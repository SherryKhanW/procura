export class ProcurementError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const requestStatuses = ['Pending', 'Approved', 'Rejected'];
const vendorStatuses = ['Active', 'Inactive'];
const decisions = ['Approved', 'Rejected'];

// Rejects missing, zero, and oversized ids before they reach SQL.
export function recordId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
    throw new ProcurementError(400, 'Choose a valid record.');
  }
  return Number(value);
}

function searchText(value) {
  const search = typeof value === 'string' ? value.trim() : '';
  if ([...search].length > 100) throw new ProcurementError(400, 'Search must be at most 100 characters.');
  return search;
}

function choice(value, allowed, label) {
  if (!value) return null;
  if (!allowed.includes(value)) throw new ProcurementError(400, `Choose a valid ${label}.`);
  return value;
}

// Keeps line breaks in notes, and rejects other control characters.
function note(value, label, max, required = false) {
  if (typeof value !== 'string') {
    if (required) throw new ProcurementError(400, `${label} is required.`);
    return null;
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new ProcurementError(400, `${label} contains unsupported characters.`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new ProcurementError(400, `${label} is required.`);
    return null;
  }
  if ([...trimmed].length > max) throw new ProcurementError(400, `${label} must be at most ${max} characters.`);
  return trimmed;
}

function requiredText(value, label, max) {
  return note(value, label, max, true);
}

// Accepts 40 or "40.50" and keeps two decimal places for DECIMAL columns.
function money(value, label) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
    throw new ProcurementError(400, `${label} must be greater than zero, with at most two decimal places.`);
  }
  return Number(text).toFixed(2);
}

function quantity(value) {
  if (!Number.isInteger(value) || value < 1 || value > 1000000) {
    throw new ProcurementError(400, 'Quantity must be a whole number greater than zero.');
  }
  return value;
}

function leadTime(value) {
  if (!Number.isInteger(value) || value < 0 || value > 365) {
    throw new ProcurementError(400, 'Lead time must be a whole number of days from 0 to 365.');
  }
  return value;
}

function optionalEmail(value) {
  const email = note(value, 'Email', 255);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ProcurementError(400, 'Enter a valid vendor email or leave it blank.');
  return email;
}

export function productFilters(query) {
  const category = note(query?.category, 'Category', 100);
  return { search: searchText(query?.search), category };
}

export function vendorFilters(query) {
  return { search: searchText(query?.search), status: choice(query?.status, vendorStatuses, 'vendor status') };
}

export function requestFilters(query) {
  return { search: searchText(query?.search), status: choice(query?.status, requestStatuses, 'request status') };
}

// Product has no price: each vendor stores its own price on Vendor_Product.
export function productInput(body) {
  return {
    productName: requiredText(body?.productName, 'Product name', 150),
    description: note(body?.description, 'Description', 2000),
    category: requiredText(body?.category, 'Category', 100),
  };
}

export function vendorInput(body) {
  return {
    vendorName: requiredText(body?.vendorName, 'Vendor name', 150),
    contactName: note(body?.contactName, 'Contact name', 150),
    email: optionalEmail(body?.email),
    phone: note(body?.phone, 'Phone', 30),
    address: note(body?.address, 'Address', 500),
    status: requiredStatus(body?.status),
  };
}

function requiredStatus(value) {
  const status = choice(value, vendorStatuses, 'vendor status');
  if (!status) throw new ProcurementError(400, 'Choose Active or Inactive.');
  return status;
}

export function listingInput(body) {
  return {
    productId: recordId(body?.productId),
    vendorSku: note(body?.vendorSku, 'Vendor SKU', 100),
    agreedUnitPrice: money(body?.agreedUnitPrice, 'Agreed unit price'),
    leadTimeDays: leadTime(body?.leadTimeDays),
  };
}

export function listingUpdate(body) {
  const { productId, ...listing } = listingInput({ ...body, productId: 1 });
  return listing;
}

// A request is saved for the signed-in employee, with at least one distinct product.
export function requestInput(body) {
  if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 20) {
    throw new ProcurementError(400, 'Add between 1 and 20 products.');
  }
  const items = body.items.map(item => ({
    productId: recordId(item?.productId),
    quantity: quantity(item?.quantity),
    estimatedUnitPrice: money(item?.estimatedUnitPrice, 'Estimated unit price'),
  }));
  if (new Set(items.map(item => item.productId)).size !== items.length) {
    throw new ProcurementError(400, 'Each product can only be added once.');
  }
  return { justification: requiredText(body?.justification, 'Justification', 2000), items };
}

export function decisionInput(body) {
  if (!decisions.includes(body?.decision)) throw new ProcurementError(400, 'Decision must be Approved or Rejected.');
  return { decision: body.decision, comments: note(body?.comments, 'Comments', 1000) };
}
