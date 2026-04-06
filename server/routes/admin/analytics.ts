import { Router, Request, Response, NextFunction } from 'express';
import { paramBuilder } from '../../db/pool.js';
import { parseTermId, parsePagination, countActiveSteps, ACTIVE_STEP_FILTER } from '../../utils/queryHelpers.js';
import type { Db } from '../../types/db.js';

const router = Router();

// ─── Stats ───────────────────────────────────────────────

// GET /api/admin/stats — optional ?term_id=
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const stepFilter = termId ? `WHERE ${ACTIVE_STEP_FILTER} AND term_id = $1` : `WHERE ${ACTIVE_STEP_FILTER}`;
    const studentFilter = termId ? 'WHERE term_id = $1' : '';
    const stepParams = termId ? [termId] : [];
    const studentParams = termId ? [termId] : [];

    const totalStudentsResult = await req.db.queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM students ${studentFilter}`, studentParams);
    const totalStudents = parseInt(totalStudentsResult!.count);
    const totalActiveStepsResult = await req.db.queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM steps ${stepFilter}`, stepParams);
    const totalActiveSteps = parseInt(totalActiveStepsResult!.count);

    const avgQuery = termId
      ? `SELECT COALESCE(AVG(pc.completed), 0) as avg_completed
         FROM students s
         LEFT JOIN (
           SELECT student_id, COUNT(*) as completed
           FROM student_progress sp
           JOIN steps st ON st.id = sp.step_id AND st.${ACTIVE_STEP_FILTER} AND st.term_id = $1
           GROUP BY student_id
         ) pc ON pc.student_id = s.id
         WHERE s.term_id = $2`
      : `SELECT COALESCE(AVG(pc.completed), 0) as avg_completed
         FROM students s
         LEFT JOIN (
           SELECT student_id, COUNT(*) as completed
           FROM student_progress sp
           JOIN steps st ON st.id = sp.step_id AND st.${ACTIVE_STEP_FILTER}
           GROUP BY student_id
         ) pc ON pc.student_id = s.id`;

    const avgResult = await req.db.queryOne<{ avg_completed: number }>(avgQuery, termId ? [termId, termId] : []);

    const avgPercent = totalActiveSteps > 0
      ? Math.round((avgResult!.avg_completed / totalActiveSteps) * 100)
      : 0;

    res.json({
      totalStudents,
      totalActiveSteps,
      avgCompletionPercent: avgPercent,
    });
  } catch (err) { next(err); }
});

// ─── Export ──────────────────────────────────────────────

// GET /api/admin/export/progress?term_id=&format=csv
router.get('/export/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const studentFilter = termId ? 'WHERE term_id = $1' : '';
    const stepFilter = termId ? `WHERE ${ACTIVE_STEP_FILTER} AND term_id = $1` : `WHERE ${ACTIVE_STEP_FILTER}`;
    const params = termId ? [termId] : [];

    const steps = await req.db.queryAll<{ id: number; title: string }>(`SELECT id, title FROM steps ${stepFilter} ORDER BY sort_order`, params);
    const students = await req.db.queryAll<{ id: string; display_name: string; email: string }>(`SELECT id, display_name, email FROM students ${studentFilter} ORDER BY display_name`, params);

    // Get progress scoped to the relevant students and steps
    const studentIds = students.map(s => s.id);
    const stepIds = steps.map(s => s.id);
    let allProgress: { student_id: string; step_id: number; status: string }[] = [];
    if (studentIds.length > 0 && stepIds.length > 0) {
      const studentPlaceholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
      const stepPlaceholders = stepIds.map((_, i) => `$${studentIds.length + i + 1}`).join(',');
      allProgress = await req.db.queryAll<{ student_id: string; step_id: number; status: string }>(
        `SELECT student_id, step_id, status FROM student_progress
         WHERE student_id IN (${studentPlaceholders}) AND step_id IN (${stepPlaceholders})`,
        [...studentIds, ...stepIds]
      );
    }
    const progressMap = new Map<string, string>();
    for (const p of allProgress) {
      const key = `${p.student_id}:${p.step_id}`;
      progressMap.set(key, p.status || 'completed');
    }

    // Build CSV
    const headers = ['Student Name', 'Email', ...steps.map(s => s.title), 'Total Complete', 'Percentage'];
    const rows = students.map(student => {
      let doneCount = 0;
      const stepCells = steps.map(step => {
        const status = progressMap.get(`${student.id}:${step.id}`);
        if (status === 'completed') { doneCount++; return 'Completed'; }
        if (status === 'waived') { doneCount++; return 'Waived'; }
        return '';
      });
      const pct = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;
      return [student.display_name, student.email, ...stepCells, doneCount, `${pct}%`];
    });

    const sanitizeCell = (value: unknown): string => {
      let str = String(value || '').replace(/"/g, '""');
      // Prevent spreadsheet formula injection
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str}"`;
    };

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => sanitizeCell(cell)).join(','))
      .join('\n');

    const termName = termId
      ? ((await req.db.queryOne<{ name: string }>('SELECT name FROM terms WHERE id = $1', [termId]))?.name || 'unknown')
      : 'all';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="progress-${termName}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  } catch (err) { next(err); }
});

