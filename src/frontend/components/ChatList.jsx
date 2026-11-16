/**
 * ChatList Component
 * Left sidebar - conversation list component.
 * CDN-loaded React (window.React) - No import statements.
 */

const { useState, useEffect, useRef, useCallback, useMemo } = React;

/**
 * Helper function: getRelativeTime(timestamp)
 * Formats timestamps into human-readable Vietnamese relative time
 * Examples: "vua xong", "5 phut truoc", "1 gio truoc", "Hom qua", "15/11"
 */
function getRelativeTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60 && diffSec >= 0) {
    return 'vừa xong';
  }
  if (diffMin < 60 && diffMin > 0) {
    return `${diffMin} phút trước`;
  }

  // Check if today
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    return `${diffHour} giờ trước`;
  }

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) {
    return 'Hôm qua';
  }

  if (diffDay < 7 && diffDay > 0) {
    return `${diffDay} ngày trước`;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  return y === now.getFullYear() ? `${d}/${m}` : `${d}/${m}/${y}`;
}

/**
 * Helper function: getInitials(name)
 * Returns first letters of first and last name (e.g. "Nguyen Thi Mai" -> "NM")
 */
function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  const first = parts[0].charAt(0);
  const last = parts[parts.length - 1].charAt(0);
  return (first + last).toUpperCase();
}

/**
 * Helper function: getAvatarColor(name)
 * Returns consistent color palette { bg, text, border } based on name hash
 */
