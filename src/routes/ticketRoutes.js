/**
 * Ticket Routes (Hỗ Trợ Khách Hàng)
 * ──────────────────────────────────
 * Implements endpoints from Addendum A (Sections A1, A2, A3, A6):
 * - GET /api/tickets - List tickets (scoped)
 * - GET /api/tickets/:id - Get ticket by ID
 * - POST /api/tickets - Create ticket
 * - POST /api/tickets/:id/status - Transition status (with reopen rule)
 * - POST /api/tickets/:id/assign - Assign ticket
 * - POST /api/tickets/:id/reply - Add reply / internal note
 */

import { Router } from 'express';
import {
  createTicket,
  getTicketById,
  getTickets,
  updateTicketStatus,
  assignTicket,
  addTicketReply,
} from '../models/ticket.js';
import { requirePermission } from '../middleware/rbac.js';
import { filterByScope, verifyEntityAccess } from '../utils/rbac.js';

const router = Router();

// ── GET / ─ List tickets (scoped) ───────────────────────────
router.get('/', requirePermission('ticket.read'), async (req, res) => {
  try {
    const { status, priority, customerId } = req.query;
    let tickets = await getTickets({ status, priority, customerId });
    tickets = filterByScope(tickets, req.user, 'ticket.read');

    return res.json({ success: true, data: tickets });
  } catch (error) {
    console.error('GET /tickets error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── GET /:id ─ Get ticket by ID ─────────────────────────────
router.get('/:id', requirePermission('ticket.read'), async (req, res) => {
  try {
    const ticket = await getTicketById(req.params.id);
    const access = verifyEntityAccess(ticket, req.user, 'ticket.read');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    return res.json({ success: true, data: ticket });
  } catch (error) {
    console.error('GET /tickets/:id error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST / ─ Create ticket ──────────────────────────────────
router.post('/', requirePermission('ticket.create'), async (req, res) => {
  try {
    const ticket = await createTicket(req.body, req.user);
    return res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    console.error('POST /tickets error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/status ─ Update status ────────────────────────
router.post('/:id/status', requirePermission('ticket.update'), async (req, res) => {
  try {
    const ticket = await getTicketById(req.params.id);
    const access = verifyEntityAccess(ticket, req.user, 'ticket.update');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const updated = await updateTicketStatus(req.params.id, req.body.status, {
      user: req.user,
      reason: req.body.reason,
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /tickets/:id/status error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/assign ─ Assign ticket ────────────────────────
router.post('/:id/assign', requirePermission('ticket.assign'), async (req, res) => {
  try {
    const { assigneeUserId } = req.body;
    if (!assigneeUserId) {
      return res.status(400).json({ success: false, message: 'Cần cung cấp assigneeUserId.' });
    }

    const updated = await assignTicket(req.params.id, assigneeUserId, req.user);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /tickets/:id/assign error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/reply ─ Add reply or internal note ────────────
router.post('/:id/reply', requirePermission('ticket.reply'), async (req, res) => {
  try {
    const ticket = await getTicketById(req.params.id);
    const access = verifyEntityAccess(ticket, req.user, 'ticket.reply');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const { content, isInternal } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung phản hồi không được để trống.' });
    }

    const updated = await addTicketReply(req.params.id, {
      content,
      isInternal,
      authorUser: req.user,
    });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /tickets/:id/reply error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
