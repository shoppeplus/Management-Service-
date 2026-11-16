/**
 * State Machines (Máy Trạng Thái)
 * ────────────────────────────────
 * Implements specifications from Addendum A (Section A3):
 * Centralized state transition validation for:
 * - Lead
 * - Quotation
 * - Order
 * - Ticket
 * - Conversation
 *
 * All state transitions must go through a single validated function per entity.
 * Returns 409/422 status code errors if invalid.
 */

// ── Lead States ─────────────────────────────────────────────────────────────
export const LEAD_STATES = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  INTERESTED: 'INTERESTED',
  QUOTATION: 'QUOTATION',
  WON: 'WON',
  LOST: 'LOST',
};

// ── Quotation States ────────────────────────────────────────────────────────
export const QUOTATION_STATES = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CONVERTED: 'CONVERTED',
};

// ── Order States ────────────────────────────────────────────────────────────
export const ORDER_STATES = {
  DRAFT: 'DRAFT',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  SHIPPING: 'SHIPPING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
  REFUNDED: 'REFUNDED',
};

// ── Ticket States ───────────────────────────────────────────────────────────
export const TICKET_STATES = {
  NEW: 'NEW',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_CUSTOMER: 'WAITING_CUSTOMER',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
};

// ── Conversation States ─────────────────────────────────────────────────────
export const CONVERSATION_STATES = {
  OPEN: 'OPEN',
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
};

/**
 * Validate Lead state transition
 * - NEW -> CONTACTED -> INTERESTED -> QUOTATION -> WON (can step forward/backward when not WON/LOST)
 * - Any non-terminal state -> LOST (requires lostReason)
 * - WON is terminal
 * - LOST -> NEW (reopen) only MANAGER or ADMIN
 */
export function validateLeadTransition(currentStatus, newStatus, context = {}) {
  const { lostReason, userRole } = context;

  if (currentStatus === newStatus) {
    return { valid: true };
  }

  // WON is terminal
  if (currentStatus === LEAD_STATES.WON) {
    return {
      valid: false,
      statusCode: 409,
      error: 'Lead đã ở trạng thái WON (thành công) và không thể chuyển trạng thái tiếp.',
    };
  }

  // LOST -> NEW (reopen)
  if (currentStatus === LEAD_STATES.LOST) {
    if (newStatus === LEAD_STATES.NEW) {
      const role = String(userRole || '').toUpperCase();
      if (role !== 'ADMIN' && role !== 'MANAGER') {
        return {
          valid: false,
          statusCode: 403,
          error: 'Chỉ cấp Quản lý (MANAGER) trở lên mới có quyền mở lại Lead đã LOST.',
        };
      }
      return { valid: true, requiresAudit: true };
    }
    return {
      valid: false,
      statusCode: 409,
      error: 'Lead đã LOST chỉ có thể mở lại thành trạng thái NEW.',
    };
  }

  // Transition to LOST
  if (newStatus === LEAD_STATES.LOST) {
    if (!lostReason || !lostReason.trim()) {
      return {
        valid: false,
        statusCode: 422,
        error: 'Chuyển sang trạng thái LOST bắt buộc phải cung cấp lý do (lostReason).',
      };
    }
    return { valid: true, requiresAudit: true };
  }

  // Valid pipeline forward / backward transitions
  const activePipeline = [
    LEAD_STATES.NEW,
    LEAD_STATES.CONTACTED,
    LEAD_STATES.INTERESTED,
    LEAD_STATES.QUOTATION,
    LEAD_STATES.WON,
  ];

  if (activePipeline.includes(currentStatus) && activePipeline.includes(newStatus)) {
    return { valid: true };
  }

  return {
    valid: false,
    statusCode: 409,
    error: `Chuyển trạng thái Lead không hợp lệ từ ${currentStatus} sang ${newStatus}.`,
  };
}

