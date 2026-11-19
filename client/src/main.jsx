import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  const [status, setStatus] = useState('Checking API…');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => setStatus(data.status === 'ok' ? 'API online' : 'API unavailable'))
      .catch(error => { if (error.name !== 'AbortError') setStatus('API unavailable'); });
    return () => controller.abort();
  }, []);
  return <main>
    <header><a className="brand" href="/">Procura</a><span>Procurement & vendor management</span></header>
    <section>
      <p className="eyebrow">WORKSPACE SETUP</p>
      <h1>A clear path from request to payment.</h1>
      <p className="intro">One shared workspace for requests, approvals, orders, deliveries, invoices, and payments.</p>
      <div className="panel"><h2>Project foundation</h2><p role="status">{status}</p><p>The application scaffold is ready. Secure login and procurement screens are the next implementation steps.</p></div>
    </section>
    <footer>Procura · Intro to Databases · Milestone 4</footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
