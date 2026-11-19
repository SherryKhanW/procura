import { createDatabasePool } from '../src/db.js';
import { readDatabaseConfig } from '../src/config.js';

const expected = ['Department', 'Employee', 'Product', 'Vendor', 'Vendor_Product', 'Purchase_Request', 'Purchase_Request_Item', 'Approval', 'Purchase_Order', 'Purchase_Order_Item', 'Delivery', 'Delivery_Item', 'Invoice', 'Invoice_Item', 'Payment', 'Login'];
let pool;
try {
  const config = readDatabaseConfig();
  pool = createDatabasePool();
  const tls = await pool.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  if (config.sslEnabled && !tls.some(row => row.Value)) throw new Error('The database connection did not negotiate TLS.');
  const tables = await pool.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = ?', ['BASE TABLE']);
  const missing = expected.filter(name => !tables.some(row => row.name === name));
  if (missing.length) throw new Error(`Missing expected tables: ${missing.join(', ')}`);
  // Check the logged-in account's own grants. Never print SHOW GRANTS output:
  // MariaDB may include authentication hashes in its USAGE statement.
  const grants = await pool.query('SHOW GRANTS');
  for (const statement of grants.flatMap(row => Object.values(row))) {
    const grant = String(statement);
    const privilegeList = grant.match(/^GRANT (.+?) ON /i)?.[1];
    if (!privilegeList) throw new Error('Unexpected role grants. Review the runtime account privileges.');
    if (/\b(ALL PRIVILEGES|CREATE|ALTER|DROP|TRIGGER|SUPER|FILE|PROCESS|RELOAD|SHUTDOWN)\b/i.test(privilegeList) || /\bWITH GRANT OPTION\b/i.test(grant)) {
      throw new Error('This account has administrative or delegation privileges. Use the restricted app account.');
    }
  }
  const routines = await pool.query('SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = ?', ['sp_decide_purchase_request']);
  if (!routines.length) throw new Error('The approval procedure is missing or not visible to this account. Verify its EXECUTE grant.');
  // Identifiers come only from the static expected list, never from user input.
  for (const table of expected) await pool.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
  console.log(`Connected${config.sslEnabled ? ' over verified TLS' : ' (local TLS disabled)'}. All 16 tables are readable, the approval procedure is visible, and no direct schema-administration or grant-delegation privileges were found.`);
  console.log('Procedure execution, trigger behavior, and application concurrency require separate integration tests.');
} catch (error) {
  // Driver messages can include connection details; do not log them.
  console.error(error.code ? `Database check failed (${error.code}). Verify server/.env and database access.` : error.message);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
