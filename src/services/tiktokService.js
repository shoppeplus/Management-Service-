/**
 * TikTok Service
 * ———————————————
 * Tích hợp TikTok Shop API:
 * - Tạo chữ ký HMAC-SHA256 cho API calls
 * - Xử lý webhook (ORDER_STATUS_CHANGE, PACKAGE_UPDATE)
 * - Lấy chi tiết đơn hàng, danh sách đơn hàng, xác nhận đơn
 */

import crypto from 'crypto';
import { db } from '../config/firebase.js';

const TIKTOK_API_BASE = 'https://open-api.tiktokglobalshop.com';
const ORDERS_COLLECTION = 'orders';

/**
 * Bảng mapping trạng thái TikTok → trạng thái nội bộ.
 * @type {Record<string, string>}
 */
const STATUS_MAP = {
  UNPAID: 'pending',
  AWAITING_SHIPMENT: 'confirmed',
  AWAITING_COLLECTION: 'confirmed',
  IN_TRANSIT: 'shipping',
  DELIVERED: 'delivered',
  COMPLETED: 'delivered',
  CANCELLED: 'cancelled',
  RETURNING: 'returned',
  RETURNED: 'returned',
};

export default class TikTokService {
  /**
   * Khởi tạo service với credentials từ biến môi trường.
   * @param {object} [options]
   * @param {string} [options.appKey]    – override cho testing
   * @param {string} [options.appSecret] – override cho testing
   */
  constructor(options = {}) {
    this.appKey = options.appKey || process.env.TIKTOK_APP_KEY;
    this.appSecret = options.appSecret || process.env.TIKTOK_APP_SECRET;
    this.accounts = this._parseAccounts(options.accounts);

    if (!this.appKey) {
      console.warn('[TikTokService] TIKTOK_APP_KEY chưa được cấu hình.');
    }
    if (!this.appSecret) {
      console.warn('[TikTokService] TIKTOK_APP_SECRET chưa được cấu hình.');
    }
  }

  _parseAccounts(accounts) {
    if (Array.isArray(accounts)) return accounts.filter((account) => account && account.shopId);

    if (typeof process.env.TIKTOK_ACCOUNTS === 'string') {
      try {
        const parsed = JSON.parse(process.env.TIKTOK_ACCOUNTS);
        if (Array.isArray(parsed)) {
          return parsed.filter((account) => account && account.shopId);
        }
      } catch (error) {
        console.warn('[TikTokService] TIKTOK_ACCOUNTS không phải JSON hợp lệ.');
      }
    }

    if (process.env.TIKTOK_SHOP_ID) {
      return [{
        shopId: process.env.TIKTOK_SHOP_ID,
        name: process.env.TIKTOK_SHOP_NAME || 'TikTok Shop',
        appKey: this.appKey,
        appSecret: this.appSecret,
        accessToken: process.env.TIKTOK_ACCESS_TOKEN || '',
      }];
    }

    return [];
  }

  resolveAccount(shopId) {
    if (!shopId) return null;
    return this.accounts.find((account) => String(account.shopId) === String(shopId)) || null;
  }

  /**
   * Đăng ký hoặc cập nhật tài khoản TikTok Shop lúc runtime (chuẩn bị sẵn để nối DB của Nam).
   * @param {object} account - { shopId, name, appKey, appSecret, accessToken, category }
   */
  registerAccount(account) {
    if (!account || !account.shopId) {
      throw new Error('shopId là bắt buộc khi đăng ký tài khoản TikTok Shop.');
    }
    const normalized = {
      shopId: String(account.shopId),
      name: account.name || `TikTok Shop ${account.shopId}`,
      appKey: account.appKey || this.appKey,
      appSecret: account.appSecret || this.appSecret,
      accessToken: account.accessToken || '',
      category: account.category || null,
    };
    const existingIdx = this.accounts.findIndex((item) => String(item.shopId) === normalized.shopId);
    if (existingIdx >= 0) {
      this.accounts[existingIdx] = { ...this.accounts[existingIdx], ...normalized };
    } else {
      this.accounts.push(normalized);
    }
    return {
      shopId: normalized.shopId,
      name: normalized.name,
      connected: Boolean(normalized.accessToken),
      category: normalized.category,
    };
  }

  getAccounts() {
    return this.accounts.map((account) => {
      const item = {
        shopId: String(account.shopId),
        name: account.name || `TikTok Shop ${account.shopId}`,
        connected: Boolean(account.accessToken),
      };
      if (account.category) {
        item.category = account.category;
      }
      return item;
    });
  }

