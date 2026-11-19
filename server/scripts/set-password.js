import { createInterface, emitKeypressEvents } from 'node:readline';
import { createDatabaseConnection } from '../src/db.js';
import { createAuthRepository } from '../src/auth/repository.js';
import { hashPassword, normalizeEmail, validPassword } from '../src/auth/passwords.js';
import { permissionsFor } from '../src/auth/permissions.js';

function ask(question) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => prompt.question(question, answer => { prompt.close(); resolve(answer); }));
}

function secret(question) {
  // A real terminal is required: never accept passwords in shell arguments,
  // environment variables, redirected files, logs, or command history.
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run auth:set-password in an interactive terminal.');
  process.stdout.write(question);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let password = '';
    const finish = () => {
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') { finish(); reject(new Error('Cancelled.')); }
      else if (key.name === 'return' || key.name === 'enter') { finish(); resolve(password); }
      else if (key.name === 'backspace') password = [...password].slice(0, -1).join('');
      else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text) && [...password].length < 129) password += text;
    };
    process.stdin.on('keypress', onKey);
  });
}

let connection;
try {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run auth:set-password in an interactive terminal.');
  const email = normalizeEmail(await ask('Existing employee email (@procura.co): '));
  if (!email) throw new Error('Enter an existing @procura.co employee email.');
  connection = await createDatabaseConnection();
  const repository = createAuthRepository({
    query: (...args) => connection.query(...args),
    getConnection: async () => ({
      query: (...args) => connection.query(...args),
      beginTransaction: () => connection.beginTransaction(),
      commit: () => connection.commit(),
      rollback: () => connection.rollback(),
      release() {},
    }),
  });
  const record = await repository.findLogin(email);
  if (!record || !permissionsFor(record.role).length) throw new Error('No authorized Login record with a supported role exists for this email.');
  const password = await secret('New application password (12–128 characters; hidden): ');
  if (!validPassword(password)) throw new Error('Use a password between 12 and 128 characters.');
  if (password !== await secret('Confirm application password (hidden): ')) throw new Error('Passwords do not match. Nothing was changed.');
  const updated = await repository.replacePassword(record.loginId, record.passwordHash, await hashPassword(password));
  if (!updated) throw new Error('The account changed while you were entering a password. Retry.');
  console.log(`Application password saved. Previous sessions were revoked.${record.isActive ? '' : ' The account remains inactive.'}`);
} catch (error) {
  console.error(error.code ? `Password setup failed (${error.code}). Check the database connection, import database/05-auth.sql, and verify grants. No credentials were printed.` : error.message);
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}
