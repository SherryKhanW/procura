import React, { useState } from 'react';
import { api } from '../api.js';
import { AdminModal, FormActions, useAdminData } from './shared.jsx';

function DepartmentForm({ department, onClose, onSaved, onExpired }) {
  const [name, setName] = useState(department?.departmentName ?? '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(department ? `/admin/departments/${department.departmentId}` : '/admin/departments', {
        method: department ? 'PUT' : 'POST', body: { departmentName: name, ...(department ? { version: department.version } : {}) },
      });
      onSaved(department ? 'Department updated. Employee assignments were preserved.' : 'Department created.');
    } catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); }
    finally { setBusy(false); }
  }
  return <AdminModal title={department ? 'Rename department' : 'Add department'} busy={busy} onClose={onClose}><form onSubmit={submit}>
    <label htmlFor="department-name">Department name</label><input autoFocus id="department-name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} />
    <p className="form-help">Renaming a department keeps its employees and purchasing records connected.</p>
    {error && <p className="error" role="alert">{error}</p>}<FormActions busy={busy} onClose={onClose} label={department ? 'Save changes' : 'Create department'} />
  </form></AdminModal>;
}

export function Departments({ onExpired }) {
  const collection = useAdminData('/admin/departments', onExpired);
  const [search, setSearch] = useState(''); const [editor, setEditor] = useState(null); const [notice, setNotice] = useState('');
  const rows = (collection.data?.departments ?? []).filter(department => department.departmentName.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">ADMINISTRATION</p><h2>Departments</h2></div><button className="primary" disabled={collection.loading || !collection.data} onClick={() => { setNotice(''); setEditor({ department: null }); }}>Add department</button></div>
    <p className="muted">Organize employees by department and keep assignments up to date.</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    <div className="filters"><div className="filter-search"><label htmlFor="department-search">Search departments</label><input id="department-search" maxLength={100} placeholder="Department name" value={search} onChange={event => setSearch(event.target.value)} /></div><button onClick={collection.reload}>Refresh</button></div>
    {collection.error && <p className="error" role="alert">{collection.error}</p>}
    {collection.loading ? <p role="status">Loading departments…</p> : !collection.error && <div className="table-scroll"><table><thead><tr><th>Department</th><th>Employees</th><th>Actions</th></tr></thead><tbody>{rows.map(department => <tr key={department.departmentId}><td><strong>{department.departmentName}</strong></td><td>{department.employeeCount}</td><td><button onClick={() => { setNotice(''); setEditor({ department }); }}>Rename</button></td></tr>)}</tbody></table>{!rows.length && <p className="empty-state">No departments match your search.</p>}</div>}
    {editor && <DepartmentForm department={editor.department} onClose={() => setEditor(null)} onSaved={message => { setEditor(null); setNotice(message); collection.reload(); }} onExpired={onExpired} />}
  </section>;
}
