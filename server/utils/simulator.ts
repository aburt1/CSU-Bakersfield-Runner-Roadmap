import type { Db } from '../types/db.js';
import type { ProgressChangeInput } from '../types/api.js';
import { applyStudentProgressChange } from './progress.js';
import { logAudit } from './audit.js';

const MIN_INTERVAL = 30000;  // 30 seconds
const MAX_INTERVAL = 60000;  // 60 seconds

interface Actor {
  type: string;
  name: string;
}

interface WeightedAction {
  action: string;
  weight: number;
}

interface SimStep {
  id: number;
  title: string;
  is_optional: number;
  sort_order: number;
}

const ACTORS: Actor[] = [
  { type: 'integration', name: 'PeopleSoft Sync' },
  { type: 'integration', name: 'Admissions Bot' },
  { type: 'integration', name: 'CRM Import' },
  { type: 'admin', name: 'Maria Santos' },
  { type: 'admin', name: 'James Chen' },
];

const ACTION_WEIGHTS: WeightedAction[] = [
  { action: 'complete', weight: 60 },
  { action: 'undo', weight: 15 },
  { action: 'waive', weight: 10 },
  { action: 'completeOptional', weight: 10 },
  { action: 'undoOptional', weight: 5 },
];

function pickWeighted(items: WeightedAction[]): string {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.action;
  }
  return items[items.length - 1]!.action;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function tick(db: Db): Promise<void> {
  // 1. Pick random student
  const student = await db.queryOne<{ id: string; display_name: string; term_id: number | null }>(
    `SELECT id, display_name, term_id FROM students ORDER BY RANDOM() LIMIT 1`
  );

  // 2. If no student, return silently
  if (!student) return;

  // 3. Get steps for the student's term
  const steps = await db.queryAll<SimStep>(
    `SELECT id, title, is_optional, sort_order FROM steps WHERE term_id = $1 AND is_active = 1 ORDER BY sort_order`,
    [student.term_id]
  );

  if (steps.length === 0) return;

  // 4. Get current progress
  const progressRows = await db.queryAll<{ step_id: number; status: string }>(
    `SELECT step_id, status FROM student_progress WHERE student_id = $1`,
    [student.id]
  );
  const progressMap = new Map(progressRows.map(r => [r.step_id, r.status]));

  // 5. Pick weighted action and random actor
  const action = pickWeighted(ACTION_WEIGHTS);
  let actor = pickRandom(ACTORS);

  // 20% chance actor is the student themselves
  if (Math.random() < 0.2) {
    actor = { type: 'student', name: student.display_name };
  }

  // Categorize steps
  const requiredSteps = steps.filter(s => !s.is_optional);
  const optionalSteps = steps.filter(s => s.is_optional);

  const notCompletedRequired = requiredSteps.filter(s => !progressMap.has(s.id) || progressMap.get(s.id) === 'not_completed');
  const completedRequired = requiredSteps.filter(s => {
    const status = progressMap.get(s.id);
    return status === 'completed' || status === 'waived';
  });
  const notCompletedOptional = optionalSteps.filter(s => !progressMap.has(s.id));
  const completedOptional = optionalSteps.filter(s => progressMap.has(s.id) && (progressMap.get(s.id) === 'completed' || progressMap.get(s.id) === 'waived'));

  let targetStep: SimStep | null = null;
  let status: string | null = null;
  let completedBy: string | null = null;
  let auditAction: string | null = null;
  let verb: string | null = null;

  switch (action) {
    case 'complete': {
      // First required step NOT in progress (by sort_order)
      if (notCompletedRequired.length === 0) return;
      targetStep = notCompletedRequired[0]!;
      status = 'completed';
      completedBy = actor.type === 'integration' ? 'integration' : 'manual';
      auditAction = actor.type === 'integration' ? 'integration_complete' : 'complete';
      verb = 'Completed';
      break;
    }
    case 'undo': {
      // Last completed required step (highest sort_order)
      if (completedRequired.length === 0) return;
      targetStep = completedRequired.sort((a, b) => b.sort_order - a.sort_order)[0]!;
      status = 'not_completed';
      completedBy = actor.type === 'integration' ? 'integration' : 'manual';
      auditAction = actor.type === 'integration' ? 'integration_uncomplete' : 'uncomplete';
      verb = 'Undid';
      break;
    }
    case 'waive': {
      // Random required step NOT in progress
      if (notCompletedRequired.length === 0) return;
      targetStep = pickRandom(notCompletedRequired);
      status = 'waived';
      completedBy = actor.type === 'integration' ? 'integration' : 'manual';
      auditAction = actor.type === 'integration' ? 'integration_waive' : 'waive';
      verb = 'Waived';
      break;
    }
    case 'completeOptional': {
      // Random optional step NOT in progress — force actor to student
      if (notCompletedOptional.length === 0) return;
      targetStep = pickRandom(notCompletedOptional);
      status = 'completed';
      completedBy = 'manual';
      actor = { type: 'student', name: student.display_name };
      auditAction = 'student_optional_complete';
      verb = 'Completed';
      break;
    }
    case 'undoOptional': {
      // Random completed optional step — force actor to student
      if (completedOptional.length === 0) return;
      targetStep = pickRandom(completedOptional);
      status = 'not_completed';
      completedBy = 'manual';
      actor = { type: 'student', name: student.display_name };
      auditAction = 'student_optional_uncomplete';
      verb = 'Undid';
      break;
    }
    default:
      return;
  }

  if (!targetStep) return;

  // 7. Apply the progress change
  const result = await applyStudentProgressChange(db, {
    studentId: student.id,
    stepId: targetStep.id,
    status: status as ProgressChangeInput['status'],
    completedBy,
  });

  // 8. Only log audit if not a noop
  if (result.result !== 'noop') {
    const mockReq = {
      integrationClient: actor.type === 'integration' ? { name: actor.name } : null,
      adminUser: actor.type === 'admin' ? { displayName: actor.name } : null,
      studentUser: actor.type === 'student' ? { displayName: student.display_name } : null,
    };

    await logAudit(db, mockReq, {
      entityType: 'student_progress',
      entityId: student.id,
      action: auditAction!,
      details: {
        stepId: targetStep.id,
        stepTitle: targetStep.title,
        status,
        completedBy,
        actor: actor.name,
      },
    });

    // 9. Log to console
    console.log(`[simulator] ${verb} "${targetStep.title}" for ${student.display_name}`);
  }
}

export function startSimulator(db: Db): void {
  console.log('[simulator] Started — activity every 30-60s (set DISABLE_SIMULATOR=1 to stop)');
  const scheduleNext = (): void => {
    const delay = MIN_INTERVAL + Math.floor(Math.random() * (MAX_INTERVAL - MIN_INTERVAL));
    setTimeout(async () => {
      try { await tick(db); } catch (err) { console.error('[simulator] Error:', (err as Error).message); }
      scheduleNext();
    }, delay);
  };
  scheduleNext();
}
