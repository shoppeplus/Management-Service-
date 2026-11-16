/**
 * Customer Routes
 * ────────────────
 * CRUD & Advanced endpoints for managing customers.
 * Implements specifications from Addendum A (Sections A1, A2, A6, A10):
 * - GET /api/customers - List customers (scoped by role)
 * - GET /api/customers/:id - Get customer by ID (404 for out-of-scope)
 * - GET /api/customers/phone/:phone - Get customer by phone
 * - POST /api/customers - Create customer
 * - PUT /api/customers/:id - Update customer (CSKH only contact fields)
 * - POST /api/customers/:id/identities - Link external identity
 * - POST /api/customers/:id/identities/:identityId/unlink - Unlink external identity
 * - POST /api/customers/:id/merge - Merge two customer profiles (Admin/Manager only)
 * - POST /api/customers/:id/anonymize - Anonymize customer data (Admin only)
 */

import { Router } from 'express';
import {
  createCustomer,
  getCustomerById,
  getCustomerByPhone,
  getAllCustomers,
  updateCustomer,
  searchCustomers,
  linkIdentity,
  unlinkIdentity,
  mergeCustomers,
  anonymizeCustomer,
} from '../models/customer.js';
import { requirePermission } from '../middleware/rbac.js';
import { filterByScope, verifyEntityAccess } from '../utils/rbac.js';

const router = Router();

// ── GET / ─ List customers (scoped) ─────────────────────────
router.get('/', requirePermission('customer.read'), async (req, res) => {
  try {
    const { search } = req.query;

    let list = [];
    if (search) {
      list = await searchCustomers(search);
    } else {
      list = await getAllCustomers(req.query.limit || 100);
    }

    // Apply data scoping (Section A1)
    list = filterByScope(list, req.user, 'customer.read');

    return res.json({ success: true, data: list });
  } catch (error) {
    console.error('GET /customers error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── GET /phone/:phone ─ Find customer by phone ──────────────
router.get('/phone/:phone', requirePermission('customer.read'), async (req, res) => {
  try {
    const customer = await getCustomerByPhone(req.params.phone);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng với số điện thoại này.' });
    }

    const access = verifyEntityAccess(customer, req.user, 'customer.read');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    return res.json({ success: true, data: customer });
  } catch (error) {
    console.error('GET /customers/phone error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── GET /:id ─ Get customer by ID ───────────────────────────
router.get('/:id', requirePermission('customer.read'), async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);
    const access = verifyEntityAccess(customer, req.user, 'customer.read');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    return res.json({ success: true, data: customer });
  } catch (error) {
    console.error('GET /customers/:id error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST / ─ Create customer ────────────────────────────────
router.post('/', requirePermission('customer.create'), async (req, res) => {
  try {
    const newCustomer = await createCustomer(req.body);
    return res.status(201).json({ success: true, data: newCustomer });
  } catch (error) {
    console.error('POST /customers error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── PUT /:id ─ Update customer ──────────────────────────────
router.put('/:id', requirePermission('customer.update'), async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);
    const access = verifyEntityAccess(customer, req.user, 'customer.update');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    // Role check: CUSTOMER_CARE can only update contact fields (phone, address, email) - Section A2
    let updatePayload = req.body;
    if (req.user?.role === 'CUSTOMER_CARE') {
      updatePayload = {
        phone: req.body.phone,
        address: req.body.address,
        email: req.body.email,
      };
    }

    const updated = await updateCustomer(req.params.id, updatePayload);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('PUT /customers/:id error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/identities ─ Link external identity ───────────
router.post('/:id/identities', requirePermission('customer.identity.link'), async (req, res) => {
  try {
    const { channel, externalId } = req.body;
    if (!channel || !externalId) {
      return res.status(400).json({ success: false, message: 'Cần cung cấp channel và externalId.' });
    }

    const updated = await linkIdentity(req.params.id, { channel, externalId });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /customers/:id/identities error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/identities/:identityId/unlink ─────────────────
router.post('/:id/identities/:identityId/unlink', requirePermission('customer.identity.link'), async (req, res) => {
  try {
    const updated = await unlinkIdentity(req.params.id, req.params.identityId);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /customers/:id/identities/:identityId/unlink error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/merge ─ Merge customers ───────────────────────
router.post('/:id/merge', requirePermission('customer.merge'), async (req, res) => {
  try {
    const { secondaryCustomerId } = req.body;
    if (!secondaryCustomerId) {
      return res.status(400).json({ success: false, message: 'Cần cung cấp secondaryCustomerId để hợp nhất.' });
    }

    const merged = await mergeCustomers(req.params.id, secondaryCustomerId, req.user);
    return res.json({ success: true, data: merged });
  } catch (error) {
    console.error('POST /customers/:id/merge error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/anonymize ─ Anonymize personal data (A10) ─────
router.post('/:id/anonymize', requirePermission('customer.anonymize'), async (req, res) => {
  try {
    const anonymized = await anonymizeCustomer(req.params.id, req.user);
    return res.json({
      success: true,
      message: 'Hồ sơ khách hàng đã được ẩn danh hóa dữ liệu cá nhân thành công.',
      data: anonymized,
    });
  } catch (error) {
    console.error('POST /customers/:id/anonymize error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
