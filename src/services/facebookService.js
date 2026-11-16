/**
 * Facebook Service
 * ————————————————
 * Tích hợp Facebook Page / Messenger:
 * - Xác thực webhook (verification)
 * - Xử lý sự kiện từ Messenger (tin nhắn, đã gửi, đã đọc) và feed (bình luận)
 * - Gửi tin nhắn / hình ảnh qua Graph API
 * - Lấy thông tin người dùng
 */

import { createMessage } from '../models/message.js';

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

export default class FacebookService {
  /**
   * Khởi tạo service với token từ biến môi trường.
   * @param {object} [options]
   * @param {string} [options.pageAccessToken] – override cho testing
   * @param {string} [options.verifyToken]     – override cho testing
   */
  constructor(options = {}) {
    this.pageAccessToken =
      options.pageAccessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    this.verifyToken =
      options.verifyToken || process.env.FACEBOOK_VERIFY_TOKEN;

    if (!this.pageAccessToken) {
      console.warn('[FacebookService] FACEBOOK_PAGE_ACCESS_TOKEN chưa được cấu hình.');
    }
    if (!this.verifyToken) {
      console.warn('[FacebookService] FACEBOOK_VERIFY_TOKEN chưa được cấu hình.');
    }
  }

  // ——————————————————————————————————————————————
  //  Webhook verification
  // ——————————————————————————————————————————————

