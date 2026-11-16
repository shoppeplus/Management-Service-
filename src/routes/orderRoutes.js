/**
 * Order Routes (Đơn Hàng)
 * ────────────────────────
 * Implements endpoints from Addendum A (Sections A1, A2, A3, A4, A6):
 * - GET /api/orders - List orders (scoped by role)
 * - GET /api/orders/:id - Get order by ID (404 for out-of-scope)
 * - POST /api/orders - Create order (with snapshot & calculations)
 * - PUT /api/orders/:id/status - Update order status (state machine)
 * - POST /api/orders/:id/cancel - Cancel order (requires reason)
 * - POST /api/orders/:id/return - Return order (requires reason)
 * - POST /api/orders/:id/refund - Refund order (requires order.refund permission)
 * - PUT /api/orders/:id/tracking - Update shipping tracking ID
 */

import { Router } from 'express';
import {
  createOrder,
  getOrderById,
  getOrders,
  updateOrderStatus,
  updateTrackingId,
} from '../models/order.js';
import { addOrderToHistory } from '../models/customer.js';
import { requirePermission } from '../middleware/rbac.js';
import { filterByScope, verifyEntityAccess, getPermissionScope } from '../utils/rbac.js';
import { ORDER_STATES } from '../utils/stateMachines.js';

const router = Router();

// ── GET / ─ List orders (scoped) ────────────────────────────
router.get('/', requirePermission('order.read'), async (req, res) => {
  try {
    const { status, customerId, limit } = req.query;
    let orders = await getOrders({ status, customerId, limit });

    orders = filterByScope(orders, req.user, 'order.read');
    return res.json({ success: true, data: orders });
  } catch (error) {
    console.error('GET /orders error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── GET /:id ─ Get order by ID ──────────────────────────────
router.get('/:id', requirePermission('order.read'), async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    const access = verifyEntityAccess(order, req.user, 'order.read');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    return res.json({ success: true, data: order });
  } catch (error) {
    console.error('GET /orders/:id error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST / ─ Create a new order ─────────────────────────────
router.post('/', requirePermission('order.create'), async (req, res) => {
  try {
    const { customerId, items } = req.body;
    if (!customerId || !items || !items.length) {
      return res.status(400).json({
        success: false,
        message: 'customerId và ít nhất một sản phẩm (items) là bắt buộc.',
      });
    }

    const order = await createOrder(req.body, req.user);

    // Link order to customer history
    if (order.customerId) {
      await addOrderToHistory(order.customerId, order.id);
    }

    return res.status(201).json({ success: true, data: order });
  } catch (error) {
    console.error('POST /orders error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── PUT /:id/status ─ Update status (State Machine) ─────────
router.put('/:id/status', requirePermission('order.update_status'), async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    const access = verifyEntityAccess(order, req.user, 'order.update_status');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const hasRefundPerm = Boolean(getPermissionScope(req.user, 'order.refund'));

    const updated = await updateOrderStatus(req.params.id, req.body.status, {
      user: req.user,
      reason: req.body.reason,
      hasRefundPermission: hasRefundPerm,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('PUT /orders/:id/status error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/cancel ─ Cancel order ─────────────────────────
router.post('/:id/cancel', requirePermission('order.update_status'), async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    const access = verifyEntityAccess(order, req.user, 'order.update_status');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (!req.body.reason || !req.body.reason.trim()) {
      return res.status(422).json({ success: false, message: 'Lý do hủy đơn hàng là bắt buộc.' });
    }

    const updated = await updateOrderStatus(req.params.id, ORDER_STATES.CANCELLED, {
      user: req.user,
      reason: req.body.reason,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /orders/:id/cancel error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/return ─ Return order ─────────────────────────
router.post('/:id/return', requirePermission('order.update_status'), async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    const access = verifyEntityAccess(order, req.user, 'order.update_status');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (!req.body.reason || !req.body.reason.trim()) {
      return res.status(422).json({ success: false, message: 'Lý do trả hàng là bắt buộc.' });
    }

    const updated = await updateOrderStatus(req.params.id, ORDER_STATES.RETURNED, {
      user: req.user,
      reason: req.body.reason,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /orders/:id/return error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/refund ─ Refund order (Requires order.refund) ─
router.post('/:id/refund', requirePermission('order.refund'), async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng.' });

    if (!req.body.reason || !req.body.reason.trim()) {
      return res.status(422).json({ success: false, message: 'Lý do hoàn tiền là bắt buộc.' });
    }

    const updated = await updateOrderStatus(req.params.id, ORDER_STATES.REFUNDED, {
      user: req.user,
      reason: req.body.reason,
      hasRefundPermission: true,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /orders/:id/refund error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── PUT /:id/tracking ─ Update tracking ID ──────────────────
router.put('/:id/tracking', requirePermission('order.update_status'), async (req, res) => {
  try {
    const { trackingId, shippingProvider } = req.body;
    if (!trackingId) {
      return res.status(400).json({ success: false, message: 'trackingId là bắt buộc.' });
    }

    const updated = await updateTrackingId(req.params.id, trackingId, shippingProvider);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('PUT /orders/:id/tracking error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
