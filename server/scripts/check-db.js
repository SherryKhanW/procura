import { createDatabaseConnection } from '../src/db.js';
import { readDatabaseConfig } from '../src/config.js';

const expected = ['Department', 'Employee', 'Product', 'Vendor', 'Vendor_Product', 'Purchase_Request', 'Purchase_Request_Item', 'Approval', 'Purchase_Order', 'Purchase_Order_Item', 'Delivery', 'Delivery_Item', 'Invoice', 'Invoice_Item', 'Payment', 'Login'];
let connection;
try {
  const config = readDatabaseConfig();
  connection = await createDatabaseConnection();
  const tls = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  if (config.sslEnabled && !tls.some(row => row.Value)) throw new Error('The database connection did not negotiate TLS.');
  const tables = await connection.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = ?', ['BASE TABLE']);
  const missing = expected.filter(name => !tables.some(row => row.name === name));
  if (missing.length) throw new Error(`Missing expected tables: ${missing.join(', ')}`);
  if (!tables.some(row => row.name === 'Login_Session')) throw new Error('Import database/05-auth.sql using the setup account to enable password login and shared sessions.');
  await connection.query('SELECT PasswordHash FROM Login LIMIT 0');
  // Check the logged-in account's own grants. Never print SHOW GRANTS output:
  // MariaDB may include authentication hashes in its USAGE statement.
  const grants = await connection.query('SHOW GRANTS');
  for (const statement of grants.flatMap(row => Object.values(row))) {
    const grant = String(statement);
    const privilegeList = grant.match(/^GRANT (.+?) ON /i)?.[1];
    if (!privilegeList) throw new Error('Unexpected role grants. Review the runtime account privileges.');
    if (/\b(ALL PRIVILEGES|CREATE|ALTER|DROP|TRIGGER|SUPER|FILE|PROCESS|RELOAD|SHUTDOWN)\b/i.test(privilegeList) || /\bWITH GRANT OPTION\b/i.test(grant)) {
      throw new Error('This account has administrative or delegation privileges. Use the restricted app account.');
    }
  }
  const routines = await connection.query('SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = ?', ['sp_decide_purchase_request']);
  if (!routines.length) throw new Error('The approval procedure is missing or not visible to this account. Verify its EXECUTE grant.');
  // Identifiers come only from the static expected list, never from user input.
  for (const table of expected) await connection.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
  await connection.query('SELECT COUNT(*) AS total FROM Login_Session');
  console.log(`Connected${config.sslEnabled ? ' over verified TLS' : ' (local TLS disabled)'}. All 16 business tables and the shared session table are readable, the password column and approval procedure are visible, and no direct schema-administration or grant-delegation privileges were found.`);
  console.log('Procedure execution, trigger behavior, and application concurrency require separate integration tests.');
} catch (error) {
  // Driver messages can include connection details; do not log them.
  const hints = {
    ENOTFOUND: 'DNS could not resolve DB_HOST. Check the hostname and your network or VPN. The password has not been checked.',
    EAI_AGAIN: 'DNS lookup temporarily failed. Check your network or VPN and retry. The password has not been checked.',
    ECONNREFUSED: 'The host refused the connection. Check DB_PORT and whether the database service is running.',
    ETIMEDOUT: 'The network connection timed out. Check port 3306 access, VPN/firewall settings, and database IP restrictions.',
    ER_CONNECTION_TIMEOUT: 'The server did not complete the connection in time. Check network access and database availability.',
    ER_ACCESS_DENIED_ERROR: 'Authentication failed. Verify DB_USER and DB_PASSWORD match the procura_app account.',
    ER_DBACCESS_DENIED_ERROR: 'The account cannot access DB_NAME. Verify the database name and account grants.',
    ER_BAD_DB_ERROR: 'DB_NAME does not exist on this server. Verify it is procura_db.',
    ER_BAD_FIELD_ERROR: 'The authentication schema may be missing. Import database/05-auth.sql using the setup account.',
    ERR_TLS_CERT_ALTNAME_INVALID: 'TLS certificate hostname validation failed. Verify DB_HOST and the provider certificate; keep certificate verification enabled.',
    CERT_HAS_EXPIRED: 'The TLS certificate has expired. Check the system clock and provider certificate.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'The TLS certificate chain could not be verified. Configure the provider CA using DB_SSL_CA.',
    SELF_SIGNED_CERT_IN_CHAIN: 'The TLS certificate chain is not trusted. Configure the provider CA using DB_SSL_CA.',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'The server certificate is self-signed. Configure the provider CA using DB_SSL_CA.',
  };
  console.error(error.code ? `Database check failed (${error.code}). ${hints[error.code] || 'Verify server/.env and database access.'}` : error.message);
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}
