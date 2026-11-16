/**
 * Follow-up Routes (Lịch Hẹn & Chăm Sóc)
 * ───────────────────────────────────────
 * Implements endpoints from Addendum A (Section A6):
 * - GET /api/follow-ups - List follow-ups
 * - POST /api/follow-ups - Create follow-up appointment
 * - PATCH /api/follow-ups/:id - Update status (PENDING -> DONE | CANCELLED)
 */

import { Router } from 'express';
import {
  createFollowUp,
  getFollowUpById,
  getFollowUps,
  updateFollowUp,
} from '../models/followUp.js';
import { filterByScope, verifyEntityAccess } from '../utils/rbac.js';

const router = Router();

// ── GET / ─ List follow-ups ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, customerId, leadId } = req.query;
    let items = await getFollowUps({ status, customerId, leadId });

    // Scope to current user if SALES
    if (req.user?.role === 'SALES') {
      items = items.filter((f) => f.assigneeUserId === req.user.uid);
    }

    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('GET /follow-ups error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST / ─ Create follow-up ───────────────────────────────
router.post('/', async (req, res) => {
  try {
    const item = await createFollowUp(req.body, req.user);
    return res.status(201).json({ success: true, data: item });
  } catch (error) {
    console.error('POST /follow-ups error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── PATCH /:id ─ Update follow-up ───────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const item = await getFollowUpById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch hẹn.' });
    }

    if (req.user?.role === 'SALES' && item.assigneeUserId !== req.user.uid) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch hẹn.' });
    }

    const updated = await updateFollowUp(req.params.id, req.body);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('PATCH /follow-ups/:id error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

export default router;