// ─── Analytics ───────────────────────────────────────────

// GET /api/admin/analytics/step-completion?term_id=
router.get('/analytics/step-completion', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const termFilter = termId ? 'AND s.term_id = $1' : '';
    const params = termId ? [termId] : [];

    const studentCountSql = termId
      ? 'SELECT COUNT(*) as count FROM students WHERE term_id = $1'
      : 'SELECT COUNT(*) as count FROM students';
    const totalStudentsResult = await req.db.queryOne<{ count: string }>(studentCountSql, params);
    const totalStudents = parseInt(totalStudentsResult!.count);

    const steps = await req.db.queryAll<{ id: number; title: string; sort_order: number; completed_count: string }>(
      `SELECT s.id, s.title, s.sort_order,
        COUNT(DISTINCT sp.student_id) as completed_count
       FROM steps s
       LEFT JOIN student_progress sp ON sp.step_id = s.id AND sp.status IN ('completed', 'waived')
       WHERE s.${ACTIVE_STEP_FILTER} ${termFilter}
       GROUP BY s.id, s.title, s.sort_order
       ORDER BY s.sort_order`,
      params
    );

    res.json({ steps: steps.map(s => ({ ...s, completed_count: parseInt(s.completed_count), total_students: totalStudents })), totalStudents });
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/completion-trend?term_id=&days=30
router.get('/analytics/completion-trend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const days = parseInt(req.query.days as string, 10) || 30;
    const termFilter = termId
      ? 'JOIN steps st ON st.id = sp.step_id AND st.term_id = $1 AND COALESCE(st.is_optional, 0) = 0'
      : 'JOIN steps st ON st.id = sp.step_id AND COALESCE(st.is_optional, 0) = 0';
    const params = termId ? [termId, days] : [days];
    const daysParam = termId ? '$2' : '$1';

    const rows = await req.db.queryAll<{ date: string; completions: string }>(
      `SELECT DATE(sp.completed_at) as date, COUNT(*) as completions
       FROM student_progress sp
       ${termFilter}
       WHERE sp.status IN ('completed', 'waived') AND sp.completed_at >= CURRENT_DATE - (${daysParam}::integer * INTERVAL '1 day')
       GROUP BY DATE(sp.completed_at)
       ORDER BY date`,
      params
    );

    res.json(rows.map(r => ({ ...r, completions: parseInt(r.completions) })));
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/bottlenecks?term_id=
router.get('/analytics/bottlenecks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const termFilter = termId ? 'AND s.term_id = $1' : '';
    const params = termId ? [termId] : [];

    const totalStudentsResult = await req.db.queryOne<{ count: string }>(
      termId ? 'SELECT COUNT(*) as count FROM students WHERE term_id = $1' : 'SELECT COUNT(*) as count FROM students',
      params
    );
    const totalStudents = parseInt(totalStudentsResult!.count);

    const steps = await req.db.queryAll<{ id: number; title: string; sort_order: number; completed_count: string }>(
      `SELECT s.id, s.title, s.sort_order,
        COUNT(DISTINCT sp.student_id) as completed_count
       FROM steps s
       LEFT JOIN student_progress sp ON sp.step_id = s.id AND sp.status IN ('completed', 'waived')
       WHERE s.${ACTIVE_STEP_FILTER} ${termFilter}
       GROUP BY s.id, s.title, s.sort_order
       ORDER BY completed_count ASC
       LIMIT 5`,
      params
    );

    res.json({
      steps: steps.map(s => ({
        ...s,
        completed_count: parseInt(s.completed_count),
        total_students: totalStudents,
        completion_pct: totalStudents > 0 ? Math.round((parseInt(s.completed_count) / totalStudents) * 100) : 0,
      })),
      totalStudents,
    });
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/cohort-summary?term_id=
router.get('/analytics/cohort-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const studentFilter = termId ? 'WHERE s.term_id = $1' : '';
    const stepFilter = termId ? 'AND st.term_id = $2' : '';
    const params = termId ? [termId, termId] : [];

    const totalActiveSteps = termId ? await countActiveSteps(req.db, termId) : parseInt(
      (await req.db.queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM steps WHERE ${ACTIVE_STEP_FILTER}`))!.count
    );

    const rows = await req.db.queryAll<{ bucket: string; student_count: string }>(
      `SELECT
        CASE
          WHEN COALESCE(pc.done, 0) = 0 THEN '0%'
          WHEN COALESCE(pc.done, 0)::float / ${totalActiveSteps || 1} <= 0.25 THEN '1-25%'
          WHEN COALESCE(pc.done, 0)::float / ${totalActiveSteps || 1} <= 0.50 THEN '26-50%'
          WHEN COALESCE(pc.done, 0)::float / ${totalActiveSteps || 1} <= 0.75 THEN '51-75%'
          ELSE '76-100%'
        END as bucket,
        COUNT(*) as student_count
       FROM students s
       LEFT JOIN (
         SELECT student_id, COUNT(*) as done
         FROM student_progress sp
         JOIN steps st ON st.id = sp.step_id AND st.${ACTIVE_STEP_FILTER} ${stepFilter}
         WHERE sp.status IN ('completed', 'waived')
         GROUP BY student_id
       ) pc ON pc.student_id = s.id
       ${studentFilter}
       GROUP BY bucket
       ORDER BY bucket`,
      params
    );

    res.json(rows.map(r => ({ ...r, student_count: parseInt(r.student_count) })));
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/deadline-risk?term_id=&days=14
router.get('/analytics/deadline-risk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const days = parseInt(req.query.days as string, 10) || 14;

    const params: unknown[] = [days];
    const termFilter = termId ? `AND s.term_id = $${params.push(termId)}` : '';

    const steps = await req.db.queryAll<{ id: number; title: string; deadline_date: string; total_students: string; at_risk_count: string }>(
      `SELECT s.id, s.title, s.deadline_date,
        COUNT(DISTINCT st.id) as total_students,
        COUNT(DISTINCT CASE WHEN sp.status IS NULL OR sp.status != 'completed' THEN st.id END) as at_risk_count
       FROM steps s
       JOIN students st ON st.term_id = s.term_id
       LEFT JOIN student_progress sp ON sp.step_id = s.id AND sp.student_id = st.id
       WHERE s.is_active = 1 AND s.deadline_date IS NOT NULL
         AND s.deadline_date::date <= (CURRENT_DATE + make_interval(days => $1))
         AND s.deadline_date::date > CURRENT_DATE ${termFilter}
       GROUP BY s.id, s.title, s.deadline_date
       ORDER BY s.deadline_date ASC`,
      params
    );

    const result = [];
    for (const step of steps) {
      let students: { id: string; display_name: string; email: string }[];
      if (termId) {
        students = await req.db.queryAll<{ id: string; display_name: string; email: string }>(
          `SELECT st.id, st.display_name, st.email
           FROM students st
           LEFT JOIN student_progress sp ON sp.step_id = $1 AND sp.student_id = st.id
           WHERE st.term_id = $2 AND (sp.status IS NULL OR sp.status != 'completed')`,
          [step.id, termId]
        );
      } else {
        students = await req.db.queryAll<{ id: string; display_name: string; email: string }>(
          `SELECT st.id, st.display_name, st.email
           FROM students st
           LEFT JOIN student_progress sp ON sp.step_id = $1 AND sp.student_id = st.id
           WHERE sp.status IS NULL OR sp.status != 'completed'`,
          [step.id]
        );
      }
      result.push({
        ...step,
        total_students: parseInt(step.total_students),
        at_risk_count: parseInt(step.at_risk_count),
        students,
      });
    }

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/stalled-students?term_id=&days=7
router.get('/analytics/stalled-students', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const days = parseInt(req.query.days as string, 10) || 7;

    const params: unknown[] = [days];
    const termFilter = termId ? `WHERE st.term_id = $${params.push(termId)}` : '';

    const students = await req.db.queryAll<{ id: string; display_name: string; email: string; last_completion_date: string | null; completed_count: string }>(
      `SELECT st.id, st.display_name, st.email,
        MAX(sp.completed_at) as last_completion_date,
        COUNT(CASE WHEN sp.status = 'completed' THEN 1 END) as completed_count
       FROM students st
       LEFT JOIN student_progress sp ON sp.student_id = st.id
       ${termFilter}
       GROUP BY st.id, st.display_name, st.email
       HAVING COUNT(CASE WHEN sp.status = 'completed' THEN 1 END) = 0
         OR MAX(sp.completed_at) < NOW() - make_interval(days => $1)
       ORDER BY COALESCE(MAX(sp.completed_at), st.created_at) ASC`,
      params
    );

    const totalStepsResult = await req.db.queryOne<{ count: string }>(
      termId ? `SELECT COUNT(*) as count FROM steps WHERE ${ACTIVE_STEP_FILTER} AND term_id = $1` : `SELECT COUNT(*) as count FROM steps WHERE ${ACTIVE_STEP_FILTER}`,
      termId ? [termId] : []
    );
    const totalSteps = parseInt(totalStepsResult!.count);

    res.json(students.map(s => ({
      ...s,
      completed_count: parseInt(s.completed_count),
      total_steps: totalSteps,
    })));
  } catch (err) { next(err); }
});

// ─── Analytics Students Drilldown ────────────────────────

interface FilterQuerySet {
  title: string;
  studentQuery: string;
  countQuery: string;
  params: unknown[];
  countParams: unknown[];
}

type FilterBuilder = (db: Db, termId: number, filterValue: string | undefined, perPage: number, offset: number, totalActiveSteps: number) => Promise<FilterQuerySet>;

async function buildStepCompletedFilter(db: Db, termId: number, filterValue: string | undefined, perPage: number, offset: number): Promise<FilterQuerySet> {
  const step = await db.queryOne<{ title: string }>('SELECT title FROM steps WHERE id = $1', [filterValue]);
  return {
    title: `Students who completed ${step?.title || 'this step'}`,
    params: [filterValue, termId, perPage, offset],
    countParams: [filterValue, termId],
    studentQuery: `
      SELECT st.id, st.display_name, st.email, st.emplid
      FROM students st
      JOIN student_progress sp ON sp.student_id = st.id AND sp.step_id = $1 AND sp.status IN ('completed', 'waived')
      WHERE st.term_id = $2
      ORDER BY st.display_name
      LIMIT $3 OFFSET $4`,
    countQuery: `
      SELECT COUNT(*) as count FROM students st
      JOIN student_progress sp ON sp.student_id = st.id AND sp.step_id = $1 AND sp.status IN ('completed', 'waived')
      WHERE st.term_id = $2`,
  };
}

async function buildStepNotCompletedFilter(db: Db, termId: number, filterValue: string | undefined, perPage: number, offset: number): Promise<FilterQuerySet> {
  const step = await db.queryOne<{ title: string }>('SELECT title FROM steps WHERE id = $1', [filterValue]);
  return {
    title: `Students who haven't completed ${step?.title || 'this step'}`,
    params: [filterValue, termId, perPage, offset],
    countParams: [filterValue, termId],
    studentQuery: `
      SELECT st.id, st.display_name, st.email, st.emplid
      FROM students st
      LEFT JOIN student_progress sp ON sp.student_id = st.id AND sp.step_id = $1 AND sp.status IN ('completed', 'waived')
      WHERE st.term_id = $2 AND sp.student_id IS NULL
      ORDER BY st.display_name
      LIMIT $3 OFFSET $4`,
    countQuery: `
      SELECT COUNT(*) as count FROM students st
      LEFT JOIN student_progress sp ON sp.student_id = st.id AND sp.step_id = $1 AND sp.status IN ('completed', 'waived')
      WHERE st.term_id = $2 AND sp.student_id IS NULL`,
  };
}

function buildCohortBucketFilter(_db: Db, termId: number, filterValue: string | undefined, perPage: number, offset: number, totalActiveSteps: number): Promise<FilterQuerySet> {
  const bucketRanges: Record<string, [number, number]> = {
    '0%': [0, 0],
    '1-25%': [0, 0.25],
    '26-50%': [0.251, 0.50],
    '51-75%': [0.501, 0.75],
    '76-100%': [0.751, 1.0],
  };
  const range = bucketRanges[filterValue!];
  if (!range) return Promise.reject(new InvalidFilterError('Invalid cohort_bucket value'));
  const [lo, hi] = range;
  if (filterValue === '0%') {
    const bucketCondition = "HAVING COALESCE(SUM(CASE WHEN sp.status IN ('completed', 'waived') THEN 1 ELSE 0 END), 0) = 0";
    return Promise.resolve({
      title: `Students at ${filterValue} completion`,
      params: [termId, termId, perPage, offset],
      countParams: [termId, termId],
      studentQuery: `
        SELECT st.id, st.display_name, st.email, st.emplid
        FROM students st
        LEFT JOIN student_progress sp ON sp.student_id = st.id
          AND sp.step_id IN (SELECT id FROM steps WHERE ${ACTIVE_STEP_FILTER} AND term_id = $2)
        WHERE st.term_id = $1
        GROUP BY st.id, st.display_name, st.email, st.emplid
        ${bucketCondition}
        ORDER BY st.display_name
        LIMIT $3 OFFSET $4`,
      countQuery: `
        SELECT COUNT(*) as count FROM (
          SELECT st.id
          FROM students st
          LEFT JOIN student_progress sp ON sp.student_id = st.id
            AND sp.step_id IN (SELECT id FROM steps WHERE ${ACTIVE_STEP_FILTER} AND term_id = $2)
          WHERE st.term_id = $1
          GROUP BY st.id
          ${bucketCondition}
        ) sub`,
    });
  }
  const bucketCondition = `HAVING (SUM(CASE WHEN sp.status IN ('completed', 'waived') THEN 1 ELSE 0 END)::float / $3) > $4
       AND (SUM(CASE WHEN sp.status IN ('completed', 'waived') THEN 1 ELSE 0 END)::float / $3) <= $5`;
  return Promise.resolve({
    title: `Students at ${filterValue} completion`,
    params: [termId, termId, totalActiveSteps || 1, lo, hi, perPage, offset],
    countParams: [termId, termId, totalActiveSteps || 1, lo, hi],
    studentQuery: `
      SELECT st.id, st.display_name, st.email, st.emplid
      FROM students st
      LEFT JOIN student_progress sp ON sp.student_id = st.id
        AND sp.step_id IN (SELECT id FROM steps WHERE ${ACTIVE_STEP_FILTER} AND term_id = $2)
      WHERE st.term_id = $1
      GROUP BY st.id, st.display_name, st.email, st.emplid
      ${bucketCondition}
      ORDER BY st.display_name
      LIMIT $6 OFFSET $7`,
    countQuery: `
      SELECT COUNT(*) as count FROM (
        SELECT st.id
        FROM students st
        LEFT JOIN student_progress sp ON sp.student_id = st.id
          AND sp.step_id IN (SELECT id FROM steps WHERE ${ACTIVE_STEP_FILTER} AND term_id = $2)
        WHERE st.term_id = $1
        GROUP BY st.id
        ${bucketCondition}
      ) sub`,
  });
}

function buildTagFilter(_db: Db, termId: number, filterValue: string | undefined, perPage: number, offset: number): Promise<FilterQuerySet> {
  const tagPattern = `%${filterValue}%`;
  return Promise.resolve({
    title: `${filterValue!.charAt(0).toUpperCase() + filterValue!.slice(1)} students`,
    params: [termId, tagPattern, perPage, offset],
    countParams: [termId, tagPattern],
    studentQuery: `
      SELECT st.id, st.display_name, st.email, st.emplid
      FROM students st
      WHERE st.term_id = $1 AND st.tags LIKE $2
      ORDER BY st.display_name
      LIMIT $3 OFFSET $4`,
    countQuery: `
      SELECT COUNT(*) as count FROM students st
      WHERE st.term_id = $1 AND st.tags LIKE $2`,
  });
}

function buildStalledFilter(_db: Db, termId: number, filterValue: string | undefined, perPage: number, offset: number): Promise<FilterQuerySet> {
  const stalledRanges: Record<string, [number, number]> = {
    '7-14 days': [7, 14],
    '2-4 weeks': [15, 28],
    '1-3 months': [29, 90],
    '3+ months': [91, 99999],
  };
  const sRange = stalledRanges[filterValue!];
  if (!sRange) return Promise.reject(new InvalidFilterError('Invalid stalled value'));
  const [minDays, maxDays] = sRange;
  return Promise.resolve({
    title: `Students stalled ${filterValue}`,
    params: [termId, minDays, maxDays, perPage, offset],
    countParams: [termId, minDays, maxDays],
    studentQuery: `
      SELECT st.id, st.display_name, st.email, st.emplid
      FROM students st
      LEFT JOIN student_progress sp ON sp.student_id = st.id
      WHERE st.term_id = $1
      GROUP BY st.id, st.display_name, st.email, st.emplid
      HAVING (
        COUNT(CASE WHEN sp.status = 'completed' THEN 1 END) = 0
        AND $2 <= (EXTRACT(DAY FROM NOW() - st.created_at))
        AND (EXTRACT(DAY FROM NOW() - st.created_at)) <= $3
      ) OR (
        MAX(sp.completed_at) IS NOT NULL
        AND $2 <= EXTRACT(DAY FROM NOW() - MAX(sp.completed_at))
        AND EXTRACT(DAY FROM NOW() - MAX(sp.completed_at)) <= $3
      )
      ORDER BY st.display_name
      LIMIT $4 OFFSET $5`,
    countQuery: `
      SELECT COUNT(*) as count FROM (
        SELECT st.id
        FROM students st
        LEFT JOIN student_progress sp ON sp.student_id = st.id
        WHERE st.term_id = $1
        GROUP BY st.id, st.created_at
        HAVING (
          COUNT(CASE WHEN sp.status = 'completed' THEN 1 END) = 0
          AND $2 <= (EXTRACT(DAY FROM NOW() - st.created_at))
          AND (EXTRACT(DAY FROM NOW() - st.created_at)) <= $3
        ) OR (
          MAX(sp.completed_at) IS NOT NULL
          AND $2 <= EXTRACT(DAY FROM NOW() - MAX(sp.completed_at))
          AND EXTRACT(DAY FROM NOW() - MAX(sp.completed_at)) <= $3
        )
      ) sub`,
  });
}

async function buildDeadlineRiskFilter(db: Db, termId: number, filterValue: string | undefined, perPage: number, offset: number): Promise<FilterQuerySet> {
  const step = await db.queryOne<{ title: string }>('SELECT title FROM steps WHERE id = $1', [filterValue]);
  return {
    title: `At-risk students for ${step?.title || 'this step'}`,
    params: [filterValue, termId, perPage, offset],
    countParams: [filterValue, termId],
    studentQuery: `
      SELECT st.id, st.display_name, st.email, st.emplid
      FROM students st
      LEFT JOIN student_progress sp ON sp.step_id = $1 AND sp.student_id = st.id AND sp.status IN ('completed', 'waived')
      WHERE st.term_id = $2 AND sp.student_id IS NULL
      ORDER BY st.display_name
      LIMIT $3 OFFSET $4`,
    countQuery: `
      SELECT COUNT(*) as count FROM students st
      LEFT JOIN student_progress sp ON sp.step_id = $1 AND sp.student_id = st.id AND sp.status IN ('completed', 'waived')
      WHERE st.term_id = $2 AND sp.student_id IS NULL`,
  };
}

function buildVelocityBucketFilter(_db: Db, termId: number, filterValue: string | undefined, perPage: number, offset: number): Promise<FilterQuerySet> {
  const velRanges: Record<string, [number, number]> = {
    '1-3 days': [0, 3],
    '4-7 days': [4, 7],
    '1-2 weeks': [8, 14],
    '2-4 weeks': [15, 28],
    '4+ weeks': [29, 99999],
  };
  const vRange = velRanges[filterValue!];
  if (!vRange) return Promise.reject(new InvalidFilterError('Invalid velocity_bucket value'));
  const [minD, maxD] = vRange;
  return Promise.resolve({
    title: `Students completing in ${filterValue}`,
    params: [termId, minD, maxD, perPage, offset],
    countParams: [termId, minD, maxD],
    studentQuery: `
      SELECT st.id, st.display_name, st.email, st.emplid
      FROM students st
      JOIN (
        SELECT sp.student_id,
          EXTRACT(DAY FROM MAX(sp.completed_at) - MIN(sp.completed_at)) as days_elapsed
        FROM student_progress sp
        WHERE sp.status = 'completed'
        GROUP BY sp.student_id
      ) vel ON vel.student_id = st.id AND vel.days_elapsed >= $2 AND vel.days_elapsed <= $3
      WHERE st.term_id = $1
      ORDER BY st.display_name
      LIMIT $4 OFFSET $5`,
    countQuery: `
      SELECT COUNT(*) as count FROM students st
      JOIN (
        SELECT sp.student_id,
          EXTRACT(DAY FROM MAX(sp.completed_at) - MIN(sp.completed_at)) as days_elapsed
        FROM student_progress sp
        WHERE sp.status = 'completed'
        GROUP BY sp.student_id
      ) vel ON vel.student_id = st.id AND vel.days_elapsed >= $2 AND vel.days_elapsed <= $3
      WHERE st.term_id = $1`,
  });
}

function buildTrendDateFilter(_db: Db, termId: number, filterValue: string | undefined, perPage: number, offset: number): Promise<FilterQuerySet> {
  const dateStr = new Date(filterValue!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return Promise.resolve({
    title: `Completions on ${dateStr}`,
    params: [filterValue, termId, perPage, offset],
    countParams: [filterValue, termId],
    studentQuery: `
      SELECT DISTINCT st.id, st.display_name, st.email, st.emplid
      FROM students st
      JOIN student_progress sp ON sp.student_id = st.id AND DATE(sp.completed_at) = $1::date AND sp.status IN ('completed', 'waived')
      JOIN steps s ON s.id = sp.step_id AND COALESCE(s.is_optional, 0) = 0
      WHERE st.term_id = $2
      ORDER BY st.display_name
      LIMIT $3 OFFSET $4`,
    countQuery: `
      SELECT COUNT(DISTINCT st.id) as count
      FROM students st
      JOIN student_progress sp ON sp.student_id = st.id AND DATE(sp.completed_at) = $1::date AND sp.status IN ('completed', 'waived')
      JOIN steps s ON s.id = sp.step_id AND COALESCE(s.is_optional, 0) = 0
      WHERE st.term_id = $2`,
  });
}

class InvalidFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFilterError';
  }
}

const filterBuilders: Record<string, FilterBuilder> = {
  step_completed: buildStepCompletedFilter,
  step_not_completed: buildStepNotCompletedFilter,
  cohort_bucket: buildCohortBucketFilter,
  tag: buildTagFilter,
  stalled: buildStalledFilter,
  deadline_risk: buildDeadlineRiskFilter,
  velocity_bucket: buildVelocityBucketFilter,
  trend_date: buildTrendDateFilter,
};

// GET /api/admin/analytics/students?term_id=&filter_type=&filter_value=&page=1&per_page=50
router.get('/analytics/students', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);
    const filterType = req.query.filter_type as string | undefined;
    const filterValue = req.query.filter_value as string | undefined;
    const { page, perPage, offset } = parsePagination(req, { perPage: 50 });

    if (!termId || !filterType) {
      return res.status(400).json({ error: 'term_id and filter_type are required' });
    }

    const totalActiveSteps = await countActiveSteps(req.db, termId);

    const builder = filterBuilders[filterType];
    if (!builder) {
      return res.status(400).json({ error: 'Invalid filter_type' });
    }

    let filterSet: FilterQuerySet;
    try {
      filterSet = await builder(req.db, termId, filterValue, perPage, offset, totalActiveSteps);
    } catch (err) {
      if (err instanceof InvalidFilterError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    const { title, studentQuery, countQuery, params, countParams } = filterSet;

    const [studentsResult, totalResult] = await Promise.all([
      req.db.queryAll<{ id: string; display_name: string; email: string; emplid: string | null }>(studentQuery, params),
      req.db.queryOne<{ count: string }>(countQuery, countParams),
    ]);
    const total = parseInt(totalResult!.count);

    // Enrich with completion counts
    const studentIds = studentsResult.map(s => s.id);
    let completionMap: Record<string, number> = {};
    if (studentIds.length > 0) {
      const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
      const completions = await req.db.queryAll<{ student_id: string; done: string }>(
        `SELECT student_id, COUNT(*) as done
         FROM student_progress
         WHERE student_id IN (${placeholders}) AND status IN ('completed', 'waived')
         GROUP BY student_id`,
        studentIds
      );
      completionMap = Object.fromEntries(completions.map(c => [c.student_id, parseInt(c.done)]));
    }

    res.json({
      title,
      students: studentsResult.map(s => ({
        ...s,
        completed_count: completionMap[s.id] || 0,
        total_steps: totalActiveSteps,
        completion_pct: totalActiveSteps > 0 ? Math.round(((completionMap[s.id] || 0) / totalActiveSteps) * 100) : 0,
      })),
      total,
      page,
      per_page: perPage,
    });
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/cohort-comparison?term_id=
router.get('/analytics/cohort-comparison', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);

    const totalStepsResult = await req.db.queryOne<{ count: string }>(
      termId ? `SELECT COUNT(*) as count FROM steps WHERE ${ACTIVE_STEP_FILTER} AND term_id = $1` : `SELECT COUNT(*) as count FROM steps WHERE ${ACTIVE_STEP_FILTER}`,
      termId ? [termId] : []
    );
    const totalSteps = parseInt(totalStepsResult!.count);

    const tags = ['freshman', 'transfer', 'first-gen', 'honors', 'athlete', 'eop', 'veteran', 'out-of-state'];
    const result: { tag: string; student_count: number; avg_completion_pct: number }[] = [];

    for (const tag of tags) {
      const tagPattern = `%${tag}%`;
      const params: unknown[] = [tagPattern, totalSteps || 1];
      const termFilter = termId ? `AND s.term_id = $${params.push(termId)}` : '';

      const cohortResult = await req.db.queryOne<{ student_count: string; avg_completion_pct: string }>(
        `SELECT COUNT(DISTINCT s.id) as student_count,
          ROUND(AVG(COALESCE(pc.done, 0)::float / $2) * 100) as avg_completion_pct
         FROM students s
         LEFT JOIN (
           SELECT student_id, COUNT(*) as done
           FROM student_progress sp
           JOIN steps st ON st.id = sp.step_id AND st.${ACTIVE_STEP_FILTER}
           WHERE sp.status = 'completed'
           GROUP BY student_id
         ) pc ON pc.student_id = s.id
         WHERE s.tags LIKE $1 ${termFilter}`,
        params
      );

      if (cohortResult && parseInt(cohortResult.student_count) > 0) {
        result.push({
          tag,
          student_count: parseInt(cohortResult.student_count),
          avg_completion_pct: parseInt(cohortResult.avg_completion_pct),
        });
      }
    }

    res.json(result.sort((a, b) => b.student_count - a.student_count));
  } catch (err) { next(err); }
});

// GET /api/admin/analytics/completion-velocity?term_id=
router.get('/analytics/completion-velocity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const termId = parseTermId(req);

    const students = await req.db.queryAll<{ id: string; days_elapsed: string }>(
      `SELECT st.id,
        EXTRACT(DAY FROM MAX(sp.completed_at) - MIN(sp.completed_at)) as days_elapsed
       FROM students st
       JOIN student_progress sp ON sp.student_id = st.id AND sp.status = 'completed'
       ${termId ? 'WHERE st.term_id = $1' : ''}
       GROUP BY st.id`,
      termId ? [termId] : []
    );

    const buckets: Record<string, number> = {
      '1-3 days': 0,
      '4-7 days': 0,
      '1-2 weeks': 0,
      '2-4 weeks': 0,
      '4+ weeks': 0,
    };

    for (const student of students) {
      const days = parseInt(student.days_elapsed) || 0;
      if (days <= 3) buckets['1-3 days']!++;
      else if (days <= 7) buckets['4-7 days']!++;
      else if (days <= 14) buckets['1-2 weeks']!++;
      else if (days <= 28) buckets['2-4 weeks']!++;
      else buckets['4+ weeks']!++;
    }

    res.json(Object.entries(buckets).map(([bucket, count]) => ({ bucket, student_count: count })));
  } catch (err) { next(err); }
});

export default router;
