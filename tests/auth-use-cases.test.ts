import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AuthUseCases,
  InvalidCredentialsError,
} from '../src/modules/auth/application/use-cases';
import { User } from '../src/modules/auth/domain/entities';
import type {
  AuthRepository,
  PasswordService,
  TokenService,
} from '../src/modules/auth/domain/repositories';

test('missing-user and wrong-password logins throw the same credentials error', async () => {
  const registeredUser = User.create('registered@example.com', 'stored-hash', 'real-user-salt');
  const users: AuthRepository = {
    register: async (user) => user,
    findByEmail: async (email) => email === registeredUser.email ? registeredUser : null,
  };
  const hashInputs: Array<{ password: string; salt: string }> = [];
  let verifyCalls = 0;
  const passwords: PasswordService = {
    createSalt: () => 'unused-salt',
    hash: async (password, salt) => {
      hashInputs.push({ password, salt });
      return 'discarded-hash';
    },
    verify: async () => {
      verifyCalls += 1;
      return false;
    },
  };
  const tokens: TokenService = {
    sign: () => 'unused-token',
    verify: () => null,
  };
  const useCases = new AuthUseCases(users, passwords, tokens, true);

  let missingUserError: unknown;
  try {
    await useCases.login('missing@example.com', 'attempted-password');
  } catch (error) {
    missingUserError = error;
  }

  let wrongPasswordError: unknown;
  try {
    await useCases.login(registeredUser.email, 'attempted-password');
  } catch (error) {
    wrongPasswordError = error;
  }

  assert.ok(missingUserError instanceof InvalidCredentialsError);
  assert.ok(wrongPasswordError instanceof InvalidCredentialsError);
  assert.equal(missingUserError.constructor, wrongPasswordError.constructor);
  assert.equal(missingUserError.message, wrongPasswordError.message);
  assert.deepEqual(hashInputs, [{
    password: 'attempted-password',
    salt: '00000000000000000000000000000000',
  }]);
  assert.equal(verifyCalls, 1);
});
