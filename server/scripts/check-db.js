import { createDatabasePool } from '../src/db.js';

const expected = ['Department', 'Employee', 'Product', 'Vendor', 'Vendor_Product', 'Purchase_Request', 'Purchase_Request_Item', 'Approval', 'Purchase_Order', 'Purchase_Order_Item', 'Delivery', 'Delivery_Item', 'Invoice', 'Invoice_Item', 'Payment', 'Login'];
let pool;
try {
  pool = createDatabasePool();
  const tables = await pool.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = ?', ['BASE TABLE']);
  const missing = expected.filter(name => !tables.some(row => row.name === name));
  if (missing.length) throw new Error(`Missing expected tables: ${missing.join(', ')}`);
  console.log('Connected. All 16 expected tables are visible. Verify routine/trigger installation separately using the setup account.');
} catch (error) {
  // Driver messages can include connection details; do not log them.
  console.error(error.code ? `Database check failed (${error.code}). Verify server/.env and database access.` : error.message);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
