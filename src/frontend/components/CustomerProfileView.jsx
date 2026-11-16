/**
 * CustomerProfileView Component (SmartSales Customer 360 - Image 02)
 * ─────────────────────────────────────────────────────────────────
 * Highly Interactive Customer 360 Profile:
 * - Breadcrumbs: Khách hàng > Hồ sơ khách hàng
 * - Hero Profile Card:
 *   - Avatar MA, Nguyễn Minh Anh, Badge Gold
 *   - Phone with unmask toggle, email, location, Phụ trách: Nam
 *   - Action buttons: [ 📞 Gọi điện ] (Triggers live simulated VoIP call!) & [ + Tạo đơn ]
 *   - 2 Stat Cards: Tổng chi tiêu (32,5 triệu), Đơn hàng (8)
 * - 4 Rich Interactive Sub-tabs:
 *   1. Lịch sử: Connected timeline, filters (Tất cả, Cuộc gọi, Đơn hàng, Báo giá) & + Thêm tương tác
 *   2. Tổng quan: Customer 360 attributes, LTV, Loyalty points, Multi-channel identities
 *   3. Đơn hàng: Order purchase history table with statuses and GHTK tracking
 *   4. Hỗ trợ: Support tickets with SLA timers & resolutions
 * - Right column: Lịch chăm sóc card with [ 📅 Đặt lịch khác ] button
 */

