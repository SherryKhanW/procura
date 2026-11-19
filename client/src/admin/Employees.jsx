import React, { useState } from 'react';
import { api } from '../api.js';
import { AdminModal, FormActions, useAdminData } from './shared.jsx';

function EmployeeForm({ employee, departments, roles, actorId, onClose, onSaved, onExpired }) {
  const creating = !employee;
  const [fields, setFields] = useState(() => ({ firstName: employee?.firstName ?? '', lastName: employee?.lastName ?? '',
    email: employee?.email ?? '', role: employee?.role ?? 'Employee', departmentId: employee?.departmentId ?? '',
    isActive: employee ? employee.isActive : true, password: '', confirmation: '' }));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const own = employee?.employeeId === actorId;
  const change = event => setFields(previous => ({ ...previous, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError('');
    if (creating && fields.password !== fields.confirmation) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const { confirmation, password, ...values } = fields;
      await api(creating ? '/admin/users' : `/admin/users/${employee.employeeId}`, {
        method: creating ? 'POST' : 'PUT', body: { ...values, departmentId: Number(values.departmentId),
          ...(creating ? { password } : { version: employee.version }) },
      });
      onSaved(creating ? 'Employee created. Their account is ready to use when active.' : 'Employee updated.', own);
    } catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); }
    finally { setBusy(false); }
  }
  return <AdminModal title={creating ? 'Add employee' : 'Edit employee'} busy={busy} onClose={onClose}><form onSubmit={submit}>
    <div className="form-grid"><div><label htmlFor="employee-first">First name</label><input autoFocus id="employee-first" name="firstName" required maxLength={100} value={fields.firstName} onChange={change} /></div>
      <div><label htmlFor="employee-last">Last name</label><input id="employee-last" name="lastName" required maxLength={100} value={fields.lastName} onChange={change} /></div></div>
    <label htmlFor="employee-email">Work email</label><input id="employee-email" name="email" type="email" placeholder="you@procura.co" required maxLength={255} value={fields.email} onChange={change} />
    <div className="form-grid"><div><label htmlFor="employee-role">Role</label><select id="employee-role" name="role" required disabled={own} value={fields.role} onChange={change}>{roles.map(role => <option key={role}>{role}</option>)}</select></div>
      <div><label htmlFor="employee-department">Department</label><select id="employee-department" name="departmentId" required value={fields.departmentId} onChange={change}><option value="">Choose department</option>{departments.map(department => <option key={department.departmentId} value={department.departmentId}>{department.departmentName}</option>)}</select></div></div>
    <label className="checkbox-label"><input type="checkbox" name="isActive" disabled={own} checked={fields.isActive} onChange={change} />Allow this employee to sign in</label>
    {own ? <p className="form-help">Your own Admin access stays enabled.</p> : <p className="form-help">Changes to role, department, email, or activation sign this employee out.</p>}
    {creating && <><label htmlFor="employee-password">Initial application password</label><input id="employee-password" name="password" autoComplete="new-password" type="password" required minLength={12} maxLength={256} value={fields.password} onChange={change} />
      <label htmlFor="employee-confirm">Confirm password</label><input id="employee-confirm" name="confirmation" autoComplete="new-password" type="password" required minLength={12} maxLength={256} value={fields.confirmation} onChange={change} />
      <p className="form-help">Use 12–128 characters. Share the password with the employee privately.</p></>}
    {error && <p className="error" role="alert">{error}</p>}<FormActions busy={busy} onClose={onClose} label={creating ? 'Create employee' : 'Save changes'} />
  </form></AdminModal>;
}

function EmployeePassword({ employee, onClose, onSaved, onExpired }) {
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError('');
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await api(`/admin/users/${employee.employeeId}/password`, { method: 'POST', body: { password, version: employee.version } });
      onSaved('Password saved. Previous sessions were revoked. Account activation was preserved.');
    } catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); }
    finally { setBusy(false); }
  }
  return <AdminModal title={employee.passwordConfigured ? 'Reset employee password' : 'Set employee password'} busy={busy} onClose={onClose}><form onSubmit={submit}>
    <p className="muted">Set a password for <strong>{employee.firstName} {employee.lastName}</strong> ({employee.email}). This signs them out on all devices.</p>
    <label htmlFor="admin-new-password">New application password</label><input autoFocus id="admin-new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} />
    <label htmlFor="admin-confirm-password">Confirm password</label><input id="admin-confirm-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
    <p className="form-help">Use 12–128 characters and share the new password privately. Inactive accounts remain inactive.</p>
    {error && <p className="error" role="alert">{error}</p>}<FormActions busy={busy} onClose={onClose} label="Save password" />
  </form></AdminModal>;
}

