import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { employeeRoles, requirePermission } from '../auth/permissions.js';
import { hashPassword, validPassword } from '../auth/passwords.js';
import { AdminError, positiveId, employeeInput, departmentInput, userFilters, versionInput } from './validation.js';

export function createAdminRouter(repository) {
  const router = Router();
  const credentialThrottle = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many password operations. Wait 15 minutes and retry.' } });
  router.get('/users', requirePermission('users:read'), async (req, res) => {
    res.json({ users: await repository.listUsers(userFilters(req.query)), roles: employeeRoles });
  });
  router.post('/users', requirePermission('employees:manage'), credentialThrottle, async (req, res) => {
    const data = employeeInput(req.body, true);
    const passwordHash = await hashPassword(data.password);
    const { password, ...employee } = data;
    res.status(201).json(await repository.createEmployee(req.user.employeeId, employee, passwordHash));
  });
  router.put('/users/:id', requirePermission('employees:manage'), async (req, res) => {
    const employeeId = positiveId(req.params.id);
    res.json(await repository.updateEmployee(req.user.employeeId, employeeId, employeeInput(req.body)));
  });
  router.post('/users/:id/password', requirePermission('employees:manage'), credentialThrottle, async (req, res) => {
    const employeeId = positiveId(req.params.id);
    const version = versionInput(req.body?.version);
    if (!validPassword(req.body?.password)) throw new AdminError(400, 'Use an application password between 12 and 128 characters.');
    res.json(await repository.setEmployeePassword(req.user.employeeId, employeeId, version, await hashPassword(req.body.password)));
  });
  router.get('/departments', requirePermission('departments:manage'), async (_req, res) => {
    res.json({ departments: await repository.listDepartments() });
  });
  router.post('/departments', requirePermission('departments:manage'), async (req, res) => {
    res.status(201).json(await repository.createDepartment(req.user.employeeId, departmentInput(req.body, true)));
  });
  router.put('/departments/:id', requirePermission('departments:manage'), async (req, res) => {
    res.json(await repository.updateDepartment(req.user.employeeId, positiveId(req.params.id), departmentInput(req.body)));
  });
  return router;
}
