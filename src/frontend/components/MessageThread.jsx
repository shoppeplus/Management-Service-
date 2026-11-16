/**
 * MessageThread Component
 * Center panel - chat thread component.
 * CDN-loaded React (window.React) - No import statements.
 */

const { useState, useEffect, useRef, useCallback, useMemo } = React;

/**
 * Format message date label: "Hom nay", "Hom qua", or "DD/MM/YYYY"
 */
function formatMessageDateHeader(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) return 'Hôm nay';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Hôm qua';

  const pad = (n) => String(n).padStart(2, '0');
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Format message time: "09:30"
 */
function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Helper to get initials if not imported
 */
function getCustomerInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const first = parts[0].charAt(0);
  const last = parts[parts.length - 1].charAt(0);
  return (first + last).toUpperCase();
}

/**
 * Quick reply pill presets
 */
const QUICK_REPLIES = [
  'Cảm ơn bạn!',
  'Đơn hàng đã xác nhận',
  'Sẽ liên hệ ngay',
  'Shop còn hàng bạn nhé',
  'Kiểm tra hàng trước khi thanh toán',
];

/**
 * Popular emojis list
 */
const POPULAR_EMOJIS = ['😊', '👍', '❤️', '🙏', '📦', '✨', '🌸', '🔥', '💯', '🛵', '💬', '📞'];

/**
 * MessageThread Main Component
 */
