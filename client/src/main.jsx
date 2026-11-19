import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import './styles.css';

function Brand() {
  return <a className="brand" href="/" aria-label="Procura home"><span className="brand-mark" aria-hidden="true">p</span>procura<span className="brand-dot">.</span></a>;
}

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
  return <div className="login-layout">
    <aside className="login-story"><Brand />
      <div className="story-copy"><p className="eyebrow">A BETTER WAY TO BUY</p><h1>Every purchase.<br />A clear path forward.</h1>
        <p>Bring your team, suppliers, and purchasing decisions together in one workspace.</p>
        <div className="journey" aria-label="Procurement workflow"><span>Request</span><i aria-hidden="true">→</i><span>Approve</span><i aria-hidden="true">→</i><span>Deliver</span><i aria-hidden="true">→</i><span>Pay</span></div>
      </div><p className="story-footer">Procurement & vendor management</p>
    </aside>
    <main className="login-main"><div className="login-card"><p className="eyebrow">YOUR TEAM WORKSPACE</p><h2>Welcome back</h2>
      <p className="muted">Sign in with your Procura employee account.</p>
      {notice && <p className="notice" role="status">{notice}</p>}
      <form onSubmit={submit}>
        <label htmlFor="email">Work email</label><input id="email" type="email" name="email" autoComplete="username" placeholder="you@procura.co" required maxLength={255} value={email} onChange={event => setEmail(event.target.value)} />
        <label htmlFor="password">Password</label><input id="password" type="password" name="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>
      </form><p className="login-help">Need access or a password reset? Contact your project administrator.</p>
    </div><footer>Procura · Intro to Databases · Milestone 4</footer></main>
  </div>;
}

const modules = [
  { title: 'Purchase requests', permission: 'requests:create', number: '01', text: 'Start a purchase and keep track of your requests.' },
  { title: 'Approvals', permission: 'requests:approve', number: '02', text: 'Review requests and record purchasing decisions.' },
  { title: 'Vendors & products', permission: 'catalog:manage', number: '03', text: 'Maintain your supplier catalog and agreed prices.' },
  { title: 'Purchase orders', permission: 'orders:manage', number: '04', text: 'Turn approved requests into supplier orders.' },
  { title: 'Deliveries', permission: 'deliveries:manage', number: '05', text: 'Record what arrived against each purchase order.' },
  { title: 'Invoices & payments', permission: 'invoices:manage', number: '06', text: 'Match invoices to orders and deliveries before payment.' },
];

function TeamAccess({ onExpired }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    api('/admin/users', { signal: controller.signal }).then(data => setUsers(data.users)).catch(failure => {
      if (failure.name === 'AbortError') return;
      if (failure.status === 401) onExpired(); else setError(failure.message);
    });
    return () => controller.abort();
  }, [attempt, onExpired]);
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">ADMINISTRATION</p><h2>Team access</h2></div><span className="tag">Admin only</span></div>
    <p className="muted">Employee roles and sign-in access for your shared workspace.</p>
    {error ? <div role="alert"><p className="error">{error}</p><button onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : !users ? <p role="status">Loading your team…</p> : <div className="table-scroll"><table>
      <thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Sign-in access</th></tr></thead>
      <tbody>{users.map(person => <tr key={person.employeeId}><td><strong>{person.firstName} {person.lastName}</strong><small>{person.email}</small></td><td>{person.departmentName}</td><td><span className="role">{person.role}</span></td><td>{!person.isActive ? 'Inactive' : person.passwordConfigured ? 'Ready' : 'Password needed'}</td></tr>)}</tbody>
    </table></div>}
  </section>;
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
  return <section className="panel account-panel"><p className="eyebrow">YOUR ACCOUNT</p><h2>Change password</h2>
    <p className="muted">Use 12–128 characters. Changing your password signs you out on every device.</p>
    <form onSubmit={submit}>
      <label htmlFor="current-password">Current password</label><input id="current-password" autoComplete="current-password" type="password" required maxLength={256} value={currentPassword} onChange={event => setCurrent(event.target.value)} />
      <label htmlFor="new-password">New password</label><input id="new-password" autoComplete="new-password" type="password" required minLength={12} maxLength={256} value={newPassword} onChange={event => setNew(event.target.value)} />
      <label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" autoComplete="new-password" type="password" required minLength={12} maxLength={256} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Update password'}</button>
    </form>
  </section>;
}

