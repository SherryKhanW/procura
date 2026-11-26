import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../auth/permissions.js';
import {
  decisionInput, deliveryFilters, deliveryInput, listingInput, listingUpdate, orderFilters, orderInput, productFilters, productInput, recordId,
  requestFilters, requestInput, vendorFilters, vendorInput,
} from './validation.js';

// Purchasing catalog: products, vendors, and the supplier prices that can be deleted.
export function createCatalogRouter(repository) {
  const router = Router();
  router.get('/products', requirePermission('catalog:read'), async (req, res) => {
    res.json(await repository.listProducts(productFilters(req.query)));
  });
  router.post('/products', requirePermission('catalog:manage'), async (req, res) => {
    res.status(201).json(await repository.createProduct(productInput(req.body)));
  });
  router.put('/products/:id', requirePermission('catalog:manage'), async (req, res) => {
    res.json(await repository.updateProduct(recordId(req.params.id), productInput(req.body)));
  });
  router.get('/vendors', requirePermission('catalog:manage'), async (req, res) => {
    res.json({ vendors: await repository.listVendors(vendorFilters(req.query)) });
  });
  router.get('/vendors/:id', requirePermission('catalog:manage'), async (req, res) => {
    res.json(await repository.getVendor(recordId(req.params.id)));
  });
  router.post('/vendors', requirePermission('catalog:manage'), async (req, res) => {
    res.status(201).json(await repository.createVendor(vendorInput(req.body)));
  });
  router.put('/vendors/:id', requirePermission('catalog:manage'), async (req, res) => {
    res.json(await repository.updateVendor(recordId(req.params.id), vendorInput(req.body)));
  });
  router.post('/vendors/:id/listings', requirePermission('catalog:manage'), async (req, res) => {
    res.status(201).json(await repository.addListing(recordId(req.params.id), listingInput(req.body)));
  });
  router.put('/vendors/:id/listings/:productId', requirePermission('catalog:manage'), async (req, res) => {
    res.json(await repository.updateListing(recordId(req.params.id), recordId(req.params.productId), listingUpdate(req.body)));
  });
  router.delete('/vendors/:id/listings/:productId', requirePermission('catalog:manage'), async (req, res) => {
    res.json(await repository.deleteListing(recordId(req.params.id), recordId(req.params.productId)));
  });
  return router;
}

// Request list, creation, details, and the manager decision that calls the procedure.
export function createRequestRouter(repository) {
  const router = Router();
  const readRequests = requireAnyPermission('requests:read:own', 'requests:read:all');
  router.get('/', readRequests, async (req, res) => {
    res.json({ requests: await repository.listRequests(req.user, requestFilters(req.query)) });
  });
  router.get('/queue', requirePermission('requests:approve'), async (_req, res) => {
    res.json({ requests: await repository.listApprovalQueue() });
  });
  router.get('/:id', readRequests, async (req, res) => {
    res.json(await repository.getRequest(req.user, recordId(req.params.id)));
  });
  router.post('/', requirePermission('requests:create'), async (req, res) => {
    res.status(201).json(await repository.createRequest(req.user.employeeId, requestInput(req.body)));
  });
  router.post('/:id/decision', requirePermission('requests:approve'), async (req, res) => {
    res.json(await repository.decideRequest(req.user.employeeId, recordId(req.params.id), decisionInput(req.body)));
  });
  return router;
}

// Purchasing turns one approved request into one vendor-backed purchase order.
export function createOrderRouter(repository) {
  const router = Router();
  router.get('/', requirePermission('orders:read'), async (req, res) => {
    res.json({ orders: await repository.listOrders(orderFilters(req.query)) });
  });
  router.get('/eligible-requests', requirePermission('orders:manage'), async (_req, res) => {
    res.json({ requests: await repository.listOrderableRequests() });
  });
  router.get('/eligible-requests/:id', requirePermission('orders:manage'), async (req, res) => {
    res.json(await repository.getOrderDraft(recordId(req.params.id)));
  });
  router.get('/:id', requirePermission('orders:read'), async (req, res) => {
    res.json(await repository.getOrder(recordId(req.params.id)));
  });
  router.post('/', requirePermission('orders:manage'), async (req, res) => {
    res.status(201).json(await repository.createOrder(orderInput(req.body)));
  });
  return router;
}

// Receiving staff record one physical delivery, which may contain lines from multiple orders.
export function createDeliveryRouter(repository) {
  const router = Router();
  router.get('/', requirePermission('deliveries:read'), async (req, res) => {
    res.json({ deliveries: await repository.listDeliveries(deliveryFilters(req.query)) });
  });
  router.get('/outstanding-orders', requirePermission('deliveries:manage'), async (_req, res) => {
    res.json({ orders: await repository.listOutstandingOrders() });
  });
  router.get('/outstanding-orders/:id', requirePermission('deliveries:manage'), async (req, res) => {
    res.json(await repository.getOutstandingOrder(recordId(req.params.id)));
  });
  router.get('/:id', requirePermission('deliveries:read'), async (req, res) => {
    res.json(await repository.getDelivery(recordId(req.params.id)));
  });
  router.post('/', requirePermission('deliveries:manage'), async (req, res) => {
    res.status(201).json(await repository.recordDelivery(req.user.employeeId, deliveryInput(req.body)));
  });
  return router;
}
