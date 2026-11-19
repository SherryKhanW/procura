import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createAdminRepository } from '../src/admin/repository.js';
import { AdminError, employeeVersion, departmentVersion } from '../src/admin/validation.js';
import { verifyPassword } from '../src/auth/passwords.js';

const actor = { employeeId: 10, loginId: 10, firstName: 'Sofia', lastName: 'Garcia', email: 'sofia.garcia@procura.co', role: 'Admin', departmentId: 10, departmentName: 'Administration' };
const employee = { employeeId: 1, firstName: 'Sara', lastName: 'Ahmed', email: 'sara.ahmed@procura.co', role: 'Employee', departmentId: 1, departmentName: 'Engineering', isActive: 1, passwordConfigured: 1 };
const department = { departmentId: 1, departmentName: 'Engineering', employeeCount: 1n };
const password = 'Admin test passphrase!';
const update = row => ({ firstName: row.firstName, lastName: row.lastName, email: row.email, role: row.role,
  departmentId: row.departmentId, isActive: Boolean(row.isActive), version: employeeVersion(row) });
const creating = { ...update(employee), email: 'new.employee@procura.co', password };

// A scripted driver exercises the real repository and HTTP middleware without
// touching the shared database. Real MariaDB locking remains a live check.
function database({ target = employee, actorAllowed = true, failLogin = false, failRevoke = false, duplicateDepartment = false, failConnect = false } = {}) {
  const events = []; const queries = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes("WHERE Role = 'Admin'")) return [{ employeeId: 10 }];
      if (sql.startsWith('SELECT IsActive AS isActive')) return [{ isActive: actorAllowed, passwordHash: 'configured' }];
      if (sql.startsWith('SELECT e.EmployeeID')) return target ? [{ ...target }] : [];
      if (sql.startsWith('INSERT INTO Employee')) return { insertId: 25n };
      if (sql.startsWith('INSERT INTO Login') && failLogin) throw new Error('simulated login write failure');
      if (sql.startsWith('DELETE s') && failRevoke) throw new Error('simulated revocation failure');
      if (sql.startsWith('SELECT DepartmentID FROM')) return duplicateDepartment ? [{ DepartmentID: 1 }] : [];
      if (sql.startsWith('SELECT DepartmentID AS departmentId')) return [{ ...department }];
      if (sql.startsWith('INSERT INTO Department')) return { insertId: 12n };
      return { affectedRows: 1 };
    },
    async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); }, release() { events.push('release'); },
  };
  const pool = {
    async getConnection() {
      if (failConnect) throw Object.assign(new Error('private SQL connection details'), { errno: 1045 });
      return connection;
    },
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('COUNT(e.EmployeeID)')) return [{ ...department }];
      return [{ ...employee }];
    },
  };
  return { pool, events, queries, repository: createAdminRepository(pool) };
}

