import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, testDb, adminToken } from '../setup.js';

const auth = () => ({ Authorization: `Bearer ${adminToken('sysadmin')}` });
const viewerAuth = () => ({ Authorization: `Bearer ${adminToken('viewer')}` });

describe('Admin Terms', () => {
  describe('GET /api/admin/terms', () => {
    it('returns terms with step and student counts', async () => {
      const res = await request(app).get('/api/admin/terms').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(typeof res.body[0].step_count).toBe('number');
        expect(typeof res.body[0].student_count).toBe('number');
      }
    });
  });

  describe('POST /api/admin/terms', () => {
    it('creates a term', async () => {
      const res = await request(app)
        .post('/api/admin/terms')
        .set(auth())
        .send({ name: 'Test Term 2099' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 without name', async () => {
      const res = await request(app)
        .post('/api/admin/terms')
        .set(auth())
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 403 for viewer role', async () => {
      const res = await request(app)
        .post('/api/admin/terms')
        .set(viewerAuth())
        .send({ name: 'Viewer Term' });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/admin/terms/:id', () => {
    it('updates term name', async () => {
      const createRes = await request(app)
        .post('/api/admin/terms').set(auth())
        .send({ name: 'Before' });
      const termId = createRes.body.id;

      const res = await request(app)
        .put(`/api/admin/terms/${termId}`)
        .set(auth())
        .send({ name: 'After' });
      expect(res.status).toBe(200);
    });

    it('activates term and deactivates others (transaction)', async () => {
      const createRes = await request(app)
        .post('/api/admin/terms').set(auth())
        .send({ name: 'Activate Me' });
      const termId = createRes.body.id;

      const res = await request(app)
        .put(`/api/admin/terms/${termId}`)
        .set(auth())
        .send({ is_active: true });
      expect(res.status).toBe(200);

      const terms = await testDb.queryAll<{ id: number; is_active: number }>('SELECT id, is_active FROM terms');
      const activeTerms = terms.filter(t => t.is_active === 1);
      expect(activeTerms).toHaveLength(1);
      expect(activeTerms[0]!.id).toBe(termId);
    });

    it('returns 404 for non-existent term', async () => {
      const res = await request(app)
        .put('/api/admin/terms/999999')
        .set(auth())
        .send({ name: 'Ghost' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/admin/terms/:id/clone', () => {
    it('clones a term with selected steps', async () => {
      const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms ORDER BY id LIMIT 1');
      if (!term) return;

      const steps = await testDb.queryAll<{ id: number }>('SELECT id FROM steps WHERE term_id = $1 LIMIT 3', [term.id]);
      if (steps.length === 0) return;

      const res = await request(app)
        .post(`/api/admin/terms/${term.id}/clone`)
        .set(auth())
        .send({
          name: 'Cloned Term',
          step_ids: steps.map(s => s.id),
        });
      expect(res.status).toBe(200);
      expect(res.body.term).toBeDefined();
      expect(res.body.steps.length).toBe(steps.length);
    });

    it('returns 400 for empty step_ids', async () => {
      const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms ORDER BY id LIMIT 1');
      if (!term) return;

      const res = await request(app)
        .post(`/api/admin/terms/${term.id}/clone`)
        .set(auth())
        .send({ name: 'Clone', step_ids: [] });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing name', async () => {
      const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms ORDER BY id LIMIT 1');
      if (!term) return;

      const res = await request(app)
        .post(`/api/admin/terms/${term.id}/clone`)
        .set(auth())
        .send({ step_ids: [1] });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/admin/terms/:id', () => {
    it('deletes term with no students', async () => {
      const createRes = await request(app)
        .post('/api/admin/terms').set(auth())
        .send({ name: 'Delete Me' });

      const res = await request(app)
        .delete(`/api/admin/terms/${createRes.body.id}`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('returns 409 for term with students', async () => {
      const termWithStudents = await testDb.queryOne<{ term_id: number }>(
        'SELECT term_id FROM students WHERE term_id IS NOT NULL LIMIT 1'
      );
      if (!termWithStudents) return;

      const res = await request(app)
        .delete(`/api/admin/terms/${termWithStudents.term_id}`)
        .set(auth());
      expect(res.status).toBe(409);
    });
  });
});
