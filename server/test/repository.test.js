import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthRepository } from '../src/auth/repository.js';

function transactionFixture({ currentHash = 'original', failDelete = false, active = true, failInsert = false } = {}) {
  const events = [];
  let committedHash = currentHash;
  let pendingHash = currentHash;
  let revoked = false;
  let sessionSaved = false;
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async query(sql, params) {
      if (sql.startsWith('SELECT')) { assert.match(sql, /FOR UPDATE/); return [{ passwordHash: committedHash, isActive: active }]; }
      if (sql.startsWith('INSERT')) {
        if (failInsert) throw new Error('simulated session insert failure');
        sessionSaved = true;
      }
      if (sql.startsWith('UPDATE')) { pendingHash = params[0]; return { affectedRows: 1 }; }
      if (sql.startsWith('DELETE')) {
        if (failDelete) throw new Error('simulated session revocation failure');
        revoked = true;
      }
    },
    async commit() { committedHash = pendingHash; events.push('commit'); },
    async rollback() { pendingHash = committedHash; revoked = false; sessionSaved = false; events.push('rollback'); },
    release() { events.push('release'); },
  };
  return {
    repository: createAuthRepository({ async getConnection() { return connection; } }), events,
    state: () => ({ committedHash, revoked }),
    sessionExists: () => sessionSaved,
  };
}

test('password replacement commits its hash and session revocation together', async () => {
  const { repository, state, events } = transactionFixture();
  assert.equal(await repository.replacePassword(1, 'original', 'replacement'), true);
  assert.deepEqual(state(), { committedHash: 'replacement', revoked: true });
  assert.deepEqual(events, ['begin', 'commit', 'release']);
});

test('failed session revocation rolls back the password and releases the connection', async () => {
  const { repository, state, events } = transactionFixture({ failDelete: true });
  await assert.rejects(repository.replacePassword(1, 'original', 'replacement'), /revocation failure/);
  assert.deepEqual(state(), { committedHash: 'original', revoked: false });
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});

test('a conflicting password reset is rejected while an unset initial password can be provisioned', async () => {
  const conflict = transactionFixture({ currentHash: 'concurrent replacement' });
  assert.equal(await conflict.repository.replacePassword(1, 'original', 'replacement'), false);
  assert.deepEqual(conflict.state(), { committedHash: 'concurrent replacement', revoked: false });
  assert.deepEqual(conflict.events, ['begin', 'rollback', 'release']);
  const initial = transactionFixture({ currentHash: null });
  assert.equal(await initial.repository.replacePassword(1, null, 'replacement'), true);
});

test('credential lookup binds user input rather than interpolating SQL', async () => {
  const maliciousEmail = "x' OR 1=1 --";
  const repository = createAuthRepository({ async query(sql, params) {
    assert.ok(!sql.includes(maliciousEmail));
    assert.deepEqual(params, [maliciousEmail]);
    return [];
  } });
  assert.equal(await repository.findLogin(maliciousEmail), null);
});

test('session issuance rechecks credentials and activation under the login row lock', async () => {
  const valid = transactionFixture();
  assert.equal(await valid.repository.createSession('token digest', 1, 'original'), true);
  assert.equal(valid.sessionExists(), true);
  assert.deepEqual(valid.events, ['begin', 'commit', 'release']);
  for (const fixture of [transactionFixture({ currentHash: 'changed' }), transactionFixture({ active: false })]) {
    assert.equal(await fixture.repository.createSession('token digest', 1, 'original'), false);
    assert.equal(fixture.sessionExists(), false);
    assert.deepEqual(fixture.events, ['begin', 'rollback', 'release']);
  }
});

test('failed session issuance rolls back and releases its connection', async () => {
  const { repository, events, sessionExists } = transactionFixture({ failInsert: true });
  await assert.rejects(repository.createSession('token digest', 1, 'original'), /session insert failure/);
  assert.equal(sessionExists(), false);
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});
