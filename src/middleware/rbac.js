/**
 * RBAC Express Middleware
 * ────────────────────────
 * Express middleware for checking permissions based on Addendum A (A1 & A2).
 */

import { getPermissionScope, normalizeRole } from '../utils/rbac.js';

/**
 * Require a specific permission
 * @param {string} permission - e.g. 'order.create', 'customer.read'
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Yêu cầu đăng nhập để truy cập tài nguyên này.',
      });
    }

    const scope = getPermissionScope(req.user, permission);
    if (!scope || scope === false) {
      return res.status(403).json({
        success: false,
        message: `Bạn không có quyền thực hiện thao tác: ${permission}`,
      });
    }

    // Attach computed scope to request for downstream handlers
    req.permissionScope = scope;
    next();
  };
}

/**
 * Require one or more specific roles
 * @param  {...string} allowedRoles - e.g. 'ADMIN', 'MANAGER'
 */
export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Yêu cầu đăng nhập để truy cập tài nguyên này.',
      });
    }

    const userRole = normalizeRole(req.user.role);
    if (!allowedRoles.map((r) => r.toUpperCase()).includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Vai trò người dùng không đủ quyền thực hiện hành động này.',
      });
    }

    next();
  };
}
