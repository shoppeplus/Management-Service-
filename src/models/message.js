/**
 * Message Model
 * ──────────────
 * Firestore & in-memory helpers for the "messages" collection.
 * Implements specifications from Addendum A (Sections A3, A6, A7, A8):
 * - isInternal flag for internal team notes on conversations (A6)
 * - clientMessageId deduplication (A7)
 * - Message sanitization & max 2000 chars limit (A8)
 * - Auto-reopening RESOLVED conversations upon customer reply (A3)
 */

import { db, isFirebaseReady } from '../config/firebase.js';
import { sanitizeMessage } from '../utils/security.js';
import { getConversationById, updateConversation } from './conversation.js';
import { CONVERSATION_STATES } from '../utils/stateMachines.js';
import { seedMessages } from '../data/seedData.js';

const COLLECTION_NAME = 'messages';

let inMemoryMessages = [...seedMessages];

export async function createMessage(data) {
  const conversationId = data.conversationId || '';
  const clientMessageId = data.clientMessageId || null;

  // Deduplication check: (conversationId, clientMessageId) - Section A7
  if (clientMessageId) {
    const existing = inMemoryMessages.find(
      (m) => m.conversationId === conversationId && m.clientMessageId === clientMessageId
    );
    if (existing) return existing;
  }

  // Sanitize message content and enforce 2000 chars limit (Section A8)
  const cleanContent = sanitizeMessage(data.content);

  const messageData = {
    id: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    clientMessageId,
    content: cleanContent,
    type: data.type || 'text',
    senderId: data.senderId || '',
    senderName: data.senderName || '',
    senderType: data.senderType || 'customer',
    channelId: data.channelId || '',
    channelType: data.channelType || 'direct',
    conversationId,
    timestamp: new Date().toISOString(),
    read: false,
    isInternal: Boolean(data.isInternal), // Section A6: internal team note
    metadata: data.metadata || {},
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(COLLECTION_NAME).add(messageData);
      messageData.id = docRef.id;
    } catch (error) {
      console.warn('Could not write message in Firestore:', error.message);
    }
  }

  inMemoryMessages.push(messageData);

  // Update conversation lastMessage & unread count, handle auto-reopen on RESOLVED (Section A3)
  if (conversationId && !messageData.isInternal) {
    try {
      const conv = await getConversationById(conversationId);
      if (conv) {
        const isCustomer = messageData.senderType === 'customer';
        const updates = {
          lastMessage: messageData.type === 'image' ? '[Hình ảnh]' : cleanContent.slice(0, 80),
          lastMessageTime: messageData.timestamp,
        };

        if (isCustomer) {
          updates.unreadCount = (conv.unreadCount || 0) + 1;
          // Section A3: Customer reply on RESOLVED auto-moves to OPEN
          if (conv.status === CONVERSATION_STATES.RESOLVED) {
            updates.status = CONVERSATION_STATES.OPEN;
          }
        }

        await updateConversation(conversationId, updates);
      }
    } catch (err) {
      console.warn('Could not update conversation summary:', err.message);
    }
  }

  return messageData;
}

export async function getMessagesByConversation(conversationId, limit = 50) {
  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(COLLECTION_NAME)
        .where('conversationId', '==', conversationId)
        .orderBy('timestamp', 'asc')
        .limit(Number(limit))
        .get();

      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.warn('Could not fetch messages from Firestore:', error.message);
    }
  }

  const normalizedTarget = (conversationId || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  return inMemoryMessages
    .filter((m) => {
      if (m.conversationId === conversationId) return true;
      const normalizedConv = (m.conversationId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedConv === normalizedTarget ||
             normalizedConv.replace('00', '') === normalizedTarget ||
             normalizedTarget.replace('00', '') === normalizedConv;
    })
    .slice(-Number(limit));
}

export async function markAsRead(messageId) {
  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(messageId).update({ read: true });
    } catch (error) {
      console.warn('Could not mark message read in Firestore:', error.message);
    }
  }

  const msg = inMemoryMessages.find((m) => m.id === messageId);
  if (msg) msg.read = true;
  return { success: true };
}

export async function markConversationAsRead(conversationId) {
  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(COLLECTION_NAME)
        .where('conversationId', '==', conversationId)
        .where('read', '==', false)
        .get();

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();
    } catch (error) {
      console.warn('Could not mark conversation messages read in Firestore:', error.message);
    }
  }

  inMemoryMessages.forEach((m) => {
    if (m.conversationId === conversationId) m.read = true;
  });

  return { success: true };
}

export async function getUnreadCount(conversationId) {
  const msgs = await getMessagesByConversation(conversationId, 200);
  return msgs.filter((m) => !m.read && m.senderType === 'customer').length;
}
