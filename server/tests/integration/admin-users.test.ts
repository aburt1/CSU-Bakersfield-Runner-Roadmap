import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, adminToken } from '../setup.js';

const auth = () => ({ Authorization: `Bearer ${adminToken('sysadmin')}` });
const editorAuth = () => ({ Authorization: `Bearer ${adminToken('admissions_editor')}` });

describe('Admin Users', () => {
  describe('GET /api/admin/users', () => {
    it('returns user list for sysadmin', async () => {
      const res = await request(app).get('/api/admin/users').set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0].password_hash).toBeUndefined();
      }
    });

    it('returns 403 for non-sysadmin', async () => {
      const res = await request(app).get('/api/admin/users').set(editorAuth());
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/admin/users', () => {
    it('creates a new admin user', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set(auth())
        .send({ email: 'newuser-test@csub.edu', displayName: 'New User', role: 'viewer' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
    });

    it('returns 409 for duplicate email', async () => {
      await request(app)
        .post('/api/admin/users')
        .set(auth())
        .send({ email: 'dup-test@csub.edu', displayName: 'Dup 1' });

      const res = await request(app)
        .post('/api/admin/users')
        .set(auth())
        .send({ email: 'dup-test@csub.edu', displayName: 'Dup 2' });
      expect(res.status).toBe(409);
    });

    it('returns 400 for invalid role', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set(auth())
        .send({ email: 'bad-role@csub.edu', displayName: 'Bad', role: 'superuser' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/admin/users')
        .set(auth())
        .send({ email: 'no-name@csub.edu' });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/admin/users/:id', () => {
    it('updates user role', async () => {
      const createRes = await request(app)
        .post('/api/admin/users').set(auth())
        .send({ email: 'update-role@csub.edu', displayName: 'Role Test', role: 'viewer' });

      const res = await request(app)
        .put(`/api/admin/users/${createRes.body.id}`)
        .set(auth())
        .send({ role: 'admissions' });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app)
        .put('/api/admin/users/999999')
        .set(auth())
        .send({ role: 'viewer' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for empty update', async () => {
      const createRes = await request(app)
        .post('/api/admin/users').set(auth())
        .send({ email: 'empty-update@csub.edu', displayName: 'Empty' });

      const res = await request(app)
        .put(`/api/admin/users/${createRes.body.id}`)
        .set(auth())
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