  /**
   * Trả danh sách TikTok Shop đã lọc theo phạm vi quyền của tài khoản (F0 xem hết, F1/F2 xem theo allowedShopIds).
   * @param {object} [user] - user session có thể chứa allowedShopIds / businessAccountIds
   */
  getAccountsForUser(user = null) {
    const all = this.getAccounts();
    if (!user) return all;
    const role = String(user.role || user.tier || '').toUpperCase();
    if (role === 'ADMIN' || role === 'F0') return all;

    const allowedIds = Array.isArray(user.allowedShopIds)
      ? user.allowedShopIds
      : Array.isArray(user.businessAccountIds)
      ? user.businessAccountIds
      : null;

    if (!allowedIds) return all;
    const allowedSet = new Set(allowedIds.map((id) => String(id)));
    return all.filter((acc) => allowedSet.has(String(acc.shopId)));
  }

  /**
   * Xác thực chữ ký Webhook từ TikTok Shop (timing-safe HMAC check).
   */
  verifyWebhookSignature({ path = '/api/webhooks/tiktok', params = {}, rawBody = '', signature = '', shopId = null }) {
    if (!signature) return false;
    const account = this.resolveAccount(shopId);
    const secret = account?.appSecret || this.appSecret;
    if (!secret) return false;

    const expected = this._generateSignatureWithSecret(secret, path, params, rawBody);
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(String(signature), 'utf8');
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  // ——————————————————————————————————————————————
  //  Signature Generation
  // ——————————————————————————————————————————————

  /**
   * Tạo chữ ký HMAC-SHA256 theo tài liệu TikTok Shop API.
   *
   * Quy trình:
   * 1. Sắp xếp params theo thứ tự alphabet
   * 2. Nối: appSecret + path + key1value1key2value2… + body + appSecret
   * 3. HMAC-SHA256 với appSecret làm key
   *
   * @param {string} path   – API path (vd: /api/orders/detail/query)
   * @param {object} params – query parameters (không bao gồm sign, access_token)
   * @param {string} [body] – request body (JSON string) nếu có
   * @returns {string} – chữ ký hex
   */
  generateSignature(path, params = {}, body = '') {
    // Sắp xếp params theo key
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys
      .map((key) => `${key}${params[key]}`)
      .join('');

    // Chuỗi cần ký: secret + path + params + body + secret
    const baseString = `${this.appSecret}${path}${paramString}${body}${this.appSecret}`;

    const signature = crypto
      .createHmac('sha256', this.appSecret)
      .update(baseString)
      .digest('hex');

    return signature;
  }

  _generateSignatureWithSecret(appSecret, path, params = {}, body = '') {
    if (!appSecret) {
      throw new Error('TikTok app secret chưa được cấu hình.');
    }
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys
      .map((key) => `${key}${params[key]}`)
      .join('');
    const baseString = `${appSecret}${path}${paramString}${body}${appSecret}`;
    return crypto.createHmac('sha256', appSecret).update(baseString).digest('hex');
  }

  // ——————————————————————————————————————————————
  //  Webhook Processing
  // ——————————————————————————————————————————————

  /**
   * Xử lý webhook từ TikTok Shop.
   * Hỗ trợ event types: ORDER_STATUS_CHANGE, PACKAGE_UPDATE.
   *
   * @param {object} body – payload webhook từ TikTok
   * @returns {Promise<object[]>} – danh sách kết quả xử lý
   */
  async processWebhook(body) {
    const results = [];

    if (!body || !body.type) {
      console.warn('[TikTokService] Payload webhook không hợp lệ.');
      return results;
    }

    const eventType = body.type;
    const data = typeof body.data === 'string' ? JSON.parse(body.data) : body.data;
    const shopId = body.shop_id || body.shopId || data?.shop_id || data?.shopId || null;
    const account = this.resolveAccount(shopId);

    if (shopId && !account) {
      console.warn(`[TikTokService] Webhook từ shop chưa được cấu hình: ${shopId}`);
      return results;
    }

    switch (eventType) {
      case 'ORDER_STATUS_CHANGE': {
        const result = await this._handleOrderStatusChange(data, account, shopId);
        if (result) results.push(result);
        break;
      }

      case 'PACKAGE_UPDATE': {
        const result = await this._handlePackageUpdate(data, account, shopId);
        if (result) results.push(result);
        break;
      }

      default:
        console.log(`[TikTokService] Event type chưa được hỗ trợ: ${eventType}`);
    }

    return results;
  }

  /**
   * Xử lý sự kiện thay đổi trạng thái đơn hàng.
   * Tìm đơn hàng theo tiktokOrderId trong metadata, cập nhật status.
   *
   * @param {object} data – event data
   * @returns {Promise<object|null>}
   * @private
   */
  async _handleOrderStatusChange(data, account, shopId) {
    const tiktokOrderId = data.order_id;
    const tiktokStatus = data.order_status;

    if (!tiktokOrderId || !tiktokStatus) {
      console.warn('[TikTokService] Thiếu order_id hoặc order_status trong event.');
      return null;
    }

    // Map trạng thái TikTok → nội bộ
    const internalStatus = STATUS_MAP[tiktokStatus];
    if (!internalStatus) {
      console.warn(`[TikTokService] Trạng thái không xác định: ${tiktokStatus}`);
      return null;
    }

    try {
      // Tìm đơn hàng theo tiktokOrderId trong metadata
      const snapshot = await db
        .collection(ORDERS_COLLECTION)
        .where('metadata.tiktokOrderId', '==', tiktokOrderId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        // Nếu không tìm thấy, tạo đơn mới từ TikTok
        console.log(`[TikTokService] Đơn hàng TikTok mới: ${tiktokOrderId}`);
        const newOrder = {
          orderCode: `TT-${tiktokOrderId.slice(-8).toUpperCase()}`,
          customerId: '',
          customerName: data.buyer_name || '',
          customerPhone: data.buyer_phone || '',
          shippingAddress: {},
          items: [],
          totalAmount: data.payment?.total_amount || 0,
          shippingFee: data.payment?.shipping_fee || 0,
          codAmount: 0,
          discount: 0,
          status: internalStatus,
          trackingId: '',
          shippingProvider: 'tiktok',
          paymentStatus: internalStatus === 'pending' ? 'unpaid' : 'paid',
          paymentMethod: 'other',
          note: `Đơn hàng từ TikTok Shop`,
          source: 'tiktok',
          createdBy: 'system',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: {
            tiktokOrderId,
            tiktokStatus,
            platform: 'tiktok',
            tiktokShopId: shopId || account?.shopId || '',
            tiktokShopName: account?.name || '',
          },
        };

        const docRef = await db.collection(ORDERS_COLLECTION).add(newOrder);
        console.log(`[TikTokService] Đã tạo đơn hàng ${docRef.id} từ TikTok.`);
        return { id: docRef.id, ...newOrder };
      }

      // Cập nhật trạng thái đơn hàng hiện có
      const doc = snapshot.docs[0];
      const updateData = {
        status: internalStatus,
        updatedAt: new Date().toISOString(),
        'metadata.tiktokStatus': tiktokStatus,
        'metadata.tiktokShopId': shopId || account?.shopId || '',
        'metadata.tiktokShopName': account?.name || '',
      };

      await doc.ref.update(updateData);
      console.log(
        `[TikTokService] Cập nhật đơn ${doc.id}: ${tiktokStatus} → ${internalStatus}`
      );

      return { id: doc.id, ...doc.data(), ...updateData };
    } catch (error) {
      console.error('[TikTokService] Lỗi xử lý ORDER_STATUS_CHANGE:', error);
      throw error;
    }
  }

  /**
   * Xử lý sự kiện cập nhật vận chuyển.
   * Cập nhật tracking info cho đơn hàng tương ứng.
   *
   * @param {object} data – event data
   * @returns {Promise<object|null>}
   * @private
   */
  async _handlePackageUpdate(data, account, shopId) {
    const tiktokOrderId = data.order_id;
    const trackingNumber = data.tracking_number;

    if (!tiktokOrderId) {
      console.warn('[TikTokService] Thiếu order_id trong PACKAGE_UPDATE event.');
      return null;
    }

    try {
      const snapshot = await db
        .collection(ORDERS_COLLECTION)
        .where('metadata.tiktokOrderId', '==', tiktokOrderId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        console.warn(
          `[TikTokService] Không tìm thấy đơn hàng cho TikTok order: ${tiktokOrderId}`
        );
        return null;
      }

      const doc = snapshot.docs[0];
      const updateData = {
        updatedAt: new Date().toISOString(),
        'metadata.tiktokShopId': shopId || account?.shopId || '',
        'metadata.tiktokShopName': account?.name || '',
      };

      if (trackingNumber) {
        updateData.trackingId = trackingNumber;
      }
      if (data.shipping_provider) {
        updateData['metadata.shippingProvider'] = data.shipping_provider;
      }
      if (data.package_status) {
        // Map package status nếu cần
        const mappedStatus = STATUS_MAP[data.package_status];
        if (mappedStatus) {
          updateData.status = mappedStatus;
        }
      }

      await doc.ref.update(updateData);
      console.log(
        `[TikTokService] Cập nhật tracking đơn ${doc.id}: ${trackingNumber || 'N/A'}`
      );

      return { id: doc.id, ...doc.data(), ...updateData };
    } catch (error) {
      console.error('[TikTokService] Lỗi xử lý PACKAGE_UPDATE:', error);
      throw error;
    }
  }

  // ——————————————————————————————————————————————
  //  TikTok Shop API Methods
  // ——————————————————————————————————————————————

  /**
   * Lấy chi tiết một đơn hàng từ TikTok Shop API.
   *
   * @param {string} orderId     – TikTok order ID
   * @param {string} accessToken – OAuth access token của shop
   * @returns {Promise<object>}
   */
  async getOrderDetail(orderId, accessToken, shopId) {
    const path = '/api/orders/detail/query';
    const timestamp = Math.floor(Date.now() / 1000);
    const account = this.resolveAccount(shopId);
    const appKey = account?.appKey || this.appKey;
    const appSecret = account?.appSecret || this.appSecret;
    const token = account?.accessToken || accessToken;

    const params = {
      app_key: appKey,
      timestamp: String(timestamp),
    };

    const bodyObj = { order_id: orderId };
    const bodyStr = JSON.stringify(bodyObj);

    const sign = this._generateSignatureWithSecret(appSecret, path, params, bodyStr);

    const queryString = new URLSearchParams({
      ...params,
      sign,
      access_token: token,
    }).toString();

    const url = `${TIKTOK_API_BASE}${path}?${queryString}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
    });

    const data = await response.json();

    if (data.code !== 0) {
      console.error('[TikTokService] Lỗi getOrderDetail:', data);
      throw new Error(`TikTok API error: ${data.message || 'Unknown'}`);
    }

    return data.data;
  }

  /**
   * Lấy danh sách đơn hàng từ TikTok Shop API.
   *
   * @param {object} queryParams – bộ lọc (order_status, create_time_from, create_time_to, page_size…)
   * @param {string} accessToken – OAuth access token
   * @returns {Promise<object>}
   */
  async getOrders(queryParams = {}, accessToken, shopId) {
    const path = '/api/orders/search';
    const timestamp = Math.floor(Date.now() / 1000);
    const account = this.resolveAccount(shopId);
    const appKey = account?.appKey || this.appKey;
    const appSecret = account?.appSecret || this.appSecret;
    const token = account?.accessToken || accessToken;

    const params = {
      app_key: appKey,
      timestamp: String(timestamp),
    };

    const bodyStr = JSON.stringify(queryParams);
    const sign = this._generateSignatureWithSecret(appSecret, path, params, bodyStr);

    const qs = new URLSearchParams({
      ...params,
      sign,
      access_token: token,
    }).toString();

    const url = `${TIKTOK_API_BASE}${path}?${qs}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
    });