async function fixture(t, options = {}) {
  const db = database(options);
  const repository = { ...db.repository, async findSession() { return { ...actor, role: options.role ?? 'Admin' }; } };
  const server = createApp({ repository, config: { production: false, origin: 'http://127.0.0.1:5173', proxyHops: 0 } }).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (path, { method = 'GET', body, authenticated = true, protect = true } = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/admin${path}`, {
    method, headers: { ...(authenticated ? { Cookie: `procura_session=${'a'.repeat(64)}` } : {}),
      ...(protect ? { 'X-Procura-Request': '1' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ...db, request };
}

test('all administration endpoints reject anonymous and non-Admin callers before database access', async t => {
  const { request, events } = await fixture(t, { role: 'Employee' });
  const endpoints = [['GET', '/users'], ['POST', '/users'], ['PUT', '/users/1'], ['POST', '/users/1/password'],
    ['GET', '/departments'], ['POST', '/departments'], ['PUT', '/departments/1']];
  for (const [method, path] of endpoints) {
    assert.equal((await request(path, { method, body: method === 'GET' ? undefined : {} })).status, 403);
    assert.equal((await request(path, { method, authenticated: false, body: method === 'GET' ? undefined : {} })).status, 401);
  }
  assert.deepEqual(events, []);
});

test('employee search and filters bind literal values and return public edit versions', async t => {
  const { request, queries } = await fixture(t);
  const search = "Sara%_' OR 1=1 --";
  const response = await request(`/users?search=${encodeURIComponent(search)}&role=Employee&departmentId=1&status=ready`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.users[0].version, employeeVersion(employee));
  assert.equal(data.users[0].departmentId, 1); assert.equal(data.users[0].isActive, true);
  assert.deepEqual(queries[0].params, [search, 'Employee', 1]);
  assert.ok(!queries[0].sql.includes(search)); assert.match(queries[0].sql, /LOCATE/);
  assert.doesNotMatch(queries[0].sql, /PasswordHash AS/);
  assert.equal(data.roles.length, 6);
  assert.doesNotMatch(JSON.stringify(data), /passwordHash|scrypt/);
});

test('invalid inputs, filters, and IDs fail without beginning a transaction', async t => {
  const { request, events } = await fixture(t);
  for (const patch of [{ role: 'Root' }, { isActive: 'false' }, { departmentId: 0 }, { firstName: ' ' }, { firstName: 'a'.repeat(101) }, { email: 'external@example.com' }, { password: 'short' }]) {
    assert.equal((await request('/users', { method: 'POST', body: { ...creating, ...patch } })).status, 400);
  }
  assert.equal((await request('/users/1', { method: 'PUT', body: { ...update(employee), version: 'missing' } })).status, 400);
  for (const path of ['/users?role=Root', '/users?status=unknown', '/users?departmentId=-1', '/users?search=a&search=b']) assert.equal((await request(path)).status, 400);
  for (const id of ['0', '1.2', '1x', '2147483648']) assert.equal((await request(`/users/${id}`, { method: 'PUT', body: update(employee) })).status, 400);
  assert.deepEqual(events, []);
});

test('employee creation normalizes identity and commits a password-backed Login with the employee', async t => {
  const { request, queries, events } = await fixture(t);
  const response = await request('/users', { method: 'POST', body: { ...creating, email: ' NEW.EMPLOYEE@PROCURA.CO ', firstName: ' Sara ', employeeId: 99 } });
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { employeeId: 25 });
  const insert = queries.find(query => query.sql.startsWith('INSERT INTO Employee'));
  assert.deepEqual(insert.params, ['Sara', 'Ahmed', 'new.employee@procura.co', 'Employee', 1]);
  const login = queries.find(query => query.sql.startsWith('INSERT INTO Login'));
  assert.equal(login.params[0], 25); assert.equal(login.params[1], true);
  assert.notEqual(login.params[2], password); assert.equal(await verifyPassword(password, login.params[2]), true);
  assert.deepEqual(events, ['begin', 'commit', 'release']);
});

test('a failed Login insertion rolls back employee creation', async t => {
  const { request, events } = await fixture(t, { failLogin: true });
  assert.equal((await request('/users', { method: 'POST', body: creating })).status, 500);
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});

test('email/role/department/activation edits revoke sessions and preserve existing password hashes', async t => {
  const { request, queries, events } = await fixture(t);
  const response = await request('/users/1', { method: 'PUT', body: { ...update(employee), role: 'Finance', departmentId: 2, isActive: false, password: 'ignored input' } });
  assert.equal(response.status, 200);
  const login = queries.find(query => query.sql.startsWith('INSERT INTO Login'));
  assert.doesNotMatch(login.sql, /PasswordHash/);
  assert.deepEqual(login.params, [1, false]);
  assert.ok(queries.some(query => query.sql.startsWith('DELETE s') && query.params[0] === 1));
  assert.deepEqual(events, ['begin', 'commit', 'release']);
});

test('failed session revocation rolls back an employee access change', async t => {
  const { request, events } = await fixture(t, { failRevoke: true });
  assert.equal((await request('/users/1', { method: 'PUT', body: { ...update(employee), isActive: false } })).status, 500);
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});

test('stale edits and missing employees cannot be overwritten', async t => {
  const stale = await fixture(t);
  assert.equal((await stale.request('/users/1', { method: 'PUT', body: { ...update(employee), version: 'a'.repeat(64) } })).status, 409);
  assert.ok(!stale.queries.some(query => query.sql.startsWith('UPDATE Employee')));
  const missing = await fixture(t, { target: null });
  assert.equal((await missing.request('/users/1', { method: 'PUT', body: update(employee) })).status, 404);
});

test('an Admin cannot remove their own role or deactivate themselves, even through direct API calls', async t => {
  const self = { ...employee, ...actor, isActive: true, passwordConfigured: true };
  const { request, queries } = await fixture(t, { target: self });
  for (const patch of [{ role: 'Employee' }, { isActive: false }]) {
    assert.equal((await request('/users/10', { method: 'PUT', body: { ...update(self), ...patch } })).status, 400);
  }
  assert.ok(!queries.some(query => query.sql.startsWith('UPDATE Employee')));
});

test('writes revalidate the acting Admin after acquiring the administration locks', async t => {
  const { request, queries, events } = await fixture(t, { actorAllowed: false });
  assert.equal((await request('/departments', { method: 'POST', body: { departmentName: 'New department' } })).status, 403);
  assert.match(queries[0].sql, /Role = 'Admin'.*FOR UPDATE/);
  assert.deepEqual(queries[1].params, [10]);
  assert.ok(!queries.some(query => query.sql.startsWith('INSERT')));
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});

test('Admin password setup/reset preserves activation and revokes target sessions', async t => {
  const inactive = { ...employee, isActive: false, passwordConfigured: false };
  const { request, queries } = await fixture(t, { target: inactive });
  const response = await request('/users/1/password', { method: 'POST', body: { password, version: employeeVersion(inactive) } });
  assert.equal(response.status, 200);
  const login = queries.find(query => query.sql.startsWith('INSERT INTO Login'));
  assert.deepEqual(login.params.slice(0, 2), [1, false]);
  assert.match(login.sql, /ON DUPLICATE KEY UPDATE PasswordHash = VALUES\(PasswordHash\)/);
  assert.equal(await verifyPassword(password, login.params[2]), true);
  assert.ok(queries.some(query => query.sql.startsWith('DELETE s')));
  assert.doesNotMatch(JSON.stringify(await response.json()), /scrypt|password/);
  assert.equal((await request('/users/10/password', { method: 'POST', body: { password, version: employeeVersion(inactive) } })).status, 400);
});

test('department listing converts MariaDB counts and supplies independent edit versions', async t => {
  const { request } = await fixture(t);
  const response = await request('/departments'); assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.departments[0].employeeCount, 1);
  assert.equal(data.departments[0].version, departmentVersion(department));
});

test('department creation/rename validate names, check duplicates, and preserve IDs', async t => {
  const { request, queries, events } = await fixture(t);
  const created = await request('/departments', { method: 'POST', body: { departmentName: ' Research ' } });
  assert.equal(created.status, 201); assert.deepEqual(await created.json(), { departmentId: 12 });
  assert.deepEqual(queries.find(query => query.sql.startsWith('INSERT INTO Department')).params, ['Research']);
  assert.equal((await request('/departments/1', { method: 'PUT', body: { departmentName: 'Product Engineering', version: departmentVersion(department) } })).status, 200);
  assert.deepEqual(queries.find(query => query.sql.startsWith('UPDATE Department')).params, ['Product Engineering', 1]);
  assert.equal((await request('/departments', { method: 'POST', body: { departmentName: ' ' } })).status, 400);
  assert.equal((await request('/departments/1', { method: 'PUT', body: { departmentName: 'Product', version: 'b'.repeat(64) } })).status, 409);
  assert.deepEqual(events.slice(-3), ['begin', 'rollback', 'release']);
  const duplicate = await fixture(t, { duplicateDepartment: true });
  assert.equal((await duplicate.request('/departments', { method: 'POST', body: { departmentName: 'engineering' } })).status, 409);
});

test('Admin writes reject missing CSRF headers and do not expose raw driver errors', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/departments', { method: 'POST', body: { departmentName: 'New' }, protect: false })).status, 403);
  const unavailable = await fixture(t, { failConnect: true });
  const failed = await unavailable.request('/departments', { method: 'POST', body: { departmentName: 'New' } });
  assert.equal(failed.status, 503);
  assert.doesNotMatch(JSON.stringify(await failed.json()), /private SQL|1045/);
});

test('duplicate emails and foreign-key failures return actionable domain errors after rollback', async () => {
  for (const [code, status] of [['ER_DUP_ENTRY', 409], ['ER_NO_REFERENCED_ROW_2', 400], ['ER_LOCK_DEADLOCK', 409]]) {
    const db = database(); const original = await db.pool.getConnection(); const query = original.query;
    original.query = async (sql, params) => {
      if (sql.startsWith('INSERT INTO Employee')) throw Object.assign(new Error('private SQL details'), { code });
      return query(sql, params);
    };
    await assert.rejects(db.repository.createEmployee(10, creating, 'hash'), error => error instanceof AdminError && error.status === status && !error.message.includes('private SQL'));
    assert.deepEqual(db.events, ['begin', 'rollback', 'release']);
  }
});
