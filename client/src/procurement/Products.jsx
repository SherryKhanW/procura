import React, { useState } from 'react';
import { api } from '../api.js';
import { AdminModal, FormActions, useAdminData } from '../admin/shared.jsx';

// Add or edit a catalog product. The form has no price field.
function ProductForm({ product, categories, onClose, onSaved, onExpired }) {
  const creating = !product;
  const [fields, setFields] = useState({ productName: product?.productName ?? '', description: product?.description ?? '', category: product?.category ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = event => setFields(previous => ({ ...previous, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await api(creating ? '/catalog/products' : `/catalog/products/${product.productId}`, { method: creating ? 'POST' : 'PUT', body: fields });
      onSaved(creating ? 'Product added to the catalog.' : 'Product updated.');
    } catch (failure) { if (failure.status === 401) onExpired(); else setError(failure.message); }
    finally { setBusy(false); }
  }
  return <AdminModal title={creating ? 'Add product' : 'Edit product'} busy={busy} onClose={onClose}><form onSubmit={submit}>
    <label htmlFor="product-name">Product name</label><input autoFocus id="product-name" name="productName" required maxLength={150} value={fields.productName} onChange={change} />
    <label htmlFor="product-category">Category</label><select id="product-category" name="category" required value={fields.category} onChange={change}><option value="">Choose category</option>{categories.map(value => <option key={value}>{value}</option>)}</select>
    <label htmlFor="product-description">Description</label><textarea id="product-description" name="description" maxLength={2000} value={fields.description} onChange={change} />
    <p className="form-help">A product does not store a price. Each vendor keeps its own agreed price.</p>
    {error && <p className="error" role="alert">{error}</p>}<FormActions busy={busy} onClose={onClose} label={creating ? 'Add product' : 'Save changes'} />
  </form></AdminModal>;
}

// Product catalog: search, category filter, and how many vendors supply each product.
export function Products({ onExpired }) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState('');
  const params = new URLSearchParams(Object.entries({ search: appliedSearch, category }).filter(([, value]) => value));
  const catalog = useAdminData(`/catalog/products?${params}`, onExpired);
  const products = catalog.data?.products ?? [];
  const categories = catalog.data?.categories ?? [];
  return <section className="panel"><div className="panel-heading"><h2>Products</h2><button className="primary" disabled={catalog.loading} onClick={() => { setNotice(''); setEditor({ product: null }); }}>Add product</button></div>
    <p>Products do not have a price. Each vendor has its own price.</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    <form className="filters" onSubmit={event => { event.preventDefault(); setAppliedSearch(search.trim()); }}>
      <div className="filter-search"><label htmlFor="product-search">Search products</label><input id="product-search" placeholder="Name, description, or category" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></div>
      <div><label htmlFor="category-filter">Category</label><select id="category-filter" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></div>
      <button type="submit">Search</button><button type="button" onClick={() => { setSearch(''); setAppliedSearch(''); setCategory(''); }}>Reset</button>
    </form>
    {catalog.error && <p className="error" role="alert">{catalog.error}</p>}
    {catalog.loading && <p role="status">Loading products…</p>}
    {!catalog.loading && !catalog.error && <><p className="result-count">{products.length} product{products.length === 1 ? '' : 's'} found</p><div className="table-scroll"><table>
      <thead><tr><th>Product</th><th>Category</th><th>Vendors</th><th>Actions</th></tr></thead>
      <tbody>{products.map(product => <tr key={product.productId}><td><strong>{product.productName}</strong><small>{product.description}</small></td><td>{product.category}</td><td>{product.numberOfVendors}</td><td><button onClick={() => { setNotice(''); setEditor({ product }); }}>Edit</button></td></tr>)}</tbody>
    </table>{!products.length && <p className="empty-state">No products match these filters.</p>}</div></>}
    {editor && <ProductForm product={editor.product} categories={[...new Set([...categories, editor.product?.category].filter(Boolean))]} onClose={() => setEditor(null)} onExpired={onExpired} onSaved={message => { setEditor(null); setNotice(message); catalog.reload(); }} />}
  </section>;
}