    const data = await response.json();

    if (data.code !== 0) {
      console.error('[TikTokService] Lỗi getOrders:', data);
      throw new Error(`TikTok API error: ${data.message || 'Unknown'}`);
    }

    return data.data;
  }

  /**
   * Xác nhận đơn hàng (acknowledge) trên TikTok Shop.
   * Thường dùng khi seller chấp nhận đơn hàng mới.
   *
   * @param {string} orderId     – TikTok order ID
   * @param {string} accessToken – OAuth access token
   * @returns {Promise<object>}
   */
  async acknowledgeOrder(orderId, accessToken, shopId) {
    const path = '/api/orders/ack';
    const timestamp = Math.floor(Date.now() / 1000);
    const account = this.resolveAccount(shopId);
    const appKey = account?.appKey || this.appKey;
    const appSecret = account?.appSecret || this.appSecret;
    const token = account?.accessToken || accessToken;

    const params = {
      app_key: appKey,
      timestamp: String(timestamp),
    };

    const bodyObj = { order_id: orderId };
    const bodyStr = JSON.stringify(bodyObj);

    const sign = this._generateSignatureWithSecret(appSecret, path, params, bodyStr);

    const qs = new URLSearchParams({
      ...params,
      sign,
      access_token: token,
    }).toString();

    const url = `${TIKTOK_API_BASE}${path}?${qs}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
    });

    const data = await response.json();

    if (data.code !== 0) {
      console.error('[TikTokService] Lỗi acknowledgeOrder:', data);
      throw new Error(`TikTok API error: ${data.message || 'Unknown'}`);
    }

    console.log(`[TikTokService] Đã xác nhận đơn hàng: ${orderId}`);
    return data.data;
  }
}
