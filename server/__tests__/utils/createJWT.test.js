'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-jwt-secret-key';

const jwt = require('jsonwebtoken');
const { createToken, isExpired, refresh } = require('../../createJWT');

const SECRET = 'test-jwt-secret-key';

describe('createJWT', () => {
  describe('createToken', () => {
    it('returns an object with an accessToken string', () => {
      const result = createToken('Alice', 'Smith', 'user-001');
      expect(result).toHaveProperty('accessToken');
      expect(typeof result.accessToken).toBe('string');
    });

    it('encodes userId, firstName, and lastName in the token payload', () => {
      const { accessToken } = createToken('Bob', 'Jones', 'user-002');
      const decoded = jwt.verify(accessToken, SECRET);
      expect(decoded.userId).toBe('user-002');
      expect(decoded.firstName).toBe('Bob');
      expect(decoded.lastName).toBe('Jones');
    });

    it('returns { error } when ACCESS_TOKEN_SECRET is missing', () => {
      const original = process.env.ACCESS_TOKEN_SECRET;
      delete process.env.ACCESS_TOKEN_SECRET;
      const result = createToken('A', 'B', 'x');
      expect(result).toHaveProperty('error');
      process.env.ACCESS_TOKEN_SECRET = original;
    });
  });

  describe('isExpired', () => {
    it('returns false for a freshly created valid token', () => {
      const { accessToken } = createToken('A', 'B', 'u1');
      expect(isExpired(accessToken)).toBe(false);
    });

    it('returns true for a completely invalid string', () => {
      expect(isExpired('not.a.token')).toBe(true);
    });

    it('returns true for a token signed with a different secret', () => {
      const wrongToken = jwt.sign({ userId: 'x' }, 'wrong-secret');
      expect(isExpired(wrongToken)).toBe(true);
    });

    it('returns true for a tampered token', () => {
      const { accessToken } = createToken('A', 'B', 'u2');
      expect(isExpired(accessToken + 'TAMPER')).toBe(true);
    });
  });

  describe('refresh', () => {
    it('returns a new accessToken', () => {
      const original = createToken('Carol', 'White', 'user-003');
      const refreshed = refresh(original.accessToken);
      expect(refreshed).toHaveProperty('accessToken');
      expect(typeof refreshed.accessToken).toBe('string');
    });

    it('preserves userId, firstName, and lastName in the refreshed token', () => {
      const original = createToken('Dave', 'Black', 'user-004');
      const { accessToken } = refresh(original.accessToken);
      const decoded = jwt.verify(accessToken, SECRET);
      expect(decoded.userId).toBe('user-004');
      expect(decoded.firstName).toBe('Dave');
      expect(decoded.lastName).toBe('Black');
    });

    it('produces a token that isExpired returns false for', () => {
      const original = createToken('Eve', 'Green', 'user-005');
      const { accessToken } = refresh(original.accessToken);
      expect(isExpired(accessToken)).toBe(false);
    });
  });
});
