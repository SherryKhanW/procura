const common = ['catalog:read', 'requests:create', 'requests:read:own'];
const rolePermissions = {
  Employee: [...common],
  Manager: [...common, 'requests:read:all', 'requests:approve', 'dashboard:read'],
  Purchasing: [...common, 'requests:read:all', 'catalog:manage', 'orders:manage', 'orders:read', 'dashboard:read'],
  Receiving: [...common, 'orders:read', 'deliveries:manage', 'deliveries:read'],
  Finance: [...common, 'orders:read', 'deliveries:read', 'invoices:manage', 'payments:manage', 'dashboard:read'],
  // The MS3 procedure only accepts Role='Manager'. Admin does not bypass it.
  Admin: [...common, 'requests:read:all', 'orders:read', 'deliveries:read', 'dashboard:read', 'users:read', 'employees:manage', 'departments:manage'],
};

export const employeeRoles = Object.freeze(Object.keys(rolePermissions));

export function permissionsFor(role) {
  return [...(Object.hasOwn(rolePermissions, role) ? rolePermissions[role] : [])];
}

export function publicUser(record) {
  return {
    employeeId: record.employeeId,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    role: record.role,
    departmentId: record.departmentId,
    departmentName: record.departmentName,
    permissions: permissionsFor(record.role),
  };
}

function denyUnless(req, res, allowed) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to continue.' });
  if (!allowed) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
  return null;
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (denyUnless(req, res, req.user?.permissions.includes(permission))) return;
    next();
  };
}

// Lets a route accept either "my own rows" or "every row" without granting both.
export function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (denyUnless(req, res, permissions.some(permission => req.user?.permissions.includes(permission)))) return;
    next();
  };
}
