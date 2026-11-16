/**
 * Sequential Readable ID Generator
 * ─────────────────────────────────
 * Implements specifications from Addendum A (Section A7):
 * Generates human-friendly sequential codes:
 * - CUS: Khách hàng (CUS-YYYYMMDD-XXXX)
 * - LEAD: Cơ hội (LEAD-YYYYMMDD-XXXX)
 * - QT: Báo giá (QT-YYYYMMDD-XXXX)
 * - DH: Đơn hàng (DH-YYYYMMDD-XXXX)
 * - TK: Ticket hỗ trợ (TK-YYYYMMDD-XXXX)
 * - FLU: Lịch hẹn follow-up (FLU-YYYYMMDD-XXXX)
 */

import crypto from 'crypto';

function getDatePrefix() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function getRandomSequence() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function generateCustomerCode() {
  return `CUS-${getDatePrefix()}-${getRandomSequence()}`;
}

export function generateLeadCode() {
  return `LEAD-${getDatePrefix()}-${getRandomSequence()}`;
}

export function generateQuotationCode() {
  return `QT-${getDatePrefix()}-${getRandomSequence()}`;
}

export function generateOrderCode() {
  return `DH-${getDatePrefix()}-${getRandomSequence()}`;
}

export function generateTicketCode() {
  return `TK-${getDatePrefix()}-${getRandomSequence()}`;
}

export function generateFollowUpCode() {
  return `FLU-${getDatePrefix()}-${getRandomSequence()}`;
}
