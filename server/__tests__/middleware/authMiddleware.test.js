'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-jwt-secret-key';

jest.mock('../../models/User', () => ({
  findOne: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { protect, optionalProtect } = require('../../middleware/authMiddleware');

const SECRET = 'test-jwt-secret-key';

// Build a real JWT for the given payload
function makeToken(payload = {}) {
  return jwt.sign({ userId: 'u1', firstName: 'T', lastName: 'U', ...payload }, SECRET);
}

// Build a mock user object (the shape returned after .select())
function makeDbUser(overrides = {}) {
  return {
    userId: 'u1',
    firstName: 'Test',
    lastName: 'User',
    passwordChangedAt: new Date(Date.now() - 7_200_000), // 2 hours ago
    ...overrides,
  };
}

// Make User.findOne() return a chainable-style mock compatible with .select()
function mockFindOne(resolvedUser) {
  User.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue(resolvedUser),
  });
}

// Create minimal req / res / next stubs
function makeCtx(authHeader) {
  const req = { headers: {} };
  if (authHeader !== undefined) req.headers.authorization = authHeader;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('authMiddleware', () => {
  // ── protect ──────────────────────────────────────────────────
  describe('protect', () => {
    it('responds 401 when no Authorization header is present', async () => {
      const { req, res, next } = makeCtx();
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
      expect(next).not.toHaveBeenCalled();
    });

    it('responds 401 when Authorization does not start with "Bearer"', async () => {
      const { req, res, next } = makeCtx('Token abc123');
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('responds 401 when the token is invalid / tampered', async () => {
      const { req, res, next } = makeCtx('Bearer completely.invalid.token');
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('responds 401 when User.findOne returns null (user deleted)', async () => {
      mockFindOne(null);
      const { req, res, next } = makeCtx(`Bearer ${makeToken()}`);
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('responds 401 when token was issued before the last password change', async () => {
      // Token issued 1 hour ago; password changed 30 minutes ago
      const iat = Math.floor((Date.now() - 3_600_000) / 1000);
      const token = jwt.sign({ userId: 'u1', firstName: 'T', lastName: 'U', iat }, SECRET);
      mockFindOne(makeDbUser({ passwordChangedAt: new Date(Date.now() - 1_800_000) }));

      const { req, res, next } = makeCtx(`Bearer ${token}`);
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next() and sets req.user when token is valid and user exists', async () => {
      const user = makeDbUser();
      mockFindOne(user);
      const { req, res, next } = makeCtx(`Bearer ${makeToken()}`);
      await protect(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toMatchObject({ userId: 'u1' });
    });

    it('allows tokens issued after the last password change', async () => {
      // Token issued now; password changed 2 hours ago → token is newer
      mockFindOne(makeDbUser({ passwordChangedAt: new Date(Date.now() - 7_200_000) }));
      const { req, res, next } = makeCtx(`Bearer ${makeToken()}`);
      await protect(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  // ── optionalProtect ───────────────────────────────────────────
  describe('optionalProtect', () => {
    it('calls next() with no Authorization header (anonymous request)', async () => {
      const { req, res, next } = makeCtx();
      await optionalProtect(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('calls next() and sets req.user = null when token is invalid', async () => {
      const { req, res, next } = makeCtx('Bearer bad.token.here');
      await optionalProtect(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeNull();
    });

    it('calls next() and sets req.user when token and user are valid', async () => {
      mockFindOne(makeDbUser());
      const { req, res, next } = makeCtx(`Bearer ${makeToken()}`);
      await optionalProtect(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toMatchObject({ userId: 'u1' });
    });

    it('calls next() when user is not found (does not error out)', async () => {
      mockFindOne(null);
      const { req, res, next } = makeCtx(`Bearer ${makeToken()}`);
      await optionalProtect(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
