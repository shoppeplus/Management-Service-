/**
 * Channel Manager
 * ————————————————
 * Quản lý kênh giao tiếp thống nhất:
 * - Định tuyến tin nhắn đi (outgoing) đến đúng platform (facebook/tiktok/direct)
 * - Chuẩn hoá tin nhắn đến (incoming) về format nội bộ
 * - Tạo / lấy conversation theo kênh
 */

import FacebookService from './facebookService.js';
import {
  createConversation,
  getActiveConversations,
} from '../models/conversation.js';
import { createMessage } from '../models/message.js';
import { db } from '../config/firebase.js';

const CONVERSATIONS_COLLECTION = 'conversations';

export default class ChannelManager {
  /**
   * @param {object} [services] – inject services cho testing
   * @param {FacebookService} [services.facebook]
   */
  constructor(services = {}) {
    /** @type {FacebookService} */
    this.facebook = services.facebook || new FacebookService();
  }

  // ——————————————————————————————————————————————
  //  Outgoing messages – Gửi tin nhắn ra ngoài
  // ——————————————————————————————————————————————

  /**
   * Gửi tin nhắn qua đúng kênh dựa trên channelType.
   *
   * @param {object} options
   * @param {'facebook'|'tiktok'|'direct'} options.channelType
   * @param {string} options.recipientId – ID người nhận trên platform
   * @param {string} options.content     – nội dung tin nhắn
   * @param {'text'|'image'} [options.type='text']
   * @param {string} [options.conversationId] – ID cuộc hội thoại nội bộ
   * @param {string} [options.senderId]       – ID nhân viên gửi
   * @param {string} [options.senderName]     – tên nhân viên
   * @returns {Promise<object>} – kết quả gửi
   */
  async sendMessage({
    channelType,
    recipientId,
    content,
    type = 'text',
    conversationId = '',
    senderId = '',
    senderName = '',
  }) {
    let platformResult;

    switch (channelType) {
      case 'facebook': {
        if (type === 'image') {
          platformResult = await this.facebook.sendImage(recipientId, content);
        } else {
          platformResult = await this.facebook.sendMessage(recipientId, content);
        }
        break;
      }

      case 'tiktok': {
        // TikTok Shop không hỗ trợ gửi tin nhắn trực tiếp qua API
        // Chỉ log và lưu nội bộ
        console.log(`[ChannelManager] TikTok không hỗ trợ gửi tin nhắn trực tiếp.`);
        platformResult = { success: false, reason: 'tiktok_no_direct_message' };
        break;
      }

      case 'direct':
      default: {
        // Tin nhắn nội bộ – không cần gửi qua platform nào
        platformResult = { success: true, channel: 'direct' };
        break;
      }
    }

    // Lưu tin nhắn vào hệ thống nội bộ (outgoing)
    const savedMessage = await createMessage({
      content,
      type,
      senderId,
      senderName,
      senderType: 'employee',
      channelId: recipientId,
      channelType,
      conversationId,
    });

    return {
      message: savedMessage,
      platformResult,
    };
  }

  // ——————————————————————————————————————————————
  //  Incoming messages – Chuẩn hoá tin nhắn đến
  // ——————————————————————————————————————————————

  /**
   * Chuẩn hoá payload tin nhắn từ nhiều platform khác nhau
   * về một format thống nhất.
   *
   * @param {'facebook'|'tiktok'|'direct'} channelType
   * @param {object} rawPayload – payload gốc từ platform
   * @returns {object} – message đã chuẩn hoá
   */
  normalizeMessage(channelType, rawPayload) {
    switch (channelType) {
      case 'facebook':
        return this._normalizeFacebookMessage(rawPayload);

      case 'tiktok':
        return this._normalizeTikTokMessage(rawPayload);

      case 'direct':
      default:
        return this._normalizeDirectMessage(rawPayload);
    }
  }

  /**
   * Chuẩn hoá tin nhắn Facebook Messenger.
   * @param {object} raw
   * @returns {object}
   * @private
   */
  _normalizeFacebookMessage(raw) {
    return {
      content: raw.message?.text || '',
      type: raw.message?.attachments?.[0]?.type === 'image' ? 'image' : 'text',
      senderId: raw.sender?.id || '',
      senderName: '', // cần gọi getUserProfile để lấy
      senderType: 'customer',
      channelType: 'facebook',
      channelId: raw.recipient?.id || '',
      timestamp: raw.timestamp
        ? new Date(raw.timestamp).toISOString()
        : new Date().toISOString(),
      metadata: {
        mid: raw.message?.mid,
        attachments: raw.message?.attachments || [],
      },
    };
  }

  /**
   * Chuẩn hoá dữ liệu từ TikTok (thường là thông tin đơn hàng, không phải chat).
   * @param {object} raw
   * @returns {object}
   * @private
   */
  _normalizeTikTokMessage(raw) {
    return {
      content: raw.message || raw.data?.message || '',
      type: 'text',
      senderId: raw.user_id || raw.data?.buyer_id || '',
      senderName: raw.user_name || raw.data?.buyer_name || '',
      senderType: 'customer',
      channelType: 'tiktok',
      channelId: raw.shop_id || '',
      timestamp: raw.timestamp
        ? new Date(raw.timestamp * 1000).toISOString()
        : new Date().toISOString(),
      metadata: {
        eventType: raw.type,
        orderId: raw.data?.order_id,
      },
    };
  }

  /**
   * Chuẩn hoá tin nhắn trực tiếp (nội bộ).
   * @param {object} raw
   * @returns {object}
   * @private
   */
  _normalizeDirectMessage(raw) {
    return {
      content: raw.content || raw.message || '',
      type: raw.type || 'text',
      senderId: raw.senderId || '',
      senderName: raw.senderName || '',
      senderType: raw.senderType || 'customer',
      channelType: 'direct',
      channelId: raw.channelId || '',
      timestamp: raw.timestamp || new Date().toISOString(),
      metadata: raw.metadata || {},
    };
  }

  // ——————————————————————————————————————————————
  //  Conversation Management
  // ——————————————————————————————————————————————

  /**
   * Lấy conversation hiện có hoặc tạo mới nếu chưa tồn tại.
   * Tìm theo channelType + channelId + contactId để tránh trùng lặp.
   *
   * @param {'facebook'|'tiktok'|'direct'} channelType
   * @param {string} channelId   – ID kênh (page ID, shop ID…)
   * @param {string} contactId   – ID người liên hệ trên platform
   * @param {string} contactName – tên hiển thị
   * @returns {Promise<object>}  – conversation document
   */
  async getOrCreateConversation(channelType, channelId, contactId, contactName) {
    try {
      // Tìm conversation đã tồn tại
      const snapshot = await db
        .collection(CONVERSATIONS_COLLECTION)
        .where('channelType', '==', channelType)
        .where('channelId', '==', channelId)
        .where('contactId', '==', contactId)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }

      // Tạo conversation mới
      const newConversation = await createConversation({
        channelType,
        channelId,
        contactId,
        contactName: contactName || '',
        status: 'active',
      });

      console.log(
        `[ChannelManager] Tạo conversation mới: ${newConversation.id} ` +
          `(${channelType}/${contactId})`
      );

      return newConversation;
    } catch (error) {
      console.error('[ChannelManager] Lỗi getOrCreateConversation:', error);
      throw error;
    }
  }
}
