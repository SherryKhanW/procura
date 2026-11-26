import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { Employees } from './admin/Employees.jsx';
import { Departments } from './admin/Departments.jsx';
import { Requests } from './procurement/Requests.jsx';
import { Approvals } from './procurement/Approvals.jsx';
import { Vendors } from './procurement/Vendors.jsx';
import { Products } from './procurement/Products.jsx';
import { Orders } from './procurement/Orders.jsx';
import { Deliveries } from './procurement/Deliveries.jsx';
import './styles.css';

function SignIn({ onSignIn, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: { email, password } });
      setPassword(''); onSignIn(user);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><h1>Sign in</h1>
    {notice && <p className="notice" role="status">{notice}</p>}
    <form onSubmit={submit}>
      <label htmlFor="email">Email</label><input id="email" type="email" name="email" autoComplete="username" required maxLength={255} value={email} onChange={event => setEmail(event.target.value)} />
      <label htmlFor="password">Password</label><input id="password" type="password" name="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>;
}

function PasswordForm({ onChanged, onExpired }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError('');
    if (newPassword !== confirmation) { setError('New passwords do not match.'); return; }
    setBusy(true);
    try { await api('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }); onChanged(); }
    catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="panel account-panel"><h2>Change password</h2>
    <p>Use 12–128 characters. This signs you out everywhere.</p>
    <form onSubmit={submit}>
      <label htmlFor="current-password">Current password</label><input id="current-password" autoComplete="current-password" type="password" required maxLength={256} value={currentPassword} onChange={event => setCurrent(event.target.value)} />
      <label htmlFor="new-password">New password</label><input id="new-password" autoComplete="new-password" type="password" required minLength={12} maxLength={256} value={newPassword} onChange={event => setNew(event.target.value)} />
      <label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" autoComplete="new-password" type="password" required minLength={12} maxLength={256} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Update password'}</button>
    </form>
  </section>;
}

function Workspace({ user, onSignedOut, onUserChanged }) {
  const [page, setPage] = useState('overview');
  const [openRequestId, setOpenRequestId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const can = permission => user.permissions.includes(permission);
  const expired = React.useCallback(() => onSignedOut('Your session ended. Please sign in again.'), [onSignedOut]);
  const clearOpenRequest = React.useCallback(() => setOpenRequestId(null), []);
  const refreshIdentity = React.useCallback(() => api('/auth/me').then(({ user: current }) => onUserChanged(current))
    .catch(failure => { if (failure.status === 401) expired(); }), [onUserChanged, expired]);
  useEffect(() => {
    const timer = setInterval(refreshIdentity, 60_000);
    return () => clearInterval(timer);
  }, [refreshIdentity]);
  async function logout() {
    setBusy(true); setError('');
    try { await api('/auth/logout', { method: 'POST' }); onSignedOut('You have signed out.'); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className="workspace-layout"><aside className="sidebar"><nav aria-label="Pages">
    <button className={page === 'overview' ? 'nav-active' : ''} onClick={() => setPage('overview')}>Home</button>
    {can('requests:create') && <button className={page === 'requests' ? 'nav-active' : ''} onClick={() => setPage('requests')}>Purchase requests</button>}
    {can('requests:approve') && <button className={page === 'approvals' ? 'nav-active' : ''} onClick={() => setPage('approvals')}>Approvals</button>}
    {can('catalog:manage') && <button className={page === 'vendors' ? 'nav-active' : ''} onClick={() => setPage('vendors')}>Vendors</button>}
    {can('catalog:manage') && <button className={page === 'products' ? 'nav-active' : ''} onClick={() => setPage('products')}>Products</button>}
    {can('orders:read') && <button className={page === 'orders' ? 'nav-active' : ''} onClick={() => setPage('orders')}>Purchase orders</button>}
    {can('deliveries:read') && <button className={page === 'deliveries' ? 'nav-active' : ''} onClick={() => setPage('deliveries')}>Deliveries</button>}
    {can('employees:manage') && <button className={page === 'team' ? 'nav-active' : ''} onClick={() => setPage('team')}>Employees & access</button>}
    {can('departments:manage') && <button className={page === 'departments' ? 'nav-active' : ''} onClick={() => setPage('departments')}>Departments</button>}
    <button className={page === 'account' ? 'nav-active' : ''} onClick={() => setPage('account')}>Your account</button>
    </nav><p className="sidebar-bottom">{user.firstName} {user.lastName}<br />{user.role}</p>
  </aside><div className="workspace-main"><header className="workspace-header"><span>{user.departmentName}</span><button disabled={busy} onClick={logout}>{busy ? 'Signing out…' : 'Sign out'}</button></header>
    <main className="workspace-content">{error && <p className="error" role="alert">{error}</p>}
      {page === 'overview' && <section className="panel"><h1>Home</h1><p>Signed in as {user.email}.</p></section>}
      {page === 'requests' && can('requests:create') && <Requests user={user} openRequestId={openRequestId} onOpened={clearOpenRequest} onExpired={expired} />}
      {page === 'approvals' && can('requests:approve') && <Approvals onExpired={expired} onReview={requestId => { setOpenRequestId(requestId); setPage('requests'); }} />}
      {page === 'vendors' && can('catalog:manage') && <Vendors onExpired={expired} />}
      {page === 'products' && can('catalog:manage') && <Products onExpired={expired} />}
      {page === 'orders' && can('orders:read') && <Orders canManage={can('orders:manage')} onExpired={expired} />}
      {page === 'deliveries' && can('deliveries:read') && <Deliveries canManage={can('deliveries:manage')} onExpired={expired} />}
      {page === 'team' && can('employees:manage') && <Employees user={user} onExpired={expired} onIdentityChanged={refreshIdentity} />}
      {page === 'departments' && can('departments:manage') && <Departments onExpired={expired} />}
      {page === 'account' && <PasswordForm onExpired={expired} onChanged={() => onSignedOut('Password updated. Sign in with your new password.')} />}
    </main>
  </div></div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api('/auth/me', { signal: controller.signal }).then(data => setUser(data.user)).catch(failure => {
      if (failure.name !== 'AbortError' && failure.status !== 401) setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  const signedOut = React.useCallback(message => { setUser(null); setNotice(message); }, []);
  if (loading) return <main className="loading"><p role="status">Loading…</p></main>;
  if (error) return <main className="loading"><p className="error" role="alert">{error}</p><button className="primary" onClick={() => setAttempt(value => value + 1)}>Try again</button></main>;
  return user ? <Workspace user={user} onSignedOut={signedOut} onUserChanged={setUser} /> : <SignIn onSignIn={setUser} notice={notice} />;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
