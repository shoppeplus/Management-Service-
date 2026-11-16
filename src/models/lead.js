/**
 * Lead Model
 * ──────────
 * Implements specifications from Addendum A (Sections A1, A2, A3, A6, A7):
 * - Status machine: NEW -> CONTACTED -> INTERESTED -> QUOTATION -> WON / LOST
 * - Lost reason requirement & manager-only reopen check
 * - Scoped queries & assignment
 * - Auto-generated sequential code: LEAD-YYYYMMDD-XXXX
 */

import { db, isFirebaseReady } from '../config/firebase.js';
import { generateLeadCode } from '../utils/idGenerator.js';
import { normalizePhone } from '../utils/security.js';
import { LEAD_STATES, validateLeadTransition } from '../utils/stateMachines.js';
import { logAudit } from './auditLog.js';
import { seedLeads } from '../data/seedData.js';

const COLLECTION_NAME = 'leads';

// In-memory cache for demo mode
let inMemoryLeads = [...seedLeads];

export async function createLead(data, creatorUser = null) {
  const code = generateLeadCode();
  const phone = data.phone || '';
  const now = new Date().toISOString();

  const lead = {
    id: `lead_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    code,
    name: data.name || 'Khách hàng tiềm năng',
    phone,
    phoneNormalized: normalizePhone(phone),
    email: data.email || null,
    source: data.source || 'facebook', // facebook, tiktok, direct, website
    status: LEAD_STATES.NEW,
    lostReason: null,
    assignedSalesUserId: data.assignedSalesUserId || creatorUser?.uid || null,
    budget: Number(data.budget) || 0,
    expectedCloseDate: data.expectedCloseDate || null,
    lastActivityAt: now,
    notes: data.notes || '',
    customerId: data.customerId || null,
    createdBy: creatorUser?.uid || 'SYSTEM',
    createdAt: now,
    updatedAt: now,
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(COLLECTION_NAME).add(lead);
      lead.id = docRef.id;
    } catch (err) {
      console.warn('Could not write lead to Firestore:', err.message);
    }
  }

  inMemoryLeads.unshift(lead);
  return lead;
}

export async function getLeadById(id) {
  if (isFirebaseReady && db) {
    try {
      const doc = await db.collection(COLLECTION_NAME).doc(id).get();
      if (doc.exists) return { id: doc.id, ...doc.data() };
    } catch (err) {
      console.warn('Could not read lead from Firestore:', err.message);
    }
  }
  return inMemoryLeads.find((l) => l.id === id || l.code === id) || null;
}

export async function getLeads(filters = {}) {
  const { status, assignedSalesUserId, search, limit = 100 } = filters;

  if (isFirebaseReady && db) {
    try {
      let query = db.collection(COLLECTION_NAME).orderBy('updatedAt', 'desc');
      if (status) query = query.where('status', '==', status);
      if (assignedSalesUserId) query = query.where('assignedSalesUserId', '==', assignedSalesUserId);

      const snapshot = await query.limit(Number(limit)).get();
      let docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (search) {
        const s = search.toLowerCase();
        docs = docs.filter(
          (l) =>
            l.name?.toLowerCase().includes(s) ||
            l.phone?.includes(s) ||
            l.code?.toLowerCase().includes(s)
        );
      }
      return docs;
    } catch (err) {
      console.warn('Could not list leads from Firestore:', err.message);
    }
  }

  let list = [...inMemoryLeads];
  if (status) list = list.filter((l) => l.status === status);
  if (assignedSalesUserId) list = list.filter((l) => l.assignedSalesUserId === assignedSalesUserId);
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(
      (l) =>
        l.name?.toLowerCase().includes(s) ||
        l.phone?.includes(s) ||
        l.code?.toLowerCase().includes(s)
    );
  }
  return list.slice(0, Number(limit));
}

export async function updateLeadStatus(id, newStatus, context = {}) {
  const lead = await getLeadById(id);
  if (!lead) {
    throw { statusCode: 404, message: 'Không tìm thấy Lead.' };
  }

  const check = validateLeadTransition(lead.status, newStatus, {
    lostReason: context.lostReason,
    userRole: context.user?.role,
  });

  if (!check.valid) {
    throw { statusCode: check.statusCode || 409, message: check.error };
  }

  const updates = {
    status: newStatus,
    lostReason: newStatus === LEAD_STATES.LOST ? context.lostReason : null,
    lastActivityAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(updates);
    } catch (err) {
      console.warn('Could not update lead in Firestore:', err.message);
    }
  }

  Object.assign(lead, updates);

  // Audit logging for critical transitions
  if (check.requiresAudit || newStatus === LEAD_STATES.LOST || lead.status === LEAD_STATES.LOST) {
    await logAudit({
      userId: context.user?.uid,
      action: newStatus === LEAD_STATES.NEW ? 'LEAD_REOPEN' : 'LEAD_STATUS_CHANGE',
      entityType: 'lead',
      entityId: id,
      oldState: { status: lead.status },
      newState: { status: newStatus, lostReason: updates.lostReason },
      reason: context.lostReason || 'Chuyển trạng thái lead',
    });
  }

  return lead;
}

export async function assignLead(id, newAssigneeId, adminUser = null) {
  const lead = await getLeadById(id);
  if (!lead) {
    throw { statusCode: 404, message: 'Không tìm thấy Lead.' };
  }

  const oldAssignee = lead.assignedSalesUserId;
  const updates = {
    assignedSalesUserId: newAssigneeId,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(updates);
    } catch (err) {
      console.warn('Could not assign lead in Firestore:', err.message);
    }
  }

  lead.assignedSalesUserId = newAssigneeId;

  await logAudit({
    userId: adminUser?.uid,
    action: 'LEAD_ASSIGN',
    entityType: 'lead',
    entityId: id,
    oldState: { assignedSalesUserId: oldAssignee },
    newState: { assignedSalesUserId: newAssigneeId },
    reason: `Phân công lead cho nhân viên ${newAssigneeId}`,
  });

  return lead;
}
