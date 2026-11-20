import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createProcurementRepository } from '../src/procurement/repository.js';

const people = {
  Employee: { employeeId: 1, loginId: 1, firstName: 'Sara', lastName: 'Ahmed', email: 'sara.ahmed@procura.co', role: 'Employee', departmentId: 1, departmentName: 'Engineering' },
  Manager: { employeeId: 5, loginId: 5, firstName: 'Lina', lastName: 'Hassan', email: 'lina.hassan@procura.co', role: 'Manager', departmentId: 5, departmentName: 'Operations' },
  Purchasing: { employeeId: 6, loginId: 6, firstName: 'Daniel', lastName: 'Lee', email: 'daniel.lee@procura.co', role: 'Purchasing', departmentId: 6, departmentName: 'Purchasing' },
};

// Scripted driver for the catalog and request SQL. It does not open MariaDB.
function database({ failItems = false } = {}) {
  const events = []; const queries = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT ProductID AS productId')) return params.map(productId => ({ productId }));
      if (sql.startsWith('INSERT INTO Purchase_Request (')) return { insertId: 16n };
      if (sql.startsWith('INSERT INTO Purchase_Request_Item') && failItems) throw new Error('simulated item failure');
      return { affectedRows: 1 };
    },
    async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); }, release() { events.push('release'); },
  };
  const pool = {
    async getConnection() { return connection; },
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('CALL ')) {
        if (params[0] === 13) throw Object.assign(new Error('Only pending requests can be decided'), { sqlState: '45000', sqlMessage: 'Only pending requests can be decided' });
        return { affectedRows: 1 };
      }
      if (sql.startsWith('INSERT INTO Product')) return { insertId: 11n };
      if (sql.startsWith('INSERT INTO Vendor (')) return { insertId: 11n };
      if (sql.startsWith('DELETE FROM Vendor_Product')) return { affectedRows: 1 };
      if (sql.startsWith('SELECT ProductID FROM Vendor_Product')) return [{ productId: params[1] }];
      if (sql.startsWith('SELECT VendorID FROM Vendor') || sql.startsWith('SELECT ProductID FROM Product')) return [{ id: params[0] }];
      if (sql.startsWith('SELECT DISTINCT Category')) return [{ category: 'Accessories' }];
      if (sql.includes('AS numberOfVendors')) return [{ productId: 3, productName: 'Wireless Keyboard', description: 'Keyboard', category: 'Accessories', numberOfVendors: 1n }];
      if (sql.includes('AS numberOfProducts')) return [{ vendorId: 3, vendorName: 'KeyWorks Supply', contactName: 'Chris Evans', email: 'sales@keyworks.example.com', phone: '+1-212-555-0103', address: '103 Market Street, New York', status: 'Active', numberOfProducts: 2n }];
      if (sql.includes('FROM Vendor_Product AS vp')) return [{ productId: 3, productName: 'Wireless Keyboard', vendorSku: 'KEY-KBD-01', agreedUnitPrice: '40.00', leadTimeDays: 3 }];
      if (sql.includes('FROM Vendor')) return [{ vendorId: 3, vendorName: 'KeyWorks Supply', contactName: 'Chris Evans', email: 'sales@keyworks.example.com', phone: '+1-212-555-0103', address: '103 Market Street, New York', status: 'Active' }];
      if (sql.includes('FROM Purchase_Request_Item')) return [{ productId: 3, productName: 'Wireless Keyboard', quantityRequested: 5, estimatedUnitPrice: '40.00', lineTotal: '200.00' }];
      if (sql.includes('FROM Approval')) return [];
      if (params[0] === 99) return [];
      return [{ requestId: 14, employeeId: 1, requester: 'Sara Ahmed', departmentName: 'Engineering', requestDate: '2026-10-28', numberOfItems: 1n, estimatedTotal: '600.00', status: 'Pending', justification: 'Keyboards for the development lab' }];
    },
  };
  return { pool, events, queries, repository: createProcurementRepository(pool) };
}

async function fixture(t, role = 'Employee', options = {}) {
  const db = database(options);
  const repository = { ...db.repository, async findSession() { return { ...people[role] }; } };
  const server = createApp({ repository, config: { production: false, origin: 'http://127.0.0.1:5173', proxyHops: 0 } }).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (path, { method = 'GET', body, authenticated = true } = {}) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method, headers: { ...(authenticated ? { Cookie: `procura_session=${'b'.repeat(64)}` } : {}), 'X-Procura-Request': '1',
      ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ...db, request };
}

const requestBody = { justification: 'Keyboards for the lab', employeeId: 999, items: [{ productId: 3, quantity: 5, estimatedUnitPrice: '40.00' }] };
const vendorBody = { vendorName: 'Demo Office Supply', contactName: 'Sam Taylor', email: 'sam@demo.example.com', phone: '+1-212-555-0111', address: '111 Market Street, New York', status: 'Active' };