(function () {
  'use strict';

  const { useState, useMemo } = window.React;

  function CustomerProfileView({
    customer,
    onOpenCreateOrder,
    onScheduleCare,
    onTriggerCall,
    showToast,
  }) {
    const [activeSubTab, setActiveSubTab] = useState('history'); // 'history' | 'overview' | 'orders' | 'support'
    const [isPhoneMasked, setIsPhoneMasked] = useState(true);
    const [timelineFilter, setTimelineFilter] = useState('all');
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [newNoteContent, setNewNoteContent] = useState('');

    // Active customer data
    const currentCustomer = customer || {
      id: 'cus_001',
      code: 'CUS-20240312-0001',
      name: 'Nguyễn Minh Anh',
      initials: 'MA',
      tier: 'Gold',
      phone: '0987654321',
      email: 'minhanh@example.com',
      location: 'Hà Nội',
      assignedTo: 'Nam',
      totalSpending: 32500000,
      totalOrders: 8,
      points: 3250,
      joinedDate: '15/01/2024',
      tags: ['Gold', 'Khách VIP', 'Điện tử'],
    };

    // Interaction timeline items matching Image 02
    const [interactionsList, setInteractionsList] = useState([
      {
        id: 'act_01',
        type: 'call',
        title: 'Đã gọi tư vấn',
        date: '12/03/2024',
        time: '10:30',
        content: 'Trao đổi về nhu cầu và giới thiệu sản phẩm phù hợp.',
        color: 'emerald',
      },
      {
        id: 'act_02',
        type: 'order',
        title: 'Hoàn tất đơn DH008',
        date: '10/03/2024',
        time: '14:20',
        content: 'Đơn hàng trị giá 12.000.000đ.',
        color: 'blue',
      },
      {
        id: 'act_03',
        type: 'quote',
        title: 'Gửi báo giá',
        date: '08/03/2024',
        time: '16:15',
        content: 'Gửi báo giá sản phẩm qua email.',
        color: 'purple',
      },
    ]);

    // Customer purchase history
    const customerOrders = [
      { code: 'DH008', date: '10/03/2024', items: 'Camera A (2 chiếc)', total: 9180000, status: 'Hoàn tất', tracking: 'GHTK-HN-883921' },
      { code: 'DH005', date: '15/02/2024', items: 'Camera Pro 360', total: 6200000, status: 'Hoàn tất', tracking: 'GHTK-HN-772109' },
      { code: 'DH002', date: '01/02/2024', items: 'Combo thẻ nhớ 128GB + Cáp sạc', total: 1250000, status: 'Hoàn tất', tracking: 'GHTK-HN-661203' },
    ];

    // Customer support tickets
    const customerTickets = [
      { code: 'TK-4001', subject: 'Hướng dẫn cài đặt ứng dụng Camera A trên điện thoại', priority: 'HIGH', status: 'Đã xử lý', sla: '4h', date: '11/03/2024' },
      { code: 'TK-3002', subject: 'Yêu cầu xuất hóa đơn điện tử VAT', priority: 'MEDIUM', status: 'Hoàn thành', sla: '8h', date: '10/03/2024' },
    ];

    // Care appointment
    const [careSchedule, setCareSchedule] = useState({
      date: 'Ngày mai',
      time: '09:00',
      title: 'Gọi điện chăm sóc',
      content: 'Trao đổi sau khi khách nhận hàng, hỏi thăm trải nghiệm sản phẩm.',
    });

    // Filtered timeline
    const filteredTimeline = useMemo(() => {
      if (timelineFilter === 'all') return interactionsList;
      return interactionsList.filter((item) => item.type === timelineFilter);
    }, [interactionsList, timelineFilter]);

    const formatCurrency = (val) => {
      if (typeof val === 'number') {
        if (val >= 1000000) return (val / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' triệu';
        return val.toLocaleString('vi-VN') + 'đ';
      }
      return val || '32,5 triệu';
    };

    const handleAddNote = (e) => {
      e?.preventDefault();
      if (!newNoteContent.trim()) return;

      const newInteraction = {
        id: 'act_' + Date.now(),
        type: 'call',
        title: 'Ghi chú tương tác trực tiếp',
        date: new Date().toLocaleDateString('vi-VN'),
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        content: newNoteContent.trim(),
        color: 'emerald',
      };

      setInteractionsList((prev) => [newInteraction, ...prev]);
      setNewNoteContent('');
      setIsAddingNote(false);
      if (showToast) showToast('Đã thêm ghi chú tương tác vào hồ sơ khách hàng!', 'success');
    };

    const renderIcon = (type) => {
      switch (type) {
        case 'call':
          return (
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
          );
        case 'order':
          return (
            <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-xs">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
          );
        case 'quote':
          return (
            <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center shadow-xs">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          );
        default:
          return null;
      }
    };

    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-8 space-y-6">
        {/* Breadcrumb Header */}
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <span className="hover:text-slate-600 cursor-pointer">Khách hàng</span>
            <span>&gt;</span>
            <span className="text-slate-700 font-semibold">Hồ sơ khách hàng</span>
          </nav>
        </div>

        {/* Hero Customer Profile Card matching Image 02 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Left: Avatar & Contact Info */}
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xl flex-shrink-0">
                {currentCustomer.initials || 'MA'}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-900">{currentCustomer.name}</h2>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                    {currentCustomer.tier || 'Gold'}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                  <div
                    onClick={() => setIsPhoneMasked(!isPhoneMasked)}
                    className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600"
                    title="Bấm để ẩn/hiện số điện thoại"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>{isPhoneMasked ? '09xx xxx xxx' : currentCustomer.phone}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>{currentCustomer.email}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    <span>{currentCustomer.location || 'Hà Nội'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-0.5">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>Phụ trách: <strong className="text-slate-700">{currentCustomer.assignedTo || 'Nam'}</strong></span>
                </div>
              </div>
            </div>

            {/* Right: Stat Cards & Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl px-4 py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Tổng chi tiêu</p>
                    <p className="text-sm font-bold text-slate-800">{formatCurrency(currentCustomer.totalSpending)}</p>
                  </div>
                </div>

                <div className="bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Đơn hàng</p>
                    <p className="text-sm font-bold text-slate-800">{currentCustomer.totalOrders}</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons: [ 📞 Gọi điện ] & [ + Tạo đơn ] */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onTriggerCall}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 rounded-xl text-xs font-semibold shadow-xs transition-all active:scale-95"
                >
                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>Gọi điện</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenCreateOrder}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-200 transition-all active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Tạo đơn</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-Tabs: Tổng quan | Lịch sử (Active) | Đơn hàng | Hỗ trợ */}
        <div className="border-b border-slate-200">
          <div className="flex items-center gap-8 text-sm">
            {[
              { id: 'overview', label: 'Tổng quan' },
              { id: 'history', label: 'Lịch sử' },
              { id: 'orders', label: 'Đơn hàng' },
              { id: 'support', label: 'Hỗ trợ' },
            ].map((tab) => {
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id)}
                  type="button"
                  className={`pb-3 font-semibold transition-all relative ${
                    isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 rounded-full"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area (2 Columns) */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-xs">
            {/* SUB-TAB 1: LỊCH SỬ (Matching Image 02) */}
            {activeSubTab === 'history' && (
              <div>
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                  <h3 className="text-sm font-bold text-slate-900">Lịch sử tương tác</h3>

                  <div className="flex items-center gap-2">
                    {/* Filters */}
                    <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100 text-xs">
                      {['all', 'call', 'order', 'quote'].map((f) => (
                        <button
                          key={f}
                          onClick={() => setTimelineFilter(f)}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                            timelineFilter === f ? 'bg-white text-blue-600 font-bold shadow-xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {f === 'all' ? 'Tất cả' : f === 'call' ? 'Cuộc gọi' : f === 'order' ? 'Đơn hàng' : 'Báo giá'}
                        </button>
                      ))}
                    </div>

                    {/* Button: + Thêm ghi chú tương tác */}
                    <button
                      type="button"
                      onClick={() => setIsAddingNote(!isAddingNote)}
                      className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition-colors"
                    >
                      + Thêm ghi chú
                    </button>
                  </div>
                </div>

                {/* Quick Add Note box */}
                {isAddingNote && (
                  <form onSubmit={handleAddNote} className="mb-6 p-4 bg-blue-50/50 border border-blue-200 rounded-2xl space-y-2.5 animate-fadeIn">
                    <label className="text-xs font-bold text-slate-700">Nhập nội dung tương tác mới với khách hàng:</label>
                    <textarea
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      placeholder="Ví dụ: Khách gọi điện hỏi thêm về thời gian giao hàng và bảo hành..."
                      rows="2"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      required
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingNote(false)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs"
                      >
                        Lưu vào dòng thời gian
                      </button>
                    </div>
                  </form>
                )}

                {/* Vertical Connected Timeline */}
                <div className="relative pl-6 space-y-8 before:absolute before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-blue-100">
                  {filteredTimeline.map((item) => (
                    <div key={item.id} className="relative flex items-start gap-4">
                      <div className="absolute -left-6 mt-0.5 z-10 bg-white ring-4 ring-white rounded-full">
                        {renderIcon(item.type)}
                      </div>

                      <div className="flex-1 ml-4 bg-slate-50/60 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {item.date} {item.time}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{item.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-TAB 2: TỔNG QUAN (Customer 360 Attributes) */}
            {activeSubTab === 'overview' && (
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-slate-900">Tổng quan hồ sơ 360°</h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-slate-400 font-medium">Mã khách hàng</span>
                    <p className="font-bold text-slate-800">{currentCustomer.code || 'CUS-20240312-0001'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-slate-400 font-medium">Hạng thành viên</span>
                    <p className="font-bold text-amber-600">{currentCustomer.tier || 'Gold'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-slate-400 font-medium">Điểm tích lũy</span>
                    <p className="font-bold text-slate-800">{currentCustomer.points || '3.250'} điểm</p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-slate-400 font-medium">Khách hàng từ</span>
                    <p className="font-bold text-slate-800">{currentCustomer.joinedDate || '15/01/2024'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-slate-400 font-medium">Kênh tiếp cận chính</span>
                    <p className="font-bold text-blue-600">Zalo OA &amp; Messenger</p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-slate-400 font-medium">Tỷ lệ hủy/hoàn đơn</span>
                    <p className="font-bold text-emerald-600">0% (Rất uy tín)</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700">Thẻ phân loại (Tags):</span>
                  <div className="flex gap-2">
                    {['Gold', 'Khách VIP', 'Điện tử', 'Thân thiết'].map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1 text-xs">
                  <span className="font-bold text-slate-800">Ghi chú nhân viên tư vấn:</span>
                  <p className="text-slate-500 leading-relaxed">
                    Khách hàng quan tâm đến các giải pháp an ninh gia đình, ưu tiên chất lượng sản phẩm chính hãng và dịch vụ bảo hành tận nơi.
                  </p>
                </div>
              </div>
            )}

            {/* SUB-TAB 3: ĐƠN HÀNG (Purchase History Table) */}
            {activeSubTab === 'orders' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Danh sách đơn hàng đã mua</h3>
                  <button
                    type="button"
                    onClick={onOpenCreateOrder}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    + Lên đơn hàng mới
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-400 uppercase font-semibold">
                      <tr>
                        <th className="p-3 rounded-l-xl">Mã đơn</th>
                        <th className="p-3">Ngày đặt</th>
                        <th className="p-3">Sản phẩm</th>
                        <th className="p-3">Tổng tiền</th>
                        <th className="p-3">Vận chuyển GHTK</th>
                        <th className="p-3 rounded-r-xl">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerOrders.map((ord) => (
                        <tr key={ord.code} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-blue-600">{ord.code}</td>
                          <td className="p-3 text-slate-500">{ord.date}</td>
                          <td className="p-3 text-slate-800 font-medium">{ord.items}</td>
                          <td className="p-3 font-bold text-slate-900">{ord.total.toLocaleString('vi-VN')}đ</td>
                          <td className="p-3 text-slate-500 font-mono text-[11px]">{ord.tracking}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                              {ord.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB 4: HỖ TRỢ (Support Tickets) */}
            {activeSubTab === 'support' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Yêu cầu hỗ trợ &amp; CSKH (Tickets)</h3>

                <div className="space-y-3">
                  {customerTickets.map((t) => (
                    <div key={t.code} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-blue-600">{t.code}</span>
                          <span className="font-bold text-slate-800">{t.subject}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Ngày tạo: {t.date} • Cam kết giải quyết (SLA): {t.sla}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                          {t.priority}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                          {t.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Lịch chăm sóc Card matching Image 02 */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-4">Lịch chăm sóc</h3>

              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>{careSchedule.date} • {careSchedule.time}</span>
                </div>

                <h4 className="text-xs font-bold text-slate-800">{careSchedule.title}</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">{careSchedule.content}</p>
              </div>
            </div>

            {/* "Đặt lịch khác" button */}
            <button
              type="button"
              onClick={onScheduleCare}
              className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Đặt lịch khác</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  window.CustomerProfileView = CustomerProfileView;
})();
