/**
 * OmnichannelInbox Component (SmartSales Hộp Thư Đa Kênh - Image 03)
 * ──────────────────────────────────────────────────────────────────
 * Highly Interactive Simulated Multi-channel Inbox:
 * - Live auto-reply simulation with typing indicator ("Đang soạn tin...")
 * - Dynamic AI suggestions that update after every message exchange
 * - Full conversation switching across all channels (Zalo, Messenger, Email, Website, WhatsApp)
 * - Quick reply templates menu
 * - Internal note vs customer reply mode
 * - "Đóng hội thoại" / "Mở lại hội thoại" status toggle
 * - Integrated 360 customer drawer with 2x2 quick actions
 */

(function () {
  'use strict';

  const { useState, useMemo, useEffect, useRef } = window.React;

  function OmnichannelInbox({
    currentUser,
    conversations = [],
    onSelectCustomerProfile,
    onOpenCreateOrder,
    onOpenCreateQuote,
    onOpenCreateTicket,
    onOpenScheduleCare,
    showToast,
  }) {
    const [inboxTab, setInboxTab] = useState('mine'); // 'mine' | 'unassigned'
    const [channelFilter, setChannelFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedConvId, setSelectedConvId] = useState('conv_001');
    const [replyTab, setReplyTab] = useState('reply'); // 'reply' | 'internal'
    const [inputText, setInputText] = useState('');
    const [isPhoneMasked, setIsPhoneMasked] = useState(true);
    const [isTyping, setIsTyping] = useState(false);
    const [showQuickTemplates, setShowQuickTemplates] = useState(false);
    const [convStatus, setConvStatus] = useState('OPEN'); // 'OPEN' | 'RESOLVED'

    // Conversation threads data map
    const [conversationsMap, setConversationsMap] = useState({
      conv_001: {
        id: 'conv_001',
        contactName: 'Nguyễn Minh Anh',
        initials: 'MA',
        tier: 'GOLD',
        channel: 'zalo',
        channelLabel: 'Zalo',
        channelTag: 'Zalo OA',
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
          productName: 'Camera A',
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
        channel: 'facebook',
        channelLabel: 'Messenger',
        channelTag: 'Messenger',
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
        channel: 'email',
        channelLabel: 'Email',
        channelTag: 'Email',
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
        channel: 'website',
        channelLabel: 'Website',
        channelTag: 'Website',
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
        channel: 'whatsapp',
        channelLabel: 'WhatsApp',
        channelTag: 'WhatsApp',
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
        tier: 'Silver',
        channel: 'zalo',
        channelLabel: 'Zalo',
        channelTag: 'Zalo',
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
    });

    // Active conversation
    const activeConv = conversationsMap[selectedConvId] || conversationsMap['conv_001'];

    // Filter list
    const filteredList = useMemo(() => {
      return Object.values(conversationsMap).filter((c) => {
        if (inboxTab === 'mine' && !c.isMine) return false;
        if (inboxTab === 'unassigned' && c.isMine) return false;
        if (channelFilter !== 'all' && c.channel !== channelFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return c.contactName.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q);
        }
        return true;
      });
    }, [conversationsMap, inboxTab, channelFilter, searchQuery]);

    // Quick templates list
    const quickTemplates = [
      'Dạ shop chào bạn! Bạn cần tư vấn sản phẩm nào ạ?',
      'Dạ mẫu này bên em đang có sẵn hàng và được freeship toàn quốc ạ.',
      'Bạn vui lòng cho shop xin Số điện thoại & Địa chỉ để lên đơn giao ngay nhé!',
      'Đơn hàng của bạn đã được xuất kho và bàn giao bưu tá GHTK rồi ạ.',
    ];

    // Scroll to bottom of message list
    const messagesEndRef = useRef(null);
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeConv.messages, isTyping]);

    // Insert AI draft
    const handleInsertDraft = () => {
      setInputText(activeConv.aiSuggestion);
      if (showToast) showToast('Đã chèn bản nháp gợi ý của AI vào khung nhập tin nhắn!', 'success');
    };

    // Send message with simulated real customer auto-reply!
    const handleSendMessage = (e) => {
      e?.preventDefault();
      if (!inputText.trim()) return;

      const sentText = inputText.trim();
      const nowTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

      const newMsg = {
        id: 'msg_' + Date.now(),
        senderType: replyTab === 'internal' ? 'internal' : 'employee',
        senderName: currentUser?.name || 'Nam',
        content: sentText,
        time: nowTime,
        delivered: true,
      };

      // Append message and update lastMessage
      setConversationsMap((prev) => {
        const conv = prev[selectedConvId];
        return {
          ...prev,
          [selectedConvId]: {
            ...conv,
            lastMessage: sentText,
            time: nowTime,
            messages: [...conv.messages, newMsg],
          },
        };
      });

      setInputText('');

      if (replyTab === 'internal') {
        if (showToast) showToast('Đã lưu ghi chú nội bộ (chỉ nhân viên nhìn thấy)', 'info');
        return;
      }

      // ── SIMULATED LIVE CUSTOMER REPLY ─────────────────────────────
      // Trigger typing indicator and reply after 1.8 seconds
      setTimeout(() => {
        setIsTyping(true);
      }, 700);

      setTimeout(() => {
        setIsTyping(false);

        let customerReply = 'Dạ vâng shop! Shop gửi về Số 12 ngõ 86 Duy Tân, Cầu Giấy, Hà Nội giúp mình nhé.';
        let nextAiSuggestion = 'Dạ em đã ghi nhận địa chỉ. Shop đang đóng gói gửi GHTK giao ngay trong chiều nay anh nhé!';

        if (sentText.toLowerCase().includes('địa chỉ') || sentText.toLowerCase().includes('nhận hàng')) {
          customerReply = 'Địa chỉ của mình: Số 12 ngõ 86 Duy Tân, Cầu Giấy, Hà Nội. SĐT: 0987654321 nhé shop.';
          nextAiSuggestion = 'Dạ em cảm ơn anh An! Đơn hàng Camera A của anh đã được xác nhận và sẽ giao trong 1-2 ngày tới ạ.';
        } else if (sentText.toLowerCase().includes('giá') || sentText.toLowerCase().includes('chiết khấu')) {
          customerReply = 'Ok giá này tốt quá, gói hàng cẩn thận cho mình nhé!';
          nextAiSuggestion = 'Dạ vâng anh yên tâm, hàng chính hãng bên em luôn bọc 3 lớp xốp khí chống va đập ạ!';
        }

        const replyMsg = {
          id: 'reply_' + Date.now(),
          senderType: 'customer',
          senderName: activeConv.contactName,
          content: customerReply,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };

        setConversationsMap((prev) => {
          const conv = prev[selectedConvId];
          return {
            ...prev,
            [selectedConvId]: {
              ...conv,
              lastMessage: customerReply,
              time: replyMsg.time,
              messages: [...conv.messages, replyMsg],
              aiSuggestion: nextAiSuggestion,
            },
          };
        });

        if (showToast) showToast(`${activeConv.contactName} vừa gửi tin nhắn mới!`, 'info');
      }, 2200);
    };

    // Toggle Close Conversation
    const handleToggleStatus = () => {
      const nextStatus = convStatus === 'OPEN' ? 'RESOLVED' : 'OPEN';
      setConvStatus(nextStatus);

      if (nextStatus === 'RESOLVED') {
        if (showToast) showToast('Hội thoại đã được đánh dấu giải quyết.', 'success');
      } else {
        if (showToast) showToast('Đã mở lại hội thoại.', 'info');
      }
    };

    const renderChannelIcon = (ch) => {
      switch (ch) {
        case 'zalo':
          return <span className="w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[9px] font-bold">Z</span>;
        case 'facebook':
          return <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-bold">f</span>;
        case 'email':
          return <span className="w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[9px] font-bold">✉</span>;
        case 'website':
          return <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px] font-bold">🌐</span>;
        case 'whatsapp':
          return <span className="w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center text-[9px] font-bold">W</span>;
        default:
          return <span className="w-4 h-4 rounded-full bg-slate-400 text-white flex items-center justify-center text-[9px] font-bold">💬</span>;
      }
    };

    return (
      <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
        {/* Top Header Banner matching Image 03 */}
        <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <span className="text-blue-600 font-extrabold">SMARTSALES</span>
              <span className="text-slate-300">•</span>
              <span>HỘP THƯ ĐA KÊNH</span>
            </h1>
            <p className="text-[11px] text-slate-400">Bản nháp giao diện — Dữ liệu minh họa</p>
          </div>

          {/* Stepper Navigation */}
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
            <span className="font-semibold text-blue-600 flex items-center gap-1">
              <span>💬</span> Hội thoại đa kênh
            </span>
            <span>➔</span>
            <span onClick={onSelectCustomerProfile} className="hover:text-blue-600 cursor-pointer flex items-center gap-1">
              <span>👤</span> Hồ sơ khách hàng
            </span>
            <span>➔</span>
            <span onClick={onOpenCreateOrder} className="hover:text-blue-600 cursor-pointer flex items-center gap-1">
              <span>📄</span> Tạo đơn / Báo giá / Ticket
            </span>
          </div>
        </div>

        {/* 3 Columns Body Grid */}
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* ══════════════════════════════════════════════════════════════
              COLUMN 1: Hộp thư (Conversation List)
              ══════════════════════════════════════════════════════════════ */}
          <section className="w-72 xl:w-80 h-full bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
            {/* Header: Title & Filter */}
            <div className="p-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900">Hộp thư</h2>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {filteredList.length}
                  </span>
                </div>

                <select
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value)}
                  className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">Tất cả các kênh</option>
                  <option value="zalo">Zalo</option>
                  <option value="facebook">Messenger</option>
                  <option value="email">Email</option>
                  <option value="website">Website</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>

              {/* Search box */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm cuộc trò chuyện..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white"
                />
              </div>

              {/* Tabs: "Của tôi (3)" vs "Chưa phân công (3)" */}
              <div className="flex items-center gap-4 text-xs font-semibold pt-1 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => setInboxTab('mine')}
                  className={`pb-2 border-b-2 transition-colors ${
                    inboxTab === 'mine' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Của tôi (3)
                </button>
                <button
                  type="button"
                  onClick={() => setInboxTab('unassigned')}
                  className={`pb-2 border-b-2 transition-colors ${
                    inboxTab === 'unassigned' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Chưa phân công (3)
                </button>
              </div>
            </div>

            {/* Conversation cards list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {filteredList.map((conv) => {
                const isSelected = conv.id === selectedConvId;
                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {conv.initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{conv.contactName}</h4>
                        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{conv.time}</span>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5">
                        {renderChannelIcon(conv.channel)}
                        <span className="text-[10px] text-slate-500 font-medium">{conv.channelLabel}</span>
                      </div>

                      <p className="text-xs text-slate-500 truncate mt-1">{conv.lastMessage}</p>
                    </div>

                    {conv.unreadCount > 0 && (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {conv.unreadCount}
                      </span>
                    )}
                    {conv.badgeText && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 flex-shrink-0 whitespace-nowrap">
                        {conv.badgeText}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════
              COLUMN 2: Chat Detail (Center Column)
              ══════════════════════════════════════════════════════════════ */}
          <section className="flex-1 h-full bg-slate-50/70 flex flex-col overflow-hidden border-r border-slate-200">
            {/* Thread Header */}
            <div className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                  {activeConv.initials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{activeConv.contactName}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                      {activeConv.channelTag}
                    </span>
                    {convStatus === 'RESOLVED' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Đã giải quyết
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Phụ trách: <strong className="text-slate-600">{activeConv.assignedTo || 'Nam'}</strong>
                  </p>
                </div>
              </div>

              {/* Status Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleStatus}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-colors ${
                    convStatus === 'OPEN'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{convStatus === 'OPEN' ? 'Đóng hội thoại' : 'Mở lại hội thoại'}</span>
                </button>
                <button
                  type="button"
                  className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-200"
                >
                  •••
                </button>
              </div>
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-center">
                <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                  Hôm nay
                </span>
              </div>

              {/* Speech Bubbles */}
              {activeConv.messages.map((msg) => {
                const isCustomer = msg.senderType === 'customer';
                const isInternal = msg.senderType === 'internal';

                if (isInternal) {
                  return (
                    <div key={msg.id} className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                      <div className="flex items-center justify-between font-bold text-[11px]">
                        <span>🔒 Ghi chú nội bộ - {msg.senderName}</span>
                        <span className="text-amber-600 font-normal">{msg.time}</span>
                      </div>
                      <p>{msg.content}</p>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}>
                    <div
                      className={`max-w-md p-3.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                        isCustomer
                          ? 'bg-white text-slate-800 rounded-bl-sm border border-slate-100'
                          : 'bg-blue-600 text-white rounded-br-sm'
                      }`}
                    >
                      <p>{msg.content}</p>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 px-1">
                      <span>{msg.time}</span>
                      {!isCustomer && msg.delivered && (
                        <span className="text-blue-500 font-bold" title="Đã gửi">✓✓</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator when customer is replying */}
              {isTyping && (
                <div className="flex items-center gap-2 text-xs text-slate-400 italic bg-white px-3 py-2 rounded-2xl border border-slate-100 w-fit">
                  <span>{activeConv.contactName} đang soạn tin...</span>
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></span>
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></span>
                  </span>
                </div>
              )}

              {/* System Event Notice */}
              <div className="flex items-center justify-center">
                <span className="text-[11px] text-slate-500 bg-white border border-slate-200 px-3.5 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                  <span>👤</span>
                  <span><strong>Nam</strong> đã tiếp nhận cuộc trò chuyện</span>
                  <span className="text-slate-400">{activeConv.time}</span>
                </span>
              </div>

              {/* ✨ Gợi ý trả lời (AI Reply Suggestion Box) */}
              <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-2xl space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700">
                  <span className="text-sm">✨</span>
                  <span>Gợi ý trả lời</span>
                </div>

                <p className="text-xs text-slate-800 leading-relaxed font-medium">
                  {activeConv.aiSuggestion}
                </p>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-400">ⓘ Nhân viên duyệt trước khi gửi</span>
                  <button
                    type="button"
                    onClick={handleInsertDraft}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold shadow-xs transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>Chèn bản nháp</span>
                  </button>
                </div>
              </div>

              <div ref={messagesEndRef} />
            </div>

            {/* Reply Footer */}
            <div className="p-4 bg-white border-t border-slate-200 space-y-2 flex-shrink-0 relative">
              {/* Quick Reply Popup Menu */}
              {showQuickTemplates && (
                <div className="absolute bottom-full left-4 mb-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-30 animate-fadeIn space-y-1">
                  <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase">
                    Mẫu trả lời nhanh
                  </div>
                  {quickTemplates.map((tmpl, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setInputText(tmpl);
                        setShowQuickTemplates(false);
                      }}
                      className="p-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl cursor-pointer transition-colors"
                    >
                      {tmpl}
                    </div>
                  ))}
                </div>
              )}

              {/* Tabs: Trả lời khách | Ghi chú nội bộ */}
              <div className="flex items-center gap-4 text-xs font-semibold border-b border-slate-100 pb-2">
                <button
                  type="button"
                  onClick={() => setReplyTab('reply')}
                  className={`transition-colors ${
                    replyTab === 'reply' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Trả lời khách
                </button>
                <button
                  type="button"
                  onClick={() => setReplyTab('internal')}
                  className={`transition-colors ${
                    replyTab === 'internal' ? 'text-amber-600 font-bold' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Ghi chú nội bộ
                </button>
              </div>

              {/* Textarea Input */}
              <form onSubmit={handleSendMessage} className="space-y-2">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows="2"
                  placeholder={
                    replyTab === 'reply'
                      ? `Nhập tin nhắn qua ${activeConv.channelLabel}... (Bấm Enter để gửi)`
                      : 'Nhập ghi chú nội bộ (chỉ team thấy)...'
                  }
                  className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none transition-colors resize-none ${
                    replyTab === 'reply'
                      ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500'
                      : 'bg-amber-50/50 border-amber-200 text-amber-900 focus:bg-white focus:ring-2 focus:ring-amber-500'
                  }`}
                />

                {/* Toolbar buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-slate-400 text-xs">
                    <button type="button" className="hover:text-slate-600 flex items-center gap-1">
                      📎 <span>Đính kèm</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQuickTemplates(!showQuickTemplates)}
                      className="hover:text-blue-600 font-medium flex items-center gap-1"
                    >
                      📑 <span>Mẫu trả lời nhanh</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputText((prev) => prev + ' 😊')}
                      className="hover:text-slate-600 text-sm"
                    >
                      😊
                    </button>
                  </div>

                  {/* Send Button */}
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors active:scale-95"
                  >
                    <span>Gửi</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════════
              COLUMN 3: Hồ sơ khách hàng Sidebar (Right Column)
              ══════════════════════════════════════════════════════════════ */}
          <section className="w-72 xl:w-80 h-full bg-white border-l border-slate-200 p-5 flex flex-col justify-between overflow-y-auto flex-shrink-0 space-y-5">
            <div className="space-y-4">
              {/* Header with "Xem chi tiết ↗" */}
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900">Hồ sơ khách hàng</h3>
                <button
                  type="button"
                  onClick={onSelectCustomerProfile}
                  className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-0.5"
                >
                  <span>Xem chi tiết</span>
                  <span>↗</span>
                </button>
              </div>

              {/* Customer Hero Card */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                    {activeConv.initials}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{activeConv.contactName}</h4>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        {activeConv.tier}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Đã liên kết hồ sơ</span>
                    </div>
                  </div>
                </div>

                {/* Contact details */}
                <div className="space-y-1 text-xs text-slate-500 pt-1">
                  <div
                    onClick={() => setIsPhoneMasked(!isPhoneMasked)}
                    className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
                    title="Bấm để ẩn/hiện số điện thoại"
                  >
                    <span>📞</span>
                    <span>{isPhoneMasked ? '09xx xxx xxx' : activeConv.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>✉️</span>
                    <span>{activeConv.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>📍</span>
                    <span>{activeConv.location}</span>
                  </div>
                </div>
              </div>

              {/* 2 Stat Boxes */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span className="text-xs">🛒</span>
                    <span className="text-[10px] font-semibold uppercase">Tổng chi tiêu</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{activeConv.totalSpending}</p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span className="text-xs">📦</span>
                    <span className="text-[10px] font-semibold uppercase">Đơn hàng</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{activeConv.totalOrders}</p>
                </div>
              </div>

              {/* Đơn hàng gần nhất */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Đơn hàng gần nhất</span>
                  <span onClick={onSelectCustomerProfile} className="text-[11px] text-blue-600 cursor-pointer hover:underline">
                    Xem tất cả ↗
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-lg shadow-xs">
                    📷
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{activeConv.recentOrder.orderCode}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700">
                        {activeConv.recentOrder.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {activeConv.recentOrder.productName} • {activeConv.recentOrder.price}
                    </p>
                  </div>
                </div>
              </div>

              {/* Thao tác nhanh (2x2 Buttons Grid) */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-900">Thao tác nhanh</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenCreateOrder(activeConv)}
                    className="p-2.5 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>🛒</span>
                    <span>+ Tạo đơn</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenCreateQuote(activeConv)}
                    className="p-2.5 bg-slate-50 hover:bg-purple-50 hover:text-purple-700 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>📄</span>
                    <span>+ Báo giá</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenCreateTicket(activeConv)}
                    className="p-2.5 bg-slate-50 hover:bg-rose-50 hover:text-rose-700 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>🎧</span>
                    <span>+ Ticket</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenScheduleCare(activeConv)}
                    className="p-2.5 bg-slate-50 hover:bg-amber-50 hover:text-amber-700 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>📅</span>
                    <span>+ Lịch hẹn</span>
                  </button>
                </div>
              </div>

              {/* Lịch chăm sóc Card */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-900">Lịch chăm sóc</span>
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                      <span>📅</span> {activeConv.careSchedule.date}
                    </p>
                    <p className="text-xs text-slate-700 font-medium">
                      {activeConv.careSchedule.content}
                    </p>
                  </div>
                  <span className="text-slate-400 text-xs">&gt;</span>
                </div>
              </div>
            </div>

            {/* Bottom link: "Xem lịch sử các kênh ↗" */}
            <div className="pt-2 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={onSelectCustomerProfile}
                className="text-xs text-blue-600 font-semibold hover:underline"
              >
                Xem lịch sử các kênh ↗
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  window.OmnichannelInbox = OmnichannelInbox;
})();
