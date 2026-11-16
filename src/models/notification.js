/**
 * Notification Model (Thông Báo)
 * ────────────────────────────────
 * Implements specifications from Addendum A (Sections A5 & A6):
 * - Deduplication via unique key: (userId, type, entityId, dedupeKey)
 * - Prevents repetitive notifications from periodic scans
 */

import { db, isFirebaseReady } from '../config/firebase.js';

const COLLECTION_NAME = 'notifications';

let inMemoryNotifications = [];

export async function createNotification({
  userId,
  type,
  entityId,
  dedupeKey = 'default',
  title,
  message,
  link = null,
}) {
  const compositeKey = `${userId}_${type}_${entityId}_${dedupeKey}`;

  // Check deduplication (A5)
  if (isFirebaseReady && db) {
    try {
      const existing = await db
        .collection(COLLECTION_NAME)
        .where('compositeKey', '==', compositeKey)
        .limit(1)
        .get();
      if (!existing.empty) {
        return { deduplicated: true, id: existing.docs[0].id };
      }
    } catch (err) {
      console.warn('Notification deduplication check failed in Firestore:', err.message);
    }
  }

  const inMemExists = inMemoryNotifications.some((n) => n.compositeKey === compositeKey);
  if (inMemExists) {
    return { deduplicated: true };
  }

  const notification = {
    id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    compositeKey,
    userId,
    type, // 'lead_followup', 'quotation_expiry', 'ticket_sla', 'order_status', 'system'
    entityId: String(entityId),
    dedupeKey,
    title,
    message,
    link,
    read: false,
    createdAt: new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(COLLECTION_NAME).add(notification);
      notification.id = docRef.id;
    } catch (err) {
      console.warn('Could not write notification to Firestore:', err.message);
    }
  }

  inMemoryNotifications.unshift(notification);
  return notification;
}

export async function getNotificationsForUser(userId, limit = 50) {
  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(COLLECTION_NAME)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(Number(limit))
        .get();
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('Could not fetch notifications from Firestore:', err.message);
    }
  }

  return inMemoryNotifications
    .filter((n) => n.userId === userId)
    .slice(0, Number(limit));
}

export async function markNotificationAsRead(id, userId) {
  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update({ read: true });
    } catch (err) {
      console.warn('Could not mark notification read in Firestore:', err.message);
    }
  }

  const item = inMemoryNotifications.find((n) => n.id === id && n.userId === userId);
  if (item) item.read = true;
  return { success: true };
}

export async function markAllNotificationsAsRead(userId) {
  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(COLLECTION_NAME)
        .where('userId', '==', userId)
        .where('read', '==', false)
        .get();
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.warn('Could not mark all notifications read in Firestore:', err.message);
    }
  }

  inMemoryNotifications.forEach((n) => {
    if (n.userId === userId) n.read = true;
  });

  return { success: true };
}
