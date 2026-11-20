import React, { useState } from 'react';
import { api } from '../api.js';
import { AdminModal, FormActions, useAdminData } from '../admin/shared.jsx';
import { money, Status } from './shared.jsx';

const emptyVendor = { vendorName: '', contactName: '', email: '', phone: '', address: '', status: 'Active' };

// Create or update a vendor. Status can become Inactive; the vendor row is not deleted.
function VendorForm({ vendor, onClose, onSaved, onExpired }) {
  const creating = !vendor;
  const [fields, setFields] = useState(() => ({ ...emptyVendor, ...vendor, contactName: vendor?.contactName ?? '', email: vendor?.email ?? '', phone: vendor?.phone ?? '', address: vendor?.address ?? '' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = event => setFields(previous => ({ ...previous, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const saved = await api(creating ? '/catalog/vendors' : `/catalog/vendors/${vendor.vendorId}`, { method: creating ? 'POST' : 'PUT', body: fields });
      onSaved(creating ? 'Vendor added.' : 'Vendor updated.', saved.vendorId);
    } catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); }
    finally { setBusy(false); }
  }
  return <AdminModal title={creating ? 'Add vendor' : 'Edit vendor'} busy={busy} onClose={onClose}><form onSubmit={submit}>
    <label htmlFor="vendor-name">Vendor name</label><input autoFocus id="vendor-name" name="vendorName" required maxLength={150} value={fields.vendorName} onChange={change} />
    <div className="form-grid"><div><label htmlFor="vendor-contact">Contact name</label><input id="vendor-contact" name="contactName" maxLength={150} value={fields.contactName} onChange={change} /></div>
      <div><label htmlFor="vendor-status">Status</label><select id="vendor-status" name="status" value={fields.status} onChange={change}><option>Active</option><option>Inactive</option></select></div></div>
    <div className="form-grid"><div><label htmlFor="vendor-email">Email</label><input id="vendor-email" name="email" type="email" maxLength={255} value={fields.email} onChange={change} /></div>
      <div><label htmlFor="vendor-phone">Phone</label><input id="vendor-phone" name="phone" maxLength={30} value={fields.phone} onChange={change} /></div></div>
    <label htmlFor="vendor-address">Address</label><textarea id="vendor-address" name="address" maxLength={500} value={fields.address} onChange={change} />
    <p className="form-help">Set a vendor to Inactive to stop using them. Past orders still keep this vendor.</p>
    {error && <p className="error" role="alert">{error}</p>}<FormActions busy={busy} onClose={onClose} label={creating ? 'Add vendor' : 'Save changes'} />
  </form></AdminModal>;
}

// Supplier price for one product. Deleting it does not delete the vendor or the product.
function ListingForm({ vendorId, products, listing, onClose, onSaved, onExpired }) {
  const creating = !listing;
  const [fields, setFields] = useState({ productId: listing?.productId ?? '', vendorSku: listing?.vendorSku ?? '', agreedUnitPrice: listing?.agreedUnitPrice ?? '', leadTimeDays: listing?.leadTimeDays ?? 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = event => setFields(previous => ({ ...previous, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    const body = { ...fields, productId: Number(fields.productId), agreedUnitPrice: String(fields.agreedUnitPrice).trim(), leadTimeDays: Number(fields.leadTimeDays) };
    try {
      await api(creating ? `/catalog/vendors/${vendorId}/listings` : `/catalog/vendors/${vendorId}/listings/${listing.productId}`, { method: creating ? 'POST' : 'PUT', body });
      onSaved(creating ? 'Product linked to this vendor.' : 'Supplier price updated.');
    } catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); }
    finally { setBusy(false); }
  }
  return <AdminModal title={creating ? 'Add supplied product' : 'Edit supplied product'} busy={busy} onClose={onClose}><form onSubmit={submit}>
    <label htmlFor="listing-product">Product</label>
    {creating ? <select id="listing-product" name="productId" required value={fields.productId} onChange={change}><option value="">Choose product</option>{products.map(product => <option key={product.productId} value={product.productId}>{product.productName}</option>)}</select>
      : <input id="listing-product" value={listing.productName} disabled />}
    <div className="form-grid"><div><label htmlFor="listing-sku">Vendor SKU</label><input id="listing-sku" name="vendorSku" maxLength={100} value={fields.vendorSku} onChange={change} /></div>
      <div><label htmlFor="listing-price">Agreed unit price</label><input id="listing-price" name="agreedUnitPrice" inputMode="decimal" required value={fields.agreedUnitPrice} onChange={change} /></div></div>
    <label htmlFor="listing-lead">Lead time (days)</label><input id="listing-lead" name="leadTimeDays" type="number" min={0} max={365} required value={fields.leadTimeDays} onChange={change} />
    <p className="form-help">This price is the vendor’s current price. An order keeps the price it was created with.</p>
    {error && <p className="error" role="alert">{error}</p>}<FormActions busy={busy} onClose={onClose} label={creating ? 'Add listing' : 'Save price'} />
  </form></AdminModal>;
}

// One vendor’s address and the products it supplies.
function VendorDetail({ vendorId, products, onExpired, onChanged, onBack }) {
  const detail = useAdminData(`/catalog/vendors/${vendorId}`, onExpired);
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const vendor = detail.data?.vendor;
  const listings = detail.data?.listings ?? [];
  const listed = new Set(listings.map(listing => listing.productId));
  const available = products.filter(product => !listed.has(product.productId));
  async function removeListing(listing) {
    if (!window.confirm(`Remove ${listing.productName} from this vendor? The product and vendor will both stay.`)) return;
    setError(''); setBusyId(listing.productId);
    try {
      await api(`/catalog/vendors/${vendorId}/listings/${listing.productId}`, { method: 'DELETE' });
      detail.reload(); onChanged();
    } catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); }
    finally { setBusyId(null); }
  }
  if (detail.loading) return <p role="status">Loading vendor…</p>;
  if (detail.error) return <p className="error" role="alert">{detail.error}</p>;
  return <section className="panel"><button type="button" onClick={onBack}>Back</button><div className="panel-heading"><h2>{vendor.vendorName}</h2>
    <button className="primary" disabled={!available.length} onClick={() => setEditor({ listing: null })}>Add product</button></div>
    <p>{vendor.address || 'No address.'} {vendor.contactName ? `Contact: ${vendor.contactName}.` : ''}</p>
    <p>Delete listing removes only that product from this vendor.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="table-scroll"><table>
      <thead><tr><th>Product</th><th>SKU</th><th>Agreed price</th><th>Lead time</th><th>Actions</th></tr></thead>
      <tbody>{listings.map(listing => <tr key={listing.productId}><td><strong>{listing.productName}</strong></td><td>{listing.vendorSku || '—'}</td><td>{money(listing.agreedUnitPrice)}</td><td>{listing.leadTimeDays} days</td>
        <td><div className="row-actions"><button disabled={busyId === listing.productId} onClick={() => setEditor({ listing })}>Edit price</button><button disabled={busyId === listing.productId} onClick={() => removeListing(listing)}>Delete listing</button></div></td></tr>)}</tbody>
    </table>{!listings.length && <p className="empty-state">This vendor does not supply any products yet.</p>}</div>
    {editor && <ListingForm vendorId={vendorId} products={available} listing={editor.listing} onClose={() => setEditor(null)} onExpired={onExpired} onSaved={() => { setEditor(null); detail.reload(); onChanged(); }} />}
  </section>;
}

// Vendor list for purchasing, with search and Active/Inactive filter.
export function Vendors({ onExpired }) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState('');
  const params = new URLSearchParams(Object.entries({ search: appliedSearch, status }).filter(([, value]) => value));
  const list = useAdminData(`/catalog/vendors?${params}`, onExpired);
  const catalog = useAdminData('/catalog/products', onExpired);
  const vendors = list.data?.vendors ?? [];
  if (selectedId) return <VendorDetail key={selectedId} vendorId={selectedId} products={catalog.data?.products ?? []} onExpired={onExpired} onChanged={() => list.reload()} onBack={() => setSelectedId(null)} />;
  return <><section className="panel"><div className="panel-heading"><h2>Vendors</h2><button className="primary" onClick={() => { setNotice(''); setEditor({ vendor: null }); }}>Add vendor</button></div>
    <p>Click a vendor name or Listings to add a price, change it, or delete that listing.</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    <form className="filters" onSubmit={event => { event.preventDefault(); setAppliedSearch(search.trim()); }}>
      <div className="filter-search"><label htmlFor="vendor-search">Search vendors</label><input id="vendor-search" placeholder="Name, contact, or email" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></div>
      <div><label htmlFor="vendor-status-filter">Status</label><select id="vendor-status-filter" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option><option>Active</option><option>Inactive</option></select></div>
      <button type="submit">Search</button><button type="button" onClick={() => { setSearch(''); setAppliedSearch(''); setStatus(''); }}>Reset</button>
    </form>
    {(list.error || catalog.error) && <p className="error" role="alert">{list.error || catalog.error}</p>}
    {list.loading && <p role="status">Loading vendors…</p>}
    {!list.loading && !list.error && <><p className="result-count">{vendors.length} vendor{vendors.length === 1 ? '' : 's'} found</p><div className="table-scroll"><table>
      <thead><tr><th>Vendor</th><th>Contact</th><th>Status</th><th>Products</th><th>Actions</th></tr></thead>
      <tbody>{vendors.map(vendor => <tr key={vendor.vendorId}><td><button className="text-button" onClick={() => setSelectedId(vendor.vendorId)}>{vendor.vendorName}</button><small>{vendor.email}</small></td><td>{vendor.contactName || '—'}<small>{vendor.phone}</small></td><td><Status value={vendor.status} /></td><td>{vendor.numberOfProducts}</td>
        <td><div className="row-actions"><button onClick={() => setSelectedId(vendor.vendorId)}>Listings</button><button onClick={() => { setNotice(''); setEditor({ vendor }); }}>Edit</button></div></td></tr>)}</tbody>
    </table>{!vendors.length && <p className="empty-state">No vendors match these filters.</p>}</div></>}
    {editor && <VendorForm vendor={editor.vendor} onClose={() => setEditor(null)} onExpired={onExpired} onSaved={(message, vendorId) => { setEditor(null); setNotice(message); if (vendorId) setSelectedId(vendorId); list.reload(); }} />}
  </section></>;
}
