/**
 * Follow-up Model (Lịch Hẹn & Chăm Sóc)
 * ──────────────────────────────────────
 * Implements specifications from Addendum A (Section A6):
 * - Entity: id, code (FLU-YYYYMMDD-XXXX), customerId, leadId, assigneeUserId,
 *   title, scheduledAt, status (PENDING | DONE | CANCELLED), notes
 */

import { db, isFirebaseReady } from '../config/firebase.js';
import { generateFollowUpCode } from '../utils/idGenerator.js';
import { seedFollowUps } from '../data/seedData.js';

const COLLECTION_NAME = 'follow_ups';

let inMemoryFollowUps = [...seedFollowUps];

export async function createFollowUp(data, user = null) {
  const code = generateFollowUpCode();
  const now = new Date().toISOString();

  const followUp = {
    id: `flu_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    code,
    customerId: data.customerId || null,
    customerName: data.customerName || '',
    customerPhone: data.customerPhone || '',
    leadId: data.leadId || null,
    assigneeUserId: data.assigneeUserId || user?.uid || null,
    title: data.title || 'Lịch hẹn chăm sóc khách hàng',
    scheduledAt: data.scheduledAt || now,
    status: 'PENDING', // PENDING, DONE, CANCELLED
    notes: data.notes || '',
    createdBy: user?.uid || 'SYSTEM',
    createdAt: now,
    updatedAt: now,
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(COLLECTION_NAME).add(followUp);
      followUp.id = docRef.id;
    } catch (err) {
      console.warn('Could not write follow-up to Firestore:', err.message);
    }
  }

  inMemoryFollowUps.unshift(followUp);
  return followUp;
}

export async function getFollowUpById(id) {
  if (isFirebaseReady && db) {
    try {
      const doc = await db.collection(COLLECTION_NAME).doc(id).get();
      if (doc.exists) return { id: doc.id, ...doc.data() };
    } catch (err) {
      console.warn('Could not read follow-up from Firestore:', err.message);
    }
  }
  return inMemoryFollowUps.find((f) => f.id === id || f.code === id) || null;
}

export async function getFollowUps(filters = {}) {
  const { status, assigneeUserId, customerId, leadId, limit = 100 } = filters;

  if (isFirebaseReady && db) {
    try {
      let query = db.collection(COLLECTION_NAME).orderBy('scheduledAt', 'asc');
      if (status) query = query.where('status', '==', status);
      if (assigneeUserId) query = query.where('assigneeUserId', '==', assigneeUserId);
      if (customerId) query = query.where('customerId', '==', customerId);
      if (leadId) query = query.where('leadId', '==', leadId);

      const snapshot = await query.limit(Number(limit)).get();
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('Could not list follow-ups from Firestore:', err.message);
    }
  }

  let list = [...inMemoryFollowUps];
  if (status) list = list.filter((f) => f.status === status);
  if (assigneeUserId) list = list.filter((f) => f.assigneeUserId === assigneeUserId);
  if (customerId) list = list.filter((f) => f.customerId === customerId);
  if (leadId) list = list.filter((f) => f.leadId === leadId);
  return list.slice(0, Number(limit));
}

export async function updateFollowUp(id, updates = {}) {
  const item = await getFollowUpById(id);
  if (!item) throw { statusCode: 404, message: 'Không tìm thấy Lịch hẹn.' };

  const safeUpdates = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(safeUpdates);
    } catch (err) {
      console.warn('Could not update follow-up in Firestore:', err.message);
    }
  }

  Object.assign(item, safeUpdates);
  return item;
}
