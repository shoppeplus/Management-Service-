/**
 * Role-Based Access Control (RBAC) & Data Scoping
 * ────────────────────────────────────────────────
 * Implements specifications from Addendum A (A1 & A2):
 * - Roles: ADMIN, MANAGER, SALES, CUSTOMER_CARE
 * - Scopes: 'All', 'Own', 'Own+ChuaGan', 'ContactOnly', 'BeforeShipping', 'None'
 */

export const ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SALES: 'SALES',
  CUSTOMER_CARE: 'CUSTOMER_CARE',
};

/**
 * Permissions Matrix according to Section A2
 */
export const PERMISSIONS_MATRIX = {
  // Customer permissions
  'customer.read': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own+ChuaGan',
    [ROLES.CUSTOMER_CARE]: 'All',
  },
  'customer.create': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: true,
    [ROLES.CUSTOMER_CARE]: true,
  },
  'customer.update': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: 'ContactOnly',
  },
  'customer.merge': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },
  'customer.identity.link': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: true,
    [ROLES.CUSTOMER_CARE]: true,
  },
  'customer.anonymize': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: false,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },

  // Lead permissions
  'lead.read': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: false,
  },
  'lead.create': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: true,
    [ROLES.CUSTOMER_CARE]: false,
  },
  'lead.update': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: false,
  },
  'lead.assign': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },

  // Product permissions
  'product.read': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: true,
    [ROLES.CUSTOMER_CARE]: true,
  },
  'product.manage': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },

  // Quotation permissions
  'quotation.read': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: false,
  },
  'quotation.create': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: true,
    [ROLES.CUSTOMER_CARE]: false,
  },
  'quotation.update': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: false,
  },
  'quotation.send': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: false,
  },
  'quotation.convert': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: false,
  },

  // Order permissions
  'order.read': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: 'All', // Readonly
  },
  'order.create': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: true,
    [ROLES.CUSTOMER_CARE]: false,
  },
  'order.update_status': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'BeforeShipping', // Own, only until before SHIPPING
    [ROLES.CUSTOMER_CARE]: false,
  },
  'order.refund': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },

  // Discount override
  'discount.override': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },

  // Conversation permissions
  'conversation.read': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own+ChuaGan',
    [ROLES.CUSTOMER_CARE]: 'Own+ChuaGan',
  },
  'conversation.reply': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: 'Own',
  },
  'conversation.assign': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: 'SelfClaim',
    [ROLES.CUSTOMER_CARE]: 'SelfClaim',
  },

  // Ticket permissions
  'ticket.create': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: true,
    [ROLES.CUSTOMER_CARE]: true,
  },
  'ticket.read': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own', // Readonly
    [ROLES.CUSTOMER_CARE]: 'All',
  },
  'ticket.update': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: 'All',
  },
  'ticket.reply': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: 'All',
  },
  'ticket.assign': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: true,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },

  // Dashboard & Admin
  'dashboard.read': {
    [ROLES.ADMIN]: 'All',
    [ROLES.MANAGER]: 'All',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: 'Own',
  },
  'notification.read': {
    [ROLES.ADMIN]: 'Own',
    [ROLES.MANAGER]: 'Own',
    [ROLES.SALES]: 'Own',
    [ROLES.CUSTOMER_CARE]: 'Own',
  },
  'audit.read': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: false,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },
  'settings.manage': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: false,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },
  'user.manage': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: false,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },
  'role.manage': {
    [ROLES.ADMIN]: true,
    [ROLES.MANAGER]: false,
    [ROLES.SALES]: false,
    [ROLES.CUSTOMER_CARE]: false,
  },
};

/**
 * Normalize role string (supports legacy roles and Ver 1.0 F0/F1/F2 tiers)
 */
export function normalizeRole(role) {
  if (!role) return ROLES.SALES;
  const upper = String(role).toUpperCase().trim();
  if (upper === 'ADMIN' || upper === 'F0') return ROLES.ADMIN;
  if (upper === 'MANAGER' || upper === 'LEADER' || upper === 'F1') return ROLES.MANAGER;
  if (upper === 'CUSTOMER_CARE' || upper === 'CSKH') return ROLES.CUSTOMER_CARE;
  if (upper === 'SALES' || upper === 'MEMBER' || upper === 'F2' || upper === 'F3') return ROLES.SALES;
  return ROLES.SALES;
}

