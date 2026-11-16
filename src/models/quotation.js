/**
 * Quotation Model (Báo Giá)
 * ──────────────────────────
 * Implements specifications from Addendum A (Sections A1, A2, A3, A4, A6, A7):
 * - State machine: DRAFT -> SENT -> ACCEPTED | REJECTED | EXPIRED -> CONVERTED
 * - Financial calculation & Item Snapshots (productNameSnapshot, skuSnapshot, unitPrice)
 * - Discount approval threshold enforcement (discount.override required if > threshold)
 * - Clone quotation functionality for retry
 * - Conversion to Order
 * - Sequential code: QT-YYYYMMDD-XXXX
 */

import { db, isFirebaseReady } from '../config/firebase.js';
import { generateQuotationCode } from '../utils/idGenerator.js';
import { calculateOrderTotals, checkDiscountApproval } from '../utils/financial.js';
import { QUOTATION_STATES, validateQuotationTransition } from '../utils/stateMachines.js';
import { getSettings } from './appSetting.js';
import { logAudit } from './auditLog.js';
import { seedQuotations } from '../data/seedData.js';

const COLLECTION_NAME = 'quotations';

let inMemoryQuotations = [...seedQuotations];

export async function createQuotation(data, creatorUser = null) {
  const settings = await getSettings();
  const taxRate = data.taxRate !== undefined ? Number(data.taxRate) : settings.taxRate || 0.1;
  const thresholdPercent = settings.discountApprovalThresholdPercent || 10;

  // Process financial calculations & item snapshots (Section A4)
  const calc = calculateOrderTotals({
    items: data.items || [],
    discountAmount: data.discountAmount || 0,
    taxRate,
    shippingFee: data.shippingFee || 0,
  });

  // Check discount override threshold
  const discountCheck = checkDiscountApproval(calc.discountAmount, calc.subtotal, thresholdPercent, creatorUser);
  if (!discountCheck.allowed) {
    throw { statusCode: 403, message: discountCheck.error };
  }

  const code = generateQuotationCode();
  const now = new Date();
  const validUntilDays = Number(data.validDays) || 7;
  const validUntil = new Date(now.getTime() + validUntilDays * 24 * 60 * 60 * 1000).toISOString();

  const quotation = {
    id: `qt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    code,
    customerId: data.customerId || null,
    customerName: data.customerName || '',
    customerPhone: data.customerPhone || '',
    leadId: data.leadId || null,
    assignedSalesUserId: data.assignedSalesUserId || creatorUser?.uid || null,
    items: calc.items,
    subtotal: calc.subtotal,
    discountAmount: calc.discountAmount,
    taxRate: calc.taxRate,
    taxAmount: calc.taxAmount,
    shippingFee: calc.shippingFee,
    total: calc.total,
    status: QUOTATION_STATES.DRAFT,
    validUntil,
    notes: data.notes || '',
    convertedOrderId: null,
    createdBy: creatorUser?.uid || 'SYSTEM',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(COLLECTION_NAME).add(quotation);
      quotation.id = docRef.id;
    } catch (err) {
      console.warn('Could not write quotation to Firestore:', err.message);
    }
  }

  inMemoryQuotations.unshift(quotation);
  return quotation;
}

export async function getQuotationById(id) {
  if (isFirebaseReady && db) {
    try {
      const doc = await db.collection(COLLECTION_NAME).doc(id).get();
      if (doc.exists) return { id: doc.id, ...doc.data() };
    } catch (err) {
      console.warn('Could not read quotation from Firestore:', err.message);
    }
  }
  return inMemoryQuotations.find((q) => q.id === id || q.code === id) || null;
}

export async function getQuotations(filters = {}) {
  const { status, assignedSalesUserId, customerId, limit = 100 } = filters;

  if (isFirebaseReady && db) {
    try {
      let query = db.collection(COLLECTION_NAME).orderBy('updatedAt', 'desc');
      if (status) query = query.where('status', '==', status);
      if (assignedSalesUserId) query = query.where('assignedSalesUserId', '==', assignedSalesUserId);
      if (customerId) query = query.where('customerId', '==', customerId);

      const snapshot = await query.limit(Number(limit)).get();
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('Could not list quotations from Firestore:', err.message);
    }
  }

  let list = [...inMemoryQuotations];
  if (status) list = list.filter((q) => q.status === status);
  if (assignedSalesUserId) list = list.filter((q) => q.assignedSalesUserId === assignedSalesUserId);
  if (customerId) list = list.filter((q) => q.customerId === customerId);
  return list.slice(0, Number(limit));
}

export async function updateQuotation(id, data, user = null) {
  const quote = await getQuotationById(id);
  if (!quote) throw { statusCode: 404, message: 'Không tìm thấy Báo giá.' };

  // Only editable in DRAFT (Section A3)
  if (quote.status !== QUOTATION_STATES.DRAFT) {
    throw {
      statusCode: 409,
      message: 'Chỉ có thể chỉnh sửa báo giá khi đang ở trạng thái DRAFT.',
    };
  }

  const settings = await getSettings();
  const taxRate = data.taxRate !== undefined ? Number(data.taxRate) : quote.taxRate;
  const thresholdPercent = settings.discountApprovalThresholdPercent || 10;

  const calc = calculateOrderTotals({
    items: data.items || quote.items,
    discountAmount: data.discountAmount !== undefined ? data.discountAmount : quote.discountAmount,
    taxRate,
    shippingFee: data.shippingFee !== undefined ? data.shippingFee : quote.shippingFee,
  });

  const discountCheck = checkDiscountApproval(calc.discountAmount, calc.subtotal, thresholdPercent, user);
  if (!discountCheck.allowed) {
    throw { statusCode: 403, message: discountCheck.error };
  }

  const updates = {
    items: calc.items,
    subtotal: calc.subtotal,
    discountAmount: calc.discountAmount,
    taxRate: calc.taxRate,
    taxAmount: calc.taxAmount,
    shippingFee: calc.shippingFee,
    total: calc.total,
    notes: data.notes !== undefined ? data.notes : quote.notes,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(updates);
    } catch (err) {
      console.warn('Could not update quotation in Firestore:', err.message);
    }
  }

  Object.assign(quote, updates);
  return quote;
}

export async function updateQuotationStatus(id, newStatus, context = {}) {
  const quote = await getQuotationById(id);
  if (!quote) throw { statusCode: 404, message: 'Không tìm thấy Báo giá.' };

  const check = validateQuotationTransition(quote.status, newStatus, context);
  if (!check.valid) {
    throw { statusCode: check.statusCode || 409, message: check.error };
  }

  const updates = {
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(updates);
    } catch (err) {
      console.warn('Could not update quotation status in Firestore:', err.message);
    }
  }

  const oldStatus = quote.status;
  Object.assign(quote, updates);

  await logAudit({
    userId: context.user?.uid,
    action: 'QUOTATION_STATUS_CHANGE',
    entityType: 'quotation',
    entityId: id,
    oldState: { status: oldStatus },
    newState: { status: newStatus },
    reason: context.reason || `Chuyển trạng thái báo giá sang ${newStatus}`,
  });

  return quote;
}

/**
 * Clone a quotation to a new DRAFT quotation (Section A3)
 */
export async function cloneQuotation(id, user = null) {
  const source = await getQuotationById(id);
  if (!source) throw { statusCode: 404, message: 'Không tìm thấy Báo giá nguồn để nhân bản.' };

  return createQuotation(
    {
      customerId: source.customerId,
      customerName: source.customerName,
      customerPhone: source.customerPhone,
      leadId: source.leadId,
      assignedSalesUserId: user?.uid || source.assignedSalesUserId,
      items: source.items,
      discountAmount: source.discountAmount,
      taxRate: source.taxRate,
      shippingFee: source.shippingFee,
      notes: `Nhân bản từ ${source.code}`,
    },
    user
  );
}
