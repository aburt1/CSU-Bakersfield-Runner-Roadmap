import { Router } from 'express';
import { integrationAuth } from '../middleware/integrationAuth.js';
import { safeJsonParse } from '../utils/json.js';
import { logAudit } from '../utils/audit.js';
import {
  applyStudentProgressChange,
  normalizeStudentIdNumber,
  resolveStepForStudentByKey,
  resolveStudentByStudentIdNumber,
} from '../utils/progress.js';
import { normalizeStepKey } from '../utils/stepKeys.js';

const router = Router();

router.use(integrationAuth);

const ERROR_STATUS = {
  invalid_student_id_number: 400,
  invalid_step_key: 400,
  student_term_missing: 409,
  student_not_found: 404,
  step_not_found: 404,
  step_inactive: 409,
  duplicate_student_id_number: 409,
};

async function getStoredIntegrationEvent(db, integrationClientId, sourceEventId) {
  const row = await db.queryOne(
    `SELECT response_status, response_body
     FROM integration_events
     WHERE integration_client_id = $1 AND source_event_id = $2`,
    [integrationClientId, sourceEventId]
  );

  if (!row) return null;

  return {
    httpStatus: row.response_status,
    body: safeJsonParse(row.response_body, { success: false, error: 'Stored response unavailable' }),
  };
}

async function storeIntegrationEvent(db, integrationClientId, sourceEventId, item, outcome) {
  try {
    await db.execute(
      `INSERT INTO integration_events (
        integration_client_id,
        source_event_id,
        student_id_number,
        step_key,
        request_body,
        response_status,
        response_body
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        integrationClientId,
        sourceEventId,
        normalizeStudentIdNumber(item.student_id_number) || null,
        normalizeStepKey(item.step_key) || null,
        JSON.stringify(item),
        outcome.httpStatus,
        JSON.stringify(outcome.body),
      ]
    );

    return outcome;
  } catch {
    return await getStoredIntegrationEvent(db, integrationClientId, sourceEventId) || outcome;
  }
}

function buildFailure(item, error, code, extra = {}) {
  return {
    success: false,
    student_id_number: normalizeStudentIdNumber(item.student_id_number) || null,
    step_key: normalizeStepKey(item.step_key) || null,
    status: item.status || null,
    source_event_id: item.source_event_id || null,
    result: 'failed',
    error,
    code,
    ...extra,
  };
}

async function finalizeOutcome(req, item, outcome, { persist = true } = {}) {
  if (!persist || !item?.source_event_id) {
    return outcome;
  }

  return await storeIntegrationEvent(
    req.db,
    req.integrationClient.id,
    item.source_event_id,
    item,
    outcome
  );
}

async function processCompletionItem(req, item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return {
      httpStatus: 400,
      body: { success: false, result: 'failed', error: 'Each item must be an object' },
    };
  }

  const sourceEventId = String(item.source_event_id || '').trim();
  if (!sourceEventId) {
    return {
      httpStatus: 400,
      body: buildFailure(item, 'source_event_id is required', 'invalid_source_event_id'),
    };
  }

  const storedEvent = await getStoredIntegrationEvent(req.db, req.integrationClient.id, sourceEventId);
  if (storedEvent) {
    return storedEvent;
  }

  if (!['completed', 'waived', 'not_completed'].includes(item.status)) {
    return {
      httpStatus: 400,
      body: buildFailure(item, 'status must be completed, waived, or not_completed', 'invalid_status'),
    };
  }

  const studentResolution = await resolveStudentByStudentIdNumber(req.db, item.student_id_number);
  if (studentResolution.error) {
    return await finalizeOutcome(req, item, {
      httpStatus: ERROR_STATUS[studentResolution.errorCode] || 400,
      body: buildFailure(item, studentResolution.error, studentResolution.errorCode),
    });
  }

  const { student, studentIdNumber } = studentResolution;
  const stepResolution = await resolveStepForStudentByKey(req.db, student, item.step_key);
  if (stepResolution.error) {
    return await finalizeOutcome(req, item, {
      httpStatus: ERROR_STATUS[stepResolution.errorCode] || 400,
      body: buildFailure(item, stepResolution.error, stepResolution.errorCode, {
        student_id: student.id,
      }),
    });
  }

  const { step, stepKey } = stepResolution;
  const progressChange = await applyStudentProgressChange(req.db, {
    studentId: student.id,
    stepId: step.id,
    status: item.status,
    note: item.note,
    completedAt: item.completed_at,
    completedBy: 'integration',
  });

  if (progressChange.error) {
    return {
      httpStatus: 400,
      body: buildFailure(item, progressChange.error, 'invalid_completed_at', {
        student_id: student.id,
        step_id: step.id,
      }),
    };
  }

  const responseBody = {
    success: true,
    student_id_number: studentIdNumber,
    step_key: stepKey,
    student_id: student.id,
    step_id: step.id,
    status: progressChange.status,
    result: progressChange.result,
    completed_at: progressChange.completedAt,
    source_event_id: sourceEventId,
  };

  if (progressChange.result !== 'noop') {
    await logAudit(req.db, req, {
      entityType: 'student_progress',
      entityId: student.id,
      action: item.status === 'waived'
        ? 'integration_waive'
        : item.status === 'not_completed'
          ? 'integration_uncomplete'
          : 'integration_complete',
      details: {
        source_system: req.integrationClient.name,
        source_event_id: sourceEventId,
        studentName: student.display_name,
        student_id_number: studentIdNumber,
        stepId: step.id,
        stepTitle: step.title,
        step_key: stepKey,
        result: progressChange.result,
        note: item.note || null,
      },
    });
  }

  return await finalizeOutcome(req, item, {
    httpStatus: 200,
    body: responseBody,
  });
}

router.put('/step-completions', async (req, res, next) => {
  try {
    const outcome = await processCompletionItem(req, req.body || {});
    return res.status(outcome.httpStatus).json(outcome.body);
  } catch (err) { next(err); }
});

router.post('/step-completions/batch', async (req, res, next) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array' });
    }

    const results = [];
    for (const item of items) {
      const outcome = await processCompletionItem(req, item);
      results.push(outcome.body);
    }
    const succeeded = results.filter((item) => item.success).length;
    const failed = results.length - succeeded;

    return res.json({
      success: true,
      items: results,
      summary: {
        total: results.length,
        succeeded,
        failed,
      },
    });
  } catch (err) { next(err); }
});

router.get('/step-catalog', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    if (req.query.term_id && !termId) {
      return res.status(400).json({ error: 'term_id must be a valid number' });
    }

    const rows = termId
      ? await req.db.queryAll(
          `SELECT s.term_id, t.name as term_name, s.step_key, s.title, COALESCE(s.is_active, 1) as is_active
           FROM steps s
           JOIN terms t ON t.id = s.term_id
           WHERE s.term_id = $1
           ORDER BY s.sort_order, s.id`,
          [termId]
        )
      : await req.db.queryAll(
          `SELECT s.term_id, t.name as term_name, s.step_key, s.title, COALESCE(s.is_active, 1) as is_active
           FROM steps s
           JOIN terms t ON t.id = s.term_id
           ORDER BY t.created_at DESC, s.sort_order, s.id`
        );

    return res.json(rows);
  } catch (err) { next(err); }
});

export default router;