/**
 * Validate Quotation state transition
 * - DRAFT -> SENT
 * - SENT -> ACCEPTED | REJECTED | EXPIRED
 * - ACCEPTED -> CONVERTED (system only upon order creation)
 * - Line items only editable in DRAFT
 * - REJECTED, EXPIRED, CONVERTED are terminal (clone to DRAFT to retry)
 */
export function validateQuotationTransition(currentStatus, newStatus, context = {}) {
  const { isSystemAction = false } = context;

  if (currentStatus === newStatus) {
    return { valid: true };
  }

  // Terminal states check
  const terminalStates = [
    QUOTATION_STATES.REJECTED,
    QUOTATION_STATES.EXPIRED,
    QUOTATION_STATES.CONVERTED,
  ];
  if (terminalStates.includes(currentStatus)) {
    return {
      valid: false,
      statusCode: 409,
      error: `Báo giá đã ở trạng thái ${currentStatus} (kết thúc), không thể chuyển tiếp. Vui lòng nhân bản (clone) để tạo báo giá mới.`,
    };
  }

  if (currentStatus === QUOTATION_STATES.DRAFT) {
    if (newStatus === QUOTATION_STATES.SENT) {
      return { valid: true };
    }
    return {
      valid: false,
      statusCode: 409,
      error: 'Báo giá ở trạng thái DRAFT chỉ có thể chuyển sang SENT (Gửi khách hàng).',
    };
  }

  if (currentStatus === QUOTATION_STATES.SENT) {
    if (
      newStatus === QUOTATION_STATES.ACCEPTED ||
      newStatus === QUOTATION_STATES.REJECTED ||
      newStatus === QUOTATION_STATES.EXPIRED
    ) {
      return { valid: true };
    }
    return {
      valid: false,
      statusCode: 409,
      error: 'Báo giá đã gửi (SENT) chỉ có thể chuyển sang ACCEPTED, REJECTED hoặc EXPIRED.',
    };
  }

  if (currentStatus === QUOTATION_STATES.ACCEPTED) {
    if (newStatus === QUOTATION_STATES.CONVERTED) {
      if (!isSystemAction) {
        return {
          valid: false,
          statusCode: 403,
          error: 'Trạng thái CONVERTED chỉ do hệ thống tự động thiết lập khi chuyển đổi thành Đơn hàng.',
        };
      }
      return { valid: true };
    }
    return {
      valid: false,
      statusCode: 409,
      error: 'Báo giá đã chấp nhận (ACCEPTED) chỉ có thể chuyển đổi thành Đơn hàng (CONVERTED).',
    };
  }

  return {
    valid: false,
    statusCode: 409,
    error: `Chuyển trạng thái Báo giá không hợp lệ từ ${currentStatus} sang ${newStatus}.`,
  };
}

/**
 * Validate Order state transition
 * - DRAFT -> CONFIRMED -> PROCESSING -> SHIPPING -> COMPLETED
 * - DRAFT | CONFIRMED | PROCESSING -> CANCELLED
 * - COMPLETED -> RETURNED -> REFUNDED
 * - CANCELLED and REFUNDED are terminal
 * - Moving to CANCELLED, RETURNED, REFUNDED requires reason & audit; REFUNDED requires order.refund
 * - SALES can only update status up to before SHIPPING
 */