function Workspace({ user, onSignedOut }) {
  const [page, setPage] = useState('overview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const can = permission => user.permissions.includes(permission);
  const visibleModules = modules.filter(module => can(module.permission));
  const expired = React.useCallback(() => onSignedOut('Your session ended. Please sign in again.'), [onSignedOut]);
  useEffect(() => {
    const refresh = () => api('/auth/me').then(({ user: current }) => {
      if (JSON.stringify(current) !== JSON.stringify(user)) window.location.reload();
    }).catch(failure => { if (failure.status === 401) expired(); });
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [user, expired]);
  async function logout() {
    setBusy(true); setError('');
    try { await api('/auth/logout', { method: 'POST' }); onSignedOut('You have signed out.'); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className="workspace-layout"><aside className="sidebar"><Brand /><p className="nav-label">WORKSPACE</p><nav aria-label="Workspace navigation">
    <button className={page === 'overview' ? 'nav-active' : ''} onClick={() => setPage('overview')}>Overview</button>
    {can('users:read') && <button className={page === 'team' ? 'nav-active' : ''} onClick={() => setPage('team')}>Team access</button>}
    <button className={page === 'account' ? 'nav-active' : ''} onClick={() => setPage('account')}>Your account</button>
    </nav><div className="sidebar-bottom"><span className="avatar">{user.firstName[0]}{user.lastName[0]}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{user.role}</small></div></div>
  </aside><div className="workspace-main"><header className="workspace-header"><span>{user.departmentName}</span><button disabled={busy} onClick={logout}>{busy ? 'Signing out…' : 'Sign out'}</button></header>
    <main className="workspace-content">{error && <p className="error" role="alert">{error}</p>}
      {page === 'overview' && <><div className="welcome"><p className="eyebrow">YOUR PROCUREMENT WORKSPACE</p><h1>Hello, {user.firstName}.</h1><p className="muted">A clear view of your role and the work ahead.</p></div>
        <section className="identity-card"><div><span className="tag">{user.role}</span><h2>You’re connected to your team.</h2><p>Signed in as <strong>{user.email}</strong></p></div><div className="identity-detail"><span>DEPARTMENT</span><strong>{user.departmentName}</strong></div></section>
        <div className="section-title"><h2>Your work areas</h2><span className="muted">Based on your role</span></div>
        <div className="module-grid">{visibleModules.map(module => <article className="module-card" key={module.title}><div className="module-top"><span className="module-number">{module.number}</span><span className="coming-soon">Coming next</span></div><h3>{module.title}</h3><p>{module.text}</p></article>)}</div>
        <p className="workspace-note">Your account is ready. Procurement modules will become available as your team completes them.</p>
      </>}
      {page === 'team' && can('users:read') && <TeamAccess onExpired={expired} />}
      {page === 'account' && <PasswordForm onExpired={expired} onChanged={() => onSignedOut('Password updated. Sign in with your new password.')} />}
    </main><footer>Procura · Shared procurement workspace</footer>
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
  if (loading) return <main className="loading"><Brand /><p role="status">Opening your workspace…</p></main>;
  if (error) return <main className="loading"><Brand /><h1>We couldn’t open your workspace.</h1><p className="error" role="alert">{error}</p><button className="primary" onClick={() => setAttempt(value => value + 1)}>Try again</button></main>;
  return user ? <Workspace user={user} onSignedOut={signedOut} /> : <SignIn onSignIn={setUser} notice={notice} />;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
