/**
 * Admin & Settings Routes
 * ────────────────────────
 * Implements endpoints from Addendum A (Section A6 & A2):
 * - GET/POST/PATCH /api/users
 * - GET /api/roles
 * - PUT /api/roles/:id/permissions
 * - GET /api/audit-logs (Admin only)
 * - GET/PATCH /api/settings (Admin only)
 */

import { Router } from 'express';
import { getAuditLogs } from '../models/auditLog.js';
import { getSettings, updateSettings } from '../models/appSetting.js';
import { PERMISSIONS_MATRIX, ROLES } from '../utils/rbac.js';
import { requireRoles } from '../middleware/rbac.js';

const router = Router();

// In-memory users for demo mode
let inMemoryUsers = [
  { uid: 'EMP001', name: 'Nguyễn Văn Admin', email: 'admin@minipancake.vn', role: ROLES.ADMIN, active: true },
  { uid: 'EMP002', name: 'Trần Thị Quản Lý', email: 'manager@minipancake.vn', role: ROLES.MANAGER, active: true },
  { uid: 'EMP003', name: 'Lê Hoàng Sales', email: 'sales1@minipancake.vn', role: ROLES.SALES, active: true },
  { uid: 'EMP004', name: 'Phạm Minh CSKH', email: 'cskh1@minipancake.vn', role: ROLES.CUSTOMER_CARE, active: true },
];

// ── GET /users ─ List users ─────────────────────────────────
router.get('/users', requireRoles(ROLES.ADMIN, ROLES.MANAGER), (req, res) => {
  return res.json({ success: true, data: inMemoryUsers });
});

// ── POST /users ─ Create user (Admin only) ──────────────────
router.post('/users', requireRoles(ROLES.ADMIN), (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Tên và email là bắt buộc.' });
  }

  const newUser = {
    uid: `EMP${String(inMemoryUsers.length + 1).padStart(3, '0')}`,
    name,
    email,
    role: role || ROLES.SALES,
    active: true,
    createdAt: new Date().toISOString(),
  };

  inMemoryUsers.push(newUser);
  return res.status(201).json({ success: true, data: newUser });
});

// ── PATCH /users/:id ─ Update user ──────────────────────────
router.patch('/users/:id', requireRoles(ROLES.ADMIN), (req, res) => {
  const user = inMemoryUsers.find((u) => u.uid === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
  }

  Object.assign(user, req.body);
  return res.json({ success: true, data: user });
});

// ── GET /roles ─ Get role permissions matrix ────────────────
router.get('/roles', (req, res) => {
  return res.json({
    success: true,
    data: {
      roles: Object.values(ROLES),
      permissions: PERMISSIONS_MATRIX,
    },
  });
});

// ── PUT /roles/:id/permissions ──────────────────────────────
router.put('/roles/:id/permissions', requireRoles(ROLES.ADMIN), (req, res) => {
  const { permissions } = req.body;
  const role = req.params.id.toUpperCase();
  if (!Object.values(ROLES).includes(role)) {
    return res.status(404).json({ success: false, message: 'Vai trò không tồn tại.' });
  }

  if (permissions && typeof permissions === 'object') {
    Object.entries(permissions).forEach(([perm, scope]) => {
      if (PERMISSIONS_MATRIX[perm]) {
        PERMISSIONS_MATRIX[perm][role] = scope;
      }
    });
  }

  return res.json({
    success: true,
    message: `Đã cập nhật ma trận phân quyền cho vai trò ${role}.`,
  });
});

// ── GET /audit-logs ─ Query audit logs (Admin only) ─────────
router.get('/audit-logs', requireRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const logs = await getAuditLogs(req.query);
    return res.json({ success: true, data: logs });
  } catch (error) {
    console.error('GET /audit-logs error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ── GET /settings ─ Get app settings ────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error('GET /settings error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ── PATCH /settings ─ Update settings (Admin only) ──────────
router.patch('/settings', requireRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const updated = await updateSettings(req.body, req.user);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('PATCH /settings error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
