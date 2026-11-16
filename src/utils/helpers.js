/**
 * Mini Pancake – Shared Utility Helpers
 * ──────────────────────────────────────
 * Common formatting, validation, sanitization, and database query helpers.
 */

/**
 * Generate a short, human-readable order code.
 * Format: MP-YYYYMMDD-NNN (with a random 3-digit suffix)
 * Example: MP-20261115-384
 *
 * @returns {string} Formatted order code
 */
export function generateOrderCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;
  const randomSuffix = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `MP-${datePart}-${randomSuffix}`;
}

/**
 * Format a number/amount into Vietnamese Dong currency string.
 * Format: "250.000d"
 *
 * @param {number|string} amount - The currency amount to format
 * @returns {string} Formatted currency string (e.g., "250.000d")
 */
export function formatCurrency(amount) {
  const num = Math.round(Number(amount) || 0);
  const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}d`;
}

/**
 * Normalize and format a phone number to standard Vietnamese 0xxx format.
 * Strips whitespace, dashes, dots, parentheses, and converts country code (+84 or 84) to 0.
 *
 * @param {string} phone - Input phone number
 * @returns {string} Normalized phone number starting with 0
 */
export function formatPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '').trim();
  if (cleaned.startsWith('+84')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('84') && cleaned.length > 9) {
    cleaned = '0' + cleaned.slice(2);
  } else if (!cleaned.startsWith('0') && cleaned.length === 9) {
    cleaned = '0' + cleaned;
  }
  return cleaned.replace(/\D/g, '');
}

/**
 * Sanitize an input string by stripping all HTML tags.
 *
 * @param {string} str - Raw input string
 * @returns {string} Cleaned string without HTML tags
 */
export function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

/**
 * Apply offset-based pagination to a Firestore query.
 *
 * @param {FirebaseFirestore.Query} query - Firestore Query or CollectionReference
 * @param {number|string} [page=1] - 1-based page number
 * @param {number|string} [limit=10] - Number of items per page
 * @returns {FirebaseFirestore.Query} Paginated Firestore query with offset and limit
 */
export function paginate(query, page = 1, limit = 10) {
  if (!query) return query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, parseInt(limit, 10) || 10);
  const offset = (pageNum - 1) * pageSize;

  let paginatedQuery = query;
  if (typeof paginatedQuery.offset === 'function' && offset > 0) {
    paginatedQuery = paginatedQuery.offset(offset);
  }
  if (typeof paginatedQuery.limit === 'function') {
    paginatedQuery = paginatedQuery.limit(pageSize);
  }
  return paginatedQuery;
}

export default {
  generateOrderCode,
  formatCurrency,
  formatPhoneNumber,
  sanitizeInput,
  paginate,
};
