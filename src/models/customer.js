/**
 * Customer Model
 * ---------------
 * Firestore & Demo-mode helpers for the "customers" collection.
 * Implements specifications from Addendum A (Sections A1, A2, A3, A6, A7, A10):
 * - Code: CUS-YYYYMMDD-XXXX
 * - Normalized phone: E.164 (+84...)
 * - Identities linking/unlinking (Facebook, TikTok, Zalo, Website)
 * - Merging customers with audit log
 * - Anonymization (GDPR/privacy compliant data deletion)
 * - Metrics: totalOrders (COMPLETED only), totalSpending (COMPLETED only)
 */

import { db, isFirebaseReady } from '../config/firebase.js';
import { generateCustomerCode } from '../utils/idGenerator.js';
import { normalizePhone, anonymizeCustomerData } from '../utils/security.js';
import { logAudit } from './auditLog.js';
import { seedCustomers } from '../data/seedData.js';

const COLLECTION_NAME = 'customers';

let inMemoryCustomers = [...seedCustomers];

export async function createCustomer(data) {
  const phone = data.phone || '';
  const code = generateCustomerCode();
  const now = new Date().toISOString();

  const customerData = {
    id: `cus_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    code,
    name: data.name || '',
    phone,
    phoneNormalized: normalizePhone(phone),
    address: data.address || '',
    email: data.email || null,
    purchaseHistory: data.purchaseHistory || [],
    assignedTo: data.assignedTo || data.assignedSalesUserId || null,
    tags: data.tags || [],
    notes: data.notes || '',
    source: data.source || 'other',
    identities: data.identities || [], // [{ id, channel, externalId, linkedAt }]
    totalOrders: Number(data.totalOrders) || 0,
    totalSpending: Number(data.totalSpending) || 0,
    isAnonymized: false,
    createdAt: now,
    updatedAt: now,
  };

  if (isFirebaseReady && db) {
    try {
      const docRef = await db.collection(COLLECTION_NAME).add(customerData);
      customerData.id = docRef.id;
    } catch (error) {
      console.warn('Could not save customer in Firestore:', error.message);
    }
  }

  inMemoryCustomers.unshift(customerData);
  return customerData;
}

export async function getCustomerById(id) {
  if (isFirebaseReady && db) {
    try {
      const doc = await db.collection(COLLECTION_NAME).doc(id).get();
      if (doc.exists) return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.warn('Could not read customer from Firestore:', error.message);
    }
  }
  return inMemoryCustomers.find((c) => c.id === id || c.code === id) || null;
}

export async function getCustomerByPhone(phone) {
  const norm = normalizePhone(phone);

  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(COLLECTION_NAME)
        .where('phoneNormalized', '==', norm)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
    } catch (error) {
      console.warn('Could not query customer by phone from Firestore:', error.message);
    }
  }

  return (
    inMemoryCustomers.find(
      (c) => c.phoneNormalized === norm || c.phone === phone
    ) || null
  );
}

export async function getCustomersByEmployee(employeeId) {
  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(COLLECTION_NAME)
        .where('assignedTo', '==', employeeId)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.warn('Could not query customers by employee from Firestore:', error.message);
    }
  }

  return inMemoryCustomers.filter((c) => c.assignedTo === employeeId);
}

export async function getAllCustomers(limit = 100) {
  if (isFirebaseReady && db) {
    try {
      const snapshot = await db
        .collection(COLLECTION_NAME)
        .orderBy('updatedAt', 'desc')
        .limit(Number(limit))
        .get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.warn('Could not list all customers from Firestore:', error.message);
    }
  }

  return inMemoryCustomers.slice(0, Number(limit));
}

export async function updateCustomer(id, data) {
  const customer = await getCustomerById(id);
  if (!customer) throw { statusCode: 404, message: 'Không tìm thấy khách hàng.' };

  const updateData = {
    ...data,
    updatedAt: new Date().toISOString(),
  };

  if (data.phone) {
    updateData.phoneNormalized = normalizePhone(data.phone);
  }

  if (isFirebaseReady && db) {
    try {
      await db.collection(COLLECTION_NAME).doc(id).update(updateData);
    } catch (error) {
      console.warn('Could not update customer in Firestore:', error.message);
    }
  }

  Object.assign(customer, updateData);
  return customer;
}

export async function addOrderToHistory(customerId, orderId) {
  const customer = await getCustomerById(customerId);
  if (!customer) return;

  const history = customer.purchaseHistory || [];
  if (!history.includes(orderId)) {
    history.push(orderId);
  }

  await updateCustomer(customerId, { purchaseHistory: history });
}

export async function searchCustomers(query) {
  const s = String(query).toLowerCase();

  if (isFirebaseReady && db) {
    try {
      const nameSnapshot = await db
        .collection(COLLECTION_NAME)
        .where('name', '>=', query)
        .where('name', '<=', query + '\uf8ff')
        .limit(20)
        .get();

      return nameSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.warn('Could not search customers in Firestore:', error.message);
    }
  }

  return inMemoryCustomers.filter(
    (c) =>
      c.name?.toLowerCase().includes(s) ||
      c.phone?.includes(s) ||
      c.code?.toLowerCase().includes(s)
  );
}

/**
 * Link an external identity to a customer (Section A6)
 */
export async function linkIdentity(customerId, { channel, externalId }) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw { statusCode: 404, message: 'Không tìm thấy khách hàng.' };

  customer.identities = customer.identities || [];
  const existing = customer.identities.find(
    (i) => i.channel === channel && i.externalId === externalId
  );
  if (existing) return customer;

  const newIdentity = {
    id: `id_${Date.now()}`,
    channel,
    externalId,
    linkedAt: new Date().toISOString(),
  };

  customer.identities.push(newIdentity);
  await updateCustomer(customerId, { identities: customer.identities });
  return customer;
}

/**
 * Unlink an external identity (Section A6)
 */
export async function unlinkIdentity(customerId, identityId) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw { statusCode: 404, message: 'Không tìm thấy khách hàng.' };

  customer.identities = (customer.identities || []).filter(
    (i) => i.id !== identityId && i.externalId !== identityId
  );
  await updateCustomer(customerId, { identities: customer.identities });
  return customer;
}

/**
 * Merge two customer records (Section A6 & A2)
 * Primary customer absorbs secondary customer's history and identities.
 */
export async function mergeCustomers(primaryId, secondaryId, adminUser = null) {
  const primary = await getCustomerById(primaryId);
  const secondary = await getCustomerById(secondaryId);

  if (!primary || !secondary) {
    throw { statusCode: 404, message: 'Không tìm thấy một trong hai hồ sơ khách hàng để hợp nhất.' };
  }

  const mergedHistory = Array.from(
    new Set([...(primary.purchaseHistory || []), ...(secondary.purchaseHistory || [])])
  );

  const mergedIdentities = [...(primary.identities || [])];
  (secondary.identities || []).forEach((secId) => {
    if (!mergedIdentities.some((pId) => pId.channel === secId.channel && pId.externalId === secId.externalId)) {
      mergedIdentities.push(secId);
    }
  });

  const mergedTotalOrders = (primary.totalOrders || 0) + (secondary.totalOrders || 0);
  const mergedTotalSpending = (primary.totalSpending || 0) + (secondary.totalSpending || 0);

  // Update primary
  await updateCustomer(primaryId, {
    purchaseHistory: mergedHistory,
    identities: mergedIdentities,
    totalOrders: mergedTotalOrders,
    totalSpending: mergedTotalSpending,
    notes: `${primary.notes || ''}\n[Hợp nhất từ ${secondary.code}] ${secondary.notes || ''}`.trim(),
  });

  // Mark secondary as merged
  await updateCustomer(secondaryId, {
    mergedIntoId: primaryId,
    notes: `Đã hợp nhất vào hồ sơ ${primary.code}`,
  });

  await logAudit({
    userId: adminUser?.uid,
    action: 'CUSTOMER_MERGE',
    entityType: 'customer',
    entityId: primaryId,
    oldState: { secondaryId: secondary.id, secondaryCode: secondary.code },
    newState: { mergedIntoId: primaryId },
    reason: `Hợp nhất hồ sơ khách hàng ${secondary.code} vào ${primary.code}`,
  });

  return primary;
}

/**
 * Anonymize customer data (Section A10)
 */
export async function anonymizeCustomer(customerId, adminUser = null) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw { statusCode: 404, message: 'Không tìm thấy khách hàng.' };

  const anonymizedData = anonymizeCustomerData(customer);
  await updateCustomer(customerId, anonymizedData);

  await logAudit({
    userId: adminUser?.uid,
    action: 'CUSTOMER_ANONYMIZE',
    entityType: 'customer',
    entityId: customerId,
    oldState: { customerCode: customer.code },
    newState: { isAnonymized: true },
    reason: 'Ẩn danh hóa dữ liệu cá nhân theo yêu cầu bảo mật',
  });

  return anonymizedData;
}