function MessageThread({
  conversationId,
  conversation,
  customer,
  messages: propMessages,
  currentUser,
  onSendMessage,
  loading = false,
  onBackToChat,
}) {
  // Input state
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [isCustomerTyping, setIsCustomerTyping] = useState(false);
  const [showCustomerInfoModal, setShowCustomerInfoModal] = useState(false);
  const [copyPhoneSuccess, setCopyPhoneSuccess] = useState(false);

  // Local message state for immediate responsive UI
  const [localMessages, setLocalMessages] = useState([]);

  // Refs
  const scrollContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // AppContext reference if available
  const appContext =
    typeof window !== 'undefined' && window.AppContext
      ? React.useContext(window.AppContext)
      : null;

  // Active conversation resolution
  const activeConvId = conversationId || conversation?.id;
  const activeConv = useMemo(() => {
    if (conversation) return conversation;
    if (
      activeConvId &&
      typeof window !== 'undefined' &&
      window.MockData &&
      Array.isArray(window.MockData.conversations)
    ) {
      return window.MockData.conversations.find((c) => c.id === activeConvId) || null;
    }
    return null;
  }, [conversation, activeConvId]);

  // Active customer resolution
  const activeCustomer = useMemo(() => {
    if (customer) return customer;
    if (
      activeConv &&
      typeof window !== 'undefined' &&
      window.MockData &&
      Array.isArray(window.MockData.customers)
    ) {
      return (
        window.MockData.customers.find(
          (c) => c.id === activeConv.contactId || c.name === activeConv.contactName
        ) || null
      );
    }
    return null;
  }, [customer, activeConv]);

  // Combined messages list
  const currentMessages = useMemo(() => {
    // 1. If propMessages is provided and non-empty, use it
    if (propMessages && Array.isArray(propMessages) && propMessages.length > 0) {
      return propMessages;
    }
    // 2. Fall back to window.MockData.messages[activeConvId]
    if (
      activeConvId &&
      typeof window !== 'undefined' &&
      window.MockData &&
      window.MockData.messages &&
      window.MockData.messages[activeConvId]
    ) {
      return window.MockData.messages[activeConvId];
    }
    // 3. Fall back to localMessages
    return localMessages;
  }, [propMessages, activeConvId, localMessages]);

  // Auto-resize textarea handler
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 120); // max 4 rows ~ 120px
      textareaRef.current.style.height = `${Math.max(newHeight, 42)}px`;
    }
  };

  // Quick reply pill click handler
  const handleSelectQuickReply = (text) => {
    setInputText((prev) => (prev ? `${prev} ${text}` : text));
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Add emoji to input
  const handleAddEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Core send message handler
  const handleSend = (type = 'text', contentOverride = null) => {
    const content = contentOverride !== null ? contentOverride : inputText.trim();
    if (!content) return;

    if (onSendMessage) {
      onSendMessage(content, type);
    } else {
      // Fallback local insertion if onSendMessage prop is missing
      const newMsg = {
        id: 'msg-' + Date.now(),
        conversationId: activeConvId,
        content,
        type,
        senderId: currentUser?.uid || 'EMP001',
        senderName: currentUser?.name || 'Nguyen Van A',
        senderType: 'employee',
        timestamp: new Date().toISOString(),
        read: true,
      };

      if (
        typeof window !== 'undefined' &&
        window.MockData &&
        window.MockData.messages &&
        activeConvId
      ) {
        if (!window.MockData.messages[activeConvId]) {
          window.MockData.messages[activeConvId] = [];
        }
        window.MockData.messages[activeConvId].push(newMsg);
      }
      setLocalMessages((prev) => [...prev, newMsg]);
    }

    if (contentOverride === null) {
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '42px';
      }
    }

    // Scroll to bottom
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Simulate occasional customer typing feedback for realistic experience
    if (Math.random() > 0.6) {
      setTimeout(() => setIsCustomerTyping(true), 1200);
      setTimeout(() => setIsCustomerTyping(false), 4500);
    }
  };

  // Key down on textarea: Enter sends, Shift+Enter makes newline
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend('text');
    }
  };

  // Handle image upload from paperclip
  const handleImageFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target.result;
      handleSend('image', dataUrl);
    };
    reader.readAsDataURL(file);

    // Reset file input
    e.target.value = '';
  };

  // Handle scroll detection for "Scroll to bottom" button
  const handleScroll = (e) => {
    const target = e.target;
    // In flex-col-reverse, scrollTop is 0 at the visual bottom, and negative when scrolled up in modern Chromium
    const distanceFromBottom = Math.abs(target.scrollTop);
    setShowScrollBottom(distanceFromBottom > 90);
  };

  // Scroll to bottom helper
  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Quick Order button click handler
  const handleQuickOrder = () => {
    if (appContext && appContext.setActiveTab) {
      appContext.setActiveTab('order');
    }
  };

  // Copy phone number helper
  const handleCopyPhone = (phone) => {
    if (!phone) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(phone);
      setCopyPhoneSuccess(true);
      setTimeout(() => setCopyPhoneSuccess(false), 2000);
    }
  };

  // Close modals on Escape key
  useEffect(() => {
    const handleGlobalKey = (e) => {
      if (e.key === 'Escape') {
        setLightboxImage(null);
        setShowCustomerInfoModal(false);
        setShowEmojiPicker(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // -------------------------------------------------------------------------
  // Empty State: When no conversation is selected
  // -------------------------------------------------------------------------
  if (!activeConv) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50 select-none">
        <div className="w-20 h-20 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-4 text-indigo-600 shadow-sm">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h3 className="text-base font-bold text-slate-800">Chọn cuộc hội thoại để bắt đầu</h3>
        <p className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed">
          Chọn một khách hàng từ danh sách bên trái để đọc tin nhắn, tư vấn sản phẩm và tạo đơn
          hàng nhanh chóng.
        </p>
      </div>
    );
  }

  // Build Chronological Visual Items (Grouped by Date), then reverse for flex-col-reverse
  const visualItems = [];
  let lastDateHeader = null;

  for (let i = 0; i < currentMessages.length; i++) {
    const msg = currentMessages[i];
    const dateLabel = formatMessageDateHeader(msg.timestamp);
    if (dateLabel && dateLabel !== lastDateHeader) {
      visualItems.push({
        type: 'date_header',
        id: `date-${dateLabel}-${i}`,
        label: dateLabel,
      });
      lastDateHeader = dateLabel;
    }
    visualItems.push({
      type: 'message',
      id: msg.id || `msg-${i}`,
      data: msg,
    });
  }

  // Reverse list so top of DOM is bottom of visual chat in flex-col-reverse
  const reversedItems = [...visualItems].reverse();

  // Contact details
  const customerName = activeConv.contactName || activeCustomer?.name || 'Khách hàng';
  const customerPhone = activeConv.contactPhone || activeCustomer?.phone || '0987654321';
  const channelType = (activeConv.channelType || 'facebook').toLowerCase();
  const isOnline = activeConv.isOnline !== false;

  return (
    <div className="h-full flex flex-col bg-slate-50 relative select-none">
      {/* --------------------------------------------------------------------- */}
      {/* 1. Header Bar */}
      {/* --------------------------------------------------------------------- */}
      <header className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0 z-10 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile back button */}
          {onBackToChat && (
            <button
              onClick={onBackToChat}
              className="md:hidden p-1.5 -ml-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
              title="Quay lại danh sách"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Customer Avatar with Online Indicator */}
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200 overflow-hidden shadow-xs">
              {activeConv.contactAvatar ? (
                <img
                  src={activeConv.contactAvatar}
                  alt={customerName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <span>{getCustomerInitials(customerName)}</span>
              )}
            </div>
            {/* Online status dot (green / gray) */}
            <span
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                isOnline ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
              title={isOnline ? 'Đang trực tuyến' : 'Ngoại tuyến'}
            ></span>
          </div>

          {/* Customer Info & Channel Badge */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{customerName}</h3>

              {/* Channel Type Badge (FB = blue, TT = black) */}
              {channelType === 'facebook' && (
                <span className="bg-[#1877F2] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5 flex-shrink-0">
                  FB
                </span>
              )}
              {channelType === 'tiktok' && (
                <span className="bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5 flex-shrink-0">
                  TikTok
                </span>
              )}
              {channelType !== 'facebook' && channelType !== 'tiktok' && (
                <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0">
                  {channelType.toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="truncate">{customerPhone}</span>
              <span className="text-slate-300">•</span>
              <span className={isOnline ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                {isOnline ? 'Trực tuyến' : 'Vừa mới truy cập'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons in Header */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Phone call / copy button */}
          <button
            onClick={() => handleCopyPhone(customerPhone)}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors relative"
            title="Gọi điện hoặc sao chép SĐT"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            {copyPhoneSuccess && (
              <span className="absolute -bottom-7 right-0 text-[10px] bg-slate-800 text-white px-2 py-0.5 rounded shadow-md whitespace-nowrap">
                Đã chép SĐT!
              </span>
            )}
          </button>

          {/* Info icon (Toggle customer details modal) */}
          <button
            onClick={() => setShowCustomerInfoModal(!showCustomerInfoModal)}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Thông tin chi tiết khách hàng"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>

          {/* "Tạo đơn" Quick Button */}
          <button
            onClick={handleQuickOrder}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
            title="Tạo đơn hàng nhanh cho khách"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            <span className="hidden sm:inline">Tạo đơn</span>
          </button>
        </div>
      </header>

      {/* --------------------------------------------------------------------- */}
      {/* 2. Message Area (flex-col-reverse for auto-scroll to bottom) */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto flex flex-col-reverse p-4 scrollbar-thin space-y-reverse space-y-3"
        >
          {/* "Dang nhap..." Typing indicator (Rendered first in DOM = Bottom-most visually) */}
          {isCustomerTyping && (
            <div className="flex items-end gap-2 self-start slide-in pt-1 pb-1">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shadow-xs flex-shrink-0">
                {getCustomerInitials(customerName)}
              </div>
              <div className="bg-slate-200/90 text-slate-600 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1.5 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"></span>
                <span className="text-[11px] text-slate-500 font-medium ml-1">Đang nhập...</span>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="py-4 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <div className="spinner spinner-slate spinner-sm"></div>
              <span>Đang đồng bộ tin nhắn...</span>
            </div>
          )}

          {/* Messages list */}
          {reversedItems.map((item) => {
            // A. Date Header Badge
            if (item.type === 'date_header') {
              return (
                <div key={item.id} className="flex justify-center my-2">
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-200/80 px-3 py-1 rounded-full shadow-xs border border-slate-300/40">
                    {item.label}
                  </span>
                </div>
              );
            }

            // B. Message Bubble
            const msg = item.data;
            const isEmployee = msg.senderType === 'employee';
            const isSystem = msg.type === 'system' || msg.senderType === 'system';
            const isImage = msg.type === 'image';
            const timeStr = formatMessageTime(msg.timestamp);

            // System Message (Centered gray badge)
            if (isSystem) {
              return (
                <div key={item.id} className="flex justify-center my-1.5">
                  <div className="text-[11px] text-slate-500 bg-slate-200/60 border border-slate-300/50 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-xs max-w-md text-center">
                    <span>⚙️</span>
                    <span>{msg.content}</span>
                  </div>
                </div>
              );
            }

            // Customer Message (Left-aligned, gray bubble, small avatar)
            if (!isEmployee) {
              return (
                <div key={item.id} className="flex items-end gap-2 max-w-[82%] self-start group">
                  <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0 shadow-xs overflow-hidden">
                    {activeConv.contactAvatar ? (
                      <img src={activeConv.contactAvatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>{getCustomerInitials(customerName)}</span>
                    )}
                  </div>

                  <div className="flex flex-col items-start min-w-0">
                    {isImage ? (
                      <div
                        onClick={() => setLightboxImage(msg.content)}
                        className="rounded-2xl rounded-bl-sm overflow-hidden border border-slate-200/80 shadow-xs cursor-pointer group/img relative bg-slate-100"
                      >
                        <img
                          src={msg.content}
                          alt="Ảnh đính kèm"
                          className="max-w-64 max-h-56 object-cover hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <svg className="w-6 h-6 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                          </svg>
                        </div>
                      </div>
                    ) : (
                      <div className="bubble-customer bg-slate-200 text-slate-900 rounded-2xl rounded-bl-sm px-3.5 py-2 text-xs sm:text-sm shadow-xs leading-relaxed break-words">
                        {msg.content}
                      </div>
                    )}
                    <span className="text-[10px] text-slate-400 mt-1 ml-1 font-normal">
                      {timeStr}
                    </span>
                  </div>
                </div>
              );
            }

            // Employee Message (Right-aligned, indigo-600 bubble, white text)
            return (
              <div key={item.id} className="flex items-end justify-end gap-2 max-w-[82%] self-end group">
                <div className="flex flex-col items-end min-w-0">
                  {isImage ? (
                    <div
                      onClick={() => setLightboxImage(msg.content)}
                      className="rounded-2xl rounded-br-sm overflow-hidden border border-indigo-200/80 shadow-xs cursor-pointer group/img relative bg-indigo-50"
                    >
                      <img
                        src={msg.content}
                        alt="Ảnh đính kèm"
                        className="max-w-64 max-h-56 object-cover hover:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <svg className="w-6 h-6 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <div className="bubble-employee bg-indigo-600 text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-xs sm:text-sm shadow-xs leading-relaxed break-words">
                      {msg.content}
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-1 mr-1">
                    <span className="text-[10px] text-slate-400 font-normal">{timeStr}</span>
                    <span className="text-[10px] text-indigo-500 font-bold" title="Đã gửi">
                      ✓✓
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Scroll To Bottom Floating Button */}
        {showScrollBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 z-20 bg-white hover:bg-slate-50 text-indigo-600 p-2 rounded-full shadow-lg border border-slate-200 transition-all transform hover:scale-110 flex items-center justify-center"
            title="Cuộn xuống tin nhắn mới nhất"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 3. Input Area at Bottom */}
      {/* --------------------------------------------------------------------- */}
      <footer className="p-3 bg-white border-t border-slate-200 flex-shrink-0 space-y-2">
        {/* Quick Reply Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 flex-shrink-0 tracking-wider">
            Gợi ý:
          </span>
          {QUICK_REPLIES.map((pill, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectQuickReply(pill)}
              className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-full font-medium whitespace-nowrap transition-colors border border-slate-200/70"
            >
              {pill}
            </button>
          ))}
        </div>

        {/* Text Input Row */}
        <div className="flex items-end gap-2 relative">
          {/* Hidden File Input for Image Upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFileChange}
            accept="image/*"
            className="hidden"
          />

          {/* Left Buttons: Paperclip (image upload) + Emoji button */}
          <div className="flex items-center gap-1 pb-1">
            <button
              type="button"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Gửi hình ảnh (đính kèm file)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-2 rounded-lg transition-colors ${
                showEmojiPicker
                  ? 'text-indigo-600 bg-indigo-50'
                  : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'
              }`}
              title="Chèn biểu tượng cảm xúc"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          </div>

          {/* Emoji Popover */}
          {showEmojiPicker && (
            <div className="absolute bottom-14 left-2 z-30 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 flex flex-wrap gap-1.5 w-60 animate-fade-in">
              <div className="w-full flex justify-between items-center text-[11px] text-slate-400 font-medium px-1 mb-1">
                <span>Biểu tượng phổ biến</span>
                <button
                  onClick={() => setShowEmojiPicker(false)}
                  className="hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
              {POPULAR_EMOJIS.map((emoji, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAddEmoji(emoji)}
                  className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Textarea with auto-resize (min 1 row, max 4 rows) */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              rows="1"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tin nhắn tư vấn (Enter gửi, Shift+Enter xuống dòng)..."
              className="message-input w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all placeholder:text-slate-400 leading-normal"
              style={{ minHeight: '42px', maxHeight: '120px' }}
            />
            {/* Character count for long messages */}
            {inputText.length > 0 && (
              <span className="absolute bottom-1.5 right-2 text-[10px] text-slate-400 pointer-events-none">
                {inputText.length}/500
              </span>
            )}
          </div>

          {/* Right: Send button (paper plane icon, indigo) */}
          <button
            type="button"
            onClick={() => handleSend('text')}
            disabled={!inputText.trim()}
            className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-xs transition-colors flex items-center justify-center flex-shrink-0 pb-0.5"
            title="Gửi tin nhắn (Enter)"
          >
            <svg className="w-4 h-4 transform rotate-45 -mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </footer>

      {/* --------------------------------------------------------------------- */}
      {/* 4. Customer Info Quick Drawer / Modal */}
      {/* --------------------------------------------------------------------- */}
      {showCustomerInfoModal && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowCustomerInfoModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>👤 Thông tin khách hàng</span>
              </h3>
              <button
                onClick={() => setShowCustomerInfoModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-bold text-base flex items-center justify-center border border-indigo-200">
                  {getCustomerInitials(customerName)}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{customerName}</h4>
                  <p className="text-slate-500">{customerPhone}</p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-200/60">
                <div className="flex justify-between">
                  <span className="text-slate-500">Kênh:</span>
                  <span className="font-medium text-slate-800 uppercase">{channelType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Địa chỉ:</span>
                  <span className="font-medium text-slate-800 text-right max-w-[200px] truncate">
                    {activeCustomer?.address || 'Chưa cập nhật'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tổng đơn đã mua:</span>
                  <span className="font-bold text-indigo-600">
                    {activeCustomer?.totalOrders || 0} đơn
                  </span>
                </div>
                {activeCustomer?.notes && (
                  <div className="pt-2 border-t border-slate-200/60">
                    <span className="text-slate-500 block mb-0.5">Ghi chú:</span>
                    <p className="text-slate-700 italic">{activeCustomer.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setShowCustomerInfoModal(false);
                  handleQuickOrder();
                }}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <span>📦 Chốt đơn cho khách này</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 5. Image Lightbox Modal */}
      {/* --------------------------------------------------------------------- */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-800 transition-colors shadow-lg"
              title="Đóng (Escape)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Enlarged Image Preview */}
            <img
              src={lightboxImage}
              alt="Phóng to ảnh"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Assign to window object
if (typeof window !== 'undefined') {
  window.MessageThread = MessageThread;
  window.formatMessageDateHeader = formatMessageDateHeader;
  window.formatMessageTime = formatMessageTime;
}