  /**
   * Xác thực webhook từ Facebook.
   * Facebook gửi GET request với hub.mode, hub.verify_token, hub.challenge.
   *
   * @param {object} query – req.query từ Express
   * @returns {{ statusCode: number, body: string }}
   */
  verifyWebhook(query) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === this.verifyToken) {
      console.log('[FacebookService] Webhook verification thành công.');
      return { statusCode: 200, body: challenge };
    }

    console.warn('[FacebookService] Webhook verification thất bại – token không khớp.');
    return { statusCode: 403, body: 'Forbidden' };
  }

  // ——————————————————————————————————————————————
  //  Webhook processing
  // ——————————————————————————————————————————————

  /**
   * Xử lý payload webhook từ Facebook.
   * Hỗ trợ cả Messenger events (messages, deliveries, reads)
   * và Page feed events (comments).
   *
   * @param {object} body – req.body từ Express
   * @returns {Promise<object[]>} – danh sách messages đã lưu
   */
  async processWebhook(body) {
    const results = [];

    if (!body || !body.entry) {
      console.warn('[FacebookService] Payload webhook không hợp lệ.');
      return results;
    }

    for (const entry of body.entry) {
      const pageId = entry.id;

      // —— Messenger events ——
      if (entry.messaging) {
        for (const event of entry.messaging) {
          const saved = await this._processMessagingEvent(event, pageId);
          if (saved) results.push(saved);
        }
      }

      // —— Feed events (bình luận trên page) ——
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'feed' && change.value) {
            const saved = await this._processFeedEvent(change.value, pageId);
            if (saved) results.push(saved);
          }
        }
      }
    }

    return results;
  }

  /**
   * Xử lý một messaging event từ Messenger.
   * @param {object} event
   * @param {string} pageId
   * @returns {Promise<object|null>}
   * @private
   */
  async _processMessagingEvent(event, pageId) {
    const senderId = event.sender?.id;
    const recipientId = event.recipient?.id;
    const timestamp = event.timestamp;

    // —— Tin nhắn mới ——
    if (event.message) {
      const msg = event.message;

      // Bỏ qua tin nhắn echo (do chính page gửi)
      if (msg.is_echo) return null;

      const normalized = {
        content: msg.text || '',
        type: this._getMessageType(msg),
        senderId,
        senderName: '', // sẽ được bổ sung bởi ChannelManager hoặc getUserProfile
        senderType: 'customer',
        channelId: pageId,
        channelType: 'facebook',
        conversationId: '', // sẽ được gán bởi ChannelManager
        metadata: {
          mid: msg.mid,
          attachments: msg.attachments || [],
          recipientId,
          timestamp,
        },
      };

      // Nếu có attachment hình ảnh, lưu URL vào content
      if (normalized.type === 'image' && msg.attachments?.[0]?.payload?.url) {
        normalized.content = msg.attachments[0].payload.url;
      }

      const saved = await createMessage(normalized);
      console.log(`[FacebookService] Đã lưu tin nhắn ${saved.id} từ ${senderId}`);
      return saved;
    }

    // —— Delivery confirmation ——
    if (event.delivery) {
      console.log(`[FacebookService] Delivery event – mids: ${event.delivery.mids?.join(', ')}`);
      return null; // không cần lưu, chỉ log
    }

    // —— Read confirmation ——
    if (event.read) {
      console.log(`[FacebookService] Read event – watermark: ${event.read.watermark}`);
      return null;
    }

    return null;
  }

  /**
   * Xử lý feed event (bình luận trên page).
   * @param {object} value – change.value từ webhook
   * @param {string} pageId
   * @returns {Promise<object|null>}
   * @private
   */
  async _processFeedEvent(value, pageId) {
    // Chỉ xử lý bình luận mới (item = 'comment', verb = 'add')
    if (value.item !== 'comment' || value.verb !== 'add') return null;

    const normalized = {
      content: value.message || '',
      type: 'text',
      senderId: value.from?.id || '',
      senderName: value.from?.name || '',
      senderType: 'customer',
      channelId: pageId,
      channelType: 'facebook',
      conversationId: '', // gán bởi ChannelManager
      metadata: {
        commentId: value.comment_id,
        postId: value.post_id,
        parentId: value.parent_id || null,
        isFeedComment: true,
      },
    };

    const saved = await createMessage(normalized);
    console.log(`[FacebookService] Đã lưu bình luận ${saved.id} từ ${normalized.senderId}`);
    return saved;
  }

  /**
   * Xác định loại tin nhắn từ message object.
   * @param {object} msg – Facebook message object
   * @returns {'text'|'image'|'sticker'}
   * @private
   */
  _getMessageType(msg) {
    if (msg.sticker_id) return 'sticker';
    if (msg.attachments?.length > 0) {
      const type = msg.attachments[0].type;
      if (type === 'image') return 'image';
      // Có thể mở rộng cho video, audio, file…
    }
    return 'text';
  }

  // ——————————————————————————————————————————————
  //  Send API
  // ——————————————————————————————————————————————

  /**
   * Gửi tin nhắn văn bản qua Messenger.
   *
   * @param {string} recipientId – PSID của người nhận
   * @param {string} text        – nội dung tin nhắn
   * @returns {Promise<object>}  – response từ Graph API
   */
  async sendMessage(recipientId, text) {
    const url = `${GRAPH_API_BASE}/me/messages?access_token=${this.pageAccessToken}`;

    const payload = {
      recipient: { id: recipientId },
      message: { text },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[FacebookService] Lỗi gửi tin nhắn:', data);
      throw new Error(`Facebook Send API error: ${data.error?.message || 'Unknown'}`);
    }

    console.log(`[FacebookService] Đã gửi tin nhắn tới ${recipientId}`);
    return data;
  }

  /**
   * Gửi hình ảnh qua Messenger.
   *
   * @param {string} recipientId – PSID của người nhận
   * @param {string} imageUrl    – URL hình ảnh
   * @returns {Promise<object>}
   */
  async sendImage(recipientId, imageUrl) {
    const url = `${GRAPH_API_BASE}/me/messages?access_token=${this.pageAccessToken}`;

    const payload = {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: imageUrl, is_reusable: true },
        },
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[FacebookService] Lỗi gửi hình ảnh:', data);
      throw new Error(`Facebook Send API error: ${data.error?.message || 'Unknown'}`);
    }

    console.log(`[FacebookService] Đã gửi hình ảnh tới ${recipientId}`);
    return data;
  }

  // ——————————————————————————————————————————————
  //  User Profile
  // ——————————————————————————————————————————————

  /**
   * Lấy thông tin hồ sơ người dùng từ Graph API.
   *
   * @param {string} userId – PSID của người dùng
   * @returns {Promise<{ id: string, name: string, first_name: string, last_name: string, profile_pic: string }>}
   */
  async getUserProfile(userId) {
    const fields = 'first_name,last_name,name,profile_pic';
    const url = `${GRAPH_API_BASE}/${userId}?fields=${fields}&access_token=${this.pageAccessToken}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('[FacebookService] Lỗi lấy profile:', data);
      throw new Error(`Facebook Graph API error: ${data.error?.message || 'Unknown'}`);
    }

    return data;
  }
}
