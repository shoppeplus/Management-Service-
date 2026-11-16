/**
 * Financial Calculation & Snapshot Engine
 * ─────────────────────────────────────────
 * Implements specifications from Addendum A (Section A4):
 * - VND calculations: integer (0 decimals), rounded half-up to dong
 * - lineTotal = quantity × unitPrice − line.discountAmount
 * - subtotal = Σ lineTotal
 * - discountAmount (header) = overall discount, capped at subtotal
 * - taxAmount = round((subtotal − discountAmount) × taxRate)
 * - total = subtotal − discountAmount + taxAmount + shippingFee
 * - Snapshot recording: productNameSnapshot, skuSnapshot, unitPrice
 * - Threshold check: discount > threshold (default 10%) requires discount.override permission
 * - Copying snapshots when converting quotation to order
 */

import { getPermissionScope } from './rbac.js';

/**
 * Round half-up to VND integer
 * @param {number} val
 * @returns {number}
 */
export function roundVND(val) {
  if (isNaN(val) || val === null || val === undefined) return 0;
  return Math.round(Number(val));
}

/**
 * Format number to VND string
 */
export function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(roundVND(amount));
}

/**
 * Calculate single item line total and generate snapshots
 */
export function calculateLineItem(item) {
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const unitPrice = roundVND(item.unitPrice || item.price || 0);
  const lineDiscount = roundVND(item.discountAmount || 0);

  const grossTotal = quantity * unitPrice;
  const lineTotal = Math.max(0, grossTotal - lineDiscount);

  return {
    productId: item.productId || item.id || null,
    skuSnapshot: item.skuSnapshot || item.sku || `SKU-${item.productId || 'UNKNOWN'}`,
    productNameSnapshot: item.productNameSnapshot || item.name || item.productName || 'Sản phẩm',
    unitPrice,
    quantity,
    discountAmount: lineDiscount,
    lineTotal,
    weight: item.weight || 100, // grams
  };
}

/**
 * Calculate entire quotation or order financial totals
 *
 * @param {object} params
 * @param {Array} params.items - Raw line items
 * @param {number} [params.discountAmount=0] - Header order discount
 * @param {number} [params.taxRate=0.1] - Tax rate (e.g. 0.08 or 0.1 for 10%)
 * @param {number} [params.shippingFee=0] - Shipping fee
 * @returns {object} Calculated totals and processed line items
 */
export function calculateOrderTotals({
  items = [],
  discountAmount = 0,
  taxRate = 0.1,
  shippingFee = 0,
}) {
  const processedItems = items.map(calculateLineItem);

  const subtotal = processedItems.reduce((acc, curr) => acc + curr.lineTotal, 0);

  // Discount cannot exceed subtotal
  const validHeaderDiscount = Math.min(Math.max(0, roundVND(discountAmount)), subtotal);

  // Taxable amount = subtotal - header discount
  const taxableAmount = Math.max(0, subtotal - validHeaderDiscount);
  const safeTaxRate = Number(taxRate) >= 0 ? Number(taxRate) : 0.1;
  const taxAmount = roundVND(taxableAmount * safeTaxRate);

  const safeShippingFee = Math.max(0, roundVND(shippingFee));
  const total = subtotal - validHeaderDiscount + taxAmount + safeShippingFee;

  return {
    items: processedItems,
    subtotal,
    discountAmount: validHeaderDiscount,
    taxRate: safeTaxRate,
    taxAmount,
    shippingFee: safeShippingFee,
    total,
  };
}

/**
 * Check if discount exceeds approval threshold (Section A4)
 * Default threshold is 10% of subtotal.
 * If exceeded, requires user to have 'discount.override' permission.
 *
 * @param {number} discountAmount
 * @param {number} subtotal
 * @param {number} [thresholdPercent=10]
 * @param {object} user - Authenticated user
 * @returns {{ allowed: boolean, requiresOverride: boolean, error?: string }}
 */
export function checkDiscountApproval(discountAmount, subtotal, thresholdPercent = 10, user = null) {
  if (subtotal <= 0 || discountAmount <= 0) {
    return { allowed: true, requiresOverride: false };
  }

  const discountPercent = (discountAmount / subtotal) * 100;

  if (discountPercent > thresholdPercent) {
    const hasOverride = user ? getPermissionScope(user, 'discount.override') : false;
    if (!hasOverride) {
      return {
        allowed: false,
        requiresOverride: true,
        discountPercent: Math.round(discountPercent * 10) / 10,
        error: `Chiết khấu ${Math.round(discountPercent * 10) / 10}% vượt quá ngưỡng cho phép (${thresholdPercent}%). Cần Quản lý hoặc Admin duyệt (quyền discount.override).`,
      };
    }
    return { allowed: true, requiresOverride: true };
  }

  return { allowed: true, requiresOverride: false };
}

/**
 * Create deep item snapshots when converting a Quotation into an Order (Section A4)
 * Does NOT re-evaluate according to current product price.
 */
export function snapshotFromQuotation(quotation) {
  if (!quotation || !Array.isArray(quotation.items)) {
    return [];
  }

  return quotation.items.map((item) => ({
    productId: item.productId,
    productNameSnapshot: item.productNameSnapshot || item.name,
    skuSnapshot: item.skuSnapshot || item.sku,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    discountAmount: item.discountAmount || 0,
    lineTotal: item.lineTotal,
    weight: item.weight || 100,
  }));
}
