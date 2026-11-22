import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAdminData } from '../admin/shared.jsx';
import { money, Status } from './shared.jsx';

let nextLineKey = 1;
// One blank request line. The key keeps React from mixing rows when one is removed.
function blankLine() { return { key: nextLineKey++, productId: '', quantity: '1', price: '' }; }

function lineAmount(line) {
  const quantity = Number(line.quantity);
  const price = Number(line.price);
  if (!Number.isInteger(quantity) || quantity < 1 || !(price > 0)) return null;
  return quantity * price;
}

// New purchase request. The signed-in employee, department, and date are not typed in.
function RequestForm({ user, products, onCancel, onCreated, onExpired }) {
  const [justification, setJustification] = useState('');
  const [lines, setLines] = useState(() => [blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = new Set(lines.map(line => String(line.productId)).filter(Boolean));
  const total = lines.reduce((sum, line) => sum + (lineAmount(line) ?? 0), 0);
  function updateLine(key, field, value) {
    setLines(current => current.map(line => line.key === key ? { ...line, [field]: value } : line));
  }
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const created = await api('/requests', { method: 'POST', body: {
        justification,
        items: lines.map(line => ({ productId: Number(line.productId), quantity: Number(line.quantity), estimatedUnitPrice: String(line.price).trim() })),
      } });
      onCreated(created.requestId);
    } catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="panel"><button type="button" onClick={onCancel}>Back</button>
    <h2>New request</h2>
    <p>Requester: {user.firstName} {user.lastName}. Department: {user.departmentName}. The date is set when you submit.</p>
    <form onSubmit={submit}>
      <label htmlFor="justification">Justification</label><textarea id="justification" required maxLength={2000} value={justification} onChange={event => setJustification(event.target.value)} />
      <p className="form-help">Each product can be added only once. Quantity and estimated price must be greater than zero. The request is saved as Pending.</p>
      {lines.map(line => <div className="line-grid" key={line.key}>
        <div><label htmlFor={`line-product-${line.key}`}>Product</label><select id={`line-product-${line.key}`} required value={line.productId} onChange={event => updateLine(line.key, 'productId', event.target.value)}>
          <option value="">Choose product</option>{products.filter(product => String(product.productId) === String(line.productId) || !chosen.has(String(product.productId))).map(product => <option key={product.productId} value={String(product.productId)}>{product.productName}</option>)}
        </select></div>
        <div><label htmlFor={`line-qty-${line.key}`}>Quantity</label><input id={`line-qty-${line.key}`} type="number" min={1} step={1} required value={line.quantity} onChange={event => updateLine(line.key, 'quantity', event.target.value)} /></div>
        <div><label htmlFor={`line-price-${line.key}`}>Estimated price</label><input id={`line-price-${line.key}`} inputMode="decimal" required value={line.price} onChange={event => updateLine(line.key, 'price', event.target.value)} /></div>
        <div><label>Line total</label><p className="line-total">{lineAmount(line) == null ? '—' : money(lineAmount(line))}</p></div>
        <button type="button" disabled={lines.length === 1} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>Remove</button>
      </div>)}
      <button type="button" disabled={lines.length >= 20} onClick={() => setLines(current => [...current, blankLine()])}>Add another product</button>
      <p className="total-line">Estimated total <span>{money(total)}</span></p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</button>
    </form>
  </section>;
}

// Request details. Managers approve or reject through the stored procedure.
function RequestDetail({ requestId, user, onBack, onChanged, onExpired }) {
  const detail = useAdminData(`/requests/${requestId}`, onExpired);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = detail.data?.request;
  const canDecide = user.permissions.includes('requests:approve') && request?.status === 'Pending';
  async function decide(decision) {
    setError(''); setNotice(''); setBusy(true);
    try {
      await api(`/requests/${requestId}/decision`, { method: 'POST', body: { decision, comments } });
      setNotice(`Request ${decision.toLowerCase()}. The approval procedure saved the decision and the new status together.`);
      setComments(''); detail.reload(); onChanged();
    } catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="panel"><button type="button" onClick={onBack}>Back</button>
    {detail.loading && <p role="status">Loading request…</p>}
    {detail.error && <p className="error" role="alert">{detail.error}</p>}
    {request && <><h2>Request {request.requestId}</h2>
      <p>{request.justification}</p>
      <p>Requester: {request.requester}. Department: {request.departmentName}. Date: {request.requestDate}. Status: {request.status}.</p>
      {request.status === 'Approved' && <p className="notice">This request is approved. Purchasing can turn it into one purchase order.</p>}
      {request.status === 'Rejected' && <p className="notice">This request was rejected. It cannot become a purchase order.</p>}
      {request.status === 'Pending' && !canDecide && <p className="notice">Waiting for a manager to approve or reject this request.</p>}
      <div className="table-scroll"><table><thead><tr><th>Product</th><th>Quantity</th><th>Estimated price</th><th>Line total</th></tr></thead>
        <tbody>{detail.data.items.map(item => <tr key={item.productId}><td>{item.productName}</td><td>{item.quantityRequested}</td><td>{money(item.estimatedUnitPrice)}</td><td>{money(item.lineTotal)}</td></tr>)}</tbody>
      </table></div>
      <p className="total-line">Estimated total <span>{money(detail.data.items.reduce((sum, item) => sum + Number(item.lineTotal), 0))}</span></p>
      {detail.data.approval && <section className="decision-box"><h3>Decision</h3><p><strong>{detail.data.approval.decisionBy}</strong> {detail.data.approval.status.toLowerCase()} this request on {detail.data.approval.approvalDate}.</p>{detail.data.approval.comments && <p>{detail.data.approval.comments}</p>}</section>}
      {canDecide && <section className="decision-box"><h3>Approval decision</h3>
        <p>Approve and Reject call sp_decide_purchase_request. A request gets one decision.</p>
        <label htmlFor="decision-comments">Comments</label><textarea id="decision-comments" maxLength={1000} value={comments} onChange={event => setComments(event.target.value)} />
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row-actions"><button className="primary" type="button" disabled={busy} onClick={() => decide('Approved')}>Approve</button><button type="button" disabled={busy} onClick={() => decide('Rejected')}>Reject</button></div>
      </section>}
    </>}
  </section>;
}

// Purchase request list with search and status filter. Employees only see their own rows.
export function Requests({ user, openRequestId, onOpened, onExpired }) {
  const seeAll = user.permissions.includes('requests:read:all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState(openRequestId ? { name: 'detail', id: openRequestId } : { name: 'list' });
  const params = new URLSearchParams(Object.entries({ search: appliedSearch, status }).filter(([, value]) => value));
  const list = useAdminData(`/requests?${params}`, onExpired);
  const catalog = useAdminData('/catalog/products', onExpired);
  useEffect(() => {
    if (!openRequestId) return;
    setView({ name: 'detail', id: openRequestId });
    onOpened();
  }, [openRequestId, onOpened]);
  const showList = () => { list.reload(); setView({ name: 'list' }); };
  if (view.name === 'new') return <RequestForm user={user} products={catalog.data?.products ?? []} onExpired={onExpired} onCancel={showList} onCreated={requestId => { list.reload(); setView({ name: 'detail', id: requestId }); }} />;
  if (view.name === 'detail') return <RequestDetail requestId={view.id} user={user} onExpired={onExpired} onChanged={() => list.reload()} onBack={showList} />;
  const requests = list.data?.requests ?? [];
  return <section className="panel"><div className="panel-heading"><h2>{seeAll ? 'Purchase requests' : 'Your purchase requests'}</h2><button className="primary" onClick={() => setView({ name: 'new' })}>New request</button></div>
    <p>{seeAll ? 'All requests.' : 'Requests you submitted.'}</p>
    <form className="filters" onSubmit={event => { event.preventDefault(); setAppliedSearch(search.trim()); }}>
      <div className="filter-search"><label htmlFor="request-search">Search requests</label><input id="request-search" placeholder="Name, department, justification, or ID" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></div>
      <div><label htmlFor="request-status">Status</label><select id="request-status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option></select></div>
      <button type="submit">Search</button><button type="button" onClick={() => { setSearch(''); setAppliedSearch(''); setStatus(''); list.reload(); }}>Reset / refresh</button>
    </form>
    {(list.error || catalog.error) && <p className="error" role="alert">{list.error || catalog.error}</p>}
    {list.loading && <p role="status">Loading requests…</p>}
    {!list.loading && !list.error && list.data && <><p className="result-count">{requests.length} request{requests.length === 1 ? '' : 's'} found</p><div className="table-scroll"><table>
      <thead><tr><th></th><th>Request</th><th>Requester</th><th>Department</th><th>Date</th><th>Items</th><th>Estimated total</th><th>Status</th></tr></thead>
      <tbody>{requests.map(request => <tr key={request.requestId}><td><button onClick={() => setView({ name: 'detail', id: request.requestId })}>View</button></td><td><strong>#{request.requestId}</strong></td><td>{request.requester}</td><td>{request.departmentName}</td><td>{request.requestDate}</td><td>{request.numberOfItems}</td><td>{money(request.estimatedTotal)}</td><td><Status value={request.status} /></td></tr>)}</tbody>
    </table>{!requests.length && <p className="empty-state">No requests match these filters.</p>}</div></>}
  </section>;
}
