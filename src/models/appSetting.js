/**
 * App Settings & Business Holidays Model
 * ───────────────────────────────────────
 * Implements specifications from Addendum A (Sections A5 & A6):
 * - timezone: 'Asia/Ho_Chi_Minh'
 * - leadFollowUpBusinessDays: 3
 * - quotationExpiryWarnDays: 2
 * - slaTargetsByPriority: { URGENT: 2, HIGH: 4, MEDIUM: 8, LOW: 24 } (hours)
 * - discountApprovalThresholdPercent: 10
 * - taxRate: 0.1
 * - loginRateLimitPerMinute: 10
 * - ticketReopenDays: 7
 * - business_holidays list
 */

import { db, isFirebaseReady } from '../config/firebase.js';

const COLLECTION_NAME = 'app_settings';

// Default system settings
const DEFAULT_SETTINGS = {
  timezone: 'Asia/Ho_Chi_Minh',
  leadFollowUpBusinessDays: 3,
  quotationExpiryWarnDays: 2,
  slaTargetsByPriority: {
    URGENT: 2,
    HIGH: 4,
    MEDIUM: 8,
    LOW: 24,
  },
  discountApprovalThresholdPercent: 10,
  taxRate: 0.1,
  loginRateLimitPerMinute: 10,
  ticketReopenDays: 7,
  businessHolidays: [
    '2026-01-01', // Tết Dương Lịch
    '2026-02-16', // Tết Âm Lịch
    '2026-02-17',
    '2026-02-18',
    '2026-02-19',
    '2026-02-20',
    '2026-04-26', // Giỗ Tổ Hùng Vương
    '2026-04-30', // Ngày Giải Phóng Miền Nam
    '2026-05-01', // Quốc Tế Lao Động
    '2026-09-02', // Quốc Khánh
  ],
  updatedAt: new Date().toISOString(),
};

// In-memory cache for demo mode and fast lookup
let cachedSettings = { ...DEFAULT_SETTINGS };

export async function getSettings() {
  if (isFirebaseReady && db) {
    try {
      const doc = await db.collection(COLLECTION_NAME).doc('main').get();
      if (doc.exists) {
        cachedSettings = { ...DEFAULT_SETTINGS, ...doc.data() };
        return cachedSettings;
      }
    } catch (err) {
      console.warn('Could not read settings from Firestore:', err.message);
    }
  }
  return cachedSettings;
}

export async function updateSettings(updates = {}, adminUser = null) {
  const merged = {
    ...cachedSettings,
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUser?.uid || 'SYSTEM',
  };

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc('main').set(merged, { merge: true });
    } catch (err) {
      console.warn('Could not save settings to Firestore:', err.message);
    }
  }

  cachedSettings = merged;
  return cachedSettings;
}

/**
 * Check if a given date is a business day (Monday - Friday, not a public holiday)
 * Section A5
 */
export function isBusinessDay(dateInput, holidays = cachedSettings.businessHolidays) {
  const d = new Date(dateInput);
  const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  const dateStr = d.toISOString().slice(0, 10);
  if (holidays && holidays.includes(dateStr)) {
    return false;
  }
  return true;
}

/**
 * Calculate business days elapsed between two dates
 */
export function getElapsedBusinessDays(startDate, endDate = new Date(), holidays = cachedSettings.businessHolidays) {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  current.setDate(current.getDate() + 1); // Start counting from the next day
  while (current <= end) {
    if (isBusinessDay(current, holidays)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}
