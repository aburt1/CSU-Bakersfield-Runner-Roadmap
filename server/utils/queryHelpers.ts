import type { Request } from 'express';
import type { Db } from '../types/db.js';

/** SQL fragment for filtering active, non-optional steps */
export const ACTIVE_STEP_FILTER = 'is_active = 1 AND COALESCE(is_optional, 0) = 0';

/** Parse term_id from query string, returning null if absent */
export function parseTermId(req: Request): number | null {
  return req.query.term_id ? parseInt(req.query.term_id as string, 10) : null;
}

/** Parse page/per_page from query string with bounds clamping */
export function parsePagination(req: Request, defaults?: { perPage?: number }): { page: number; perPage: number; offset: number } {
  const defaultPerPage = defaults?.perPage ?? 25;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page as string, 10) || defaultPerPage));
  const offset = (page - 1) * perPage;
  return { page, perPage, offset };
}

/** Count active, non-optional steps for a term */
export async function countActiveSteps(db: Db, termId: number): Promise<number> {
  const result = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM steps WHERE ${ACTIVE_STEP_FILTER} AND term_id = $1`,
    [termId]
  );
  return parseInt(result!.count);
}
