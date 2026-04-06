import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, testDb, adminToken } from '../setup.js';

const auth = () => ({ Authorization: `Bearer ${adminToken('sysadmin')}` });
const viewerAuth = () => ({ Authorization: `Bearer ${adminToken('viewer')}` });

async function getStudentAndStep(): Promise<{ studentId: string; stepId: number } | null> {
  const student = await testDb.queryOne<{ id: string; term_id: number }>('SELECT id, term_id FROM students WHERE term_id IS NOT NULL LIMIT 1');
  if (!student) return null;
  const step = await testDb.queryOne<{ id: number }>('SELECT id FROM steps WHERE term_id = $1 AND is_active = 1 LIMIT 1', [student.term_id]);
  if (!step) return null;
  return { studentId: student.id, stepId: step.id };
}

describe('Admin Students', () => {
  describe('GET /api/admin/students', () => {
    it('returns paginated student list', async () => {
      const res = await request(app).get('/api/admin/students').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.students).toBeDefined();
      expect(typeof res.body.total).toBe('number');
      expect(typeof res.body.page).toBe('number');
    });

    it('supports search parameter', async () => {
      const res = await request(app)
        .get('/api/admin/students?search=nonexistent-query-xyz')
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.students).toEqual([]);
    });

    it('supports all sort options without SQL errors', async () => {
      const sorts = ['date_desc', 'date_asc', 'name_asc', 'name_desc', 'progress_asc', 'progress_desc'];
      for (const sort of sorts) {
        const res = await request(app)
          .get(`/api/admin/students?sort=${sort}`)
          .set(auth());
        expect(res.status).toBe(200);
      }
    });

    it('supports combined filters (search + term_id + overdue_only)', async () => {
      const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms LIMIT 1');
      if (!term) return;

      const res = await request(app)
        .get(`/api/admin/students?search=test&term_id=${term.id}&overdue_only=1`)
        .set(auth());
      expect(res.status).toBe(200);
    });

    it('handles invalid sort gracefully (falls back to default)', async () => {
      const res = await request(app)
        .get('/api/admin/students?sort=invalid_sort')
        .set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/admin/students/:studentId/steps/:stepId/complete', () => {
    it('marks step as completed', async () => {
      const data = await getStudentAndStep();
      if (!data) return;

      const res = await request(app)
        .post(`/api/admin/students/${data.studentId}/steps/${data.stepId}/complete`)
        .set(auth())
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('marks step as waived', async () => {
      const data = await getStudentAndStep();
      if (!data) return;

      const res = await request(app)
        .post(`/api/admin/students/${data.studentId}/steps/${data.stepId}/complete`)
        .set(auth())
        .send({ status: 'waived' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('waived');
    });

    it('returns 403 for viewer role', async () => {
      const data = await getStudentAndStep();
      if (!data) return;

      const res = await request(app)
        .post(`/api/admin/students/${data.studentId}/steps/${data.stepId}/complete`)
        .set(viewerAuth())
        .send({});
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent student', async () => {
      const res = await request(app)
        .post('/api/admin/students/nonexistent-id/steps/1/complete')
        .set(auth())
        .send({});
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/students/:studentId/steps/:stepId/complete', () => {
    it('uncompletes a step', async () => {
      const data = await getStudentAndStep();
      if (!data) return;

      await request(app)
        .post(`/api/admin/students/${data.studentId}/steps/${data.stepId}/complete`)
        .set(auth()).send({});

      const res = await request(app)
        .delete(`/api/admin/students/${data.studentId}/steps/${data.stepId}/complete`)
        .set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/students/:studentId/progress', () => {
    it('returns student with progress and tags', async () => {
      const student = await testDb.queryOne<{ id: string }>('SELECT id FROM students LIMIT 1');
      if (!student) return;

      const res = await request(app)
        .get(`/api/admin/students/${student.id}/progress`)
        .set(auth());
      expect(res.status).toBe(200);
      expect(res.body.student).toBeDefined();
      expect(Array.isArray(res.body.progress)).toBe(true);
      expect(Array.isArray(res.body.manualTags)).toBe(true);
      expect(Array.isArray(res.body.derivedTags)).toBe(true);
      expect(Array.isArray(res.body.mergedTags)).toBe(true);
    });

    it('returns 404 for non-existent student', async () => {
      const res = await request(app)
        .get('/api/admin/students/nonexistent-id/progress')
        .set(auth());
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/admin/students/:studentId/tags', () => {
    it('updates student tags', async () => {
      const student = await testDb.queryOne<{ id: string }>('SELECT id FROM students LIMIT 1');
      if (!student) return;

      const res = await request(app)
        .put(`/api/admin/students/${student.id}/tags`)
        .set(auth())
        .send({ tags: ['honors', 'athlete'] });
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/admin/students/:studentId/profile', () => {
    it('updates student profile fields', async () => {
      const student = await testDb.queryOne<{ id: string }>('SELECT id FROM students LIMIT 1');
      if (!student) return;

      const res = await request(app)
        .put(`/api/admin/students/${student.id}/profile`)
        .set(auth())
        .send({ major: 'Computer Science', applicant_type: 'Freshman' });
      expect(res.status).toBe(200);
    });

    it('returns 400 for empty update', async () => {
      const student = await testDb.queryOne<{ id: string }>('SELECT id FROM students LIMIT 1');
      if (!student) return;

      const res = await request(app)
        .put(`/api/admin/students/${student.id}/profile`)
        .set(auth())
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/students/overdue', () => {
    it('returns overdue students list', async () => {
      const res = await request(app).get('/api/admin/students/overdue').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('filters by term_id', async () => {
      const term = await testDb.queryOne<{ id: number }>('SELECT id FROM terms LIMIT 1');
      if (!term) return;

      const res = await request(app)
        .get(`/api/admin/students/overdue?term_id=${term.id}`)
        .set(auth());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/admin/audit', () => {
    it('returns audit log', async () => {
      const res = await request(app).get('/api/admin/audit').set(auth());
      expect(res.status).toBe(200);
      expect(res.body.logs).toBeDefined();
      expect(typeof res.body.total).toBe('number');
    });

    it('supports all filter combinations', async () => {
      const res = await request(app)
        .get('/api/admin/audit?entityType=student_progress&action=complete&q=test')
        .set(auth());
      expect(res.status).toBe(200);
    });
  });
});