/**
 * Extract normalized F0/F1/F2 account scope contract for easy integration with Nam's Account DB.
 * - F0 (Admin): full access to dashboard, all categories, all business accounts/shops.
 * - F1 (Leader): dashboard scoped to assigned categories; inbox/orders scoped to assigned categories & shops.
 * - F2 (Member): no dashboard access; inbox/orders scoped to assigned categories, shops & tasks.
 */
export function getUserDataScope(user) {
  const rawRole = String(user?.role || user?.tier || user?.level || 'ADMIN').toUpperCase().trim();
  const normalizedRole = normalizeRole(rawRole);

  let roleTier = 'F2';
  if (normalizedRole === ROLES.ADMIN || rawRole === 'F0') {
    roleTier = 'F0';
  } else if (normalizedRole === ROLES.MANAGER || rawRole === 'F1' || rawRole === 'LEADER') {
    roleTier = 'F1';
  }

  const allowedCategories = Array.isArray(user?.allowedCategories)
    ? user.allowedCategories
    : Array.isArray(user?.categories)
    ? user.categories
    : null;

  const allowedShopIds = Array.isArray(user?.allowedShopIds)
    ? user.allowedShopIds
    : Array.isArray(user?.businessAccountIds)
    ? user.businessAccountIds
    : null;

  return {
    roleTier,
    normalizedRole,
    isAdmin: roleTier === 'F0',
    isLeader: roleTier === 'F1',
    isMember: roleTier === 'F2',
    canViewDashboard: roleTier === 'F0' || roleTier === 'F1',
    allowedCategories: roleTier === 'F0' ? null : allowedCategories,
    allowedShopIds: roleTier === 'F0' ? null : allowedShopIds,
  };
}

/**
 * Check if a user has a specific permission
 * @param {object} user - Authenticated user object { uid, role }
 * @param {string} permission - e.g. 'order.create', 'customer.read'
 * @returns {boolean|string} false if denied, or scope ('All', 'Own', etc.) / true
 */
export function getPermissionScope(user, permission) {
  const role = normalizeRole(user?.role);
  const permConfig = PERMISSIONS_MATRIX[permission];
  if (!permConfig) return false;
  const scope = permConfig[role];
  return scope === undefined ? false : scope;
}

/**
 * Extract owner ID from an entity
 */
export function getEntityOwnerId(entity) {
  if (!entity) return null;
  return (
    entity.assignedSalesUserId ||
    entity.assigneeUserId ||
    entity.salesUserId ||
    entity.assignedUserId ||
    entity.assignedTo ||
    entity.createdBy ||
    entity.userId ||
    null
  );
}

/**
 * Filter an array of items according to the user's permission scope (A1)
 */
export function filterByScope(items, user, permission) {
  const scope = getPermissionScope(user, permission);
  if (!scope || scope === false) return [];
  if (scope === 'All' || scope === true) return items;

  const currentUserId = user?.uid;

  if (scope === 'Own') {
    return items.filter((item) => getEntityOwnerId(item) === currentUserId);
  }

  if (scope === 'Own+ChuaGan') {
    return items.filter((item) => {
      const ownerId = getEntityOwnerId(item);
      return !ownerId || ownerId === currentUserId;
    });
  }

  return items;
}

/**
 * Verify access to a single entity according to A1:
 * - If user lacks permission completely -> 403 Forbidden
 * - If user has 'Own' scope, but record belongs to another -> 404 Not Found (no leaking existence)
 */
export function verifyEntityAccess(entity, user, permission) {
  const scope = getPermissionScope(user, permission);

  // 1. Missing permission completely -> 403
  if (!scope || scope === false) {
    return {
      allowed: false,
      status: 403,
      message: 'Bạn không có quyền thực hiện hành động này.',
    };
  }

  // 2. Full access
  if (scope === 'All' || scope === true) {
    return { allowed: true };
  }

  // 3. Entity doesn't exist -> 404
  if (!entity) {
    return {
      allowed: false,
      status: 404,
      message: 'Không tìm thấy dữ liệu yêu cầu.',
    };
  }

  const currentUserId = user?.uid;
  const ownerId = getEntityOwnerId(entity);

  if (scope === 'Own') {
    if (ownerId && ownerId !== currentUserId) {
      // Return 404 to not reveal existence (Section A1)
      return {
        allowed: false,
        status: 404,
        message: 'Không tìm thấy dữ liệu yêu cầu.',
      };
    }
  }

  if (scope === 'Own+ChuaGan') {
    if (ownerId && ownerId !== currentUserId) {
      return {
        allowed: false,
        status: 404,
        message: 'Không tìm thấy dữ liệu yêu cầu.',
      };
    }
  }

  return { allowed: true };
}
