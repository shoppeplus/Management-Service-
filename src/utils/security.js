/**
 * Security & Data Sanitization Utilities
 * ────────────────────────────────────────
 * Implements specifications from Addendum A (Sections A7, A8, A9, A10):
 * - Phone number normalization to E.164 (+84...)
 * - Live chat visitor token generation (>= 256-bit random, SHA-256 hashed)
 * - Plain-text message sanitization (preventing HTML injection, max 2000 chars)
 * - Rate limiting tracker for live chat visitors
 * - Customer data anonymization helper
 */

import crypto from 'crypto';

/**
 * Normalize phone number to E.164 format (+84...)
 * E.g. '0912345678' -> '+84912345678'
 *      '+84912345678' -> '+84912345678'
 *      '038 123 4567' -> '+84381234567'
 */
export function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  const cleaned = String(rawPhone).replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+84')) {
    return cleaned;
  }
  if (cleaned.startsWith('84')) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith('0')) {
    return `+84${cleaned.slice(1)}`;
  }
  return cleaned ? `+84${cleaned}` : '';
}

/**
 * Generate cryptographically secure visitor token (>= 256 bits)
 * Returns { rawToken, tokenHash }
 */
export function generateVisitorToken() {
  const rawToken = crypto.randomBytes(32).toString('hex'); // 256 bits
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

/**
 * Hash visitor token for verification
 */
export function hashToken(token) {
  if (!token) return '';
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Sanitize live chat message
 * - Converts to pure text (strips HTML / script tags)
 * - Truncates to maximum 2,000 characters (Section A8)
 */
export function sanitizeMessage(rawContent) {
  if (!rawContent) return '';
  let content = String(rawContent)
    .replace(/<[^>]*>/g, '') // Strip all HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Strip control chars
    .trim();

  // Max 2,000 chars per message
  if (content.length > 2000) {
    content = content.slice(0, 2000);
  }
  return content;
}

// In-memory rate limiting map for live chat visitors: visitorId -> [timestamps]
const visitorRateLimits = new Map();

/**
 * Check rate limit for a visitor (Default 20 messages per minute - Section A8)
 */
export function checkVisitorRateLimit(visitorId, limit = 20, windowMs = 60000) {
  const now = Date.now();
  const timestamps = visitorRateLimits.get(visitorId) || [];

  // Filter timestamps within window
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    return false; // Rate limit exceeded
  }

  recent.push(now);
  visitorRateLimits.set(visitorId, recent);

  // Periodic cleanup
  if (visitorRateLimits.size > 5000) {
    for (const [id, times] of visitorRateLimits.entries()) {
      if (times.length === 0 || now - times[times.length - 1] > windowMs) {
        visitorRateLimits.delete(id);
      }
    }
  }

  return true;
}

/**
 * Anonymize customer data (Section A10)
 * Replaces personally identifiable information with randomized placeholders
 * Preserves ID and order/accounting links.
 */
export function anonymizeCustomerData(customer) {
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  return {
    ...customer,
    name: `Khách hàng ẩn danh ${randomSuffix}`,
    phone: `+8499999${randomSuffix.slice(0, 4)}`,
    phoneNormalized: `+8499999${randomSuffix.slice(0, 4)}`,
    email: `anonymized_${randomSuffix}@deleted.user`,
    address: 'Địa chỉ đã được ẩn danh hóa theo yêu cầu',
    notes: 'Hồ sơ đã được ẩn danh hóa dữ liệu cá nhân theo quy định.',
    isAnonymized: true,
    anonymizedAt: new Date().toISOString(),
  };
}
