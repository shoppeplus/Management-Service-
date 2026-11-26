/**
 * Inbox Domain Helpers & Initial Seed Store
 * ──────────────────────────────────────────
 * Tách biệt thuần logic xử lý cây danh mục, sản phẩm đính kèm,
 * lọc hội thoại theo Danh mục + Kênh + Đa tài khoản TikTok Shop + Phân quyền (F0/F1/F2).
 * Giúp dễ dàng bảo trì và nâng cấp khi tích hợp Database Account của Nam.
 */

(function () {
  'use strict';

  const DEFAULT_BUSINESS_ACCOUNTS = [
    {
      id: 'shop-id-01',
      shopId: 'shop-id-01',
      channelType: 'tiktok',
      name: 'TikTok Shop 01 - Mỹ Phẩm',
      category: 'Mỹ phẩm',
      connected: true,
    },
    {
      id: 'shop-id-02',
      shopId: 'shop-id-02',
      channelType: 'tiktok',
      name: 'TikTok Shop 02 - Gia Dụng & Điện Tử',
      category: 'Đồ gia dụng',
      connected: true,
    },
    {
      id: 'oa_zalo_smartsales',
      shopId: 'oa_zalo_smartsales',
      channelType: 'zalo',
      name: 'Zalo OA SmartSales',
      category: 'Điện tử',
      connected: true,
    },
    {
      id: 'page_smartsales',
      shopId: 'page_smartsales',
      channelType: 'facebook',
      name: 'Fanpage Thời Trang Unisex',
      category: 'Thời trang',
      connected: true,
    },
  ];

  const DEFAULT_CONVERSATIONS_MAP = {
    conv_001: {
      id: 'conv_001',
      contactName: 'Nguyễn Minh Anh',
      initials: 'MA',
      tier: 'GOLD',
      category: 'Điện tử',
      subCategory: 'Camera & An ninh',
      channel: 'zalo',
      channelLabel: 'Zalo',
      channelTag: 'Zalo OA SmartSales',
      shopId: 'oa_zalo_smartsales',
      lastMessage: 'Mình lấy 2 chiếc màu đen nhé.',
      time: '10:42',
      unreadCount: 2,
      assignedTo: 'Nam',
      isMine: true,
      phone: '0987654321',
      email: 'minhanh@example.com',
      location: 'Hà Nội',
      totalSpending: '32,5 triệu',
      totalOrders: 8,
      recentOrder: {
        orderCode: 'DH008',
        status: 'Hoàn tất',
        date: '10/03/2024',
        productName: 'Camera A An ninh AI 4K',
        price: '4.590.000đ',
      },
      careSchedule: {
        date: 'Ngày mai • 09:00',
        content: 'Gọi xác nhận trải nghiệm',
      },
      messages: [
        { id: 'm1', senderType: 'customer', senderName: 'Nguyễn Minh Anh', content: 'Chào shop, Camera A còn màu đen không?', time: '10:35' },
        { id: 'm2', senderType: 'employee', senderName: 'Nam', content: 'Dạ còn hàng anh nhé. Giá hiện tại là 4.590.000đ/chiếc ạ.', time: '10:36', delivered: true },
        { id: 'm3', senderType: 'customer', senderName: 'Nguyễn Minh Anh', content: 'Mình lấy 2 chiếc màu đen nhé.', time: '10:42' },
      ],
      aiSuggestion: 'Dạ, em ghi nhận 2 Camera A màu đen. Anh xác nhận giúp em địa chỉ nhận hàng nhé.',
    },
    conv_002: {
      id: 'conv_002',
      contactName: 'Trần Hoàng',
      initials: 'TH',
      tier: 'Silver',
      category: 'Thời trang',
      subCategory: 'Quần thể thao & Jogger',
      channel: 'facebook',
      channelLabel: 'Messenger',
      channelTag: 'Fanpage Thời Trang Unisex',
      shopId: 'page_smartsales',
      lastMessage: 'Cho mình xin giá sản phẩm.',
      time: '10:38',
      unreadCount: 1,
      assignedTo: 'Nam',
      isMine: true,
      phone: '0912345678',
      email: 'tranhoang.hn@gmail.com',
      location: 'Hà Nội',
      totalSpending: '5,2 triệu',
      totalOrders: 2,
      recentOrder: {
        orderCode: 'DH004',
        status: 'Hoàn tất',
        date: '28/02/2024',
        productName: 'Quần jogger thể thao',
        price: '700.000đ',
      },
      careSchedule: {
        date: '15/03 • 14:00',
        content: 'Tư vấn đồng phục CLB Cầu Lông',
      },
      messages: [
        { id: 'm201', senderType: 'customer', senderName: 'Trần Hoàng', content: 'Shop ơi áo thun unisex và quần jogger bên mình còn size L không?', time: '10:30' },
        { id: 'm202', senderType: 'employee', senderName: 'Nam', content: 'Dạ chào anh Hoàng, bên em sẵn size L cả hai mẫu ạ.', time: '10:34', delivered: true },
        { id: 'm203', senderType: 'customer', senderName: 'Trần Hoàng', content: 'Cho mình xin giá sản phẩm.', time: '10:38' },
      ],
      aiSuggestion: 'Dạ áo thun unisex basic giá 180k, quần jogger thể thao 350k. Nếu lấy cả set shop tặng kèm freeship anh nhé!',
    },
    conv_003: {
      id: 'conv_003',
      contactName: 'Công ty An Phát',
      initials: 'AP',
      tier: 'Platinum',
      category: 'Điện tử',
      subCategory: 'Camera & An ninh',
      channel: 'email',
      channelLabel: 'Email',
      channelTag: 'Email Doanh nghiệp',
      shopId: 'email_smartsales',
      lastMessage: 'Yêu cầu báo giá thiết bị.',
      time: '10:30',
      unreadCount: 0,
      assignedTo: 'Nam',
      isMine: true,
      phone: '0903123456',
      email: 'contact@anphat.vn',
      location: 'Đà Nẵng',
      totalSpending: '85,0 triệu',
      totalOrders: 12,
      recentOrder: {
        orderCode: 'DH001',
        status: 'Hoàn tất',
        date: '15/01/2024',
        productName: 'Gói 20 Camera An ninh',
        price: '45.000.000đ',
      },
      careSchedule: {
        date: '20/03 • 10:00',
        content: 'Ký hợp đồng cung cấp thiết bị Q2',
      },
      messages: [
        { id: 'm301', senderType: 'customer', senderName: 'Công ty An Phát', content: 'Yêu cầu báo giá thiết bị 50 Camera A cho chi nhánh mới.', time: '10:30' },
      ],
      aiSuggestion: 'Kính gửi Quý công ty An Phát, em xin gửi bảng báo giá chiết khấu 15% cho đơn hàng 50 Camera A qua email đính kèm ạ.',
    },
    conv_004: {
      id: 'conv_004',
      contactName: 'Lê Thu Hà',
      initials: 'LH',
      tier: 'Standard',
      category: 'Mỹ phẩm',
      subCategory: 'Chăm sóc da (Skincare)',
      channel: 'website',
      channelLabel: 'Website',
      channelTag: 'Website Livechat',
      shopId: 'website_chat',
      lastMessage: 'Cần tư vấn thêm về bảo hành.',
      time: '10:21',
      unreadCount: 0,
      badgeText: 'Chờ phản hồi',
      assignedTo: null,
      isMine: false,
      phone: '0978998877',
      email: 'thuha.le@gmail.com',
      location: 'TP. Hồ Chí Minh',
      totalSpending: '1,5 triệu',
      totalOrders: 1,
      recentOrder: {
        orderCode: 'DH003',
        status: 'Hoàn tất',
        date: '05/03/2024',
        productName: 'Serum Vitamin C',
        price: '450.000đ',
      },
      careSchedule: {
        date: '16/03 • 09:30',
        content: 'Hỏi thăm trải nghiệm sau 2 tuần dùng',
      },
      messages: [
        { id: 'm401', senderType: 'customer', senderName: 'Lê Thu Hà', content: 'Cần tư vấn thêm về bảo hành và chính sách đổi trả sản phẩm ạ.', time: '10:21' },
      ],
      aiSuggestion: 'Dạ bên em bảo hành 12 tháng 1 đổi 1 trong 30 ngày nếu phát sinh lỗi từ nhà sản xuất chị nhé!',
    },
    conv_005: {
      id: 'conv_005',
      contactName: 'Phạm Quang',
      initials: 'PQ',
      tier: 'Standard',
      category: 'Phụ kiện',
      subCategory: 'Đồng hồ & Kính mắt',
      channel: 'whatsapp',
      channelLabel: 'WhatsApp',
      channelTag: 'WhatsApp Business',
      shopId: 'whatsapp_smartsales',
      lastMessage: 'Đơn của tôi giao đến đâu rồi?',
      time: '10:15',
      unreadCount: 0,
      assignedTo: null,
      isMine: false,
      phone: '0345678901',
      email: 'quangpham90@gmail.com',
      location: 'Hải Phòng',
      totalSpending: '890.000đ',
      totalOrders: 2,
      recentOrder: {
        orderCode: 'DH007',
        status: 'Đang giao',
        date: '11/03/2024',
        productName: 'Đồng hồ nam dây da',
        price: '550.000đ',
      },
      careSchedule: {
        date: 'Hôm nay • 16:00',
        content: 'Theo dõi đơn hàng GHTK phát tận nơi',
      },
      messages: [
        { id: 'm501', senderType: 'customer', senderName: 'Phạm Quang', content: 'Đơn của tôi giao đến đâu rồi? Hôm qua thấy báo đang xuất kho.', time: '10:15' },
      ],
      aiSuggestion: 'Dạ đơn DH007 của anh đang được bưu tá GHTK đi giao trong sáng nay mã vận đơn GHTK883921 ạ!',
    },
    conv_006: {
      id: 'conv_006',
      contactName: 'Vũ Linh',
      initials: 'VL',
      category: 'Mỹ phẩm',
      subCategory: 'Trang điểm (Makeup)',
      tier: 'Silver',
      channel: 'zalo',
      channelLabel: 'Zalo',
      channelTag: 'Zalo OA SmartSales',
      shopId: 'oa_zalo_smartsales',
      lastMessage: 'Cảm ơn shop!',
      time: '09:58',
      unreadCount: 0,
      assignedTo: null,
      isMine: false,
      phone: '0933221100',
      email: 'vulinh.beauty@gmail.com',
      location: 'Cần Thơ',
      totalSpending: '3,8 triệu',
      totalOrders: 4,
      recentOrder: {
        orderCode: 'DH006',
        status: 'Hoàn tất',
        date: '02/03/2024',
        productName: 'Son môi lì + Kem chống nắng',
        price: '570.000đ',
      },
      careSchedule: {
        date: '25/03 • 10:00',
        content: 'Gửi voucher ưu đãi sinh nhật',
      },
      messages: [
        { id: 'm601', senderType: 'customer', senderName: 'Vũ Linh', content: 'Hàng nhận được rồi, đóng gói rất kỹ nhé shop. Cảm ơn shop!', time: '09:58' },
      ],
      aiSuggestion: 'Dạ cảm ơn chị Linh đã ủng hộ shop! Chúc chị một ngày tốt lành và hy vọng sớm được phục vụ chị tiếp ạ!',
    },
    conv_007: {
      id: 'conv_007',
      contactName: 'Võ Thị Em',
      initials: 'VE',
      category: 'Mỹ phẩm',
      subCategory: 'Chăm sóc da (Skincare)',
      tier: 'Gold',
      channel: 'tiktok',
      channelLabel: 'TikTok Shop',
      channelTag: 'TikTok Shop 01 - Mỹ Phẩm',
      shopId: 'shop-id-01',
      lastMessage: 'Da em nhạy cảm dùng serum vitamin C này có bị kích ứng không?',
      time: '10:05',
      unreadCount: 3,
      assignedTo: 'Nam',
      isMine: true,
      phone: '0345678901',
      email: 'emvo.beauty@gmail.com',
      location: 'TP. Hồ Chí Minh',
      totalSpending: '2,4 triệu',
      totalOrders: 3,
      recentOrder: {
        orderCode: 'TT-882910',
        status: 'Hoàn tất',
        date: '09/03/2024',
        productName: 'Kem chống nắng SPF50+',
        price: '320.000đ',
      },
      careSchedule: {
        date: 'Ngày mai • 15:00',
        content: 'Tư vấn liệu trình Serum Vitamin C',
      },
      messages: [
        { id: 'm701', senderType: 'customer', senderName: 'Võ Thị Em', content: 'Shop ơi cho em hỏi lọ Serum Vitamin C dưỡng trắng ạ.', time: '10:02' },
        { id: 'm702', senderType: 'employee', senderName: 'Nam', content: 'Dạ chào chị, dòng Serum Vitamin C bên em chiết xuất tự nhiên lành tính ạ.', time: '10:03', delivered: true },
        { id: 'm703', senderType: 'customer', senderName: 'Võ Thị Em', content: 'Da em nhạy cảm dùng serum vitamin C này có bị kích ứng không?', time: '10:05' },
      ],
      aiSuggestion: 'Dạ sản phẩm có nồng độ Vitamin C 10% kết hợp B5 làm dịu da nên da nhạy cảm dùng rất êm, không gây châm chích chị nhé!',
    },
    conv_008: {
      id: 'conv_008',
      contactName: 'Bùi Thị Hương',
      initials: 'BH',
      category: 'Đồ gia dụng',
      subCategory: 'Đồ dùng nhà bếp & Bình nhiệt',
      tier: 'Standard',
      channel: 'tiktok',
      channelLabel: 'TikTok Shop',
      channelTag: 'TikTok Shop 02 - Gia Dụng & Điện Tử',
      shopId: 'shop-id-02',
      lastMessage: 'Bình giữ nhiệt inox 500ml giao đến Đà Nẵng mất mấy ngày ạ?',
      time: '09:50',
      unreadCount: 1,
      assignedTo: null,
      isMine: false,
      phone: '0966554433',
      email: 'huongbui.dn@gmail.com',
      location: 'Đà Nẵng',
      totalSpending: '600.000đ',
      totalOrders: 1,
      recentOrder: {
        orderCode: 'TT-774120',
        status: 'Đang giao',
        date: '11/03/2024',
        productName: 'Đèn bàn LED chống cận',
        price: '380.000đ',
      },
      careSchedule: {
        date: '18/03 • 10:30',
        content: 'Gọi xác nhận nhận hàng GHTK tại Đà Nẵng',
      },
      messages: [
        { id: 'm801', senderType: 'customer', senderName: 'Bùi Thị Hương', content: 'Bình giữ nhiệt inox 500ml giao đến Đà Nẵng mất mấy ngày ạ?', time: '09:50' },
      ],
      aiSuggestion: 'Dạ shop gửi nhanh từ kho qua GHTK về Đà Nẵng chỉ mất khoảng 2-3 ngày là mình nhận được hàng chị nhé!',
    },
  };

  function formatCurrencyVND(price) {
    const num = Number(price);
    if (!Number.isFinite(num)) return String(price || '0đ');
    return num.toLocaleString('vi-VN') + 'đ';
  }

  /**
   * Dựng cây danh mục cha - con kèm danh sách sản phẩm đính kèm và số hội thoại
   */
  function buildCategoryTree(categories = [], conversationsMap = {}) {
    const byName = new Map();

    const ensureNode = (category, inheritedParent = null) => {
      if (!category?.name) return null;
      const parentName = category.parentName || category.parent?.name || inheritedParent || null;
      const existing = byName.get(category.name);
      const products = Array.isArray(category.products)
        ? category.products
        : existing?.products || [];

      const node = {
        id: category.id || existing?.id || category.name,
        name: category.name,
        code: category.code || existing?.code || '',
        parentName,
        count: existing?.count || 0,
        products,
        children: existing?.children || [],
      };
      byName.set(category.name, node);

      (category.children || []).forEach((child) => {
        ensureNode(child, category.name);
      });
      return node;
    };

    categories.forEach((cat) => ensureNode(cat));

    // Đếm số lượng hội thoại cho từng danh mục cha và danh mục con
    Object.values(conversationsMap).forEach((conv) => {
      const catName = conv.category || conv.categoryName || conv.metadata?.category;
      const subCatName = conv.subCategory || conv.metadata?.subCategory;

      if (catName) {
        const existing = byName.get(catName) || ensureNode({ name: catName });
        if (existing) existing.count += 1;
      }
      if (subCatName && subCatName !== catName) {
        const subExisting = byName.get(subCatName) || ensureNode({ name: subCatName, parentName: catName || null });
        if (subExisting) subExisting.count += 1;
      }
    });

    const roots = new Map();
    byName.forEach((node) => {
      if (!node.parentName) {
        roots.set(node.name, node);
        return;
      }
      let parent = byName.get(node.parentName);
      if (!parent) {
        parent = ensureNode({ id: node.parentName, name: node.parentName, parentName: null });
      }
      if (!parent.children.some((c) => c.name === node.name)) {
        parent.children.push(node);
      }
      roots.set(parent.name, parent);
    });

    return Array.from(roots.values())
      .map((root) => ({
        ...root,
        children: [...root.children].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  /**
   * Lọc danh sách hội thoại theo Tab, Kênh, Tài khoản Shop, Danh mục (cha hoặc con), Từ khóa & Scope User
   */
  function filterConversations(conversationsMap = {}, filters = {}) {
    const {
      inboxTab = 'mine',
      channelFilter = 'all',
      shopFilter = 'all',
      categoryFilter = 'all',
      searchQuery = '',
      categoryTree = [],
      currentUser = null,
    } = filters;

    // Nếu chọn danh mục cha, chấp nhận cả hội thoại thuộc danh mục con của nó
    const matchingCategories = new Set();
    if (categoryFilter && categoryFilter !== 'all') {
      matchingCategories.add(categoryFilter.toLowerCase());
      const rootNode = categoryTree.find(
        (cat) => cat.name.toLowerCase() === categoryFilter.toLowerCase()
      );
      if (rootNode && Array.isArray(rootNode.children)) {
        rootNode.children.forEach((child) => matchingCategories.add(child.name.toLowerCase()));
      }
    }

    const allowedCategories = Array.isArray(currentUser?.allowedCategories) && currentUser.allowedCategories.length > 0
      ? new Set(currentUser.allowedCategories.map((c) => String(c).toLowerCase()))
      : null;

    const allowedShopIds = Array.isArray(currentUser?.allowedShopIds) && currentUser.allowedShopIds.length > 0
      ? new Set(currentUser.allowedShopIds.map((id) => String(id)))
      : null;

    return Object.values(conversationsMap).filter((c) => {
      if (inboxTab === 'mine' && !c.isMine) return false;
      if (inboxTab === 'unassigned' && c.isMine) return false;
      if (channelFilter !== 'all' && c.channel !== channelFilter) return false;

      if (shopFilter !== 'all') {
        const convShopId = c.shopId || c.metadata?.tiktokShopId || c.channelId || '';
        if (convShopId !== shopFilter) return false;
      }

      if (allowedCategories) {
        const convCat = String(c.category || c.categoryName || c.metadata?.category || '').toLowerCase();
        const convSub = String(c.subCategory || c.metadata?.subCategory || '').toLowerCase();
        if (!allowedCategories.has(convCat) && !allowedCategories.has(convSub)) return false;
      }

      if (allowedShopIds) {
        const convShopId = String(c.shopId || c.metadata?.tiktokShopId || c.channelId || '');
        if (convShopId && !allowedShopIds.has(convShopId)) return false;
      }

      if (matchingCategories.size > 0) {
        const convCat = String(c.category || c.categoryName || c.metadata?.category || '').toLowerCase();
        const convSub = String(c.subCategory || c.metadata?.subCategory || '').toLowerCase();
        if (!matchingCategories.has(convCat) && !matchingCategories.has(convSub)) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (c.contactName || '').toLowerCase().includes(q);
        const msgMatch = (c.lastMessage || '').toLowerCase().includes(q);
        const tagMatch = (c.channelTag || '').toLowerCase().includes(q);
        return nameMatch || msgMatch || tagMatch;
      }

      return true;
    });
  }

  window.InboxHelpers = {
    DEFAULT_BUSINESS_ACCOUNTS,
    DEFAULT_CONVERSATIONS_MAP,
    formatCurrencyVND,
    buildCategoryTree,
    filterConversations,
  };
})();
