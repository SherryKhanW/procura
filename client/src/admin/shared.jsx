import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export function useAdminData(path, onExpired) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api(path, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setData(result); }).catch(failure => {
      if (failure.name === 'AbortError') return;
      if (failure.status === 401) onExpired(); else setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, revision, onExpired]);
  return { data, error, loading, reload: () => setRevision(value => value + 1) };
}

export function AdminModal({ title, busy, onClose, children }) {
  const ref = useRef(null);
  const titleId = React.useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="admin-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" aria-label="Close form" disabled={busy} onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}

export function FormActions({ busy, onClose, label = 'Save changes' }) {
  return <div className="form-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : label}</button></div>;
}
