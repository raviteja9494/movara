import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_JWT_EXPIRES_IN, resolveJwtExpiresIn } from '../src/modules/auth/infrastructure/security/JwtTokenService';

test('JWT expiry accepts supported durations and uses a quiet 30-day default', () => {
  const warnings: string[] = [];
  const warn = (message: string) => warnings.push(message);

  assert.equal(resolveJwtExpiresIn(undefined, warn), DEFAULT_JWT_EXPIRES_IN);
  assert.equal(resolveJwtExpiresIn('30d', warn), '30d');
  assert.equal(resolveJwtExpiresIn('12h', warn), '12h');
  assert.equal(resolveJwtExpiresIn('3600s', warn), '3600s');
  assert.deepEqual(warnings, []);
});

test('JWT expiry falls back and warns once for empty or invalid values', () => {
  for (const value of ['', '7days', '  ']) {
    const warnings: string[] = [];
    assert.equal(resolveJwtExpiresIn(value, (message) => warnings.push(message)), DEFAULT_JWT_EXPIRES_IN);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Invalid JWT_EXPIRES_IN/);
  }
});
