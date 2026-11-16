/**
 * Mini Pancake - API Client & Mock Data Fallback
 * ------------------------------------------------
 * Handles network requests to the backend /api endpoints.
 * When the backend is offline or requests fail, falls back seamlessly to mock data.
 * Attached to window.Api (and initializes window.MockData).
 */

(function () {
  'use strict';

  const BASE_URL = '/api';

  /**
   * Helper: Return authorization headers with JWT bearer token.
   */
  function getAuthHeaders() {
    let token = 'mock-jwt-token-emp001';
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        token = window.localStorage.getItem('auth_token') || token;
      }
    } catch (e) {
      // ignore localStorage errors (e.g. sandbox security)
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  // =========================================================================
  // Default Mock Data Store
  // =========================================================================
  const defaultMockData = {
    currentUser: {
      uid: 'EMP001',
      name: 'Nguyen Van A',
      email: 'vana.nguyen@minipancake.vn',
      role: 'admin',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
    },

    customers: [
      {
        id: 'CUST-001',
        name: 'Nguyễn Thị Mai',
        phone: '0987654321',
        email: 'mai.nguyen@gmail.com',
        address: 'Số 12 ngõ 86 Duy Tân, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội',
        province: 'Hà Nội',
        district: 'Quận Cầu Giấy',
        ward: 'Phường Dịch Vọng Hậu',
        street: 'Số 12 ngõ 86 Duy Tân',
        tags: ['VIP', 'Mỹ phẩm'],
        notes: 'Khách quen, hay mua buổi tối, tư vấn kỹ màu son',
        source: 'facebook',
        totalOrders: 3,
        totalSpent: 1250000,
        purchaseHistory: ['ORD-20261110-001', 'ORD-20261025-004'],
        createdAt: '2026-10-01T08:00:00.000Z',
      },
      {
        id: 'CUST-002',
        name: 'Trần Văn Nam',
        phone: '0912345678',
        email: 'nam.tran@gmail.com',
        address: '45 Trần Phú, Phường Thạch Thang, Quận Hải Châu, Đà Nẵng',
        province: 'Đà Nẵng',
        district: 'Quận Hải Châu',
        ward: 'Phường Thạch Thang',
        street: '45 Trần Phú',
        tags: ['Khách mới', 'TikTok'],
        notes: 'Hỏi quần jogger size L, thích giao giờ hành chính',
        source: 'tiktok',
        totalOrders: 1,
        totalSpent: 350000,
        purchaseHistory: ['ORD-20261112-003'],
        createdAt: '2026-11-05T14:30:00.000Z',
      },
      {
        id: 'CUST-003',
        name: 'Lê Thị Hương',
        phone: '0909123456',
        email: 'huong.le@gmail.com',
        address: '88 Đồng Khởi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
        province: 'Hồ Chí Minh',
        district: 'Quận 1',
        ward: 'Phường Bến Nghé',
        street: '88 Đồng Khởi',
        tags: ['Tiềm năng', 'Zalo'],
        notes: 'Đang phân vân giữa serum và kem chống nắng',
        source: 'zalo',
        totalOrders: 0,
        totalSpent: 0,
        purchaseHistory: [],
        createdAt: '2026-11-12T09:15:00.000Z',
      },
      {
        id: 'CUST-004',
        name: 'Phạm Đức Anh',
        phone: '0978112233',
        email: 'anh.pham@gmail.com',
        address: '25 Lê Lợi, Phường Lạc Viên, Quận Ngô Quyền, Hải Phòng',
        province: 'Hải Phòng',
        district: 'Quận Ngô Quyền',
        ward: 'Phường Lạc Viên',
        street: '25 Lê Lợi',
        tags: ['Thời trang'],
        notes: 'Giao hàng gọi trước 15 phút',
        source: 'facebook',
        totalOrders: 2,
        totalSpent: 530000,
        purchaseHistory: ['ORD-20261108-002'],
        createdAt: '2026-10-18T11:20:00.000Z',
      },
      {
        id: 'CUST-005',
        name: 'Hoàng Mỹ Linh',
        phone: '0933445566',
        email: 'linh.hoang@gmail.com',
        address: '102 Nguyễn Văn Cừ, Phường An Khánh, Quận Ninh Kiều, Cần Thơ',
        province: 'Cần Thơ',
        district: 'Quận Ninh Kiều',
        ward: 'Phường An Khánh',
        street: '102 Nguyễn Văn Cừ',
        tags: ['Gia dụng'],
        notes: 'Đã mua bình giữ nhiệt, khen dùng rất tốt',
        source: 'tiktok',
        totalOrders: 1,
        totalSpent: 220000,
        purchaseHistory: ['ORD-20261102-005'],
        createdAt: '2026-10-28T16:00:00.000Z',
      },
    ],

    conversations: [
      {
        id: 'conv-1',
        channelType: 'facebook',
        channelId: 'page_fb_01',
        pageId: 'page_fb_01',
        pageName: 'Mỹ Phẩm Xinh - Store',
        contactId: 'CUST-001',
        contactName: 'Nguyễn Thị Mai',
        contactAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
        lastMessage: 'Shop ơi son này có màu đỏ cam không?',
        lastMessageTime: '2026-11-15T09:45:00.000Z',
        unreadCount: 2,
        assignedTo: 'EMP001',
        status: 'active',
      },
      {
        id: 'conv-2',
        channelType: 'tiktok',
        channelId: 'shop_tt_01',
        pageId: 'shop_tt_01',
        pageName: 'Mini Pancake Official',
        contactId: 'CUST-002',
        contactName: 'Trần Văn Nam',
        contactAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
        lastMessage: 'Đơn hàng của mình gửi chưa shop? Hôm nay có giao kịp không?',
        lastMessageTime: '2026-11-15T09:12:00.000Z',
        unreadCount: 0,
        assignedTo: 'EMP001',
        status: 'active',
      },
      {
        id: 'conv-3',
        channelType: 'zalo',
        channelId: 'oa_zalo_01',
        pageId: 'oa_zalo_01',
        pageName: 'Zalo OA CSKH Mini Pancake',
        contactId: 'CUST-003',
        contactName: 'Lê Thị Hương',
        contactAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face',
        lastMessage: 'Tư vấn cho mình kem chống nắng cho da dầu mụn nhé',
        lastMessageTime: '2026-11-15T08:30:00.000Z',
        unreadCount: 1,
        assignedTo: 'EMP001',
        status: 'active',
      },
      {
        id: 'conv-4',
        channelType: 'facebook',
        channelId: 'page_fb_02',
        pageId: 'page_fb_02',
        pageName: 'Thời Trang Unisex Việt',
        contactId: 'CUST-004',
        contactName: 'Phạm Đức Anh',
        contactAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
        lastMessage: 'Quần jogger size L cao 1m75 nặng 68kg vừa không shop?',
        lastMessageTime: '2026-11-14T21:05:00.000Z',
        unreadCount: 0,
        assignedTo: 'EMP001',
        status: 'active',
      },
      {
        id: 'conv-5',
        channelType: 'tiktok',
        channelId: 'shop_tt_02',
        pageId: 'shop_tt_02',
        pageName: 'Gia Dụng Thông Minh 247',
        contactId: 'CUST-005',
        contactName: 'Hoàng Mỹ Linh',
        contactAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face',
        lastMessage: 'Bình giữ nhiệt dùng tốt lắm shop ạ, mình muốn đặt thêm 2 cái nữa.',
        lastMessageTime: '2026-11-14T18:20:00.000Z',
        unreadCount: 0,
        assignedTo: 'EMP001',
        status: 'active',
      },
    ],

    messages: {
      'conv-1': [
        {
          id: 'msg-101',
          conversationId: 'conv-1',
          senderId: 'CUST-001',
          senderName: 'Nguyễn Thị Mai',
          senderType: 'customer',
          content: 'Chào shop, em đang xem dòng son môi lì cao cấp của bên mình ạ.',
          type: 'text',
          timestamp: '2026-11-15T09:30:00.000Z',
          read: true,
        },
        {
          id: 'msg-102',
          conversationId: 'conv-1',
          senderId: 'EMP001',
          senderName: 'Nguyen Van A',
          senderType: 'employee',
          content: 'Dạ chào chị Mai ạ! Dòng son lì bên em chất son cực mịn, giữ màu 8-10 tiếng không khô môi chị nhé 🥰',
          type: 'text',
          timestamp: '2026-11-15T09:32:00.000Z',
          read: true,
        },
        {
          id: 'msg-103',
          conversationId: 'conv-1',
          senderId: 'CUST-001',
          senderName: 'Nguyễn Thị Mai',
          senderType: 'customer',
          content: 'Shop ơi son này có màu đỏ cam không?',
          type: 'text',
          timestamp: '2026-11-15T09:45:00.000Z',
          read: false,
        },
      ],
      'conv-2': [
        {
          id: 'msg-201',
          conversationId: 'conv-2',
          senderId: 'CUST-002',
          senderName: 'Trần Văn Nam',
          senderType: 'customer',
          content: 'Đơn hàng của mình gửi chưa shop? Hôm nay có giao kịp không?',
          type: 'text',
          timestamp: '2026-11-15T09:12:00.000Z',
          read: true,
        },
      ],
      'conv-3': [
        {
          id: 'msg-301',
          conversationId: 'conv-3',
          senderId: 'CUST-003',
          senderName: 'Lê Thị Hương',
          senderType: 'customer',
          content: 'Tư vấn cho mình kem chống nắng cho da dầu mụn nhé',
          type: 'text',
          timestamp: '2026-11-15T08:30:00.000Z',
          read: false,
        },
      ],
      'conv-4': [
        {
          id: 'msg-401',
          conversationId: 'conv-4',
          senderId: 'CUST-004',
          senderName: 'Phạm Đức Anh',
          senderType: 'customer',
          content: 'Quần jogger size L cao 1m75 nặng 68kg vừa không shop?',
          type: 'text',
          timestamp: '2026-11-14T21:05:00.000Z',
          read: true,
        },
        {
          id: 'msg-402',
          conversationId: 'conv-4',
          senderId: 'EMP001',
          senderName: 'Nguyen Van A',
          senderType: 'employee',
          content: 'Dạ vừa chuẩn form luôn anh nhé, chất co giãn thoáng mát lắm ạ!',
          type: 'text',
          timestamp: '2026-11-14T21:10:00.000Z',
          read: true,
        },
      ],
      'conv-5': [
        {
          id: 'msg-501',
          conversationId: 'conv-5',
          senderId: 'CUST-005',
          senderName: 'Hoàng Mỹ Linh',
          senderType: 'customer',
          content: 'Bình giữ nhiệt dùng tốt lắm shop ạ, mình muốn đặt thêm 2 cái nữa.',
          type: 'text',
          timestamp: '2026-11-14T18:20:00.000Z',
          read: true,
        },
      ],
    },

    products: [
      { id: 'PROD-001', name: 'Son môi lì cao cấp', price: 250000, category: 'My pham', weight: 50 },
      { id: 'PROD-002', name: 'Kem chống nắng SPF50+', price: 320000, category: 'My pham', weight: 80 },
      { id: 'PROD-003', name: 'Serum Vitamin C dưỡng trắng', price: 450000, category: 'My pham', weight: 60 },
      { id: 'PROD-004', name: 'Áo thun unisex basic', price: 180000, category: 'Thoi trang', weight: 200 },
      { id: 'PROD-005', name: 'Quần jogger thể thao', price: 350000, category: 'Thoi trang', weight: 350 },
      { id: 'PROD-006', name: 'Túi xách nữ mini', price: 290000, category: 'Phu kien', weight: 250 },
      { id: 'PROD-007', name: 'Kính mát thời trang UV400', price: 199000, category: 'Phu kien', weight: 40 },
      { id: 'PROD-008', name: 'Đồng hồ dây da nam', price: 550000, category: 'Phu kien', weight: 120 },
      { id: 'PROD-009', name: 'Bình giữ nhiệt inox 500ml', price: 220000, category: 'Do gia dung', weight: 350 },
      { id: 'PROD-010', name: 'Đèn bàn LED chống cận', price: 380000, category: 'Do gia dung', weight: 800 },
    ],

    orders: [
      {
        id: 'ORD-20261110-001',
        orderCode: 'MP-20261110-A1B2',
        customerId: 'CUST-001',
        customerName: 'Nguyễn Thị Mai',
        customerPhone: '0987654321',
        shippingAddress: {
          province: 'Hà Nội',
          district: 'Quận Cầu Giấy',
          ward: 'Phường Dịch Vọng Hậu',
          detail: 'Số 12 ngõ 86 Duy Tân',
        },
        items: [{ productId: 'PROD-001', name: 'Son môi lì cao cấp', quantity: 2, price: 250000 }],
        totalAmount: 530000,
        shippingFee: 30000,
        codAmount: 530000,
        discount: 0,
        status: 'delivered',
        trackingId: 'GHTK882910394',
        shippingProvider: 'ghtk',
        paymentStatus: 'paid',
        paymentMethod: 'cod',
        note: 'Giao hàng buổi sáng',
        createdBy: 'EMP001',
        createdAt: '2026-11-10T10:00:00.000Z',
      },
    ],
  };

  // Expose MockData globally if not already defined
  if (typeof window !== 'undefined') {
    window.MockData = window.MockData || defaultMockData;
  }

  // =========================================================================
  // API Client Object
  // =========================================================================
  const Api = {
    BASE_URL,
    getAuthHeaders,

    /**
     * Get customers list with optional filters (search query, assignedTo).
     */
    async getCustomers(filters = {}) {
      try {
        const params = new URLSearchParams();
        if (filters.search) params.append('search', filters.search);
        if (filters.assignedTo) params.append('assignedTo', filters.assignedTo);

        const url = `${BASE_URL}/customers${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url, {
          method: 'GET',
          headers: getAuthHeaders(),
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        return data.data !== undefined ? data.data : data;
      } catch (error) {
        console.warn('[Api.getCustomers] Network/API error, returning mock data:', error.message);
        const dataStore = (window.MockData && window.MockData.customers) || defaultMockData.customers;
        let list = [...dataStore];

        if (filters.search) {
          const q = filters.search.toLowerCase().trim();
          list = list.filter(
            (c) =>
              (c.name && c.name.toLowerCase().includes(q)) ||
              (c.phone && c.phone.includes(q)) ||
              (c.email && c.email.toLowerCase().includes(q))
          );
        }
        if (filters.assignedTo) {
          list = list.filter((c) => c.assignedTo === filters.assignedTo);
        }
        return list;
      }
    },

    /**
     * Get messages for a given conversation.
     */
    async getMessages(conversationId, limit = 50) {
      if (!conversationId) return [];
      try {
        const url = `${BASE_URL}/messages/conversation/${encodeURIComponent(conversationId)}?limit=${limit}`;
        const res = await fetch(url, {
          method: 'GET',
          headers: getAuthHeaders(),
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        return data.data !== undefined ? data.data : data;
      } catch (error) {
        console.warn(`[Api.getMessages] API error for conv=${conversationId}, returning mock messages:`, error.message);
        const messageMap = (window.MockData && window.MockData.messages) || defaultMockData.messages;
        const thread = messageMap[conversationId] || [];
        return [...thread].slice(-limit);
      }
    },

    /**
     * Send a new message to a conversation.
     */
    async sendMessage(conversationId, content, type = 'text') {
      try {
        const res = await fetch(`${BASE_URL}/messages`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ conversationId, content, type }),
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        return data.data !== undefined ? data.data : data;
      } catch (error) {
        console.warn('[Api.sendMessage] API error, saving to mock data store:', error.message);
        const currentUser = (window.MockData && window.MockData.currentUser) || defaultMockData.currentUser;
        const newMsg = {
          id: 'msg-' + Date.now(),
          conversationId,
          content,
          type: type || 'text',
          senderId: currentUser.uid,
          senderName: currentUser.name,
          senderType: 'employee',
          timestamp: new Date().toISOString(),
          read: true,
        };

        // Append to mock data
        const messageMap = (window.MockData && window.MockData.messages) || defaultMockData.messages;
        if (!messageMap[conversationId]) {
          messageMap[conversationId] = [];
        }
        messageMap[conversationId].push(newMsg);

        // Update lastMessage on conversation
        const convList = (window.MockData && window.MockData.conversations) || defaultMockData.conversations;
        const targetConv = convList.find((c) => c.id === conversationId);
        if (targetConv) {
          targetConv.lastMessage = content;
          targetConv.lastMessageTime = newMsg.timestamp;
        }

        return newMsg;
      }
    },

    /**
     * Create a new sales order.
     */
    async createOrder(orderData) {
      try {
        const res = await fetch(`${BASE_URL}/orders`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(orderData),
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        return data.data !== undefined ? data.data : data;
      } catch (error) {
        console.warn('[Api.createOrder] API error, creating mock order:', error.message);
        const now = new Date();
        const dateCode = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
        const trackingNum = Math.floor(100000000 + Math.random() * 900000000);

        const newOrder = {
          id: 'ORD-' + Date.now(),
          orderCode: `MP-${dateCode}-${randomPart}`,
          customerId: orderData.customerId || '',
          customerName: orderData.customerName || '',
          customerPhone: orderData.customerPhone || '',
          shippingAddress: orderData.shippingAddress || {},
          items: orderData.items || [],
          totalAmount: orderData.totalAmount || 0,
          shippingFee: orderData.shippingFee || 30000,
          codAmount: orderData.codAmount || orderData.totalAmount || 0,
          discount: orderData.discount || 0,
          status: 'pending',
          trackingId: `GHTK${trackingNum}`,
          shippingProvider: 'ghtk',
          paymentStatus: orderData.paymentStatus || 'unpaid',
          paymentMethod: orderData.paymentMethod || 'cod',
          note: orderData.note || '',
          createdBy: 'EMP001',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        const orderStore = (window.MockData && window.MockData.orders) || defaultMockData.orders;
        orderStore.unshift(newOrder);

        // Update customer purchase history if customer exists
        const custStore = (window.MockData && window.MockData.customers) || defaultMockData.customers;
        const cust = custStore.find((c) => c.id === orderData.customerId || c.phone === orderData.customerPhone);
        if (cust) {
          cust.purchaseHistory = cust.purchaseHistory || [];
          cust.purchaseHistory.unshift(newOrder.id);
          cust.totalOrders = (cust.totalOrders || 0) + 1;
          cust.totalSpent = (cust.totalSpent || 0) + newOrder.totalAmount;
        }

        return newOrder;
      }
    },

    /**
     * Calculate shipping fee (GHTK integration).
     */
    async calculateShipping(params = {}) {
      try {
        const res = await fetch(`${BASE_URL}/shipping/calculate-fee`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(params),
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        return data.data !== undefined ? data.data : data;
      } catch (error) {
        console.warn('[Api.calculateShipping] API error, returning computed mock fee:', error.message);
        const weight = Number(params.weight) || 200;
        const province = (params.province || '').toLowerCase();

        let baseFee = 25000;
        if (province.includes('hà nội') || province.includes('hồ chí minh') || province.includes('hcm')) {
          baseFee = 22000;
        } else if (province.includes('đà nẵng') || province.includes('hải phòng') || province.includes('cần thơ')) {
          baseFee = 30000;
        } else {
          baseFee = 35000;
        }

        if (weight > 500) {
          const extraBlocks = Math.ceil((weight - 500) / 500);
          baseFee += extraBlocks * 5000;
        }

        return {
          success: true,
          fee: baseFee,
          insurance_fee: 0,
          estimatedDelivery: '2 - 3 ngày',
          provider: 'Giao Hàng Tiết Kiệm (GHTK)',
        };
      }
    },

    /**
     * Update order status (pending -> confirmed -> shipping -> delivered -> returned / cancelled).
     */
    async updateOrderStatus(orderId, status) {
      try {
        const res = await fetch(`${BASE_URL}/orders/${encodeURIComponent(orderId)}/status`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ status }),
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        const data = await res.json();
        return data.data !== undefined ? data.data : data;
      } catch (error) {
        console.warn(`[Api.updateOrderStatus] API error for order=${orderId}, updating mock store:`, error.message);
        const orderStore = (window.MockData && window.MockData.orders) || defaultMockData.orders;
        const order = orderStore.find((o) => o.id === orderId);
        if (order) {
          order.status = status;
          order.updatedAt = new Date().toISOString();
          return order;
        }
        return { id: orderId, status, updatedAt: new Date().toISOString() };
      }
    },

    /**
     * Get conversations list for the chat sidebar.
     */
    async getConversations(filters = {}) {
      try {
        const params = new URLSearchParams();
        if (filters.channelType) params.append('channelType', filters.channelType);
        if (filters.status) params.append('status', filters.status);

        const url = `${BASE_URL}/conversations${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url, {
          method: 'GET',
          headers: getAuthHeaders(),
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        return data.data !== undefined ? data.data : data;
      } catch (error) {
        console.warn('[Api.getConversations] API error, returning mock conversations:', error.message);
        const convList = (window.MockData && window.MockData.conversations) || defaultMockData.conversations;
        let list = [...convList];
        if (filters.channelType) {
          list = list.filter((c) => c.channelType === filters.channelType);
        }
        return list;
      }
    },

    /**
     * Get product catalog for order creation.
     */
    async getProducts() {
      try {
        const res = await fetch(`${BASE_URL}/products`, {
          method: 'GET',
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        return data.data !== undefined ? data.data : data;
      } catch (error) {
        return (window.MockData && window.MockData.products) || defaultMockData.products;
      }
    },

    /**
     * Mark a conversation as read.
     */
    async markConversationAsRead(conversationId) {
      try {
        const res = await fetch(`${BASE_URL}/messages/conversation/${encodeURIComponent(conversationId)}/read`, {
          method: 'PUT',
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return await res.json();
      } catch (error) {
        const convList = (window.MockData && window.MockData.conversations) || defaultMockData.conversations;
        const conv = convList.find((c) => c.id === conversationId);
        if (conv) {
          conv.unreadCount = 0;
        }
        return { success: true, markedAsRead: true };
      }
    },

    /**
     * Get trending products list (Phase 5).
     */
    async getTrends(filters = {}) {
      try {
        const params = new URLSearchParams();
        if (filters.category) params.append('category', filters.category);
        if (filters.limit) params.append('limit', filters.limit);

        const res = await fetch(`${BASE_URL}/trends/latest${params.toString() ? `?${params.toString()}` : ''}`, {
          method: 'GET',
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        return data.data !== undefined ? data.data : data;
      } catch (error) {
        return (window.MockData && window.MockData.trends && window.MockData.trends.latest) || [];
      }
    },

    /**
     * Get latest AI trend report.
     */
    async getTrendReport() {
      try {
        const res = await fetch(`${BASE_URL}/trends/report`, {
          method: 'GET',
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        return data.data !== undefined ? data.data : data;
      } catch (error) {
        return (window.MockData && window.MockData.trends && window.MockData.trends.report) || {};
      }
    },

    /**
     * Trigger manual trend collection & analysis.
     */
    async triggerTrendCollection() {
      try {
        const res = await fetch(`${BASE_URL}/trends/collect`, {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return await res.json();
      } catch (error) {
        return { success: true, message: 'Mock trend collection triggered successfully' };
      }
    },
  };

  // Expose Api on the window object
  if (typeof window !== 'undefined') {
    window.Api = Api;
  }
})();
