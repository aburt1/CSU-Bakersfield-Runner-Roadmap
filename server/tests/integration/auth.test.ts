import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, testDb, adminToken, studentToken } from '../setup.js';

describe('Admin Auth', () => {
  describe('POST /api/admin/auth/login', () => {
    it('returns 400 for missing credentials', async () => {
      const res = await request(app).post('/api/admin/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email.*password/i);
    });

    it('returns 401 for wrong password', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ email: 'admin@csub.edu', password: 'wrong-password-here' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/auth/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/admin/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns admin info with valid token', async () => {
      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });
  });

  describe('POST /api/admin/auth/change-password', () => {
    it('returns 400 if newPassword is too short', async () => {
      const res = await request(app)
        .post('/api/admin/auth/change-password')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ currentPassword: 'anything', newPassword: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/12 characters/);
    });
  });
});

describe('Student Auth', () => {
  describe('POST /api/auth/dev-login', () => {
    it('returns 400 for missing fields', async () => {
      const res = await request(app).post('/api/auth/dev-login').send({});
      expect(res.status).toBe(400);
    });

    it('creates student and returns token', async () => {
      const res = await request(app)
        .post('/api/auth/dev-login')
        .send({ name: 'Test Student', email: 'teststudent-unique@csub.edu' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.student.email).toBe('teststudent-unique@csub.edu');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