export function validateOrderTransition(currentStatus, newStatus, context = {}) {
  const { reason, userRole, hasRefundPermission = false } = context;

  if (currentStatus === newStatus) {
    return { valid: true };
  }

  // Terminal states check
  if (currentStatus === ORDER_STATES.CANCELLED || currentStatus === ORDER_STATES.REFUNDED) {
    return {
      valid: false,
      statusCode: 409,
      error: `Đơn hàng đã ở trạng thái ${currentStatus} (kết thúc), không thể thay đổi thêm.`,
    };
  }

  // Scope check for SALES: can only update before SHIPPING
  const role = String(userRole || '').toUpperCase();
  if (role === 'SALES') {
    const allowedForSales = [ORDER_STATES.DRAFT, ORDER_STATES.CONFIRMED, ORDER_STATES.PROCESSING];
    if (!allowedForSales.includes(currentStatus) || newStatus === ORDER_STATES.SHIPPING || newStatus === ORDER_STATES.COMPLETED) {
      return {
        valid: false,
        statusCode: 403,
        error: 'Nhân viên Sales chỉ được chuyển trạng thái đơn hàng đến trước giai đoạn Vận chuyển (SHIPPING).',
      };
    }
  }

  // Cancel check
  if (newStatus === ORDER_STATES.CANCELLED) {
    const cancellableStates = [ORDER_STATES.DRAFT, ORDER_STATES.CONFIRMED, ORDER_STATES.PROCESSING];
    if (!cancellableStates.includes(currentStatus)) {
      return {
        valid: false,
        statusCode: 409,
        error: `Không thể hủy đơn hàng khi đã ở trạng thái ${currentStatus}.`,
      };
    }
    if (!reason || !reason.trim()) {
      return {
        valid: false,
        statusCode: 422,
        error: 'Hủy đơn hàng bắt buộc phải có lý do (reason).',
      };
    }
    return { valid: true, requiresAudit: true };
  }

  // Standard forward progression
  if (currentStatus === ORDER_STATES.DRAFT && newStatus === ORDER_STATES.CONFIRMED) {
    return { valid: true };
  }
  if (currentStatus === ORDER_STATES.CONFIRMED && newStatus === ORDER_STATES.PROCESSING) {
    return { valid: true };
  }
  if (currentStatus === ORDER_STATES.PROCESSING && newStatus === ORDER_STATES.SHIPPING) {
    return { valid: true };
  }
  if (currentStatus === ORDER_STATES.SHIPPING && newStatus === ORDER_STATES.COMPLETED) {
    return { valid: true };
  }

  // Return and Refund progression
  if (currentStatus === ORDER_STATES.COMPLETED && newStatus === ORDER_STATES.RETURNED) {
    if (!reason || !reason.trim()) {
      return {
        valid: false,
        statusCode: 422,
        error: 'Chuyển sang trạng thái Trả hàng (RETURNED) bắt buộc phải có lý do.',
      };
    }
    return { valid: true, requiresAudit: true };
  }

  if (currentStatus === ORDER_STATES.RETURNED && newStatus === ORDER_STATES.REFUNDED) {
    if (!hasRefundPermission) {
      return {
        valid: false,
        statusCode: 403,
        error: 'Bạn không có quyền hoàn tiền (order.refund). Cần cấp Quản lý hoặc Admin duyệt.',
      };
    }
    if (!reason || !reason.trim()) {
      return {
        valid: false,
        statusCode: 422,
        error: 'Hoàn tiền bắt buộc phải có lý do (reason).',
      };
    }
    return { valid: true, requiresAudit: true };
  }

  return {
    valid: false,
    statusCode: 409,
    error: `Chuyển trạng thái Đơn hàng không hợp lệ từ ${currentStatus} sang ${newStatus}.`,
  };
}

/**
 * Validate Ticket state transition
 * - NEW -> ASSIGNED -> IN_PROGRESS <-> WAITING_CUSTOMER -> RESOLVED -> CLOSED
 * - RESOLVED -> IN_PROGRESS (reopen) within N days (default 7); after that, create new ticket
 * - CLOSED is terminal
 */
