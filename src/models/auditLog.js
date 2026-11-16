/**
 * Audit Log Model (Append-Only)
 * ──────────────────────────────
 * Implements specifications from Addendum A (Section A7):
 * - Append-only audit log: no updates or deletes permitted.
 * - Records all critical transitions (Lead LOST/reopen, Order cancel/refund, Customer merge/anonymize, etc.)
 */

import { db, isFirebaseReady } from '../config/firebase.js';
import { seedAuditLogs } from '../data/seedData.js';

const COLLECTION_NAME = 'audit_logs';

// In-memory array for demo mode
const inMemoryAuditLogs = [...seedAuditLogs];

/**
 * Log an audit entry
 * @param {object} entry
 * @param {string} entry.userId - Operator ID
 * @param {string} entry.action - Action name (e.g. 'LEAD_REOPEN', 'ORDER_CANCEL', 'ORDER_REFUND')
 * @param {string} entry.entityType - 'lead', 'order', 'quotation', 'customer', 'ticket', 'setting'
 * @param {string} entry.entityId
 * @param {any} [entry.oldState]
 * @param {any} [entry.newState]
 * @param {string} [entry.reason]
 * @param {object} [entry.metadata]
 */
export async function logAudit({
  userId,
  action,
  entityType,
  entityId,
  oldState = null,
  newState = null,
  reason = null,
  metadata = {},
}) {
  const auditEntry = {
    id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId: userId || 'SYSTEM',
    action,
    entityType,
    entityId: String(entityId),
    oldState,
    newState,
    reason: reason || null,
    metadata,
    timestamp: new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).add(auditEntry);
    } catch (err) {
      console.error('Audit log write error:', err.message);
    }
  }

  inMemoryAuditLogs.unshift(auditEntry);
  // Keep up to 2000 in memory
  if (inMemoryAuditLogs.length > 2000) {
    inMemoryAuditLogs.pop();
  }

  return auditEntry;
}

/**
 * Get audit logs with optional filters (Admin only)
 */
export async function getAuditLogs(filters = {}) {
  const { entityType, entityId, userId, limit = 50 } = filters;

  if (isFirebaseReady && db) {
    try {
      let query = db.collection(COLLECTION_NAME).orderBy('timestamp', 'desc');
      if (entityType) query = query.where('entityType', '==', entityType);
      if (entityId) query = query.where('entityId', '==', String(entityId));
      if (userId) query = query.where('userId', '==', userId);

      const snapshot = await query.limit(Number(limit)).get();
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('Could not read audit logs from Firestore:', err.message);
    }
  }

  // Filter in-memory logs
  let filtered = [...inMemoryAuditLogs];
  if (entityType) filtered = filtered.filter((l) => l.entityType === entityType);
  if (entityId) filtered = filtered.filter((l) => l.entityId === String(entityId));
  if (userId) filtered = filtered.filter((l) => l.userId === userId);

  return filtered.slice(0, Number(limit));
}
