/**
 * Notification Routes (Thông Báo)
 * ────────────────────────────────
 * Implements endpoints from Addendum A (Section A6):
 * - GET /api/notifications
 * - POST /api/notifications/:id/read
 * - POST /api/notifications/read-all
 */

import { Router } from 'express';
import {
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../models/notification.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const list = await getNotificationsForUser(req.user.uid, req.query.limit || 50);
    return res.json({ success: true, data: list });
  } catch (error) {
    console.error('GET /notifications error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    await markNotificationAsRead(req.params.id, req.user.uid);
    return res.json({ success: true, message: 'Đã đánh dấu thông báo là đã đọc.' });
  } catch (error) {
    console.error('POST /notifications/:id/read error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    await markAllNotificationsAsRead(req.user.uid);
    return res.json({ success: true, message: 'Đã đánh dấu tất cả thông báo là đã đọc.' });
  } catch (error) {
    console.error('POST /notifications/read-all error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
