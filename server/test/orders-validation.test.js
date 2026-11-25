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
      if (sql.includes('FROM Purchase_Order_Item AS poi INNER JOIN Purchase_Order')) return [{ poItemId: 7, poId: 3, quantityOrdered: 10, orderStatus: 'Open', alreadyReceived: 8 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
    async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); }, release() { events.push('release'); },
  };
  const repository = createProcurementRepository({ async getConnection() { return connection; } });
  await assert.rejects(() => repository.recordDelivery(7, { deliveryDate: '2026-11-25', items: [{ poItemId: 7, quantity: 3 }] }), /cannot exceed/);
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});
