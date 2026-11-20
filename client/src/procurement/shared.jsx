// Formats a DECIMAL value from MariaDB as dollars and cents.
export function money(value) {
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Colors a status word: Pending, Approved, Rejected, Active, or Inactive.
export function Status({ value }) {
  return <span className={`status status-${String(value).toLowerCase()}`}>{value}</span>;
}
