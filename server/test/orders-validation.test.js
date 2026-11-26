import test from 'node:test';
import assert from 'node:assert/strict';
import { createProcurementRepository } from '../src/procurement/repository.js';
import { ProcurementError, deliveryInput, orderInput } from '../src/procurement/validation.js';

test('order validation requires complete, distinct lines and a sensible delivery date', () => {
  assert.throws(() => orderInput({ requestId: 1, vendorId: 1, orderDate: '2026-11-25', expectedDeliveryDate: '2026-11-24', items: [{ productId: 1, quantity: 1, unitPrice: '1.00' }] }), ProcurementError);
  assert.throws(() => orderInput({ requestId: 1, vendorId: 1, orderDate: '2026-11-25', expectedDeliveryDate: '2026-11-26', items: [{ productId: 1, quantity: 1, unitPrice: '1.00' }, { productId: 1, quantity: 2, unitPrice: '1.00' }] }), /only appear once/);
});

test('delivery validation rejects duplicate order items before any database transaction', () => {
  assert.throws(() => deliveryInput({ deliveryDate: '2026-11-25', items: [{ poItemId: 1, quantity: 1 }, { poItemId: 1, quantity: 1 }] }), /only once/);
});

function orderFixture() {
  const events = []; const queries = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT Status FROM Purchase_Request')) return [{ Status: 'Approved' }];
      if (sql.startsWith('SELECT POID FROM Purchase_Order')) return [];
      if (sql.startsWith('SELECT ProductID AS productId FROM Purchase_Request_Item')) return [{ productId: 3 }, { productId: 9 }];
      if (sql.startsWith('SELECT VendorID FROM Vendor')) return [{ VendorID: 2 }];
      if (sql.startsWith('SELECT ProductID AS productId FROM Vendor_Product')) return [{ productId: 3 }, { productId: 9 }];
      if (sql.startsWith('INSERT INTO Purchase_Order ')) return { insertId: 31n };
      return { affectedRows: 1 };
    },
    async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); }, release() { events.push('release'); },
  };
  return { repository: createProcurementRepository({ async getConnection() { return connection; } }), events, queries };
}

test('creating an order locks and rechecks the approved request before saving all lines', async () => {
  const { repository, events, queries } = orderFixture();
  const result = await repository.createOrder({ requestId: 14, vendorId: 2, orderDate: '2026-11-25', expectedDeliveryDate: '2026-11-28', items: [{ productId: 9, quantity: 2, unitPrice: '20.00' }, { productId: 3, quantity: 5, unitPrice: '40.00' }] });
  assert.deepEqual(result, { poId: 31 });
  assert.deepEqual(events, ['begin', 'commit', 'release']);
  assert.match(queries[0].sql, /FOR UPDATE/);
  assert.equal(queries.filter(query => query.sql.startsWith('INSERT INTO Purchase_Order_Item')).length, 2);
});

test('over-receiving rolls the delivery transaction back', async () => {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async query(sql) {
      if (sql.includes('FROM Purchase_Order_Item WHERE POItemID IN')) return [{ poItemId: 7, poId: 3 }];
      if (sql.includes('FROM Purchase_Order WHERE POID IN')) return [{ poId: 3, orderStatus: 'Open' }];
      if (sql.includes('QuantityOrdered AS quantityOrdered')) return [{ poItemId: 7, poId: 3, quantityOrdered: 10 }];
      if (sql.includes('FROM Delivery_Item WHERE POItemID IN')) return [{ poItemId: 7, quantityReceived: 8 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); }, release() { events.push('release'); },
  };
  const repository = createProcurementRepository({ async getConnection() { return connection; } });
  await assert.rejects(() => repository.recordDelivery(7, { deliveryDate: '2026-11-25', items: [{ poItemId: 7, quantity: 3 }] }), /cannot exceed/);
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});

function concurrentDeliveryFixture() {
  const orderItems = new Map([
    [11, { poItemId: 11, poId: 1, quantityOrdered: 10 }],
    [22, { poItemId: 22, poId: 2, quantityOrdered: 10 }],
  ]);
  const received = new Map([[11, []], [22, []]]);
  const locks = new Map(); let nextConnectionId = 1; let nextDeliveryId = 1;

  async function acquire(connection, poId) {
    while (locks.has(poId) && locks.get(poId).owner !== connection.id) {
      await new Promise(resolve => locks.get(poId).waiters.push(resolve));
    }
    if (!locks.has(poId)) locks.set(poId, { owner: connection.id, waiters: [] });
    connection.held.add(poId);
  }

  function release(connection) {
    for (const poId of connection.held) {
      const lock = locks.get(poId); const next = lock.waiters.shift();
      if (next) { locks.delete(poId); next(); } else locks.delete(poId);
    }
    connection.held.clear();
  }

  function makeConnection() {
    const connection = {
      id: nextConnectionId++, held: new Set(), pending: [],
      async beginTransaction() {},
      async query(sql, params = []) {
        if (sql.includes('FROM Purchase_Order_Item WHERE POItemID IN') && !sql.includes('QuantityOrdered')) {
          return params.map(poItemId => orderItems.get(poItemId)).filter(Boolean).map(({ poItemId, poId }) => ({ poItemId, poId }));
        }
        if (sql.includes('FROM Purchase_Order WHERE POID IN')) {
          for (const poId of params) await acquire(connection, poId);
          return params.map(poId => ({ poId, orderStatus: 'Open' }));
        }
        if (sql.includes('QuantityOrdered AS quantityOrdered')) {
          return [...orderItems.values()].filter(item => params.includes(item.poId));
        }
        if (sql.includes('FROM Delivery_Item WHERE POItemID IN')) {
          return params.flatMap(poItemId => received.get(poItemId).map(quantityReceived => ({ poItemId, quantityReceived })));
        }
        if (sql.startsWith('INSERT INTO Delivery (')) return { insertId: BigInt(nextDeliveryId++) };
        if (sql.startsWith('INSERT INTO Delivery_Item')) {
          connection.pending.push({ poItemId: params[1], quantity: params[2] }); return { affectedRows: 1 };
        }
        if (sql.startsWith('UPDATE Purchase_Order')) return { affectedRows: 1 };
        throw new Error(`Unexpected query: ${sql}`);
      },
      async commit() {
        for (const item of connection.pending) received.get(item.poItemId).push(item.quantity);
        connection.pending = []; release(connection);
      },
      async rollback() { connection.pending = []; release(connection); },
      release() { release(connection); },
    };
    return connection;
  }

  return {
    repository: createProcurementRepository({ async getConnection() { return makeConnection(); } }),
    total: poItemId => received.get(poItemId).reduce((sum, quantity) => sum + quantity, 0),
  };
}

test('overlapping consolidated deliveries serialize before reading received totals', async () => {
  const fixture = concurrentDeliveryFixture();
  const results = await Promise.allSettled([
    fixture.repository.recordDelivery(7, { deliveryDate: '2026-11-25', items: [{ poItemId: 11, quantity: 6 }, { poItemId: 22, quantity: 1 }] }),
    fixture.repository.recordDelivery(8, { deliveryDate: '2026-11-25', items: [{ poItemId: 11, quantity: 6 }] }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /cannot exceed/);
  assert.equal(fixture.total(11), 6);
  assert.ok(fixture.total(22) <= 1);
});
