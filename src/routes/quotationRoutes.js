/**
 * Quotation Routes (Báo Giá)
 * ────────────────────────────
 * Implements endpoints from Addendum A (Sections A1, A2, A3, A4, A6):
 * - GET /api/quotations - List quotations (scoped)
 * - GET /api/quotations/:id - Get quotation by ID (404 for out-of-scope)
 * - POST /api/quotations - Create quotation
 * - PATCH /api/quotations/:id - Update quotation (only in DRAFT)
 * - POST /api/quotations/:id/send - Send quotation
 * - POST /api/quotations/:id/accept - Accept quotation
 * - POST /api/quotations/:id/reject - Reject quotation
 * - POST /api/quotations/:id/convert - Convert to Order (copies snapshots)
 * - POST /api/quotations/:id/clone - Clone quotation to new DRAFT
 */

import { Router } from 'express';
import {
  createQuotation,
  getQuotationById,
  getQuotations,
  updateQuotation,
  updateQuotationStatus,
  cloneQuotation,
} from '../models/quotation.js';
import { createOrder } from '../models/order.js';
import { requirePermission } from '../middleware/rbac.js';
import { filterByScope, verifyEntityAccess } from '../utils/rbac.js';
import { QUOTATION_STATES } from '../utils/stateMachines.js';

const router = Router();

// ── GET / ─ List quotations (scoped) ────────────────────────
router.get('/', requirePermission('quotation.read'), async (req, res) => {
  try {
    const { status, customerId } = req.query;
    let quotations = await getQuotations({ status, customerId });
    quotations = filterByScope(quotations, req.user, 'quotation.read');

    return res.json({ success: true, data: quotations });
  } catch (error) {
    console.error('GET /quotations error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── GET /:id ─ Get quotation by ID ──────────────────────────
router.get('/:id', requirePermission('quotation.read'), async (req, res) => {
  try {
    const quotation = await getQuotationById(req.params.id);
    const access = verifyEntityAccess(quotation, req.user, 'quotation.read');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    return res.json({ success: true, data: quotation });
  } catch (error) {
    console.error('GET /quotations/:id error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST / ─ Create quotation ───────────────────────────────
router.post('/', requirePermission('quotation.create'), async (req, res) => {
  try {
    const quote = await createQuotation(req.body, req.user);
    return res.status(201).json({ success: true, data: quote });
  } catch (error) {
    console.error('POST /quotations error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── PATCH /:id ─ Update quotation (only in DRAFT) ───────────
router.patch('/:id', requirePermission('quotation.update'), async (req, res) => {
  try {
    const quote = await getQuotationById(req.params.id);
    const access = verifyEntityAccess(quote, req.user, 'quotation.update');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const updated = await updateQuotation(req.params.id, req.body, req.user);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('PATCH /quotations/:id error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/send ─ Send quotation ─────────────────────────
router.post('/:id/send', requirePermission('quotation.send'), async (req, res) => {
  try {
    const quote = await getQuotationById(req.params.id);
    const access = verifyEntityAccess(quote, req.user, 'quotation.send');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const updated = await updateQuotationStatus(req.params.id, QUOTATION_STATES.SENT, {
      user: req.user,
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /quotations/:id/send error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/accept ─ Accept quotation ─────────────────────
router.post('/:id/accept', requirePermission('quotation.update'), async (req, res) => {
  try {
    const quote = await getQuotationById(req.params.id);
    const access = verifyEntityAccess(quote, req.user, 'quotation.update');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const updated = await updateQuotationStatus(req.params.id, QUOTATION_STATES.ACCEPTED, {
      user: req.user,
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /quotations/:id/accept error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/reject ─ Reject quotation ─────────────────────
router.post('/:id/reject', requirePermission('quotation.update'), async (req, res) => {
  try {
    const quote = await getQuotationById(req.params.id);
    const access = verifyEntityAccess(quote, req.user, 'quotation.update');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const updated = await updateQuotationStatus(req.params.id, QUOTATION_STATES.REJECTED, {
      user: req.user,
      reason: req.body.reason,
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /quotations/:id/reject error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/convert ─ Convert to Order (Sections A3 & A4) ─
router.post('/:id/convert', requirePermission('quotation.convert'), async (req, res) => {
  try {
    const quote = await getQuotationById(req.params.id);
    const access = verifyEntityAccess(quote, req.user, 'quotation.convert');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    if (quote.status !== QUOTATION_STATES.ACCEPTED) {
      return res.status(409).json({
        success: false,
        message: 'Chỉ có thể chuyển đổi báo giá đã được khách hàng chấp nhận (ACCEPTED) thành Đơn hàng.',
      });
    }

    // Create Order with exact snapshot copies (Section A4)
    const newOrder = await createOrder(
      {
        quotationId: quote.id,
        customerId: quote.customerId,
        customerName: quote.customerName,
        customerPhone: quote.customerPhone,
        shippingAddress: req.body.shippingAddress || {},
        items: quote.items,
        discount: quote.discountAmount,
        taxRate: quote.taxRate,
        shippingFee: quote.shippingFee,
        note: `Chuyển đổi từ báo giá ${quote.code}. ${req.body.note || ''}`.trim(),
        assignedSalesUserId: quote.assignedSalesUserId,
      },
      req.user
    );

    // Update quotation to CONVERTED (Section A3)
    quote.convertedOrderId = newOrder.id;
    await updateQuotationStatus(quote.id, QUOTATION_STATES.CONVERTED, {
      isSystemAction: true,
      user: req.user,
      reason: `Đã chuyển đổi thành đơn hàng ${newOrder.orderCode}`,
    });

    return res.status(201).json({
      success: true,
      data: {
        quotation: quote,
        order: newOrder,
      },
    });
  } catch (error) {
    console.error('POST /quotations/:id/convert error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/clone ─ Clone quotation to new DRAFT ──────────
router.post('/:id/clone', requirePermission('quotation.create'), async (req, res) => {
  try {
    const newQuote = await cloneQuotation(req.params.id, req.user);
    return res.status(201).json({ success: true, data: newQuote });
  } catch (error) {
    console.error('POST /quotations/:id/clone error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