test('catalog and approval routes reject anonymous users and the wrong roles', async t => {
  const employee = await fixture(t, 'Employee');
  const purchasing = await fixture(t, 'Purchasing');
  const manager = await fixture(t, 'Manager');
  assert.equal((await employee.request('/catalog/products')).status, 200);
  assert.equal((await employee.request('/catalog/products', { method: 'POST', body: {} })).status, 403);
  assert.equal((await employee.request('/catalog/vendors')).status, 403);
  assert.equal((await employee.request('/catalog/vendors/1/listings/1', { method: 'DELETE' })).status, 403);
  assert.equal((await employee.request('/requests/14/decision', { method: 'POST', body: { decision: 'Approved' } })).status, 403);
  assert.equal((await employee.request('/requests/queue')).status, 403);
  assert.equal((await purchasing.request('/requests/14/decision', { method: 'POST', body: { decision: 'Approved' } })).status, 403);
  assert.equal((await manager.request('/catalog/products', { method: 'POST', body: { productName: 'USB-C Dock', category: 'Accessories' } })).status, 403);
  for (const path of ['/catalog/products', '/catalog/vendors', '/requests', '/requests/queue']) {
    assert.equal((await employee.request(path, { authenticated: false })).status, 401);
  }
  assert.deepEqual(employee.events, []);
});

test('an employee request is stored as Pending for the signed-in employee only', async t => {
  const { request, queries, events } = await fixture(t, 'Employee');
  const response = await request('/requests', { method: 'POST', body: requestBody });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { requestId: 16 });
  const header = queries.find(query => query.sql.startsWith('INSERT INTO Purchase_Request'));
  assert.deepEqual(header.params, [1, 'Keyboards for the lab']);
  assert.match(header.sql, /CURDATE\(\), 'Pending'/);
  assert.equal(queries.some(query => query.params.includes(999)), false);
  assert.deepEqual(events.filter(event => event !== 'release'), ['begin', 'commit']);
});

test('employees only query their own requests, and search values stay bound', async t => {
  const employee = await fixture(t, 'Employee');
  const manager = await fixture(t, 'Manager');
  const search = "Sara%' OR 1=1 --";
  assert.equal((await employee.request(`/requests?search=${encodeURIComponent(search)}&status=Pending`)).status, 200);
  assert.equal((await manager.request('/requests?status=Approved')).status, 200);
  const employeeQuery = employee.queries.find(query => query.sql.includes('AS numberOfItems'));
  const managerQuery = manager.queries.find(query => query.sql.includes('AS numberOfItems'));
  assert.deepEqual(employeeQuery.params.slice(0, 2), [0, 1]);
  assert.equal(employeeQuery.params.at(-2), search);
  assert.equal(employeeQuery.params.at(-1), 'Pending');
  assert.match(employeeQuery.sql, /LOCATE\(LOWER\(\?\)/);
  assert.equal(employeeQuery.sql.includes(search), false);
  assert.deepEqual(managerQuery.params, [1, 5, 'Approved']);
});

test('a hidden request returns not found and a bad quantity never opens a transaction', async t => {
  const { request, queries, events } = await fixture(t, 'Employee');
  assert.equal((await request('/requests/99')).status, 404);
  assert.equal(queries.length, 1);
  const invalid = await request('/requests', { method: 'POST', body: { justification: 'Too many', items: [{ productId: 3, quantity: 0, estimatedUnitPrice: 40 }, { productId: 3, quantity: 1, estimatedUnitPrice: 40 }] } });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /once|greater than zero/);
  assert.deepEqual(events, []);
});

test('approval calls the existing procedure and returns its business rule message', async t => {
  const { request, queries } = await fixture(t, 'Manager');
  const saved = await request('/requests/14/decision', { method: 'POST', body: { decision: 'Approved', comments: 'Approved through the app' } });
  assert.equal(saved.status, 200);
  const call = queries.find(query => query.sql.startsWith('CALL '));
  assert.match(call.sql, /CALL sp_decide_purchase_request\(\?, \?, \?, CURDATE\(\), \?\)/);
  assert.deepEqual(call.params, [14, 5, 'Approved', 'Approved through the app']);
  assert.equal(queries.some(query => /INSERT INTO Approval|UPDATE Purchase_Request/i.test(query.sql)), false);
  const rejected = await request('/requests/13/decision', { method: 'POST', body: { decision: 'Rejected', comments: 'Already decided' } });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), { error: 'Only pending requests can be decided' });
});

test('purchasing can add catalog rows and delete only a supplier listing', async t => {
  const { request, queries } = await fixture(t, 'Purchasing');
  assert.equal((await request('/catalog/products', { method: 'POST', body: { productName: 'USB-C Dock', description: 'Docking station', category: 'Accessories' } })).status, 201);
  const product = queries.find(query => query.sql.startsWith('INSERT INTO Product'));
  assert.deepEqual(product.params, ['USB-C Dock', 'Docking station', 'Accessories']);
  assert.equal((await request('/catalog/vendors', { method: 'POST', body: vendorBody })).status, 201);
  assert.equal((await request('/catalog/vendors/11/listings/3', { method: 'DELETE' })).status, 200);
  const deleted = queries.find(query => query.sql.startsWith('DELETE'));
  assert.equal(deleted.sql, 'DELETE FROM Vendor_Product WHERE VendorID = ? AND ProductID = ?');
  assert.deepEqual(deleted.params, [11, 3]);
  assert.equal(queries.some(query => /DELETE FROM Vendor\b|DELETE FROM Product\b/.test(query.sql)), false);
});

test('a failed request item rolls the new request back', async () => {
  const { repository, events } = database({ failItems: true });
  await assert.rejects(() => repository.createRequest(1, { justification: 'Lab keyboards', items: [{ productId: 3, quantity: 5, estimatedUnitPrice: '40.00' }] }), /simulated item failure/);
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});