export function Employees({ user, onExpired, onIdentityChanged }) {
  const [search, setSearch] = useState(''); const [appliedSearch, setAppliedSearch] = useState('');
  const [role, setRole] = useState(''); const [departmentId, setDepartment] = useState(''); const [status, setStatus] = useState('');
  const [editor, setEditor] = useState(null); const [passwordEmployee, setPasswordEmployee] = useState(null); const [notice, setNotice] = useState('');
  const params = new URLSearchParams(Object.entries({ search: appliedSearch, role, departmentId, status }).filter(([, value]) => value));
  const collection = useAdminData(`/admin/users?${params}`, onExpired);
  const departments = useAdminData('/admin/departments', onExpired);
  const users = collection.data?.users ?? []; const roles = collection.data?.roles ?? [];
  function saved(message, own = false) { setEditor(null); setPasswordEmployee(null); setNotice(message); collection.reload(); if (own) onIdentityChanged(); }
  const disabled = collection.loading || departments.loading || !departments.data || !collection.data;
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">ADMINISTRATION</p><h2>Employees & access</h2></div><button className="primary" disabled={disabled} onClick={() => { setNotice(''); setEditor({ employee: null }); }}>Add employee</button></div>
    <p className="muted">Manage employee roles, departments, and account access. Deactivate accounts to retain purchasing history.</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    <form className="filters" onSubmit={event => { event.preventDefault(); setAppliedSearch(search.trim()); }}>
      <div className="filter-search"><label htmlFor="employee-search">Search employees</label><input id="employee-search" placeholder="Name or email" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></div>
      <div><label htmlFor="role-filter">Role</label><select id="role-filter" value={role} onChange={event => setRole(event.target.value)}><option value="">All roles</option>{roles.map(value => <option key={value}>{value}</option>)}</select></div>
      <div><label htmlFor="department-filter">Department</label><select id="department-filter" value={departmentId} onChange={event => setDepartment(event.target.value)}><option value="">All departments</option>{departments.data?.departments.map(department => <option key={department.departmentId} value={department.departmentId}>{department.departmentName}</option>)}</select></div>
      <div><label htmlFor="status-filter">Access</label><select id="status-filter" value={status} onChange={event => setStatus(event.target.value)}><option value="">All accounts</option><option value="ready">Ready</option><option value="pending">Password needed</option><option value="inactive">Inactive</option></select></div>
      <button type="submit">Search</button><button type="button" onClick={() => { setSearch(''); setAppliedSearch(''); setRole(''); setDepartment(''); setStatus(''); collection.reload(); departments.reload(); }}>Reset / refresh</button>
    </form>
    {(collection.error || departments.error) && <p className="error" role="alert">{collection.error || departments.error}</p>}
    {collection.loading && <p role="status">Loading employees…</p>}
    {!collection.loading && !collection.error && <><p className="result-count">{users.length} employee{users.length === 1 ? '' : 's'} found</p><div className="table-scroll"><table>
      <thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Sign-in access</th><th>Actions</th></tr></thead><tbody>{users.map(person => <tr key={person.employeeId}><td><strong>{person.firstName} {person.lastName}{person.employeeId === user.employeeId ? ' (you)' : ''}</strong><small>{person.email}</small></td><td>{person.departmentName}</td><td><span className="role">{person.role}</span></td><td><span className={`access-status ${person.isActive && person.passwordConfigured ? 'access-ready' : ''}`}>{!person.isActive ? 'Inactive' : person.passwordConfigured ? 'Ready' : 'Password needed'}</span></td><td><div className="row-actions"><button disabled={disabled} onClick={() => { setNotice(''); setEditor({ employee: person }); }}>Edit</button>{person.employeeId !== user.employeeId && <button disabled={disabled} onClick={() => { setNotice(''); setPasswordEmployee(person); }}>{person.passwordConfigured ? 'Reset password' : 'Set password'}</button>}</div></td></tr>)}</tbody>
    </table>{!users.length && <p className="empty-state">No employees match these filters.</p>}</div></>}
    {editor && <EmployeeForm employee={editor.employee} departments={departments.data.departments} roles={roles} actorId={user.employeeId} onClose={() => setEditor(null)} onSaved={saved} onExpired={onExpired} />}
    {passwordEmployee && <EmployeePassword employee={passwordEmployee} onClose={() => setPasswordEmployee(null)} onSaved={saved} onExpired={onExpired} />}
  </section>;
}
