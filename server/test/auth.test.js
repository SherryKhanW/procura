import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createApp } from '../src/app.js';
import { readAppConfig } from '../src/config.js';
import { hashPassword, verifyPassword, validPassword } from '../src/auth/passwords.js';
import { permissionsFor, requirePermission } from '../src/auth/permissions.js';
import { createAuth, sessionDigest } from '../src/auth/routes.js';

const password = 'Test-only long passphrase!';
const passwordHash = await hashPassword(password);
const config = { production: false, origin: 'http://localhost:5173', proxyHops: 0 };

// HTTP tests use a controlled repository, never the shared project's data.
// SQL transactions and hosted TLS are verified separately against MariaDB.
function memoryRepository() {
  const roles = ['Employee', 'Manager', 'Purchasing', 'Receiving', 'Finance', 'Admin'];
  const accounts = roles.map((role, index) => ({
    loginId: index + 1, employeeId: index + 1, firstName: role, lastName: 'Tester',
    email: `${role.toLowerCase()}@procura.co`, role, departmentId: index + 1,
    departmentName: 'Test department', isActive: true, passwordHash,
  }));
  const sessions = new Map();
  return {
    accounts, sessions,
    async findLogin(email) { const row = accounts.find(account => account.email === email); return row ? { ...row } : null; },
    async createSession(hash, loginId, expectedHash) {
      const account = accounts.find(row => row.loginId === loginId && row.passwordHash === expectedHash && row.isActive);
      if (!account) return false;
      sessions.set(hash, { loginId, expires: Date.now() + 8 * 60 * 60 * 1000 }); return true;
    },
    async findSession(hash) {
      const session = sessions.get(hash);
      if (!session || session.expires <= Date.now()) return null;
      const account = accounts.find(row => row.loginId === session.loginId && row.isActive && row.passwordHash);
      return account ? { ...account } : null;
    },
    async deleteSession(hash) { sessions.delete(hash); },
    async deleteExpiredSessions() { for (const [hash, session] of sessions) if (session.expires <= Date.now()) sessions.delete(hash); },
    async replacePassword(loginId, expected, replacement) {
      const account = accounts.find(row => row.loginId === loginId && row.passwordHash === expected);
      if (!account) return false;
      account.passwordHash = replacement;
      for (const [hash, session] of sessions) if (session.loginId === loginId) sessions.delete(hash);
      return true;
    },
    async listUsers() { return accounts.map(({ passwordHash: secret, loginId, ...row }) => ({ ...row, passwordConfigured: Boolean(secret) })); },
  };
}

