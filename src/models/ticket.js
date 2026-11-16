/**
 * Ticket Model (Hỗ Trợ Khách Hàng)
 * ─────────────────────────────────
 * Implements specifications from Addendum A (Sections A1, A2, A3, A6, A7):
 * - Status machine: NEW -> ASSIGNED -> IN_PROGRESS <-> WAITING_CUSTOMER -> RESOLVED -> CLOSED
 * - Reopen ticket from RESOLVED within ticketReopenDays (default 7)
 * - Priority SLA tracking (dueAt calculation)
 * - Conversation & customer care replies
 * - Auto-generated sequential code: TK-YYYYMMDD-XXXX
 */

import { db, isFirebaseReady } from '../config/firebase.js';
import { generateTicketCode } from '../utils/idGenerator.js';
import { TICKET_STATES, validateTicketTransition } from '../utils/stateMachines.js';
import { getSettings } from './appSetting.js';
import { logAudit } from './auditLog.js';
import { seedTickets } from '../data/seedData.js';

const COLLECTION_NAME = 'tickets';

let inMemoryTickets = [...seedTickets];

export async function createTicket(data, creatorUser = null) {
  const settings = await getSettings();
  const priority = data.priority || 'MEDIUM';
  const slaHours = settings.slaTargetsByPriority?.[priority] || 8;

  const now = new Date();
  const dueAt = new Date(now.getTime() + slaHours * 60 * 60 * 1000).toISOString();
  const code = generateTicketCode();

  const ticket = {
    id: `tk_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    code,
    customerId: data.customerId || null,
    customerName: data.customerName || '',
    customerPhone: data.customerPhone || '',
    title: data.title || 'Yêu cầu hỗ trợ',
    description: data.description || '',
    priority, // LOW, MEDIUM, HIGH, URGENT
    status: TICKET_STATES.NEW,
    assigneeUserId: data.assigneeUserId || null,
    dueAt,
    resolvedAt: null,
    closedAt: null,
    replies: [],
    createdBy: creatorUser?.uid || 'CUSTOMER',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(COLLECTION_NAME).add(ticket);
      ticket.id = docRef.id;
    } catch (err) {
      console.warn('Could not write ticket to Firestore:', err.message);
    }
  }

  inMemoryTickets.unshift(ticket);
  return ticket;
}

export async function getTicketById(id) {
  if (isFirebaseReady && db) {
    try {
      const doc = await db.collection(COLLECTION_NAME).doc(id).get();
      if (doc.exists) return { id: doc.id, ...doc.data() };
    } catch (err) {
      console.warn('Could not read ticket from Firestore:', err.message);
    }
  }
  return inMemoryTickets.find((t) => t.id === id || t.code === id) || null;
}

export async function getTickets(filters = {}) {
  const { status, priority, assigneeUserId, customerId, limit = 100 } = filters;

  if (isFirebaseReady && db) {
    try {
      let query = db.collection(COLLECTION_NAME).orderBy('updatedAt', 'desc');
      if (status) query = query.where('status', '==', status);
      if (priority) query = query.where('priority', '==', priority);
      if (assigneeUserId) query = query.where('assigneeUserId', '==', assigneeUserId);
      if (customerId) query = query.where('customerId', '==', customerId);

      const snapshot = await query.limit(Number(limit)).get();
      return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('Could not list tickets from Firestore:', err.message);
    }
  }

  let list = [...inMemoryTickets];
  if (status) list = list.filter((t) => t.status === status);
  if (priority) list = list.filter((t) => t.priority === priority);
  if (assigneeUserId) list = list.filter((t) => t.assigneeUserId === assigneeUserId);
  if (customerId) list = list.filter((t) => t.customerId === customerId);
  return list.slice(0, Number(limit));
}

export async function updateTicketStatus(id, newStatus, context = {}) {
  const ticket = await getTicketById(id);
  if (!ticket) throw { statusCode: 404, message: 'Không tìm thấy Ticket.' };

  const settings = await getSettings();
  const reopenDaysLimit = settings.ticketReopenDays || 7;

  const check = validateTicketTransition(ticket.status, newStatus, {
    resolvedAt: ticket.resolvedAt,
    reopenDaysLimit,
  });

  if (!check.valid) {
    throw { statusCode: check.statusCode || 409, message: check.error };
  }

  const now = new Date().toISOString();
  const updates = {
    status: newStatus,
    updatedAt: now,
  };

  if (newStatus === TICKET_STATES.RESOLVED) {
    updates.resolvedAt = now;
  }
  if (newStatus === TICKET_STATES.CLOSED) {
    updates.closedAt = now;
  }

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(updates);
    } catch (err) {
      console.warn('Could not update ticket in Firestore:', err.message);
    }
  }

  const oldStatus = ticket.status;
  Object.assign(ticket, updates);

  await logAudit({
    userId: context.user?.uid,
    action: newStatus === TICKET_STATES.IN_PROGRESS && oldStatus === TICKET_STATES.RESOLVED ? 'TICKET_REOPEN' : 'TICKET_STATUS_CHANGE',
    entityType: 'ticket',
    entityId: id,
    oldState: { status: oldStatus },
    newState: { status: newStatus },
    reason: context.reason || `Chuyển trạng thái ticket sang ${newStatus}`,
  });

  return ticket;
}

export async function assignTicket(id, assigneeUserId, adminUser = null) {
  const ticket = await getTicketById(id);
  if (!ticket) throw { statusCode: 404, message: 'Không tìm thấy Ticket.' };

  const oldAssignee = ticket.assigneeUserId;
  const updates = {
    assigneeUserId,
    status: ticket.status === TICKET_STATES.NEW ? TICKET_STATES.ASSIGNED : ticket.status,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(updates);
    } catch (err) {
      console.warn('Could not assign ticket in Firestore:', err.message);
    }
  }

  Object.assign(ticket, updates);

  await logAudit({
    userId: adminUser?.uid,
    action: 'TICKET_ASSIGN',
    entityType: 'ticket',
    entityId: id,
    oldState: { assigneeUserId: oldAssignee },
    newState: { assigneeUserId },
    reason: `Gán ticket cho nhân viên ${assigneeUserId}`,
  });

  return ticket;
}

export async function addTicketReply(id, { content, isInternal = false, authorUser }) {
  const ticket = await getTicketById(id);
  if (!ticket) throw { statusCode: 404, message: 'Không tìm thấy Ticket.' };

  const reply = {
    id: `reply_${Date.now()}`,
    content,
    isInternal: Boolean(isInternal),
    authorId: authorUser?.uid || 'SYSTEM',
    authorName: authorUser?.name || 'Nhân viên CSKH',
    createdAt: new Date().toISOString(),
  };

  ticket.replies = ticket.replies || [];
  ticket.replies.push(reply);
  ticket.updatedAt = new Date().toISOString();

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update({
        replies: ticket.replies,
        updatedAt: ticket.updatedAt,
      });
    } catch (err) {
      console.warn('Could not add ticket reply in Firestore:', err.message);
    }
  }

  return ticket;
}
