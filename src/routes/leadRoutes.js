/**
 * Lead Routes
 * ────────────
 * Implements endpoints from Addendum A (Sections A1, A2, A3, A6):
 * - GET /api/leads - List leads (filtered by scope)
 * - GET /api/leads/:id - Get lead by ID (enforcing 404 for out-of-scope)
 * - POST /api/leads - Create lead
 * - PATCH /api/leads/:id - Update lead info
 * - POST /api/leads/:id/status - Transition lead status (state machine)
 * - POST /api/leads/:id/assign - Assign lead to employee (Admin/Manager only)
 */

import { Router } from 'express';
import {
  createLead,
  getLeadById,
  getLeads,
  updateLeadStatus,
  assignLead,
} from '../models/lead.js';
import { requirePermission } from '../middleware/rbac.js';
import { filterByScope, verifyEntityAccess } from '../utils/rbac.js';

const router = Router();

// ── GET / ─ List leads (scoped) ─────────────────────────────
router.get('/', requirePermission('lead.read'), async (req, res) => {
  try {
    const { status, search, assignedSalesUserId } = req.query;
    let leads = await getLeads({ status, search, assignedSalesUserId });

    // Enforce data scoping (Section A1)
    leads = filterByScope(leads, req.user, 'lead.read');

    return res.json({ success: true, data: leads });
  } catch (error) {
    console.error('GET /leads error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── GET /:id ─ Get lead by ID ───────────────────────────────
router.get('/:id', requirePermission('lead.read'), async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    const access = verifyEntityAccess(lead, req.user, 'lead.read');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    return res.json({ success: true, data: lead });
  } catch (error) {
    console.error('GET /leads/:id error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST / ─ Create lead ────────────────────────────────────
router.post('/', requirePermission('lead.create'), async (req, res) => {
  try {
    const newLead = await createLead(req.body, req.user);
    return res.status(201).json({ success: true, data: newLead });
  } catch (error) {
    console.error('POST /leads error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── PATCH /:id ─ Update lead info ───────────────────────────
router.patch('/:id', requirePermission('lead.update'), async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    const access = verifyEntityAccess(lead, req.user, 'lead.update');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    // Apply allowed field updates
    const allowedFields = ['name', 'phone', 'email', 'budget', 'expectedCloseDate', 'notes'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) lead[field] = req.body[field];
    });
    lead.updatedAt = new Date().toISOString();

    return res.json({ success: true, data: lead });
  } catch (error) {
    console.error('PATCH /leads/:id error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/status ─ Transition status ────────────────────
router.post('/:id/status', requirePermission('lead.update'), async (req, res) => {
  try {
    const lead = await getLeadById(req.params.id);
    const access = verifyEntityAccess(lead, req.user, 'lead.update');
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    const { status, lostReason } = req.body;
    const updated = await updateLeadStatus(req.params.id, status, {
      lostReason,
      user: req.user,
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /leads/:id/status error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /:id/assign ─ Assign lead ──────────────────────────
router.post('/:id/assign', requirePermission('lead.assign'), async (req, res) => {
  try {
    const { assigneeUserId } = req.body;
    if (!assigneeUserId) {
      return res.status(400).json({ success: false, message: 'Cần cung cấp assigneeUserId.' });
    }

    const updated = await assignLead(req.params.id, assigneeUserId, req.user);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /leads/:id/assign error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
