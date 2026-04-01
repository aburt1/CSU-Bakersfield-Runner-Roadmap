import type { Db } from '../types/db.js';
import type { ProgressChangeInput, ProgressChangeResult, StudentResolution, StepResolution } from '../types/api.js';
import { normalizeStepKey } from './stepKeys.js';

export function normalizeStudentIdNumber(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeCompletedAt(value: unknown): string | null {
  if (value == null || value === '') return null;

  const date = new Date(value as string | number);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export async function resolveStudentByStudentIdNumber(db: Db, studentIdNumber: unknown): Promise<StudentResolution> {
  const normalized = normalizeStudentIdNumber(studentIdNumber);
  if (!normalized) {
    return { errorCode: 'invalid_student_id_number', error: 'student_id_number is required' };
  }

  const rows = await db.queryAll<{ id: string; display_name: string; email: string; emplid: string | null; term_id: number | null }>(
    `SELECT id, display_name, email, emplid, term_id
     FROM students
     WHERE trim(COALESCE(emplid, '')) = $1`,
    [normalized]
  );

  if (rows.length === 0) {
    return { errorCode: 'student_not_found', error: 'Student not found' };
  }

  if (rows.length > 1) {
    return { errorCode: 'duplicate_student_id_number', error: 'Student ID # is not unique' };
  }

  return { student: rows[0]!, studentIdNumber: normalized };
}

export async function resolveStepForStudentByKey(
  db: Db,
  student: { term_id: number | null },
  stepKey: string
): Promise<StepResolution> {
  const normalizedStepKey = normalizeStepKey(stepKey);
  if (!normalizedStepKey) {
    return { errorCode: 'invalid_step_key', error: 'step_key is required' };
  }

  if (!student?.term_id) {
    return { errorCode: 'student_term_missing', error: 'Student does not have an assigned term' };
  }

  const step = await db.queryOne<{ id: number; title: string; term_id: number; step_key: string; is_active: number }>(
    `SELECT id, title, term_id, step_key, is_active
     FROM steps
     WHERE term_id = $1 AND step_key = $2`,
    [student.term_id, normalizedStepKey]
  );

  if (!step) {
    return { errorCode: 'step_not_found', error: 'Step not found in the student term' };
  }

  if (step.is_active === 0) {
    return { errorCode: 'step_inactive', error: 'Step is inactive' };
  }

  return { step, stepKey: normalizedStepKey };
}

export async function applyStudentProgressChange(db: Db, input: ProgressChangeInput): Promise<ProgressChangeResult> {
  const { studentId, stepId, status, note, completedAt, completedBy } = input;
  const nextStatus = status === 'waived' ? 'waived' : status === 'not_completed' ? 'not_completed' : 'completed';
  const normalizedNote = note == null || note === '' ? null : String(note);
  const normalizedCompletedBy = completedBy || 'manual';
  const explicitCompletedAt = completedAt === undefined ? undefined : normalizeCompletedAt(completedAt);

  if (completedAt !== undefined && !explicitCompletedAt) {
    return { error: 'completed_at must be a valid ISO timestamp' };
  }

  const current = await db.queryOne<{
    student_id: string;
    step_id: number;
    completed_at: string | Date | null;
    status: string;
    note: string | null;
    completed_by: string;
  }>(
    `SELECT student_id, step_id, completed_at, status, note, completed_by
     FROM student_progress
     WHERE student_id = $1 AND step_id = $2
     FOR UPDATE`,
    [studentId, stepId]
  );

  if (nextStatus === 'not_completed') {
    if (!current) {
      return { result: 'noop', status: 'not_completed', completedAt: null, completedBy: normalizedCompletedBy };
    }

    await db.execute(
      `DELETE FROM student_progress WHERE student_id = $1 AND step_id = $2`,
      [studentId, stepId]
    );

    return { result: 'updated', status: 'not_completed', completedAt: null, completedBy: normalizedCompletedBy };
  }

  if (current) {
    const nextCompletedAt = explicitCompletedAt ?? current.completed_at ?? new Date().toISOString();
    const currentCompletedAt = current.completed_at instanceof Date
      ? current.completed_at.toISOString()
      : current.completed_at;
    const isSameCompletedAt = completedAt === undefined || currentCompletedAt === explicitCompletedAt;

    if (
      current.status === nextStatus &&
      (current.note ?? null) === normalizedNote &&
      isSameCompletedAt &&
      (current.completed_by || 'manual') === normalizedCompletedBy
    ) {
      return { result: 'noop', status: nextStatus, completedAt: currentCompletedAt, completedBy: current.completed_by || 'manual' };
    }

    await db.execute(
      `UPDATE student_progress
       SET status = $1, note = $2, completed_at = $3, completed_by = $4
       WHERE student_id = $5 AND step_id = $6`,
      [nextStatus, normalizedNote, nextCompletedAt, normalizedCompletedBy, studentId, stepId]
    );

    return { result: 'updated', status: nextStatus, completedAt: nextCompletedAt as string, completedBy: normalizedCompletedBy };
  }

  const nextCompletedAt = explicitCompletedAt ?? new Date().toISOString();
  await db.execute(
    `INSERT INTO student_progress (student_id, step_id, completed_at, status, note, completed_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [studentId, stepId, nextCompletedAt, nextStatus, normalizedNote, normalizedCompletedBy]
  );

  return { result: 'created', status: nextStatus, completedAt: nextCompletedAt, completedBy: normalizedCompletedBy };
}
