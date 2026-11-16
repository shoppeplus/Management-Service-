/**
 * Message & Conversation Routes
 * ──────────────────────────────
 * Implements endpoints from Addendum A (Sections A1, A2, A3, A6, A7, A8):
 * - GET /api/messages/conversations - List conversations (scoped)
 * - GET /api/messages/conversation/:conversationId - Get messages for a thread
 * - POST /api/messages - Send message or internal note (isInternal: true)
 * - POST /api/messages/conversation/:id/read - Mark conversation read
 * - POST /api/messages/conversation/:id/assign - Concurrency-safe claim (409 if already claimed)
 * - POST /api/messages/conversation/:id/status - Update conversation status
 */

import { Router } from 'express';
import {
  createMessage,
  getMessagesByConversation,
  markAsRead,
  markConversationAsRead,
  getUnreadCount,
} from '../models/message.js';
import {
  getConversations,
  getConversationById,
  claimConversation,
  updateConversationStatus,
} from '../models/conversation.js';
import { requirePermission } from '../middleware/rbac.js';
import { filterByScope, verifyEntityAccess, getPermissionScope } from '../utils/rbac.js';

const router = Router();

// ── GET /conversations ─ List conversations (scoped) ────────
const listConversationsHandler = async (req, res) => {
  try {
    const { status, channelType } = req.query;
    let list = await getConversations({ status, channelType });

    list = filterByScope(list, req.user, 'conversation.read');
    return res.json({ success: true, data: list });
  } catch (error) {
    console.error('GET conversations error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

router.get('/conversations', requirePermission('conversation.read'), listConversationsHandler);
router.get('/', requirePermission('conversation.read'), listConversationsHandler);

// ── GET /conversation/:conversationId ─ Get messages ────────
router.get('/conversation/:conversationId', requirePermission('conversation.read'), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const conv = await getConversationById(conversationId);
    if (conv) {
      const access = verifyEntityAccess(conv, req.user, 'conversation.read');
      if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
      }
    }

    const limit = parseInt(req.query.limit, 10) || 50;
    const messages = await getMessagesByConversation(conversationId, limit);
    return res.json({ success: true, data: messages });
  } catch (error) {
    console.error('GET /messages/conversation error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST / ─ Send a message or internal note (Section A6) ───
router.post('/', requirePermission('conversation.reply'), async (req, res) => {
  try {
    const { content, conversationId, isInternal, clientMessageId } = req.body;

    if (!content || !conversationId) {
      return res.status(400).json({
        success: false,
        message: 'content và conversationId là bắt buộc.',
      });
    }

    const conv = await getConversationById(conversationId);
    if (conv) {
      const access = verifyEntityAccess(conv, req.user, 'conversation.reply');
      if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
      }
    }

    const message = await createMessage({
      ...req.body,
      clientMessageId,
      isInternal: Boolean(isInternal),
      senderId: req.user.uid,
      senderName: req.user.name || req.user.email || 'Nhân viên',
      senderType: 'employee',
    });

    return res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error('POST /messages error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /conversation/:id/read ─ Mark read (Section A6) ────
router.post('/conversation/:id/read', requirePermission('conversation.read'), async (req, res) => {
  try {
    await markConversationAsRead(req.params.id);
    return res.json({ success: true, message: 'Đã đánh dấu cuộc hội thoại là đã đọc.' });
  } catch (error) {
    console.error('POST /messages/conversation/:id/read error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /conversation/:id/assign ─ Claim or assign (Section A7)
router.post('/conversation/:id/assign', requirePermission('conversation.assign'), async (req, res) => {
  try {
    const { assigneeUserId } = req.body;
    const targetUserId = assigneeUserId || req.user.uid;

    const assignScope = getPermissionScope(req.user, 'conversation.assign');
    // If user only has SelfClaim scope, they can only assign to themselves
    if (assignScope === 'SelfClaim' && targetUserId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: 'Nhân viên chỉ có quyền tự nhận cuộc hội thoại cho bản thân (SelfClaim).',
      });
    }

    const updated = await claimConversation(req.params.id, targetUserId);
    return res.json({
      success: true,
      message: `Đã phân công hội thoại thành công cho ${targetUserId}.`,
      data: updated,
    });
  } catch (error) {
    console.error('POST /messages/conversation/:id/assign error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── POST /conversation/:id/status ─ State Machine transition ─
router.post('/conversation/:id/status', requirePermission('conversation.reply'), async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await updateConversationStatus(req.params.id, status, { user: req.user });
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('POST /messages/conversation/:id/status error:', error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
});

// ── GET /conversation/:conversationId/unread ────────────────
router.get('/conversation/:conversationId/unread', async (req, res) => {
  try {
    const count = await getUnreadCount(req.params.conversationId);
    return res.json({ success: true, unreadCount: count });
  } catch (error) {
    console.error('GET /messages/conversation/unread error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
