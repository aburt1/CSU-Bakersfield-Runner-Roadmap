import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, testDb, adminToken } from '../setup.js';

const auth = () => ({ Authorization: `Bearer ${adminToken('sysadmin')}` });

async function getTermId(): Promise<number | null> {
  const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms WHERE is_active = 1 LIMIT 1');
  return term?.id ?? null;
}

describe('Admin Analytics', () => {
  describe('GET /api/admin/stats', () => {
    it('returns stats without term_id', async () => {
      const res = await request(app).get('/api/admin/stats').set(auth());
      expect(res.status).toBe(200);
      expect(typeof res.body.totalStudents).toBe('number');
      expect(typeof res.body.totalActiveSteps).toBe('number');
      expect(typeof res.body.avgCompletionPercent).toBe('number');
    });

    it('returns stats with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/stats?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
      expect(typeof res.body.totalStudents).toBe('number');
    });
  });

  describe('GET /api/admin/export/progress', () => {
    it('returns CSV without term_id', async () => {
      const res = await request(app).get('/api/admin/export/progress').set(auth());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
    });

    it('returns CSV with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/export/progress?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
    });

    it('handles empty data (term with no students)', async () => {
      const termRes = await testDb.execute("INSERT INTO terms (name, is_active) VALUES ('Empty CSV Term', 0) RETURNING id");
      const emptyTermId = (termRes.rows[0] as { id: number }).id;

      const res = await request(app)
        .get(`/api/admin/export/progress?term_id=${emptyTermId}`)
        .set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics/step-completion', () => {
    it('returns step completion without term_id', async () => {
      const res = await request(app).get('/api/admin/analytics/step-completion').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.steps).toBeDefined();
    });

    it('returns step completion with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/step-completion?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics/completion-trend', () => {
    it('works without term_id (conditional $1/$2 swap)', async () => {
      const res = await request(app).get('/api/admin/analytics/completion-trend').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('works with term_id (different param positions)', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/completion-trend?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });

    it('accepts custom days parameter', async () => {
      const res = await request(app).get('/api/admin/analytics/completion-trend?days=7').set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics/bottlenecks', () => {
    it('returns bottlenecks without term_id', async () => {
      const res = await request(app).get('/api/admin/analytics/bottlenecks').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.steps).toBeDefined();
    });

    it('returns bottlenecks with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/bottlenecks?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics/cohort-summary', () => {
    it('returns cohort buckets without term_id', async () => {
      const res = await request(app).get('/api/admin/analytics/cohort-summary').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns cohort buckets with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/cohort-summary?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics/deadline-risk', () => {
    it('works without term_id (dynamic $N via push)', async () => {
      const res = await request(app).get('/api/admin/analytics/deadline-risk').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('works with term_id (adds extra param via push)', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/deadline-risk?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics/stalled-students', () => {
    it('works without term_id', async () => {
      const res = await request(app).get('/api/admin/analytics/stalled-students').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('works with term_id (dynamic param push)', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/stalled-students?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });

    it('accepts custom days parameter', async () => {
      const res = await request(app).get('/api/admin/analytics/stalled-students?days=14').set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics/cohort-comparison', () => {
    it('returns tag-based comparison', async () => {
      const res = await request(app).get('/api/admin/analytics/cohort-comparison').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('works with term_id (dynamic param push inside loop)', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/cohort-comparison?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics/completion-velocity', () => {
    it('returns velocity buckets', async () => {
      const res = await request(app).get('/api/admin/analytics/completion-velocity').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('works with term_id', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app).get(`/api/admin/analytics/completion-velocity?term_id=${termId}`).set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/analytics/students (filter builders — THE BUG CLASS)', () => {
    it('returns 400 without term_id', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/students?filter_type=step_completed&filter_value=1')
        .set(auth());
      expect(res.status).toBe(400);
    });

    it('returns 400 without filter_type', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}`)
        .set(auth());
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid filter_type', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=invalid`)
        .set(auth());
      expect(res.status).toBe(400);
    });

    it('filter: step_completed', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const step = await testDb.queryOne<{ id: number }>('SELECT id FROM steps WHERE term_id = $1 LIMIT 1', [termId]);
      if (!step) return;

      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=step_completed&filter_value=${step.id}`)
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.students).toBeDefined();
      expect(typeof res.body.total).toBe('number');
    });

    it('filter: step_not_completed', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const step = await testDb.queryOne<{ id: number }>('SELECT id FROM steps WHERE term_id = $1 LIMIT 1', [termId]);
      if (!step) return;

      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=step_not_completed&filter_value=${step.id}`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: cohort_bucket 0% (was the original bug — different SQL branch)', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=0%25`)
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.students).toBeDefined();
    });

    it('filter: cohort_bucket 1-25%', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=1-25%25`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: cohort_bucket 26-50%', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=26-50%25`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: cohort_bucket 51-75%', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=51-75%25`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: cohort_bucket 76-100%', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=76-100%25`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: cohort_bucket invalid value', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=cohort_bucket&filter_value=invalid`)
        .set(auth());
      expect(res.status).toBe(400);
    });

    it('filter: tag', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=tag&filter_value=freshman`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: stalled 7-14 days', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=stalled&filter_value=7-14 days`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: stalled 2-4 weeks', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=stalled&filter_value=2-4 weeks`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: stalled 1-3 months', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=stalled&filter_value=1-3 months`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: stalled 3+ months', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=stalled&filter_value=3%2B months`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: stalled invalid value', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=stalled&filter_value=invalid`)
        .set(auth());
      expect(res.status).toBe(400);
    });

    it('filter: deadline_risk', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const step = await testDb.queryOne<{ id: number }>('SELECT id FROM steps WHERE term_id = $1 LIMIT 1', [termId]);
      if (!step) return;

      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=deadline_risk&filter_value=${step.id}`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket 1-3 days', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=1-3 days`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket 4-7 days', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=4-7 days`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket 1-2 weeks', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=1-2 weeks`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket 2-4 weeks', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=2-4 weeks`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket 4+ weeks', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=4%2B weeks`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('filter: velocity_bucket invalid value', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=velocity_bucket&filter_value=invalid`)
        .set(auth());
      expect(res.status).toBe(400);
    });

    it('filter: trend_date', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=trend_date&filter_value=2026-01-15`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('supports pagination params', async () => {
      const termId = await getTermId();
      if (!termId) return;
      const res = await request(app)
        .get(`/api/admin/analytics/students?term_id=${termId}&filter_type=tag&filter_value=freshman&page=1&per_page=5`)
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.per_page).toBe(5);
    });
  });
});
