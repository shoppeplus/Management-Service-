/**
 * InboxConversationList Component (Cột 1: Danh sách hội thoại + Lọc Kênh + Đa tài khoản TikTok Shop)
 * ───────────────────────────────────────────────────────────────────────────────────────────────────
 * Đáp ứng yêu cầu Requirment_Ver1.0.xlsx:
 * - Nhúng các trang business (Zalo, FB, TikTok...), trong đó TikTok quản lý nhiều tài khoản shop.
 * - Hiển thị bộ chọn nhanh tài khoản Shop/Page theo kênh đang chọn.
 * - Hiển thị nhãn danh mục và tên tài khoản shop trên từng thẻ hội thoại.
 */

(function () {
  'use strict';

  const { useMemo } = window.React;

  function renderChannelIcon(ch) {
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
      case 'tiktok':
        return <span className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[9px] font-bold">T</span>;
      default:
        return <span className="w-4 h-4 rounded-full bg-slate-400 text-white flex items-center justify-center text-[9px] font-bold">💬</span>;
    }
  }

  function InboxConversationList({
    filteredList = [],
    selectedConvId,
    onSelectConversation,
    inboxTab,
    onChangeInboxTab,
    mineCount = 0,
    unassignedCount = 0,
    channelFilter = 'all',
    onChangeChannelFilter,
    shopFilter = 'all',
    onChangeShopFilter,
    businessAccounts = [],
    searchQuery = '',
    onChangeSearchQuery,
    isMobileThreadOpen = false,
  }) {
    const visibleBusinessAccounts = useMemo(() => {
      if (channelFilter === 'all') return businessAccounts;
      return businessAccounts.filter((acc) => acc.channelType === channelFilter);
    }, [businessAccounts, channelFilter]);

    return (
      <section
        className={`${
          isMobileThreadOpen ? 'hidden lg:flex' : 'flex'
        } max-lg:absolute max-lg:inset-0 max-lg:z-10 max-lg:w-full lg:w-72 xl:w-80 h-full bg-white border-r border-slate-200 flex-col flex-shrink-0`}
      >
        {/* Header: Title, Channel Filter & Multi-Shop Selector */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Hộp thư</h2>
              <span className="min-w-6 text-center text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                {filteredList.length}
              </span>
            </div>

            <select
              value={channelFilter}
              onChange={(e) => {
                onChangeChannelFilter(e.target.value);
                onChangeShopFilter('all');
              }}
              aria-label="Lọc theo kênh"
              className="max-w-[150px] text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg py-1.5 pl-2.5 pr-2 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 cursor-pointer"
            >
              <option value="all">Tất cả các kênh</option>
              <option value="tiktok">TikTok Shop</option>
              <option value="zalo">Zalo OA</option>
              <option value="facebook">Messenger</option>
              <option value="email">Email</option>
              <option value="website">Website</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>

          {/* Multi-Shop / Business Page Selector (Đặc biệt hỗ trợ nhiều tài khoản TikTok Shop) */}
          {visibleBusinessAccounts.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">
                Tài khoản:
              </span>
              <select
                value={shopFilter}
                onChange={(e) => onChangeShopFilter(e.target.value)}
                aria-label="Lọc theo tài khoản Business hoặc TikTok Shop"
                className="flex-1 min-w-0 text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-300 cursor-pointer truncate"
              >
                <option value="all">
                  Tất cả tài khoản ({visibleBusinessAccounts.length})
                </option>
                {visibleBusinessAccounts.map((acc) => (
                  <option key={acc.shopId || acc.id} value={acc.shopId || acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search box */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              placeholder="Tìm khách hàng, tin nhắn, tên shop..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>

          {/* Mine vs Unassigned Tabs */}
          <div className="flex items-center gap-5 text-xs font-semibold pt-1 border-b border-slate-100">
            <button
              type="button"
              onClick={() => onChangeInboxTab('mine')}
              className={`pb-2 border-b-2 transition-colors ${
                inboxTab === 'mine'
                  ? 'border-blue-600 text-blue-600 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <span>Của tôi</span>
              <span className={`ml-1.5 text-[10px] ${inboxTab === 'mine' ? 'text-blue-500' : 'text-slate-400'}`}>
                {mineCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onChangeInboxTab('unassigned')}
              className={`pb-2 border-b-2 transition-colors ${
                inboxTab === 'unassigned'
                  ? 'border-blue-600 text-blue-600 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <span>Chưa phân công</span>
              <span
                className={`ml-1.5 text-[10px] ${
                  inboxTab === 'unassigned' ? 'text-blue-500' : 'text-slate-400'
                }`}
              >
                {unassignedCount}
              </span>
            </button>
          </div>
        </div>

        {/* Conversation cards list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {filteredList.map((conv) => {
            const isSelected = conv.id === selectedConvId;
            return (
              <button
                type="button"
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                aria-current={isSelected ? 'true' : undefined}
                className={`w-full p-3.5 flex items-start gap-3 text-left border-l-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-600'
                    : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {conv.initials}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 truncate">{conv.contactName}</h4>
                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                      {conv.time}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {renderChannelIcon(conv.channel)}
                    <span className="text-[10px] text-slate-500 font-medium truncate max-w-[120px]">
                      {conv.channelTag || conv.channelLabel}
                    </span>
                    {conv.category && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                        {conv.category}
                      </span>
                    )}
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
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  window.InboxConversationList = InboxConversationList;
})();
