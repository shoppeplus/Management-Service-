/**
 * Auth & Role Management Routes
 * ─────────────────────────────
 * Implements user authentication and 3-tier account management:
 * - F0: admin (Full system permissions)
 * - F1: lead (Full permissions EXCEPT Overview / Tổng quan)
 * - F2: member (ONLY allowed to access Bán hàng / inbox and Khách hàng / customers)
 */

import { Router } from 'express';

const router = Router();

export const SYSTEM_ACCOUNTS = [
  {
    uid: 'ACC-F0-001',
    name: 'Nguyễn Nam',
    email: 'admin@smartsales.vn',
    password: 'admin',
    role: 'F0_ADMIN',
    roleLabel: 'F0: Admin (Quản trị viên)',
    description: 'Full quyền toàn hệ thống (Tổng quan, Bán hàng, Khách hàng, Đơn hàng, Sản phẩm, Chăm sóc, Báo cáo, Cài đặt)',
    badgeColor: 'bg-purple-100 text-purple-700 border-purple-200',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
    allowedNavs: ['overview', 'inbox', 'customers', 'orders', 'products', 'care', 'reports', 'settings'],
  },
  {
    uid: 'ACC-F1-002',
    name: 'Trần Hoàng',
    email: 'lead@smartsales.vn',
    password: 'lead',
    role: 'F1_LEAD',
    roleLabel: 'F1: Lead (Trưởng nhóm)',
    description: 'Full quyền TRỪ mục Tổng quan (Bán hàng, Khách hàng, Đơn hàng, Sản phẩm, Chăm sóc, Báo cáo, Cài đặt)',
    badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
    allowedNavs: ['inbox', 'customers', 'orders', 'products', 'care', 'reports', 'settings'],
  },
  {
    uid: 'ACC-F2-003',
    name: 'Lê Thu Hà',
    email: 'member@smartsales.vn',
    password: 'member',
    role: 'F2_MEMBER',
    roleLabel: 'F2: Member (Thành viên)',
    description: 'Chỉ được phép truy cập vào Bán hàng và Khách hàng',
    badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
    allowedNavs: ['inbox', 'customers'],
  },
];

// GET /api/auth/accounts - List available accounts for demo / quick-switch
router.get('/accounts', (_req, res) => {
  const safeAccounts = SYSTEM_ACCOUNTS.map(({ password, ...acc }) => acc);
  return res.json({
    success: true,
    data: safeAccounts,
  });
});

// POST /api/auth/login - Login with email & password or direct account selection
router.post('/login', (req, res) => {
  const { email, password, role } = req.body;

  let user = null;

  if (role) {
    user = SYSTEM_ACCOUNTS.find((acc) => acc.role.toUpperCase() === role.toUpperCase());
  } else if (email) {
    user = SYSTEM_ACCOUNTS.find((acc) => acc.email.toLowerCase() === email.toLowerCase());
  }

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Tài khoản không tồn tại trong hệ thống.',
    });
  }

  // Password verification (lenient in demo mode: if password matches or equals default 'admin'/'lead'/'member' or '123456')
  if (password && user.password !== password && password !== '123456' && password !== 'admin123') {
    return res.status(401).json({
      success: false,
      message: 'Mật khẩu không chính xác. Mẹo: bạn có thể bấm trực tiếp vào nút chọn tài khoản F0, F1 hoặc F2.',
    });
  }

  const { password: _, ...safeUser } = user;

  // Generate lightweight mock JWT token for session
  const token = `token_${user.role.toLowerCase()}_${Date.now()}`;

  return res.json({
    success: true,
    message: `Đăng nhập thành công với vai trò ${user.roleLabel}`,
    data: {
      user: safeUser,
      token,
    },
  });
});

// GET /api/auth/me - Get current user profile
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.includes('f1_lead') || authHeader.includes('lead')) {
      const { password, ...u } = SYSTEM_ACCOUNTS[1];
      return res.json({ success: true, data: u });
    }
    if (authHeader.includes('f2_member') || authHeader.includes('member')) {
      const { password, ...u } = SYSTEM_ACCOUNTS[2];
      return res.json({ success: true, data: u });
    }
  }
  const { password, ...defaultAdmin } = SYSTEM_ACCOUNTS[0];
  return res.json({ success: true, data: defaultAdmin });
});

export default router;
