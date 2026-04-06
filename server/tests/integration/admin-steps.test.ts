import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, testDb, adminToken } from '../setup.js';

const sysadminAuth = () => ({ Authorization: `Bearer ${adminToken('sysadmin')}` });
const viewerAuth = () => ({ Authorization: `Bearer ${adminToken('viewer')}` });

async function ensureTerm(): Promise<number> {
  const existing = await testDb.queryOne<{ id: number }>('SELECT id FROM terms ORDER BY id LIMIT 1');
  if (existing) return existing.id;
  const result = await testDb.execute(
    "INSERT INTO terms (name, is_active) VALUES ('Test Term', 1) RETURNING id",
    []
  );
  return (result.rows[0] as { id: number }).id;
}

describe('Admin Steps', () => {
  describe('GET /api/admin/steps', () => {
    it('returns steps list with auth', async () => {
      const res = await request(app).get('/api/admin/steps').set(sysadminAuth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('filters by term_id', async () => {
      const termId = await ensureTerm();
      const res = await request(app)
        .get(`/api/admin/steps?term_id=${termId}`)
        .set(sysadminAuth());
      expect(res.status).toBe(200);
      for (const step of res.body) {
        expect(step.term_id).toBe(termId);
      }
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/admin/steps');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/admin/steps', () => {
    it('creates a step with valid data', async () => {
      const termId = await ensureTerm();
      const res = await request(app)
        .post('/api/admin/steps')
        .set(sysadminAuth())
        .send({ title: 'Test Step', term_id: termId });
      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 without title', async () => {
      const termId = await ensureTerm();
      const res = await request(app)
        .post('/api/admin/steps')
        .set(sysadminAuth())
        .send({ term_id: termId });
      expect(res.status).toBe(400);
    });

    it('returns 400 without term_id', async () => {
      const res = await request(app)
        .post('/api/admin/steps')
        .set(sysadminAuth())
        .send({ title: 'No Term' });
      expect(res.status).toBe(400);
    });

    it('returns 403 for viewer role', async () => {
      const termId = await ensureTerm();
      const res = await request(app)
        .post('/api/admin/steps')
        .set(viewerAuth())
        .send({ title: 'Viewer Step', term_id: termId });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/admin/steps/:id', () => {
    it('updates step title', async () => {
      const termId = await ensureTerm();
      const createRes = await request(app)
        .post('/api/admin/steps')
        .set(sysadminAuth())
        .send({ title: 'Original', term_id: termId });
      const stepId = createRes.body.id;

      const res = await request(app)
        .put(`/api/admin/steps/${stepId}`)
        .set(sysadminAuth())
        .send({ title: 'Updated' });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent step', async () => {
      const res = await request(app)
        .put('/api/admin/steps/999999')
        .set(sysadminAuth())
        .send({ title: 'Ghost' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/steps/:id', () => {
    it('deletes a step', async () => {
      const termId = await ensureTerm();
      const createRes = await request(app)
        .post('/api/admin/steps')
        .set(sysadminAuth())
        .send({ title: 'To Delete', term_id: termId });

      const res = await request(app)
        .delete(`/api/admin/steps/${createRes.body.id}`)
        .set(sysadminAuth());
      expect(res.status).toBe(200);
    });

    it('returns 200 even for non-existent step (idempotent delete)', async () => {
      const res = await request(app)
        .delete('/api/admin/steps/999999')
        .set(sysadminAuth());
      expect(res.status).toBe(200);
    });
  });
});
