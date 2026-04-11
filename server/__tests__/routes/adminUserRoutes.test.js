'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-jwt-secret-key';

/**
 * adminUserRoutes.test.js
 *
 * Unit tests for GET/PATCH/POST/DELETE /api/admin/users.
 * The route is not factory-based, so we mock the service and auth middleware
 * at the module level via jest.mock before the route is required.
 */

// ── Module-level mocks (must be hoisted before any require) ──────────────────

// Stub protect + requireAdmin so every request is treated as an authenticated admin
jest.mock('../../middleware/authMiddleware', () => ({
  protect: (req, _res, next) => {
    req.user = { userId: 'admin-user-1', role: 'admin' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
}));

// Auto-mock the service — all exported functions become jest.fn()
jest.mock('../../services/adminUserService');

// ── Imports ──────────────────────────────────────────────────────────────────

const express = require('express');
const supertest = require('supertest');
const adminUserService = require('../../services/adminUserService');
const adminUserRoutes = require('../../routes/adminUserRoutes');

// ── App factory ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/users', adminUserRoutes);
  return app;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeSerializedUser(overrides = {}) {
  return {
    userId: 'user-1',
    displayName: 'Alice',
    email: 'alice@test.com',
    trustScore: 1,
    role: 'user',
    accountStatus: 'active',
    emailVerifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetAllMocks();
});

// ── GET / — list users ────────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  it('returns 200 with a users array', async () => {
    const users = [makeSerializedUser(), makeSerializedUser({ userId: 'user-2', email: 'bob@test.com' })];
    adminUserService.listUsers.mockResolvedValue(users);

    const res = await supertest(buildApp()).get('/api/admin/users');

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.users[0].email).toBe('alice@test.com');
  });

  it('forwards the ?q query parameter to the service', async () => {
    adminUserService.listUsers.mockResolvedValue([makeSerializedUser()]);

    await supertest(buildApp()).get('/api/admin/users?q=alice');

    expect(adminUserService.listUsers).toHaveBeenCalledWith('alice');
  });

  it('returns 500 when the service throws', async () => {
    adminUserService.listUsers.mockRejectedValue(new Error('db error'));

    const res = await supertest(buildApp()).get('/api/admin/users');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/server error/i);
  });
});

// ── PATCH /:userId — edit user ────────────────────────────────────────────────

describe('PATCH /api/admin/users/:userId', () => {
  it('returns 200 with the updated user on success', async () => {
    const updated = makeSerializedUser({ role: 'admin' });
    adminUserService.editUser.mockResolvedValue({ user: updated });

    const res = await supertest(buildApp())
      .patch('/api/admin/users/user-1')
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User updated');
    expect(res.body.user.role).toBe('admin');
  });

  it('returns the service error status when editUser signals an error', async () => {
    adminUserService.editUser.mockResolvedValue({ error: 'Email already taken', status: 409 });

    const res = await supertest(buildApp())
      .patch('/api/admin/users/user-1')
      .send({ email: 'taken@test.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email already taken/i);
  });

  it('returns 404 when the user does not exist', async () => {
    adminUserService.editUser.mockResolvedValue({ error: 'User not found', status: 404 });

    const res = await supertest(buildApp())
      .patch('/api/admin/users/nonexistent')
      .send({ role: 'user' });

    expect(res.status).toBe(404);
  });

  it('returns 500 when the service throws', async () => {
    adminUserService.editUser.mockRejectedValue(new Error('db error'));

    const res = await supertest(buildApp())
      .patch('/api/admin/users/user-1')
      .send({ role: 'admin' });

    expect(res.status).toBe(500);
  });
});

// ── POST /:userId/force-password-reset ────────────────────────────────────────

describe('POST /api/admin/users/:userId/force-password-reset', () => {
  it('returns 200 on success', async () => {
    adminUserService.forcePasswordReset.mockResolvedValue({ userId: 'user-1' });

    const res = await supertest(buildApp())
      .post('/api/admin/users/user-1/force-password-reset');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password reset forced');
    expect(res.body.userId).toBe('user-1');
  });

  it('returns 404 when the target user does not exist', async () => {
    adminUserService.forcePasswordReset.mockResolvedValue({ error: 'User not found', status: 404 });

    const res = await supertest(buildApp())
      .post('/api/admin/users/ghost/force-password-reset');

    expect(res.status).toBe(404);
  });

  it('returns 500 when the service throws', async () => {
    adminUserService.forcePasswordReset.mockRejectedValue(new Error('db error'));

    const res = await supertest(buildApp())
      .post('/api/admin/users/user-1/force-password-reset');

    expect(res.status).toBe(500);
  });
});

// ── DELETE /:userId — delete user ─────────────────────────────────────────────

describe('DELETE /api/admin/users/:userId', () => {
  it('returns 200 with userId on successful deletion', async () => {
    adminUserService.deleteUser.mockResolvedValue({ userId: 'user-1' });

    const res = await supertest(buildApp())
      .delete('/api/admin/users/user-1');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User deleted');
    expect(res.body.userId).toBe('user-1');
  });

  it('returns 400 when admin tries to delete their own account', async () => {
    adminUserService.deleteUser.mockResolvedValue({ error: 'Cannot delete your own account', status: 400 });

    const res = await supertest(buildApp())
      .delete('/api/admin/users/admin-user-1'); // same userId as req.user set by mock protect

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot delete/i);
  });

  it('returns 404 when the user does not exist', async () => {
    adminUserService.deleteUser.mockResolvedValue({ error: 'User not found', status: 404 });

    const res = await supertest(buildApp())
      .delete('/api/admin/users/ghost');

    expect(res.status).toBe(404);
  });

  it('returns 500 when the service throws', async () => {
    adminUserService.deleteUser.mockRejectedValue(new Error('db error'));

    const res = await supertest(buildApp())
      .delete('/api/admin/users/user-1');

    expect(res.status).toBe(500);
  });
});
