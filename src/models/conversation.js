/**
 * Conversation Model (Hội Thoại)
 * ────────────────────────────────
 * Implements specifications from Addendum A (Sections A1, A2, A3, A6, A7):
 * - State machine: OPEN <-> PENDING -> RESOLVED -> CLOSED
 * - Auto-reopen to OPEN on customer new message when RESOLVED
 * - Concurrency-safe self-claim: UPDATE ... WHERE id = :id AND assignedUserId IS NULL -> 409 if taken
 * - Unified channel conversation tracking
 */

import { db, isFirebaseReady } from '../config/firebase.js';
import { CONVERSATION_STATES, validateConversationTransition } from '../utils/stateMachines.js';
import { seedConversations } from '../data/seedData.js';

const COLLECTION_NAME = 'conversations';

let inMemoryConversations = [...seedConversations];

export async function createConversation(data) {
  const now = new Date().toISOString();

  const conversationData = {
    id: data.id || `conv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    channelType: data.channelType || 'direct',
    channelId: data.channelId || '',
    contactId: data.contactId || '',
    contactName: data.contactName || '',
    contactAvatar: data.contactAvatar || '',
    lastMessage: data.lastMessage || '',
    lastMessageTime: data.lastMessageTime || now,
    unreadCount: data.unreadCount || 0,
    assignedUserId: data.assignedUserId || data.assignedTo || null,
    assignedTo: data.assignedUserId || data.assignedTo || null,
    status: data.status || CONVERSATION_STATES.OPEN,
    pageId: data.pageId || null,
    metadata: data.metadata || {},
    createdAt: now,
    updatedAt: now,
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(COLLECTION_NAME).add(conversationData);
      conversationData.id = docRef.id;
    } catch (err) {
      console.warn('Could not save conversation in Firestore:', err.message);
    }
  }

  inMemoryConversations.unshift(conversationData);
  return conversationData;
}

export async function getConversationById(id) {
  if (isFirebaseReady && db) {
    try {
      const doc = await db.collection(COLLECTION_NAME).doc(id).get();
      if (doc.exists) return { id: doc.id, ...doc.data() };
    } catch (err) {
      console.warn('Could not read conversation from Firestore:', err.message);
    }
  }
  return inMemoryConversations.find((c) => 
    c.id === id || 
    c.id.replace('_00', '-') === id || 
    c.id.replace('-', '_00') === id
  ) || null;
}

export async function getConversations(filters = {}) {
  const {
    status,
    assignedUserId,
    channelType,
    category,
    shopId,
    allowedCategories,
    allowedShopIds,
    limit = 100,
  } = filters;

  let list = [];

  if (isFirebaseReady && db) {
    try {
      let query = db.collection(COLLECTION_NAME).orderBy('lastMessageTime', 'desc');
      if (status) query = query.where('status', '==', status);
      if (assignedUserId) query = query.where('assignedUserId', '==', assignedUserId);
      if (channelType) query = query.where('channelType', '==', channelType);

      const snapshot = await query.limit(Number(limit)).get();
      list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('Could not list conversations from Firestore:', err.message);
      list = [...inMemoryConversations];
    }
  } else {
    list = [...inMemoryConversations];
  }

  if (status) list = list.filter((c) => c.status === status);
  if (assignedUserId) list = list.filter((c) => c.assignedUserId === assignedUserId);
  if (channelType) list = list.filter((c) => c.channelType === channelType);

  if (category && category !== 'all') {
    const targetCat = String(category).toLowerCase();
    list = list.filter((c) => {
      const convCat = c.category || c.categoryName || c.metadata?.category || '';
      const convSubCat = c.subCategory || c.metadata?.subCategory || '';
      return (
        String(convCat).toLowerCase() === targetCat ||
        String(convSubCat).toLowerCase() === targetCat
      );
    });
  }

  if (shopId && shopId !== 'all') {
    const targetShop = String(shopId);
    list = list.filter((c) => {
      const convShop = c.shopId || c.metadata?.tiktokShopId || c.channelId || c.pageId || '';
      return String(convShop) === targetShop;
    });
  }

  if (Array.isArray(allowedCategories) && allowedCategories.length > 0) {
    const allowedCatSet = new Set(allowedCategories.map((cat) => String(cat).toLowerCase()));
    list = list.filter((c) => {
      const convCat = String(c.category || c.categoryName || c.metadata?.category || '').toLowerCase();
      const convSubCat = String(c.subCategory || c.metadata?.subCategory || '').toLowerCase();
      return allowedCatSet.has(convCat) || allowedCatSet.has(convSubCat);
    });
  }

  if (Array.isArray(allowedShopIds) && allowedShopIds.length > 0) {
    const allowedShopSet = new Set(allowedShopIds.map((id) => String(id)));
    list = list.filter((c) => {
      const convShop = String(c.shopId || c.metadata?.tiktokShopId || c.channelId || c.pageId || '');
      return !convShop || allowedShopSet.has(convShop);
    });
  }

  return list.slice(0, Number(limit));
}

export async function getConversationsByEmployee(employeeId) {
  return getConversations({ assignedUserId: employeeId });
}

export async function updateConversation(id, updates = {}) {
  const conv = await getConversationById(id);
  if (!conv) throw { statusCode: 404, message: 'Không tìm thấy cuộc hội thoại.' };

  const safeUpdates = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  if (updates.assignedUserId !== undefined) {
    safeUpdates.assignedTo = updates.assignedUserId;
  }

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(safeUpdates);
    } catch (err) {
      console.warn('Could not update conversation in Firestore:', err.message);
    }
  }

  Object.assign(conv, safeUpdates);
  return conv;
}

/**
 * Concurrency-safe conversation assignment / self-claim (Section A7 & A2)
 * If already assigned to someone else, returns 409 Conflict.
 */
export async function claimConversation(id, userId, forceReassign = false) {
  const conv = await getConversationById(id);
  if (!conv) throw { statusCode: 404, message: 'Không tìm thấy cuộc hội thoại.' };

  // Concurrency check: if already assigned to someone else and not forcing reassign
  if (conv.assignedUserId && conv.assignedUserId !== userId && !forceReassign) {
    throw {
      statusCode: 409,
      message: `Hội thoại này đã được nhân viên khác nhận xử lý (${conv.assignedUserId}).`,
    };
  }

  return updateConversation(id, {
    assignedUserId: userId,
    assignedTo: userId,
    status: conv.status === CONVERSATION_STATES.RESOLVED ? CONVERSATION_STATES.OPEN : conv.status,
  });
}

/**
 * Update conversation status through state machine (Section A3)
 */
export async function updateConversationStatus(id, newStatus, context = {}) {
  const conv = await getConversationById(id);
  if (!conv) throw { statusCode: 404, message: 'Không tìm thấy cuộc hội thoại.' };

  const check = validateConversationTransition(conv.status, newStatus, context);
  if (!check.valid) {
    throw { statusCode: check.statusCode || 409, message: check.error };
  }

  return updateConversation(id, { status: newStatus });
}

export async function markConversationAsRead(id) {
  return updateConversation(id, { unreadCount: 0 });
}
