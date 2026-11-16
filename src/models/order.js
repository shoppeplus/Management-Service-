/**
 * Order Model (Đơn Hàng)
 * ────────────────────────
 * Implements specifications from Addendum A (Sections A1, A2, A3, A4, A6, A7):
 * - State machine: DRAFT -> CONFIRMED -> PROCESSING -> SHIPPING -> COMPLETED
 * - CANCELLATION, RETURN, REFUND validation & reasons
 * - Unique quotationId constraint (prevents duplicate quotation conversions)
 * - Financial calculation & snapshot preservation (Section A4)
 * - Auto-generated sequential code: DH-YYYYMMDD-XXXX
 * - Customer metrics updates (totalOrders, totalSpending for COMPLETED)
 */

import { db, isFirebaseReady } from '../config/firebase.js';
import { generateOrderCode } from '../utils/idGenerator.js';
import { calculateOrderTotals } from '../utils/financial.js';
import { ORDER_STATES, validateOrderTransition } from '../utils/stateMachines.js';
import { updateCustomer, getCustomerById } from './customer.js';
import { logAudit } from './auditLog.js';
import { seedOrders } from '../data/seedData.js';

const COLLECTION_NAME = 'orders';

let inMemoryOrders = [...seedOrders];

export async function createOrder(data, creatorUser = null) {
  // Check quotation unique constraint (Section A7)
  if (data.quotationId) {
    const existing = await getOrderByQuotationId(data.quotationId);
    if (existing) {
      throw {
        statusCode: 409,
        message: `Báo giá ${data.quotationId} đã được chuyển đổi thành đơn hàng ${existing.orderCode}. Không thể chuyển đổi lần thứ hai.`,
      };
    }
  }

  // Financial calculations & snapshot generation (Section A4)
  const calc = calculateOrderTotals({
    items: data.items || [],
    discountAmount: data.discount || data.discountAmount || 0,
    taxRate: data.taxRate !== undefined ? Number(data.taxRate) : 0.1,
    shippingFee: data.shippingFee || 0,
  });

  const orderCode = generateOrderCode();
  const now = new Date().toISOString();

  const orderData = {
    id: `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    orderCode,
    quotationId: data.quotationId || null,
    customerId: data.customerId || '',
    customerName: data.customerName || '',
    customerPhone: data.customerPhone || '',
    shippingAddress: data.shippingAddress || {},
    items: calc.items,
    subtotal: calc.subtotal,
    discount: calc.discountAmount,
    discountAmount: calc.discountAmount,
    taxRate: calc.taxRate,
    taxAmount: calc.taxAmount,
    shippingFee: calc.shippingFee,
    total: calc.total,
    totalAmount: calc.total,
    codAmount: data.codAmount !== undefined ? data.codAmount : calc.total,
    status: ORDER_STATES.DRAFT,
    trackingId: data.trackingId || '',
    shippingProvider: data.shippingProvider || 'ghtk',
    paymentStatus: data.paymentStatus || 'unpaid',
    paymentMethod: data.paymentMethod || 'cod',
    note: data.note || '',
    assignedSalesUserId: data.assignedSalesUserId || creatorUser?.uid || null,
    createdBy: creatorUser?.uid || 'SYSTEM',
    createdAt: now,
    updatedAt: now,
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(COLLECTION_NAME).add(orderData);
      orderData.id = docRef.id;
    } catch (error) {
      console.warn('Could not save order in Firestore:', error.message);
    }
  }

  inMemoryOrders.unshift(orderData);
  return orderData;
}

export async function getOrderById(id) {
  if (isFirebaseReady && db) {
    try {
      const doc = await db.collection(COLLECTION_NAME).doc(id).get();
      if (doc.exists) return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.warn('Could not read order from Firestore:', error.message);
    }
  }
  return inMemoryOrders.find((o) => o.id === id || o.orderCode === id) || null;
}

export async function getOrderByQuotationId(quotationId) {
  if (!quotationId) return null;

  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(COLLECTION_NAME)
        .where('quotationId', '==', quotationId)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
    } catch (err) {
      console.warn('Could not check quotationId in Firestore:', err.message);
    }
  }

  return inMemoryOrders.find((o) => o.quotationId === quotationId) || null;
}

export async function getOrders(filters = {}) {
  const { status, customerId, assignedSalesUserId, limit = 100 } = filters;

  if (isFirebaseReady && db) {
    try {
      let query = db.collection(COLLECTION_NAME).orderBy('updatedAt', 'desc');
      if (status) query = query.where('status', '==', status);
      if (customerId) query = query.where('customerId', '==', customerId);
      if (assignedSalesUserId) query = query.where('assignedSalesUserId', '==', assignedSalesUserId);

      const snapshot = await query.limit(Number(limit)).get();
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.warn('Could not list orders from Firestore:', error.message);
    }
  }

  let list = [...inMemoryOrders];
  if (status) list = list.filter((o) => o.status === status);
  if (customerId) list = list.filter((o) => o.customerId === customerId);
  if (assignedSalesUserId) list = list.filter((o) => o.assignedSalesUserId === assignedSalesUserId);
  return list.slice(0, Number(limit));
}

export async function getOrdersByCustomer(customerId) {
  return getOrders({ customerId });
}

export async function getOrdersByStatus(status) {
  return getOrders({ status });
}

export async function updateOrderStatus(id, newStatus, context = {}) {
  const order = await getOrderById(id);
  if (!order) throw { statusCode: 404, message: 'Không tìm thấy Đơn hàng.' };

  const check = validateOrderTransition(order.status, newStatus, {
    reason: context.reason,
    userRole: context.user?.role,
    hasRefundPermission: context.hasRefundPermission,
  });

  if (!check.valid) {
    throw { statusCode: check.statusCode || 409, message: check.error };
  }

  const updates = {
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };

  if (context.reason) {
    updates.statusReason = context.reason;
  }

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(updates);
    } catch (error) {
      console.warn('Could not update order in Firestore:', error.message);
    }
  }

  const oldStatus = order.status;
  Object.assign(order, updates);

  // Audit logging for critical transitions (A3 & A7)
  if (check.requiresAudit || [ORDER_STATES.CANCELLED, ORDER_STATES.RETURNED, ORDER_STATES.REFUNDED].includes(newStatus)) {
    await logAudit({
      userId: context.user?.uid,
      action: `ORDER_${newStatus}`,
      entityType: 'order',
      entityId: id,
      oldState: { status: oldStatus },
      newState: { status: newStatus },
      reason: context.reason || `Chuyển trạng thái đơn hàng sang ${newStatus}`,
    });
  }

  // Update customer spending metrics when COMPLETED or transitioning out of COMPLETED (A3)
  if (order.customerId && (newStatus === ORDER_STATES.COMPLETED || oldStatus === ORDER_STATES.COMPLETED)) {
    try {
      const customer = await getCustomerById(order.customerId);
      if (customer) {
        const customerOrders = await getOrdersByCustomer(order.customerId);
        const completedOrders = customerOrders.filter((o) => o.status === ORDER_STATES.COMPLETED);
        const totalOrders = completedOrders.length;
        const totalSpending = completedOrders.reduce((sum, o) => sum + (Number(o.total) || Number(o.totalAmount) || 0), 0);
        await updateCustomer(order.customerId, { totalOrders, totalSpending });
      }
    } catch (err) {
      console.warn('Could not update customer spending metrics:', err.message);
    }
  }

  return order;
}

export async function updateTrackingId(id, trackingId, shippingProvider = 'ghtk') {
  const order = await getOrderById(id);
  if (!order) throw { statusCode: 404, message: 'Không tìm thấy Đơn hàng.' };

  const updates = {
    trackingId,
    shippingProvider,
    status: ORDER_STATES.SHIPPING,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(updates);
    } catch (error) {
      console.warn('Could not update tracking ID in Firestore:', error.message);
    }
  }

  Object.assign(order, updates);
  return order;
}
