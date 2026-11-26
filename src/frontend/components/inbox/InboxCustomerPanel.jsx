/**
 * InboxCustomerPanel Component (Cột 3: Hồ sơ khách hàng 360 & Thao tác lên đơn nhanh)
 * ────────────────────────────────────────────────────────────────────────────────────
 * Tách độc lập từ OmnichannelInbox để giảm độ phức tạp của file chính và dễ mở rộng.
 */

(function () {
  'use strict';

  const { useState } = window.React;

  function InboxCustomerPanel({
    activeConv,
    isOpen,
    onClose,
    onSelectCustomerProfile,
    onOpenCreateOrder,
    onOpenCreateQuote,
    onOpenCreateTicket,
    onOpenScheduleCare,
  }) {
    const [isPhoneMasked, setIsPhoneMasked] = useState(true);

    if (!activeConv) return null;

    return (
      <>
        {isOpen && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hồ sơ khách hàng"
            className="absolute inset-0 z-20 bg-slate-950/20 2xl:hidden"
          />
        )}
        <section
          className={`${
            isOpen ? 'flex' : 'hidden'
          } absolute inset-y-0 right-0 z-30 w-80 max-w-[90vw] bg-white border-l border-slate-200 p-5 flex-col justify-between overflow-y-auto flex-shrink-0 space-y-5 shadow-xl 2xl:relative 2xl:inset-auto 2xl:z-auto 2xl:w-72 2xl:max-w-none 2xl:shadow-none`}
        >
          <div className="space-y-4">
            {/* Header with "Xem chi tiết ↗" */}
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">Hồ sơ khách hàng</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSelectCustomerProfile}
                  className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-0.5"
                >
                  <span>Xem chi tiết</span>
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Ẩn thông tin khách hàng"
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center 2xl:hidden"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
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
            {activeConv.recentOrder && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Đơn hàng gần nhất</span>
                  <span
                    onClick={onSelectCustomerProfile}
                    className="text-[11px] text-blue-600 cursor-pointer hover:underline"
                  >
                    Xem tất cả ↗
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-lg shadow-xs">
                    📷
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">
                        {activeConv.recentOrder.orderCode}
                      </span>
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
            )}

            {/* Thao tác nhanh (2x2 Buttons Grid) */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-900">Thao tác nhanh</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onOpenCreateOrder && onOpenCreateOrder(activeConv)}
                  className="p-2.5 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>🛒</span>
                  <span>+ Tạo đơn</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenCreateQuote && onOpenCreateQuote(activeConv)}
                  className="p-2.5 bg-slate-50 hover:bg-purple-50 hover:text-purple-700 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>📄</span>
                  <span>+ Báo giá</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenCreateTicket && onOpenCreateTicket(activeConv)}
                  className="p-2.5 bg-slate-50 hover:bg-rose-50 hover:text-rose-700 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>🎧</span>
                  <span>+ Ticket</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenScheduleCare && onOpenScheduleCare(activeConv)}
                  className="p-2.5 bg-slate-50 hover:bg-amber-50 hover:text-amber-700 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>📅</span>
                  <span>+ Lịch hẹn</span>
                </button>
              </div>
            </div>

            {/* Lịch chăm sóc Card */}
            {activeConv.careSchedule && (
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
            )}
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
      </>
    );
  }

  window.InboxCustomerPanel = InboxCustomerPanel;
})();