function getAvatarColor(name) {
  const palette = [
    { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
    { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
    { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
    { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200' },
    { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' },
    { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
    { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
    { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
    { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
    { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  ];
  if (!name) return palette[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index];
}

/**
 * Channel Icon / Badge component
 */
function ChannelBadge({ channelType, className = '' }) {
  const type = (channelType || '').toLowerCase();

  if (type === 'facebook') {
    return (
      <span
        title="Facebook Messenger"
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#1877F2] text-white shadow-xs ${className}`}
      >
        <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      </span>
    );
  }

  if (type === 'tiktok') {
    return (
      <span
        title="TikTok Shop"
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-black text-white shadow-xs ${className}`}
      >
        <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
      </span>
    );
  }

  // Fallback / Zalo
  return (
    <span
      title={channelType ? channelType.toUpperCase() : 'Chat'}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-[8px] font-bold text-white shadow-xs ${className}`}
    >
      {type === 'zalo' ? 'Z' : (type.charAt(0) || 'C').toUpperCase()}
    </span>
  );
}

/**
 * ChatList Main Component
 */
function ChatList({
  conversations,
  selectedConversationId,
  selectedConversation,
  onSelectConversation,
  onNewConversation,
  loading = false,
}) {
  // Search query & filter tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread' | 'facebook' | 'tiktok'

  // Resolve raw conversations data: prop or window.MockData fallback
  const rawConversations = useMemo(() => {
    if (conversations && Array.isArray(conversations) && conversations.length > 0) {
      return conversations;
    }
    if (typeof window !== 'undefined' && window.MockData && Array.isArray(window.MockData.conversations)) {
      return window.MockData.conversations;
    }
    return [];
  }, [conversations]);

  // Lookup phone helper from customers list
  const getCustomerPhone = useCallback((conv) => {
    if (conv.contactPhone) return conv.contactPhone;
    if (conv.phone) return conv.phone;
    if (typeof window !== 'undefined' && window.MockData && Array.isArray(window.MockData.customers)) {
      const match = window.MockData.customers.find(
        (c) => c.id === conv.contactId || c.name === conv.contactName
      );
      if (match && match.phone) return match.phone;
    }
    return '';
  }, []);

  // Filter conversations based on search query and active tab
  const filteredConversations = useMemo(() => {
    return rawConversations.filter((conv) => {
      // 1. Channel / Read status filter
      if (activeFilter === 'unread' && (!conv.unreadCount || conv.unreadCount <= 0)) {
        return false;
      }
      if (activeFilter === 'facebook' && (conv.channelType || '').toLowerCase() !== 'facebook') {
        return false;
      }
      if (activeFilter === 'tiktok' && (conv.channelType || '').toLowerCase() !== 'tiktok') {
        return false;
      }

      // 2. Search query filter (customer name or phone)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const name = (conv.contactName || '').toLowerCase();
        const phone = (getCustomerPhone(conv) || '').toLowerCase();
        const lastMsg = (conv.lastMessage || '').toLowerCase();

        const matchesName = name.includes(query);
        const matchesPhone = phone.includes(query);
        const matchesMsg = lastMsg.includes(query);

        if (!matchesName && !matchesPhone && !matchesMsg) {
          return false;
        }
      }

      return true;
    });
  }, [rawConversations, activeFilter, searchQuery, getCustomerPhone]);

  // Counts for tabs
  const tabCounts = useMemo(() => {
    const total = rawConversations.length;
    const unread = rawConversations.filter((c) => (c.unreadCount || 0) > 0).length;
    const fb = rawConversations.filter((c) => (c.channelType || '').toLowerCase() === 'facebook').length;
    const tt = rawConversations.filter((c) => (c.channelType || '').toLowerCase() === 'tiktok').length;
    return { total, unread, fb, tt };
  }, [rawConversations]);

  // Determine active conversation id
  const currentSelectedId =
    selectedConversationId ||
    selectedConversation?.id ||
    (typeof selectedConversation === 'string' ? selectedConversation : null);

  // Handle card selection
  const handleSelectCard = (conv) => {
    if (onSelectConversation) {
      // Supports both onSelectConversation(convId) and onSelectConversation(conv)
      onSelectConversation(conv.id, conv);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white select-none border-r border-slate-200">
      {/* 1. Header & Search Bar */}
      <div className="p-3 border-b border-slate-200 bg-white space-y-2.5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-1.5">
              <span>Hội thoại</span>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {rawConversations.length}
              </span>
            </h2>
          </div>
          {onNewConversation && (
            <button
              onClick={onNewConversation}
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Cuộc trò chuyện mới"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>

        {/* Search input with SVG magnifying glass */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc SĐT..."
            className="w-full text-xs pl-8 pr-7 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-600"
              title="Xóa tìm kiếm"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 2. Filter Tabs Row: "Tất cả", "Chưa đọc", "Facebook", "TikTok" */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin pt-0.5 pb-0.5 text-xs">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
              activeFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>Tất cả</span>
            <span
              className={`text-[10px] px-1 py-0.2 rounded-full ${
                activeFilter === 'all' ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {tabCounts.total}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('unread')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
              activeFilter === 'unread'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>Chưa đọc</span>
            {tabCounts.unread > 0 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeFilter === 'unread'
                    ? 'bg-rose-500 text-white'
                    : 'bg-rose-500 text-white pulse-badge'
                }`}
              >
                {tabCounts.unread}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveFilter('facebook')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
              activeFilter === 'facebook'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#1877F2]"></span>
            <span>Facebook</span>
          </button>

          <button
            onClick={() => setActiveFilter('tiktok')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
              activeFilter === 'tiktok'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-black"></span>
            <span>TikTok</span>
          </button>
        </div>
      </div>

      {/* 3. Scrollable Conversation List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-slate-100">
        {loading && (
          <div className="p-8 text-center text-slate-400">
            <div className="spinner spinner-slate spinner-sm mb-2"></div>
            <p className="text-xs">Đang tải danh sách hội thoại...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredConversations.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2.5 text-slate-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-600">Không có cuộc hội thoại nào</p>
            <p className="text-[11px] text-slate-400 mt-1">
              {searchQuery ? 'Thử tìm kiếm với từ khóa khác' : 'Chưa có tin nhắn trong danh mục này'}
            </p>
          </div>
        )}

        {/* Conversation Cards */}
        {!loading &&
          filteredConversations.map((conv) => {
            const isSelected = currentSelectedId === conv.id;
            const avatarColor = getAvatarColor(conv.contactName);
            const initials = getInitials(conv.contactName);
            const relativeTime = getRelativeTime(conv.lastMessageTime);
            const unread = conv.unreadCount || 0;

            // Preview truncated to 40 characters
            const rawMessage = conv.lastMessage || 'Chưa có tin nhắn';
            const messagePreview =
              rawMessage.length > 40 ? rawMessage.substring(0, 40) + '...' : rawMessage;

            return (
              <div
                key={conv.id}
                onClick={() => handleSelectCard(conv)}
                className={`conversation-card p-3 flex items-start gap-3 transition-colors cursor-pointer border-l-4 ${
                  isSelected
                    ? 'bg-primary-50 bg-indigo-50/80 border-l-indigo-600 active'
                    : 'border-l-transparent hover:bg-gray-50'
                }`}
              >
                {/* Left: Avatar with initials & channel icon overlay */}
                <div className="relative flex-shrink-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shadow-xs border ${avatarColor.bg} ${avatarColor.text} ${avatarColor.border} overflow-hidden`}
                  >
                    {conv.contactAvatar ? (
                      <img
                        src={conv.contactAvatar}
                        alt={conv.contactName || 'Avatar'}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>

                  {/* Channel icon overlay (FB/TT small badge) */}
                  <div className="absolute -bottom-1 -right-1 ring-2 ring-white rounded-full">
                    <ChannelBadge channelType={conv.channelType} />
                  </div>
                </div>

                {/* Center: Customer name, preview, timestamp */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1">
                    <h3
                      className={`text-xs truncate ${
                        isSelected ? 'font-bold text-indigo-900' : 'font-semibold text-slate-900'
                      }`}
                    >
                      {conv.contactName || 'Khách hàng'}
                    </h3>
                    <span className="text-[10px] text-slate-400 flex-shrink-0 font-normal">
                      {relativeTime}
                    </span>
                  </div>

                  <p
                    className={`text-xs truncate mt-0.5 ${
                      unread > 0 ? 'font-medium text-slate-800' : 'text-slate-500'
                    }`}
                  >
                    {messagePreview}
                  </p>
                </div>

                {/* Right: Unread count badge */}
                {unread > 0 && (
                  <div className="flex-shrink-0 self-center">
                    <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center pulse-badge shadow-xs">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// Assign to window object
if (typeof window !== 'undefined') {
  window.ChatList = ChatList;
  window.getRelativeTime = getRelativeTime;
  window.getInitials = getInitials;
  window.getAvatarColor = getAvatarColor;
}

