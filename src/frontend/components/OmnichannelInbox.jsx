/**
 * OmnichannelInbox Component (SmartSales Hộp Thư Đa Kênh - Kiến trúc Chia Nhỏ Module)
 * ────────────────────────────────────────────────────────────────────────────────────
 * Thành phần điều phối trung tâm (Orchestrator), kết nối 4 khối độc lập:
 * 1. window.InboxHelpers          -> Xử lý cây danh mục, sản phẩm đính kèm & lọc đa điều kiện
 * 2. window.InboxCategoryDrawer   -> Menu 3 gạch: Cây danh mục cha/con & chọn nhanh sản phẩm
 * 3. window.InboxConversationList -> Cột trái: Lọc kênh, chọn đa tài khoản TikTok Shop & danh sách chat
 * 4. window.InboxCustomerPanel    -> Cột phải: Hồ sơ khách hàng 360 & thao tác lên đơn nhanh
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
    const helpers = window.InboxHelpers || {};
    const initialMap = helpers.DEFAULT_CONVERSATIONS_MAP || {};
    const defaultAccounts = helpers.DEFAULT_BUSINESS_ACCOUNTS || [];

    const [inboxTab, setInboxTab] = useState('mine'); // 'mine' | 'unassigned'
    const [channelFilter, setChannelFilter] = useState('all');
    const [shopFilter, setShopFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedConvId, setSelectedConvId] = useState('conv_001');
    const [replyTab, setReplyTab] = useState('reply'); // 'reply' | 'internal'
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [showQuickTemplates, setShowQuickTemplates] = useState(false);
    const [convStatus, setConvStatus] = useState('OPEN'); // 'OPEN' | 'RESOLVED'

    const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
    const [categories, setCategories] = useState([]);
    const [categoryLoading, setCategoryLoading] = useState(false);
    const [categoryError, setCategoryError] = useState('');
    const [businessAccounts, setBusinessAccounts] = useState(defaultAccounts);

    const [isMobileThreadOpen, setIsMobileThreadOpen] = useState(false);
    const [isCustomerPanelOpen, setIsCustomerPanelOpen] = useState(
      () => window.innerWidth >= 1536
    );

    const [conversationsMap, setConversationsMap] = useState(initialMap);

    // 1. Nạp cây danh mục sản phẩm (kèm sản phẩm con) & danh sách tài khoản Business/TikTok Shop từ Backend
    useEffect(() => {
      let isMounted = true;

      async function loadCatalogAndAccounts() {
        setCategoryLoading(true);
        setCategoryError('');
        const headers = window.Api?.getAuthHeaders ? window.Api.getAuthHeaders() : {};

        try {
          const [catRes, accRes] = await Promise.all([
            fetch('/api/products/categories/all', { method: 'GET', headers }),
            fetch('/api/messages/business-accounts', { method: 'GET', headers }).catch(() => null),
          ]);

          if (!catRes.ok) {
            throw new Error(`HTTP error ${catRes.status}`);
          }

          const catPayload = await catRes.json();
          const catData = Array.isArray(catPayload.data) ? catPayload.data : [];
          if (isMounted) setCategories(catData);

          if (accRes && accRes.ok) {
            const accPayload = await accRes.json();
            if (Array.isArray(accPayload.data) && accPayload.data.length > 0 && isMounted) {
              setBusinessAccounts(accPayload.data);
            }
          }
        } catch (error) {
          if (isMounted) {
            setCategoryError('Không thể tải danh mục sản phẩm.');
            setCategories([]);
          }
        } finally {
          if (isMounted) setCategoryLoading(false);
        }
      }

      loadCatalogAndAccounts();
      return () => {
        isMounted = false;
      };
    }, []);

    // 2. Đồng bộ dữ liệu hội thoại truyền từ App vào map nội bộ
    useEffect(() => {
      if (!Array.isArray(conversations) || conversations.length === 0) return;

      setConversationsMap((previous) => {
        let changed = false;
        const next = { ...previous };

        conversations.forEach((conversation) => {
          const category =
            conversation.category ||
            conversation.categoryName ||
            conversation.metadata?.category ||
            conversation.productCategory;
          const subCategory =
            conversation.subCategory || conversation.metadata?.subCategory || null;
          const shopId =
            conversation.shopId ||
            conversation.metadata?.tiktokShopId ||
            conversation.channelId ||
            conversation.pageId ||
            null;

          const conversationName =
            conversation.contactName || conversation.customerName || conversation.name;
          const match = Object.values(next).find(
            (item) =>
              item.id === conversation.id ||
              item.contactName === conversationName ||
              item.contactName === conversation.customerName
          );

          if (match) {
            const nextCat = category || match.category;
            const nextSub = subCategory || match.subCategory;
            const nextShop = shopId || match.shopId;
            if (
              match.category !== nextCat ||
              match.subCategory !== nextSub ||
              match.shopId !== nextShop
            ) {
              next[match.id] = {
                ...match,
                category: nextCat,
                subCategory: nextSub,
                shopId: nextShop,
              };
              changed = true;
            }
          }
        });

        return changed ? next : previous;
      });
    }, [conversations]);

    // 3. Dựng cây danh mục cha - con kèm sản phẩm đính kèm
    const categoryTree = useMemo(() => {
      if (helpers.buildCategoryTree) {
        return helpers.buildCategoryTree(categories, conversationsMap);
      }
      return [];
    }, [categories, conversationsMap, helpers]);

    // 4. Lọc danh sách hội thoại theo Tab, Kênh, Tài khoản Shop, Danh mục, Từ khóa & Phân quyền User
    const filteredList = useMemo(() => {
      if (helpers.filterConversations) {
        return helpers.filterConversations(conversationsMap, {
          inboxTab,
          channelFilter,
          shopFilter,
          categoryFilter,
          searchQuery,
          categoryTree,
          currentUser,
        });
      }
      return Object.values(conversationsMap);
    }, [
      conversationsMap,
      inboxTab,
      channelFilter,
      shopFilter,
      categoryFilter,
      searchQuery,
      categoryTree,
      currentUser,
      helpers,
    ]);

    useEffect(() => {
      if (filteredList.length === 0) return;
      const selectedIsVisible = filteredList.some((conv) => conv.id === selectedConvId);
      if (!selectedIsVisible) {
        setSelectedConvId(filteredList[0].id);
      }
    }, [filteredList, selectedConvId]);

    const activeConv =
      conversationsMap[selectedConvId] ||
      filteredList[0] ||
      Object.values(conversationsMap)[0];

    const mineConversationCount = useMemo(
      () => Object.values(conversationsMap).filter((conv) => conv.isMine).length,
      [conversationsMap]
    );
    const unassignedConversationCount = useMemo(
      () => Object.values(conversationsMap).filter((conv) => !conv.isMine).length,
      [conversationsMap]
    );

    const activeShopName = useMemo(() => {
      if (shopFilter === 'all') return null;
      const found = businessAccounts.find((a) => (a.shopId || a.id) === shopFilter);
      return found ? found.name : shopFilter;
    }, [shopFilter, businessAccounts]);

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
    }, [activeConv?.messages, isTyping]);

    const handleInsertDraft = () => {
      if (!activeConv?.aiSuggestion) return;
      setInputText(activeConv.aiSuggestion);
      if (showToast) {
        showToast('Đã chèn bản nháp gợi ý của AI vào khung nhập tin nhắn!', 'success');
      }
    };

    const handleSelectProductForChat = (product, categoryName) => {
      if (!product) return;
      const formattedPrice = helpers.formatCurrencyVND
        ? helpers.formatCurrencyVND(product.price)
        : `${Number(product.price || 0).toLocaleString('vi-VN')}đ`;
      const draft = `Dạ sản phẩm "${product.name}" (${categoryName}) hiện có giá ${formattedPrice}${
        product.stock ? `, sẵn kho ${product.stock} sản phẩm` : ''
      }. Anh/chị lấy số lượng bao nhiêu để em lên đơn ạ?`;
      setCategoryFilter(categoryName);
      setReplyTab('reply');
      setInputText(draft);
      if (showToast) {
        showToast(`Đã chọn tư vấn sản phẩm "${product.name}"`, 'info');
      }
    };

    const handleSendMessage = (e) => {
      e?.preventDefault();
      if (!inputText.trim() || !activeConv) return;

      const sentText = inputText.trim();
      const nowTime = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const newMsg = {
        id: 'msg_' + Date.now(),
        senderType: replyTab === 'internal' ? 'internal' : 'employee',
        senderName: currentUser?.name || 'Nam',
        content: sentText,
        time: nowTime,
        delivered: true,
      };

      setConversationsMap((prev) => {
        const conv = prev[activeConv.id];
        return {
          ...prev,
          [activeConv.id]: {
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

      setTimeout(() => {
        setIsTyping(true);
      }, 700);

      setTimeout(() => {
        setIsTyping(false);

        let customerReply =
          'Dạ vâng shop! Shop gửi về Số 12 ngõ 86 Duy Tân, Cầu Giấy, Hà Nội giúp mình nhé.';
        let nextAiSuggestion =
          'Dạ em đã ghi nhận địa chỉ. Shop đang đóng gói gửi GHTK giao ngay trong chiều nay anh nhé!';

        if (
          sentText.toLowerCase().includes('địa chỉ') ||
          sentText.toLowerCase().includes('nhận hàng')
        ) {
          customerReply =
            'Địa chỉ của mình: Số 12 ngõ 86 Duy Tân, Cầu Giấy, Hà Nội. SĐT: 0987654321 nhé shop.';
          nextAiSuggestion =
            'Dạ em cảm ơn anh! Đơn hàng của anh đã được xác nhận và sẽ giao trong 1-2 ngày tới ạ.';
        } else if (
          sentText.toLowerCase().includes('giá') ||
          sentText.toLowerCase().includes('sản phẩm')
        ) {
          customerReply = 'Ok giá này tốt quá, gói hàng cẩn thận cho mình nhé!';
          nextAiSuggestion =
            'Dạ vâng anh yên tâm, hàng chính hãng bên em luôn bọc 3 lớp xốp khí chống va đập ạ!';
        }

        const replyMsg = {
          id: 'reply_' + Date.now(),
          senderType: 'customer',
          senderName: activeConv.contactName,
          content: customerReply,
          time: new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };

        setConversationsMap((prev) => {
          const conv = prev[activeConv.id];
          return {
            ...prev,
            [activeConv.id]: {
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

    const handleToggleStatus = () => {
      const nextStatus = convStatus === 'OPEN' ? 'RESOLVED' : 'OPEN';
      setConvStatus(nextStatus);
      if (showToast) {
        showToast(
          nextStatus === 'RESOLVED'
            ? 'Hội thoại đã được đánh dấu giải quyết.'
            : 'Đã mở lại hội thoại.',
          nextStatus === 'RESOLVED' ? 'success' : 'info'
        );
      }
    };

    const CategoryDrawerComp = window.InboxCategoryDrawer;
    const ConversationListComp = window.InboxConversationList;
    const CustomerPanelComp = window.InboxCustomerPanel;

    return (
      <div className="relative flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
        {/* Top Bar Inbox Header */}
        <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setCategoryMenuOpen(true)}
              className="w-10 h-10 shrink-0 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-500 hover:text-blue-600 flex items-center justify-center transition-colors"
              title="Danh mục sản phẩm & Sản phẩm con"
              aria-label="Mở danh mục sản phẩm"
            >
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-bold text-slate-900 tracking-tight truncate">
                  Hộp thư đa kênh
                </h1>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-[9px] font-bold tracking-wide text-slate-400 whitespace-nowrap">
                  INBOX
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {categoryFilter === 'all' ? 'Tất cả danh mục' : `Danh mục · ${categoryFilter}`}
                {activeShopName ? ` • ${activeShopName}` : ''}
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 text-[11px]">
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Hội thoại
            </span>
            <span className="text-slate-300">/</span>
            <button
              type="button"
              onClick={onSelectCustomerProfile}
              className="px-2 py-1.5 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            >
              Khách hàng
            </button>
            <span className="text-slate-300">/</span>
            <button
              type="button"
              onClick={onOpenCreateOrder}
              className="px-2 py-1.5 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            >
              Tạo đơn
            </button>
          </div>
        </div>

        {/* Sub-Component 1: Menu 3 Gạch (Cây Danh Mục & Sản Phẩm Con) */}
        {CategoryDrawerComp && (
          <CategoryDrawerComp
            isOpen={categoryMenuOpen}
            onClose={() => setCategoryMenuOpen(false)}
            categoryTree={categoryTree}
            categoryFilter={categoryFilter}
            onSelectCategory={(catName) => setCategoryFilter(catName)}
            onSelectProductForChat={handleSelectProductForChat}
            totalConversationCount={Object.keys(conversationsMap).length}
            loading={categoryLoading}
            error={categoryError}
          />
        )}

        {/* 3 Columns Body Grid */}
        <div className="relative flex-1 flex flex-row overflow-hidden">
          {/* Sub-Component 2: Cột 1 - Danh sách hội thoại & Bộ chọn đa tài khoản TikTok Shop */}
          {ConversationListComp && (
            <ConversationListComp
              filteredList={filteredList}
              selectedConvId={selectedConvId}
              onSelectConversation={(id) => {
                setSelectedConvId(id);
                setIsMobileThreadOpen(true);
              }}
              inboxTab={inboxTab}
              onChangeInboxTab={setInboxTab}
              mineCount={mineConversationCount}
              unassignedCount={unassignedConversationCount}
              channelFilter={channelFilter}
              onChangeChannelFilter={setChannelFilter}
              shopFilter={shopFilter}
              onChangeShopFilter={setShopFilter}
              businessAccounts={businessAccounts}
              searchQuery={searchQuery}
              onChangeSearchQuery={setSearchQuery}
              isMobileThreadOpen={isMobileThreadOpen}
            />
          )}

          {/* Cột 2: Luồng tin nhắn & Trả lời (Center Thread Column) */}
          {activeConv && (
            <section
              className={`${
                isMobileThreadOpen ? 'flex' : 'hidden lg:flex'
              } flex-1 min-w-0 h-full bg-slate-50/70 flex-col overflow-hidden border-r border-slate-200`}
            >
              {/* Thread Header */}
              <div className="min-h-16 bg-white border-b border-slate-200 px-4 md:px-6 py-2 flex items-center justify-between gap-3 flex-shrink-0 shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsMobileThreadOpen(false)}
                    aria-label="Quay lại danh sách hội thoại"
                    className="w-9 h-9 shrink-0 rounded-xl border border-slate-200 bg-white text-slate-500 flex items-center justify-center lg:hidden"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                    {activeConv.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {activeConv.contactName}
                      </h3>
                      <span className="hidden sm:inline-flex text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                        {activeConv.channelTag}
                      </span>
                      {activeConv.category && (
                        <span className="hidden md:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {activeConv.category}
                          {activeConv.subCategory ? ` · ${activeConv.subCategory}` : ''}
                        </span>
                      )}
                      {convStatus === 'RESOLVED' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Đã giải quyết
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      Phụ trách: <strong className="text-slate-600">{activeConv.assignedTo || 'Nam'}</strong>
                    </p>
                  </div>
                </div>

                {/* Status Action Buttons */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsCustomerPanelOpen((open) => !open)}
                    aria-label={isCustomerPanelOpen ? 'Ẩn thông tin khách hàng' : 'Hiện thông tin khách hàng'}
                    aria-expanded={isCustomerPanelOpen}
                    title={isCustomerPanelOpen ? 'Ẩn thông tin khách hàng' : 'Hiện thông tin khách hàng'}
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${
                      isCustomerPanelOpen
                        ? 'bg-blue-50 border-blue-100 text-blue-600'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-blue-600'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
                      <path strokeLinecap="round" d="M15 4.5v15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleStatus}
                    className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-colors ${
                      convStatus === 'OPEN'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    }`}
                  >
                    <svg className="hidden sm:block w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="hidden sm:inline">
                      {convStatus === 'OPEN' ? 'Đóng hội thoại' : 'Mở lại hội thoại'}
                    </span>
                    <span className="sm:hidden">{convStatus === 'OPEN' ? 'Đóng' : 'Mở lại'}</span>
                  </button>
                </div>
              </div>

              {/* Message Stream */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                <div className="flex items-center justify-center">
                  <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                    Hôm nay
                  </span>
                </div>

                {activeConv.messages.map((msg) => {
                  const isCustomer = msg.senderType === 'customer';
                  const isInternal = msg.senderType === 'internal';

                  if (isInternal) {
                    return (
                      <div
                        key={msg.id}
                        className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1"
                      >
                        <div className="flex items-center justify-between font-bold text-[11px]">
                          <span>🔒 Ghi chú nội bộ - {msg.senderName}</span>
                          <span className="text-amber-600 font-normal">{msg.time}</span>
                        </div>
                        <p>{msg.content}</p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                    >
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
                          <span className="text-blue-500 font-bold" title="Đã gửi">
                            ✓✓
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isTyping && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 italic bg-white px-3 py-2 rounded-2xl border border-slate-100 w-fit">
                    <span>{activeConv.contactName} đang soạn tin...</span>
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></span>
                      <span
                        className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: '0.15s' }}
                      ></span>
                      <span
                        className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: '0.3s' }}
                      ></span>
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-center">
                  <span className="text-[11px] text-slate-500 bg-white border border-slate-200 px-3.5 py-1 rounded-full flex items-center gap-1.5 shadow-xs">
                    <span>👤</span>
                    <span>
                      <strong>{activeConv.assignedTo || 'Nam'}</strong> đã tiếp nhận cuộc trò chuyện
                    </span>
                    <span className="text-slate-400">{activeConv.time}</span>
                  </span>
                </div>

                {/* AI Reply Suggestion Box */}
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
                      <span>Chèn bản nháp</span>
                    </button>
                  </div>
                </div>

                <div ref={messagesEndRef} />
              </div>

              {/* Reply Footer */}
              <div className="p-4 bg-white border-t border-slate-200 space-y-2 flex-shrink-0 relative">
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
                        ? `Nhập tin nhắn qua ${activeConv.channelTag || activeConv.channelLabel}... (Bấm Enter để gửi)`
                        : 'Nhập ghi chú nội bộ (chỉ team thấy)...'
                    }
                    className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none transition-colors resize-none ${
                      replyTab === 'reply'
                        ? 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500'
                        : 'bg-amber-50/50 border-amber-200 text-amber-900 focus:bg-white focus:ring-2 focus:ring-amber-500'
                    }`}
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-slate-400 text-xs">
                      <button
                        type="button"
                        onClick={() => setCategoryMenuOpen(true)}
                        className="hover:text-blue-600 font-medium flex items-center gap-1"
                      >
                        🏷️ <span>Chọn sản phẩm</span>
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

                    <button
                      type="submit"
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors active:scale-95"
                    >
                      <span>Gửi</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    </button>
                  </div>
                </form>
              </div>
            </section>
          )}

          {/* Sub-Component 3: Cột 3 - Hồ sơ khách hàng 360 & Thao tác lên đơn */}
          {CustomerPanelComp && (
            <CustomerPanelComp
              activeConv={activeConv}
              isOpen={isCustomerPanelOpen}
              onClose={() => setIsCustomerPanelOpen(false)}
              onSelectCustomerProfile={onSelectCustomerProfile}
              onOpenCreateOrder={onOpenCreateOrder}
              onOpenCreateQuote={onOpenCreateQuote}
              onOpenCreateTicket={onOpenCreateTicket}
              onOpenScheduleCare={onOpenScheduleCare}
            />
          )}

          {/* Empty Filter State */}
          {filteredList.length === 0 && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-50/95 p-6 text-center">
              <div className="max-w-sm">
                <div className="mx-auto w-11 h-11 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="11" cy="11" r="7" />
                    <path strokeLinecap="round" d="m16 16 4 4" />
                  </svg>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-800">Không có hội thoại phù hợp</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Thử đổi danh mục, tài khoản shop hoặc xóa bộ lọc để xem thêm hội thoại.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setInboxTab('mine');
                    setChannelFilter('all');
                    setShopFilter('all');
                    setCategoryFilter('all');
                    setSearchQuery('');
                  }}
                  className="mt-4 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Xóa bộ lọc
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  window.OmnichannelInbox = OmnichannelInbox;
})();