export function validateTicketTransition(currentStatus, newStatus, context = {}) {
  const { resolvedAt, reopenDaysLimit = 7 } = context;

  if (currentStatus === newStatus) {
    return { valid: true };
  }

  if (currentStatus === TICKET_STATES.CLOSED) {
    return {
      valid: false,
      statusCode: 409,
      error: 'Ticket đã đóng (CLOSED) không thể mở lại. Vui lòng tạo ticket mới.',
    };
  }

  // Reopen check from RESOLVED -> IN_PROGRESS
  if (currentStatus === TICKET_STATES.RESOLVED && newStatus === TICKET_STATES.IN_PROGRESS) {
    if (resolvedAt) {
      const daysSinceResolved = (Date.now() - new Date(resolvedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceResolved > reopenDaysLimit) {
        return {
          valid: false,
          statusCode: 409,
          error: `Ticket đã giải quyết quá ${reopenDaysLimit} ngày. Không thể mở lại, vui lòng tạo ticket mới.`,
        };
      }
    }
    return { valid: true, requiresAudit: true };
  }

  if (currentStatus === TICKET_STATES.NEW && (newStatus === TICKET_STATES.ASSIGNED || newStatus === TICKET_STATES.IN_PROGRESS)) {
    return { valid: true };
  }
  if (currentStatus === TICKET_STATES.ASSIGNED && newStatus === TICKET_STATES.IN_PROGRESS) {
    return { valid: true };
  }
  if (currentStatus === TICKET_STATES.IN_PROGRESS && (newStatus === TICKET_STATES.WAITING_CUSTOMER || newStatus === TICKET_STATES.RESOLVED)) {
    return { valid: true };
  }
  if (currentStatus === TICKET_STATES.WAITING_CUSTOMER && (newStatus === TICKET_STATES.IN_PROGRESS || newStatus === TICKET_STATES.RESOLVED)) {
    return { valid: true };
  }
  if (currentStatus === TICKET_STATES.RESOLVED && newStatus === TICKET_STATES.CLOSED) {
    return { valid: true };
  }

  return {
    valid: false,
    statusCode: 409,
    error: `Chuyển trạng thái Ticket không hợp lệ từ ${currentStatus} sang ${newStatus}.`,
  };
}

/**
 * Validate Conversation state transition
 * - OPEN <-> PENDING -> RESOLVED -> CLOSED
 * - Customer new message on RESOLVED -> auto OPEN
 * - CLOSED is terminal (new message creates new conversation)
 */
export function validateConversationTransition(currentStatus, newStatus, context = {}) {
  const { isCustomerMessage = false } = context;

  if (currentStatus === newStatus) {
    return { valid: true };
  }

  // Customer message on RESOLVED automatically moves to OPEN
  if (currentStatus === CONVERSATION_STATES.RESOLVED && isCustomerMessage) {
    return { valid: true, nextStatus: CONVERSATION_STATES.OPEN };
  }

  if (currentStatus === CONVERSATION_STATES.CLOSED) {
    return {
      valid: false,
      statusCode: 409,
      error: 'Hội thoại đã đóng hoàn toàn (CLOSED). Tin nhắn mới sẽ tạo một hội thoại mới.',
    };
  }

  if (currentStatus === CONVERSATION_STATES.OPEN && (newStatus === CONVERSATION_STATES.PENDING || newStatus === CONVERSATION_STATES.RESOLVED)) {
    return { valid: true };
  }
  if (currentStatus === CONVERSATION_STATES.PENDING && (newStatus === CONVERSATION_STATES.OPEN || newStatus === CONVERSATION_STATES.RESOLVED)) {
    return { valid: true };
  }
  if (currentStatus === CONVERSATION_STATES.RESOLVED && (newStatus === CONVERSATION_STATES.OPEN || newStatus === CONVERSATION_STATES.CLOSED)) {
    return { valid: true };
  }

  return {
    valid: false,
    statusCode: 409,
    error: `Chuyển trạng thái hội thoại không hợp lệ từ ${currentStatus} sang ${newStatus}.`,
  };
}

/**
 * Calculate customer spending metrics from orders according to A3:
 * - totalOrders = number of COMPLETED orders
 * - totalSpending = sum of total for COMPLETED orders
 * - RETURNED and REFUNDED orders are NOT counted.
 */
export function calculateCustomerMetrics(orders = []) {
  const completedOrders = orders.filter((o) => o.status === ORDER_STATES.COMPLETED);
  const totalOrders = completedOrders.length;
  const totalSpending = completedOrders.reduce((sum, o) => sum + (Number(o.total) || Number(o.totalAmount) || 0), 0);
  return { totalOrders, totalSpending };
}
