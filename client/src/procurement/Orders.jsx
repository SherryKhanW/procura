import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAdminData } from '../admin/shared.jsx';
import { money, Status } from './shared.jsx';

const today = () => new Date().toISOString().slice(0, 10);

function OrderForm({ onBack, onCreated, onExpired }) {
  const available = useAdminData('/orders/eligible-requests', onExpired);
  const [requestId, setRequestId] = useState(''); const [draft, setDraft] = useState(null);
  const [vendorId, setVendorId] = useState(''); const [items, setItems] = useState([]);
  const [orderDate, setOrderDate] = useState(today); const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(today);
  const [busy, setBusy] = useState(false); const [draftLoading, setDraftLoading] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    setDraft(null); setVendorId(''); setItems([]); setError('');
    if (!requestId) { setDraftLoading(false); return undefined; }
    const controller = new AbortController(); setDraftLoading(true);
    api(`/orders/eligible-requests/${requestId}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setDraft(data);
      setItems(data.items.map(item => ({ ...item, quantity: String(item.quantityRequested), unitPrice: '' })));
    }).catch(failure => {
      if (failure.name === 'AbortError' || controller.signal.aborted) return;
      if (failure.status === 401) onExpired(); else setError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setDraftLoading(false); });
    return () => controller.abort();
  }, [requestId, onExpired]);
  function selectVendor(id) {
    setVendorId(id);
    const priceFor = productId => draft?.prices.find(price => String(price.vendorId) === String(id) && String(price.productId) === String(productId));
    setItems(current => current.map(item => ({ ...item, unitPrice: priceFor(item.productId)?.agreedUnitPrice ?? '' })));
  }
  function updateItem(productId, field, value) { setItems(current => current.map(item => item.productId === productId ? { ...item, [field]: value } : item)); }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const saved = await api('/orders', { method: 'POST', body: { requestId: Number(requestId), vendorId: Number(vendorId), orderDate, expectedDeliveryDate,
        items: items.map(item => ({ productId: item.productId, quantity: Number(item.quantity), unitPrice: String(item.unitPrice).trim() })) } });
      onCreated(saved.poId);
    } catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); } finally { setBusy(false); }
  }
  const total = items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice) || 0), 0);
  return <section className="panel"><button type="button" onClick={onBack}>Back</button><h2>Create purchase order</h2>
    <form onSubmit={submit}><label htmlFor="order-request">Approved request</label><select id="order-request" required value={requestId} onChange={event => setRequestId(event.target.value)}><option value="">Choose approved request</option>{(available.data?.requests ?? []).map(request => <option key={request.requestId} value={request.requestId}>Request #{request.requestId} — {request.requester} ({request.numberOfItems} items)</option>)}</select>
      {available.loading && <p role="status">Loading approved requests…</p>}{available.error && <p className="error" role="alert">{available.error}</p>}
      {draftLoading && <p role="status">Loading request details…</p>}
      {draft && <><p>{draft.request.justification}</p><label htmlFor="order-vendor">Vendor</label><select id="order-vendor" required value={vendorId} onChange={event => selectVendor(event.target.value)}><option value="">Choose eligible vendor</option>{draft.vendors.map(vendor => <option key={vendor.vendorId} value={vendor.vendorId}>{vendor.vendorName}</option>)}</select>
        {!draft.vendors.length && <p className="error">No active vendor supplies every product in this request.</p>}
        <div className="form-grid"><div><label htmlFor="order-date">Order date</label><input id="order-date" type="date" required value={orderDate} onChange={event => setOrderDate(event.target.value)} /></div><div><label htmlFor="expected-date">Expected delivery</label><input id="expected-date" type="date" required min={orderDate} value={expectedDeliveryDate} onChange={event => setExpectedDeliveryDate(event.target.value)} /></div></div>
        <p className="form-help">Prices are prefilled from the selected vendor and saved on the order, so later vendor price changes do not affect it.</p><div className="table-scroll"><table><thead><tr><th>Product</th><th>Requested</th><th>Quantity ordered</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>{items.map(item => <tr key={item.productId}><td>{item.productName}</td><td>{item.quantityRequested}</td><td><input aria-label={`${item.productName} quantity`} type="number" required min={1} step={1} value={item.quantity} onChange={event => updateItem(item.productId, 'quantity', event.target.value)} /></td><td><input aria-label={`${item.productName} unit price`} required inputMode="decimal" value={item.unitPrice} onChange={event => updateItem(item.productId, 'unitPrice', event.target.value)} /></td><td>{money(Number(item.quantity) * Number(item.unitPrice) || 0)}</td></tr>)}</tbody></table></div><p className="total-line">Order total <span>{money(total)}</span></p></>}
      {error && <p className="error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={busy || draftLoading || !draft || !vendorId || !draft.vendors.length}>{busy ? 'Creating…' : 'Create purchase order'}</button>
    </form></section>;
}

function OrderDetail({ poId, onBack, onExpired }) {
  const detail = useAdminData(`/orders/${poId}`, onExpired); const data = detail.data;
  return <section className="panel"><button type="button" onClick={onBack}>Back</button>{detail.loading && <p role="status">Loading order…</p>}{detail.error && <p className="error" role="alert">{detail.error}</p>}{data && <><h2>Purchase order #{data.order.poId}</h2><p>Request #{data.order.requestId} · {data.order.vendorName} · Ordered {data.order.orderDate} · Expected {data.order.expectedDeliveryDate} · <Status value={data.order.status} /></p>
    <div className="table-scroll"><table><thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Invoiced</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>{data.items.map(item => <tr key={item.poItemId}><td>{item.productName}</td><td>{item.quantityOrdered}</td><td>{item.totalReceived}</td><td>{item.quantityInvoiced}</td><td>{money(item.unitPrice)}</td><td>{money(item.lineTotal)}</td></tr>)}</tbody></table></div><p className="total-line">Order total <span>{money(data.items.reduce((sum, item) => sum + Number(item.lineTotal), 0))}</span></p>
    <h3>Deliveries</h3>{data.deliveries.length ? <ul>{data.deliveries.map(delivery => <li key={delivery.deliveryId}>Delivery #{delivery.deliveryId} — {delivery.deliveryDate} ({delivery.status})</li>)}</ul> : <p>No deliveries recorded.</p>}
  </>}</section>;
}

export function Orders({ canManage, onExpired }) {
  const [view, setView] = useState({ name: 'list' }); const [search, setSearch] = useState(''); const [appliedSearch, setAppliedSearch] = useState(''); const [status, setStatus] = useState('');
  const params = new URLSearchParams(Object.entries({ search: appliedSearch, status }).filter(([, value]) => value)); const list = useAdminData(`/orders?${params}`, onExpired);
  const showList = () => { list.reload(); setView({ name: 'list' }); };
  if (view.name === 'new' && canManage) return <OrderForm onBack={showList} onCreated={poId => { list.reload(); setView({ name: 'detail', poId }); }} onExpired={onExpired} />;
  if (view.name === 'detail') return <OrderDetail poId={view.poId} onBack={showList} onExpired={onExpired} />;
  const orders = list.data?.orders ?? [];
  return <section className="panel"><div className="panel-heading"><h2>Purchase orders</h2>{canManage && !list.loading && <button className="primary" onClick={() => setView({ name: 'new' })}>New purchase order</button>}</div><form className="filters" onSubmit={event => { event.preventDefault(); setAppliedSearch(search.trim()); }}><div className="filter-search"><label htmlFor="order-search">Search orders</label><input id="order-search" placeholder="PO, request, or vendor" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></div><div><label htmlFor="order-status">Status</label><select id="order-status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{['Open', 'Partially Received', 'Received', 'Invoiced', 'Closed'].map(value => <option key={value}>{value}</option>)}</select></div><button type="submit">Search</button><button type="button" onClick={() => { setSearch(''); setAppliedSearch(''); setStatus(''); }}>Reset</button></form>{list.error && <p className="error" role="alert">{list.error}</p>}{list.loading && <p role="status">Loading orders…</p>}{!list.loading && list.data && <><p className="result-count">{orders.length} order{orders.length === 1 ? '' : 's'} found</p><div className="table-scroll"><table><thead><tr><th></th><th>PO</th><th>Request</th><th>Vendor</th><th>Order date</th><th>Expected</th><th>Total</th><th>Status</th></tr></thead><tbody>{orders.map(order => <tr key={order.poId}><td><button onClick={() => setView({ name: 'detail', poId: order.poId })}>View</button></td><td>#{order.poId}</td><td>#{order.requestId}</td><td>{order.vendorName}</td><td>{order.orderDate}</td><td>{order.expectedDeliveryDate}</td><td>{money(order.orderTotal)}</td><td><Status value={order.status} /></td></tr>)}</tbody></table>{!orders.length && <p className="empty-state">No purchase orders match these filters.</p>}</div></>}</section>;
}
