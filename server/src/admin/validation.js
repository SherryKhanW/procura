import { createHash } from 'node:crypto';
import { normalizeEmail, validPassword } from '../auth/passwords.js';
import { employeeRoles } from '../auth/permissions.js';

export class AdminError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
    throw new AdminError(400, 'Choose a valid record.');
  }
  return Number(value);
}

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > max || /[\x00-\x1f\x7f]/.test(value)) {
    throw new AdminError(400, `${label} is required and must be at most ${max} characters.`);
  }
  return value.trim();
}

export function employeeInput(body, creating = false) {
  const email = normalizeEmail(body?.email);
  if (!email) throw new AdminError(400, 'Enter a valid @procura.co email.');
  if (!employeeRoles.includes(body?.role)) throw new AdminError(400, 'Choose a supported employee role.');
  if (typeof body?.isActive !== 'boolean') throw new AdminError(400, 'Account activation must be true or false.');
  const data = {
    firstName: text(body?.firstName, 'First name', 100),
    lastName: text(body?.lastName, 'Last name', 100),
    email, role: body.role, departmentId: positiveId(body.departmentId), isActive: body.isActive,
  };
  if (creating) {
    if (!validPassword(body.password)) throw new AdminError(400, 'Use an application password between 12 and 128 characters.');
    return { ...data, password: body.password };
  }
  return { ...data, version: versionInput(body?.version) };
}

export function departmentInput(body, creating = false) {
  const data = { departmentName: text(body?.departmentName, 'Department name', 100) };
  return creating ? data : { ...data, version: versionInput(body?.version) };
}

export function versionInput(version) {
  if (!/^[a-f0-9]{64}$/.test(typeof version === 'string' ? version : '')) throw new AdminError(400, 'Refresh this list before saving changes.');
  return version;
}

const digest = values => createHash('sha256').update(JSON.stringify(values)).digest('hex');
export function employeeVersion(row) {
  // Only public fields; the version never encodes a password or password hash.
  return digest([row.employeeId, row.firstName, row.lastName, row.email, row.role, row.departmentId, Boolean(row.isActive), Boolean(row.passwordConfigured)]);
}
export const departmentVersion = row => digest([row.departmentId, row.departmentName]);

export function userFilters(query) {
  const search = query.search === undefined || query.search === '' ? '' : text(query.search, 'Search', 100);
  const role = query.role === undefined || query.role === '' ? null : query.role;
  if (role !== null && !employeeRoles.includes(role)) throw new AdminError(400, 'Choose a supported role filter.');
  const departmentId = query.departmentId === undefined || query.departmentId === '' ? null : positiveId(query.departmentId);
  const status = query.status === undefined || query.status === '' ? null : query.status;
  if (status !== null && !['ready', 'inactive', 'pending'].includes(status)) throw new AdminError(400, 'Choose a supported account status.');
  return { search, role, departmentId, status };
}
