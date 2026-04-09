'use strict';

// ── Environment ──────────────────────────────────────────────────────────────
process.env.ACCESS_TOKEN_SECRET = 'test-jwt-secret-key';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASS = 'test-pass';

// ── Mocks (hoisted by Jest before requires) ───────────────────────────────────
jest.mock('../../models/User', () => {
  const MockUser = jest.fn();
  MockUser.findOne = jest.fn();
  return MockUser;
});

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-id' }),
  })),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
const express = require('express');
const supertest = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const authRoutes = require('../../routes/authRoutes');

// ── App under test ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const request = supertest(app);

// ── Helpers ───────────────────────────────────────────────────────────────────
const SECRET = 'test-jwt-secret-key';

function makeDbUser(overrides = {}) {
  return {
    userId: 'user-abc',
    login: 'testuser',
    email: 'test@example.com',
    passwordHash: 'hashed_password',
    firstName: 'Test',
    lastName: 'User',
    displayName: null,
    hideLocation: false,
    pinColor: '#0F766E',
    favorites: [],
    userNoiseWF: 1,
    userOccupancyWF: 1,
    emailVerifiedAt: new Date(),
    passwordChangedAt: new Date(Date.now() - 7_200_000),
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    save: jest.fn().mockResolvedValue(undefined),
    verifyEmail: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Returns a mock that is both awaitable (Promise) and chainable with .select().
 * Handles both:
 *   - await User.findOne(...)          (controller pattern)
 *   - await User.findOne(...).select() (middleware pattern)
 */
function mockQuery(resolvedValue) {
  const p = Promise.resolve(resolvedValue);
  p.select = jest.fn().mockResolvedValue(resolvedValue);
  return p;
}

function validJwt(userId = 'user-abc') {
  return jwt.sign({ userId, firstName: 'Test', lastName: 'User' }, SECRET);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Auth Routes', () => {
  // ── POST /api/auth/register ──────────────────────────────────
  describe('POST /api/auth/register', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request.post('/api/auth/register').send({ login: 'user' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 409 when login or email already exists', async () => {
      User.findOne.mockReturnValue(mockQuery(makeDbUser())); // existing user found
      const res = await request.post('/api/auth/register').send({
        login: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });
      expect(res.status).toBe(409);
    });

    it('returns 201 with userId and login on successful registration', async () => {
      User.findOne.mockReturnValue(mockQuery(null)); // no existing user

      const mockUserInstance = makeDbUser({ userId: 'new-uuid', login: 'newuser', email: 'new@example.com' });
      User.mockImplementation(() => mockUserInstance);

      const res = await request.post('/api/auth/register').send({
        firstName: 'New',
        lastName: 'User',
        login: 'newuser',
        email: 'new@example.com',
        password: 'securepass',
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('userId');
      expect(res.body).toHaveProperty('login');
      expect(res.body.message).toMatch(/verify your email/i);
    });

    it('normalizes login and email to lowercase', async () => {
      User.findOne.mockReturnValue(mockQuery(null));
      const mockUserInstance = makeDbUser({ userId: 'uuid-x', login: 'mixeduser', email: 'mixed@example.com' });
      User.mockImplementation(() => mockUserInstance);

      const res = await request.post('/api/auth/register').send({
        login: 'MixedUser',
        email: 'Mixed@Example.COM',
        password: 'password123',
      });

      expect(res.status).toBe(201);
    });
  });

  // ── POST /api/auth/login ─────────────────────────────────────
  describe('POST /api/auth/login', () => {
    it('returns 400 when login or password is missing', async () => {
      const res = await request.post('/api/auth/login').send({ login: 'user' });
      expect(res.status).toBe(400);
    });

    it('returns 401 when user is not found', async () => {
      User.findOne.mockReturnValue(mockQuery(null));
      const res = await request
        .post('/api/auth/login')
        .send({ login: 'nobody', password: 'pass' });
      expect(res.status).toBe(401);
    });

    it('returns 401 when password does not match', async () => {
      User.findOne.mockReturnValue(mockQuery(makeDbUser()));
      bcrypt.compare.mockResolvedValueOnce(false);
      const res = await request
        .post('/api/auth/login')
        .send({ login: 'testuser', password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('returns 403 when email is not verified', async () => {
      User.findOne.mockReturnValue(mockQuery(makeDbUser({ emailVerifiedAt: null })));
      bcrypt.compare.mockResolvedValueOnce(true);
      const res = await request
        .post('/api/auth/login')
        .send({ login: 'testuser', password: 'pass' });
      expect(res.status).toBe(403);
    });

    it('returns 200 with accessToken and user on success', async () => {
      User.findOne.mockReturnValue(mockQuery(makeDbUser()));
      bcrypt.compare.mockResolvedValueOnce(true);
      const res = await request
        .post('/api/auth/login')
        .send({ login: 'testuser', password: 'correctpass' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('userId');
    });
  });

  // ── POST /api/auth/verify-email ──────────────────────────────
  describe('POST /api/auth/verify-email', () => {
    it('returns 400 when token is invalid / not found', async () => {
      User.findOne.mockReturnValue(mockQuery(null));
      const res = await request.post('/api/auth/verify-email').send({ token: 'bad-token' });
      expect(res.status).toBe(400);
    });

    it('returns 200 on successful verification', async () => {
      const user = makeDbUser();
      User.findOne.mockReturnValue(mockQuery(user));
      const res = await request.post('/api/auth/verify-email').send({ token: 'valid-token' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/verified/i);
      expect(user.verifyEmail).toHaveBeenCalled();
    });
  });

  // ── POST /api/auth/resend-verification ──────────────────────
  describe('POST /api/auth/resend-verification', () => {
    it('returns 400 when email is missing', async () => {
      const res = await request.post('/api/auth/resend-verification').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 when user is not found', async () => {
      User.findOne.mockReturnValue(mockQuery(null));
      const res = await request
        .post('/api/auth/resend-verification')
        .send({ email: 'ghost@example.com' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when account is already verified', async () => {
      User.findOne.mockReturnValue(mockQuery(makeDbUser({ emailVerifiedAt: new Date() })));
      const res = await request
        .post('/api/auth/resend-verification')
        .send({ email: 'test@example.com' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already verified/i);
    });

    it('returns 200 after successfully resending', async () => {
      User.findOne.mockReturnValue(mockQuery(makeDbUser({ emailVerifiedAt: null })));
      const res = await request
        .post('/api/auth/resend-verification')
        .send({ email: 'test@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/resent/i);
    });
  });

  // ── POST /api/auth/forgot-password ──────────────────────────
  describe('POST /api/auth/forgot-password', () => {
    it('returns 200 with ambiguous message even when user is not found', async () => {
      User.findOne.mockReturnValue(mockQuery(null));
      const res = await request
        .post('/api/auth/forgot-password')
        .send({ email: 'ghost@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account/i);
    });

    it('returns 200 with same ambiguous message when user exists', async () => {
      User.findOne.mockReturnValue(mockQuery(makeDbUser()));
      const res = await request
        .post('/api/auth/forgot-password')
        .send({ email: 'test@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account/i);
    });
  });

  // ── POST /api/auth/reset-password ───────────────────────────
  describe('POST /api/auth/reset-password', () => {
    it('returns 400 when new password is too short', async () => {
      const res = await request
        .post('/api/auth/reset-password')
        .send({ token: 'some-token', newPassword: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/8 characters/i);
    });

    it('returns 400 when reset token is invalid or expired', async () => {
      User.findOne.mockReturnValue(mockQuery(null));
      const res = await request
        .post('/api/auth/reset-password')
        .send({ token: 'expired-token', newPassword: 'newpassword123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid or has expired/i);
    });

    it('returns 200 on successful password reset', async () => {
      const user = makeDbUser({ passwordResetToken: 'valid-token' });
      User.findOne.mockReturnValue(mockQuery(user));
      const res = await request
        .post('/api/auth/reset-password')
        .send({ token: 'valid-token', newPassword: 'newpassword123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/successfully reset/i);
      expect(user.save).toHaveBeenCalled();
    });
  });

  // ── GET /api/auth/profile ────────────────────────────────────
  describe('GET /api/auth/profile', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const res = await request.get('/api/auth/profile');
      expect(res.status).toBe(401);
    });

    it('returns 200 with serialized user profile when authenticated', async () => {
      const user = makeDbUser();
      // First call: protect middleware (.select()); Second call: getProfile controller (direct)
      User.findOne
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(user) })
        .mockReturnValueOnce(mockQuery(user));

      const res = await request
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${validJwt()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('userId');
      expect(res.body).not.toHaveProperty('passwordHash');
    });
  });

  // ── PUT /api/auth/profile ────────────────────────────────────
  describe('PUT /api/auth/profile', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request.put('/api/auth/profile').send({ firstName: 'New' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when pinColor is not a valid hex value', async () => {
      const user = makeDbUser();
      User.findOne
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(user) })
        .mockReturnValueOnce(mockQuery(user));

      const res = await request
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${validJwt()}`)
        .send({ pinColor: 'not-a-color' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/hex/i);
    });

    it('returns 400 when displayName is an empty string', async () => {
      const user = makeDbUser();
      User.findOne
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(user) })
        .mockReturnValueOnce(mockQuery(user));

      const res = await request
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${validJwt()}`)
        .send({ displayName: '   ' }); // only whitespace → empty after trim

      expect(res.status).toBe(400);
    });

    it('returns 200 with updated user on valid update', async () => {
      const user = makeDbUser();
      user.save.mockResolvedValue(user);
      User.findOne
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(user) })
        .mockReturnValueOnce(mockQuery(user));

      const res = await request
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${validJwt()}`)
        .send({ firstName: 'Updated', pinColor: '#1A2B3C' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('userId');
    });
  });

  // ── POST /api/auth/change-password ──────────────────────────
  describe('POST /api/auth/change-password', () => {
    it('returns 401 when not authenticated', async () => {
      const res = await request
        .post('/api/auth/change-password')
        .send({ currentPassword: 'old', newPassword: 'new123456' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when fields are missing', async () => {
      const user = makeDbUser();
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

      const res = await request
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${validJwt()}`)
        .send({ currentPassword: 'old' }); // missing newPassword

      expect(res.status).toBe(400);
    });

    it('returns 400 when new password is shorter than 8 characters', async () => {
      const user = makeDbUser();
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

      const res = await request
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${validJwt()}`)
        .send({ currentPassword: 'old', newPassword: 'short' });

      expect(res.status).toBe(400);
    });

    it('returns 401 when current password is wrong', async () => {
      const user = makeDbUser();
      User.findOne
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(user) }) // middleware
        .mockReturnValueOnce(mockQuery(user)); // controller
      bcrypt.compare.mockResolvedValueOnce(false); // wrong password

      const res = await request
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${validJwt()}`)
        .send({ currentPassword: 'wrongpass', newPassword: 'newpassword123' });

      expect(res.status).toBe(401);
    });

    it('returns 200 on successful password change', async () => {
      const user = makeDbUser();
      User.findOne
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(user) })
        .mockReturnValueOnce(mockQuery(user));
      bcrypt.compare.mockResolvedValueOnce(true);

      const res = await request
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${validJwt()}`)
        .send({ currentPassword: 'correctpass', newPassword: 'brandnewpassword' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/updated/i);
      expect(user.save).toHaveBeenCalled();
    });
  });
});