async function fixture(t, repository = memoryRepository(), appConfig = config, probePermissions = false) {
  let app;
  if (probePermissions) {
    // Isolate the exported middleware from the production SPA fallback.
    const auth = createAuth({ repository, config: appConfig });
    app = express(); app.use(express.json()); app.use('/api/auth', auth.router);
    app.get('/permission-probe/:permission', auth.requireAuth,
      (req, res, next) => requirePermission(req.params.permission)(req, res, next),
      (req, res) => res.json({ employeeId: req.user.employeeId }));
  } else app = createApp({ repository, config: appConfig });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { method = 'GET', body, cookie, headers = {}, protect = true } = {}) => fetch(`${origin}${path}`, {
    method,
    headers: { ...(protect ? { 'X-Procura-Request': '1' } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  const login = (role = 'employee', extra = {}) => request('/api/auth/login', { method: 'POST', body: { email: `${role}@procura.co`, password, ...extra } });
  return { repository, request, login, origin };
}

function cookieFrom(response) { return response.headers.get('set-cookie')?.split(';')[0]; }

test('password hashes use independent salts and support long Unicode passwords', async () => {
  const unicode = '采购🔒 secure passphrase';
  const first = await hashPassword(unicode);
  const second = await hashPassword(unicode);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(unicode, first), true);
  assert.equal(await verifyPassword(`${unicode}!`, first), false);
  assert.equal(await verifyPassword(password, null), false);
  assert.equal(await verifyPassword(password, 'malformed'), false);
  assert.equal(validPassword('a'.repeat(11)), false);
  assert.equal(validPassword('🔒'.repeat(128)), true);
  assert.equal(validPassword('a'.repeat(129)), false);
});

test('sign-in ignores client roles, hides credentials, and stores a digest of a fresh cookie', async t => {
  const { login, request, repository } = await fixture(t);
  const response = await login('employee', { role: 'Admin', employeeId: 6, email: ' EMPLOYEE@PROCURA.CO ' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.role, 'Employee');
  assert.equal(body.user.employeeId, 1);
  assert.doesNotMatch(JSON.stringify(body), /passwordHash|scrypt|loginId|TokenHash/);
  const cookieHeader = response.headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly/); assert.match(cookieHeader, /SameSite=Lax/);
  assert.match(cookieHeader, /Max-Age=28800/);
  const cookie = cookieFrom(response);
  const token = cookie.split('=')[1];
  assert.ok(repository.sessions.has(sessionDigest(token)));
  assert.equal(repository.sessions.has(token), false);
  const me = await request('/api/auth/me', { cookie });
  assert.equal(me.status, 200); assert.deepEqual(await me.json(), body);
  assert.equal(me.headers.get('cache-control'), 'no-store');
});

test('wrong, unknown, inactive, unprovisioned, and unsupported accounts fail identically', async t => {
  const { login, request, repository } = await fixture(t);
  const responses = [await login('employee', { password: 'incorrect password' }), await login('unknown')];
  repository.accounts[0].isActive = false; responses.push(await login());
  repository.accounts[0].isActive = true; repository.accounts[0].passwordHash = null; responses.push(await login());
  repository.accounts[0].passwordHash = passwordHash; repository.accounts[0].role = 'SuperAdmin'; responses.push(await login());
  responses.push(await request('/api/auth/login', { method: 'POST', body: { email: "x' OR 1=1 --", password } }));
  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Email or password is incorrect.' });
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal(repository.sessions.size, 0);
});

test('anonymous and non-admin users cannot read the real team-access endpoint', async t => {
  const { login, request } = await fixture(t);
  assert.equal((await request('/api/admin/users')).status, 401);
  assert.equal((await request('/api/auth/me', { cookie: 'procura_session=forged' })).status, 401);
  const employee = cookieFrom(await login());
  assert.equal((await request('/api/admin/users', { cookie: employee })).status, 403);
  const admin = cookieFrom(await login('admin'));
  const response = await request('/api/admin/users', { cookie: admin });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.users.length, 6);
  assert.doesNotMatch(JSON.stringify(body), /passwordHash|scrypt/);
});

test('six roles obey approval, payment, delivery, purchasing, and admin boundaries', async t => {
  const { login, request } = await fixture(t, memoryRepository(), config, true);
  const allowed = {
    'requests:approve': ['manager'], 'payments:manage': ['finance'],
    'deliveries:manage': ['receiving'], 'orders:manage': ['purchasing'],
    'users:read': ['admin'], 'requests:create': ['employee', 'manager', 'purchasing', 'receiving', 'finance', 'admin'],
  };
  for (const role of ['employee', 'manager', 'purchasing', 'receiving', 'finance', 'admin']) {
    const cookie = cookieFrom(await login(role));
    for (const [permission, roles] of Object.entries(allowed)) {
      const response = await request(`/permission-probe/${permission}`, { cookie });
      assert.equal(response.status, roles.includes(role) ? 200 : 403, `${role}: ${permission}`);
    }
  }
  assert.deepEqual(permissionsFor('toString'), []);
});

test('role changes and deactivation apply to an already-issued session', async t => {
  const { login, request, repository } = await fixture(t);
  const cookie = cookieFrom(await login('admin'));
  repository.accounts[5].role = 'Employee';
  assert.equal((await request('/api/admin/users', { cookie })).status, 403);
  repository.accounts[5].isActive = false;
  assert.equal((await request('/api/auth/me', { cookie })).status, 401);
});

test('logout and expiry invalidate stored tokens, including copied cookies', async t => {
  const { login, request, repository } = await fixture(t);
  const cookie = cookieFrom(await login());
  const logout = await request('/api/auth/logout', { method: 'POST', cookie });
  assert.equal(logout.status, 204); assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  assert.equal((await request('/api/auth/me', { cookie })).status, 401);
  const expired = cookieFrom(await login());
  for (const session of repository.sessions.values()) session.expires = Date.now() - 1;
  assert.equal((await request('/api/auth/me', { cookie: expired })).status, 401);
  assert.equal((await request('/api/auth/logout', { method: 'POST' })).status, 204);
});

test('fresh sign-in rotates the presented session and preserves a separate browser', async t => {
  const { login, request } = await fixture(t);
  const first = cookieFrom(await login()); const separate = cookieFrom(await login());
  const rotated = await request('/api/auth/login', { method: 'POST', cookie: first, body: { email: 'employee@procura.co', password } });
  assert.notEqual(cookieFrom(rotated), first);
  assert.equal((await request('/api/auth/me', { cookie: first })).status, 401);
  assert.equal((await request('/api/auth/me', { cookie: separate })).status, 200);
});

test('password change verifies current credentials and revokes every account session', async t => {
  const { login, request } = await fixture(t);
  const first = cookieFrom(await login()); const second = cookieFrom(await login());
  const other = cookieFrom(await login('finance'));
  const change = body => request('/api/auth/password', { method: 'POST', cookie: first, body });
  assert.equal((await change({ currentPassword: 'wrong', newPassword: 'A different long passphrase!' })).status, 400);
  assert.equal((await change({ currentPassword: password, newPassword: 'short' })).status, 400);
  assert.equal((await change({ currentPassword: password, newPassword: password })).status, 400);
  assert.equal((await request('/api/auth/me', { cookie: second })).status, 200);
  const replacement = 'A different long passphrase!';
  assert.equal((await change({ currentPassword: password, newPassword: replacement })).status, 204);
  assert.equal((await request('/api/auth/me', { cookie: first })).status, 401);
  assert.equal((await request('/api/auth/me', { cookie: second })).status, 401);
  assert.equal((await request('/api/auth/me', { cookie: other })).status, 200);
  assert.equal((await login()).status, 401);
  assert.equal((await login('employee', { password: replacement })).status, 200);
});

test('credential changes between verification and session insertion fail closed', async t => {
  const repository = memoryRepository(); repository.createSession = async () => false;
  const { login } = await fixture(t, repository);
  const response = await login(); assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('write requests reject missing custom headers and untrusted origins', async t => {
  const { request, login } = await fixture(t);
  const body = { email: 'employee@procura.co', password };
  assert.equal((await request('/api/auth/login', { method: 'POST', body, protect: false })).status, 403);
  assert.equal((await request('/api/auth/login', { method: 'POST', body, headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const cookie = cookieFrom(await login());
  assert.equal((await request('/api/auth/logout', { method: 'POST', cookie, protect: false })).status, 403);
  assert.equal((await request('/api/auth/password', { method: 'POST', cookie, body: {}, protect: false })).status, 403);
  assert.equal((await request('/api/auth/login', { method: 'POST', body, headers: { Origin: config.origin } })).status, 200);
});

test('login attempts are rate limited with a retry hint', async t => {
  const { request } = await fixture(t);
  for (let index = 0; index < 15; index++) assert.equal((await request('/api/auth/login', { method: 'POST', body: {} })).status, 401);
  const response = await request('/api/auth/login', { method: 'POST', body: {} });
  assert.equal(response.status, 429); assert.ok(response.headers.get('retry-after'));
});

test('database failures return an unavailable response without connection or SQL details', async t => {
  const repository = memoryRepository();
  repository.findLogin = async () => { throw Object.assign(new Error('SELECT PasswordHash secret-details'), { errno: 1054, sqlState: '42S22' }); };
  const { login } = await fixture(t, repository);
  const response = await login(); assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(await response.json()), /PasswordHash|secret-details|SELECT/);
});

test('production cookies use HTTPS and the host prefix; invalid config is rejected', async t => {
  const { login } = await fixture(t, memoryRepository(), { ...config, production: true, origin: 'https://procura.example' });
  const response = await login();
  assert.match(response.headers.get('set-cookie'), /^__Host-procura_session=/);
  assert.match(response.headers.get('set-cookie'), /; Secure/);
  assert.doesNotMatch(response.headers.get('set-cookie'), /Domain=/);
  assert.match(response.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  assert.throws(() => readAppConfig({ NODE_ENV: 'production' }), /APP_ORIGIN/);
  assert.throws(() => readAppConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://procura.example' }), /HTTPS/);
  assert.throws(() => readAppConfig({ APP_ORIGIN: 'http://localhost:5173/' }), /trailing slash/);
  assert.throws(() => readAppConfig({ TRUST_PROXY_HOPS: 'true' }), /TRUST_PROXY_HOPS/);
});

test('two simultaneous users remain isolated and sessions survive another app instance', async t => {
  const repository = memoryRepository(); const first = await fixture(t, repository);
  const [employee, finance] = await Promise.all([first.login(), first.login('finance')]);
  const second = await fixture(t, repository);
  const employeeMe = await second.request('/api/auth/me', { cookie: cookieFrom(employee) });
  const financeMe = await second.request('/api/auth/me', { cookie: cookieFrom(finance) });
  assert.equal((await employeeMe.json()).user.role, 'Employee');
  assert.equal((await financeMe.json()).user.role, 'Finance');
});

test('malformed and oversized JSON are rejected, health stays public, and API misses stay JSON', async t => {
  const { login, request } = await fixture(t);
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  assert.doesNotMatch(health.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'a'.repeat(110_000) } })).status, 413);
  const cookie = cookieFrom(await login());
  const missing = await request('/api/not-a-route', { cookie });
  assert.equal(missing.status, 404); assert.equal(missing.headers.get('content-type').split(';')[0], 'application/json');
});
