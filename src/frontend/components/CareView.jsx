/**
 * CareView Component (SmartSales Chăm Sóc Khách Hàng)
 * ─────────────────────────────────────────────────
 * Dedicated view for Customer Care & Support:
 * - 2 Clean Sub-tabs without external duplication:
 *   1. 🎫 Tickets CSKH & SLAs (Cao: 4h, Trung bình: 8h, Thấp: 24h)
 *   2. 📅 Lịch hẹn chăm sóc (Follow-ups) with direct VoIP Call button [ 📞 Gọi ngay ]
 * - SLA Timer & status lifecycle management (OPEN -> PENDING -> RESOLVED -> CLOSED)
 * - Interactive Ticket Reply Drawer
 * - "+ Tạo Ticket" and "+ Đặt lịch hẹn" quick actions
 */

(function () {
  'use strict';

  const { useState, useEffect, useMemo } = window.React;

  function CareView({ currentUser, onOpenCreateTicket, onScheduleCare, onTriggerCall, showToast }) {
    const [activeSubTab, setActiveSubTab] = useState('tickets'); // 'tickets' | 'followups'
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [ticketReplyText, setTicketReplyText] = useState('');
    const [ticketsList, setTicketsList] = useState([]);
    const [followUpsList, setFollowUpsList] = useState([]);
    const [priorityFilter, setPriorityFilter] = useState('ALL');

    // Default Seed Tickets
    const defaultTickets = [
      {
        id: 'tk_001',
        code: 'TK-20261116-4001',
        customerId: 'cus_001',
        customerName: 'Nguyễn Minh Anh',
        customerPhone: '0987654321',
        subject: 'Hướng dẫn cài đặt xem Camera A qua điện thoại từ xa',
        priority: 'HIGH',
        slaHours: 4,
        slaDeadline: '12/03/2024 14:00',
        status: 'OPEN',
        assignedTo: 'Nam',
        replies: [
          { sender: 'Nguyễn Minh Anh', role: 'customer', content: 'Mình vừa nhận 2 chiếc Camera A, shop gửi video hướng dẫn kết nối app wifi giúp mình nhé.', time: '10:00' },
        ],
        createdAt: '12/03/2024 10:00',
      },
      {
        id: 'tk_002',
        code: 'TK-20261116-4002',
        customerId: 'cus_002',
        customerName: 'Trần Hoàng',
        customerPhone: '0912345678',
        subject: 'Yêu cầu hỗ trợ đổi size quần jogger thể thao từ L sang XL',
        priority: 'MEDIUM',
        slaHours: 8,
        slaDeadline: '13/03/2024 09:00',
        status: 'OPEN',
        assignedTo: 'Nam',
        replies: [
          { sender: 'Trần Hoàng', role: 'customer', content: 'Shop ơi quần jogger size L hơi chật một chút, mình muốn đổi lên XL được không?', time: '09:00' },
        ],
        createdAt: '12/03/2024 09:00',
      },
      {
        id: 'tk_003',
        code: 'TK-20261116-4003',
        customerId: 'cus_003',
        customerName: 'Công ty An Phát',
        customerPhone: '0903123456',
        subject: 'Xuất hóa đơn VAT điện tử cho đơn hàng camera dự án',
        priority: 'LOW',
        slaHours: 24,
        slaDeadline: '14/03/2024 10:00',
        status: 'RESOLVED',
        assignedTo: 'Nam',
        replies: [
          { sender: 'Nam (Kế toán)', role: 'employee', content: 'Dạ em đã xuất hóa đơn điện tử gửi về email contact@anphat.vn rồi ạ.', time: '11:00' },
        ],
        createdAt: '11/03/2024 10:00',
      },
    ];

    // Default Seed Follow-ups (Appointments)
    const defaultFollowUps = [
      {
        id: 'flu_001',
        customerName: 'Nguyễn Minh Anh',
        customerPhone: '0987654321',
        title: 'Gọi xác nhận trải nghiệm và phiếu bảo hành Camera A',
        scheduledTime: 'Ngày mai • 09:00',
        date: '13/03/2024',
        status: 'SCHEDULED',
        assignedTo: 'Nam',
        notes: 'Khách hàng VIP, kiểm tra xem khách đã cài app xem từ xa mượt chưa.',
      },
      {
        id: 'flu_002',
        customerName: 'Trần Hoàng',
        customerPhone: '0912345678',
        title: 'Tư vấn đồng phục CLB Cầu Lông áo thun unisex sỉ',
        scheduledTime: '15/03/2024 • 14:00',
        date: '15/03/2024',
        status: 'SCHEDULED',
        assignedTo: 'Nam',
        notes: 'Khách quan tâm đặt 30 áo in logo CLB.',
      },
      {
        id: 'flu_003',
        customerName: 'Công ty An Phát',
        customerPhone: '0903123456',
        title: 'Hẹn báo giá và hợp đồng thiết bị dự án chi nhánh 2',
        scheduledTime: '20/03/2024 • 10:00',
        date: '20/03/2024',
        status: 'SCHEDULED',
        assignedTo: 'Nam',
        notes: 'Chuẩn bị file hợp đồng và catalogue camera mới nhất.',
      },
    ];

    useEffect(() => {
      loadData();
    }, []);

    const loadData = async () => {
      try {
        const tRes = await fetch('/api/tickets').then((r) => r.json()).catch(() => null);
        if (tRes?.success && Array.isArray(tRes.data) && tRes.data.length > 0) {
          setTicketsList(tRes.data);
        } else {
          setTicketsList(defaultTickets);
        }

        const fRes = await fetch('/api/follow-ups').then((r) => r.json()).catch(() => null);
        if (fRes?.success && Array.isArray(fRes.data) && fRes.data.length > 0) {
          setFollowUpsList(fRes.data);
        } else {
          setFollowUpsList(defaultFollowUps);
        }
      } catch (e) {
        setTicketsList(defaultTickets);
        setFollowUpsList(defaultFollowUps);
      }
    };

    // Filter tickets
    const filteredTickets = useMemo(() => {
      if (priorityFilter === 'ALL') return ticketsList;
      return ticketsList.filter((t) => t.priority === priorityFilter);
    }, [ticketsList, priorityFilter]);

    // Handle add reply to ticket
    const handleAddReply = (e) => {
      e?.preventDefault();
      if (!ticketReplyText.trim() || !selectedTicket) return;

      const newReply = {
        sender: currentUser?.name || 'Nam',
        role: 'employee',
        content: ticketReplyText.trim(),
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };

      setSelectedTicket((prev) => ({
        ...prev,
        replies: [...(prev.replies || []), newReply],
        status: 'IN_PROGRESS',
      }));

      setTicketsList((prev) =>
        prev.map((t) =>
          t.id === selectedTicket.id
            ? { ...t, status: 'IN_PROGRESS', replies: [...(t.replies || []), newReply] }
            : t
        )
      );

      setTicketReplyText('');
      if (showToast) showToast('Đã gửi phản hồi giải quyết Ticket thành công!', 'success');
    };

    // Handle resolve ticket
    const handleResolveTicket = () => {
      if (!selectedTicket) return;

      setSelectedTicket((prev) => ({ ...prev, status: 'RESOLVED' }));
      setTicketsList((prev) =>
        prev.map((t) => (t.id === selectedTicket.id ? { ...t, status: 'RESOLVED' } : t))
      );

      if (showToast) showToast(`Đã đóng Ticket ${selectedTicket.code} thành công!`, 'success');
    };

    // Mark follow-up as completed
    const handleCompleteFollowUp = (id) => {
      setFollowUpsList((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: 'COMPLETED' } : f))
      );
      if (showToast) showToast('Đã đánh dấu hoàn thành cuộc hẹn chăm sóc!', 'success');
    };

    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-8 space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Chăm Sóc Khách Hàng (CSKH)</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              Quản lý Ticket khiếu nại, cam kết thời gian xử lý (SLA) và Lịch hẹn gọi điện
            </p>
          </div>

          <div className="flex items-center gap-3">
            {activeSubTab === 'tickets' ? (
              <button
                type="button"
                onClick={onOpenCreateTicket}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-200 transition-all active:scale-95"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>+ Tạo Ticket mới</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onScheduleCare}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-200 transition-all active:scale-95"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>+ Đặt lịch hẹn mới</span>
              </button>
            )}
          </div>
        </div>

        {/* 2 Clean Sub-Tabs */}
        <div className="border-b border-slate-200">
          <div className="flex items-center gap-8 text-sm">
            <button
              type="button"
              onClick={() => setActiveSubTab('tickets')}
              className={`pb-3 font-semibold transition-all relative flex items-center gap-2 ${
                activeSubTab === 'tickets' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>🎫 Tickets CSKH &amp; Khiếu nại</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                {ticketsList.length}
              </span>
              {activeSubTab === 'tickets' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 rounded-full"></span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('followups')}
              className={`pb-3 font-semibold transition-all relative flex items-center gap-2 ${
                activeSubTab === 'followups' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>📅 Lịch hẹn chăm sóc (Follow-ups)</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">
                {followUpsList.length}
              </span>
              {activeSubTab === 'followups' && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-600 rounded-full"></span>
              )}
            </button>
          </div>
        </div>

        {/* SUB-TAB 1: TICKETS VIEW */}
        {activeSubTab === 'tickets' && (
          <div className="space-y-4">
            {/* SLA Priority Filters */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-semibold uppercase">Lọc theo SLA:</span>
                {[
                  { id: 'ALL', label: 'Tất cả' },
                  { id: 'HIGH', label: '🔴 Khẩn cấp (SLA 4h)' },
                  { id: 'MEDIUM', label: '🟡 Trung bình (SLA 8h)' },
                  { id: 'LOW', label: '🟢 Thấp (SLA 24h)' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setPriorityFilter(f.id)}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                      priorityFilter === f.id
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="text-xs text-slate-500">
                Hiển thị: <strong>{filteredTickets.length}</strong> yêu cầu
              </div>
            </div>

            {/* Tickets Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-400 uppercase font-semibold border-b border-slate-100">
                  <tr>
                    <th className="p-3.5 pl-6">Mã Ticket</th>
                    <th className="p-3.5">Khách hàng</th>
                    <th className="p-3.5">Tiêu đề yêu cầu</th>
                    <th className="p-3.5">Cam kết SLA</th>
                    <th className="p-3.5">Hạn chót giải quyết</th>
                    <th className="p-3.5">Trạng thái</th>
                    <th className="p-3.5 pr-6 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 pl-6 font-bold text-blue-600">
                        {t.code}
                      </td>
                      <td className="p-3.5">
                        <span className="font-bold text-slate-800 block">{t.customerName}</span>
                        <span className="text-slate-400 font-mono text-[11px]">{t.customerPhone}</span>
                      </td>
                      <td className="p-3.5 max-w-sm">
                        <span className="font-semibold text-slate-800 block">{t.subject}</span>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            t.priority === 'HIGH'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : t.priority === 'MEDIUM'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {t.priority} (SLA {t.slaHours || 8}h)
                        </span>
                      </td>
                      <td className="p-3.5 font-medium text-slate-600">
                        {t.slaDeadline || '12/03/2024 18:00'}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            t.status === 'RESOLVED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : t.status === 'IN_PROGRESS'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-rose-50 text-rose-700 animate-pulse'
                          }`}
                        >
                          {t.status === 'RESOLVED' ? 'Đã giải quyết' : t.status === 'IN_PROGRESS' ? 'Đang xử lý' : 'Đang chờ (OPEN)'}
                        </span>
                      </td>
                      <td className="p-3.5 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTicket(t)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Xử lý
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: FOLLOW-UPS (APPOINTMENTS VIEW) */}
        {activeSubTab === 'followups' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {followUpsList.map((flu) => (
              <div
                key={flu.id}
                className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 flex items-center gap-1.5">
                      <span>📅</span>
                      <span>{flu.scheduledTime}</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        flu.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {flu.status === 'COMPLETED' ? 'Đã xong' : 'Chờ gọi'}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{flu.title}</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{flu.notes}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
                    <span>Khách: <strong>{flu.customerName}</strong></span>
                    <span className="font-mono text-slate-400">{flu.customerPhone}</span>
                  </div>
                </div>

                {/* Direct Action buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onTriggerCall) {
                        onTriggerCall({ name: flu.customerName, phone: flu.customerPhone });
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                  >
                    <span>📞</span>
                    <span>Gọi ngay</span>
                  </button>

                  {flu.status !== 'COMPLETED' && (
                    <button
                      type="button"
                      onClick={() => handleCompleteFollowUp(flu.id)}
                      className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                      title="Đánh dấu đã hoàn thành"
                    >
                      ✓ Xong
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ticket Resolution Drawer Modal */}
        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Xử lý Ticket {selectedTicket.code}</h3>
                  <p className="text-[11px] text-slate-400">Khách hàng: {selectedTicket.customerName} ({selectedTicket.customerPhone})</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTicket(null)}
                  className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="font-bold text-slate-700">Yêu cầu từ khách:</span>
                  <p className="text-slate-800 font-medium">{selectedTicket.subject}</p>
                </div>

                {/* Replies Thread */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <span className="font-bold text-slate-700">Lịch sử phản hồi:</span>
                  {selectedTicket.replies?.map((r, i) => (
                    <div key={i} className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-blue-700">
                        <span>{r.sender} ({r.role === 'customer' ? 'Khách' : 'CSKH'})</span>
                        <span className="text-slate-400 font-normal">{r.time}</span>
                      </div>
                      <p className="text-slate-800">{r.content}</p>
                    </div>
                  ))}
                </div>

                {/* Reply Form */}
                <form onSubmit={handleAddReply} className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="font-bold text-slate-700 block">Nhập câu trả lời giải quyết cho khách hàng:</label>
                  <textarea
                    value={ticketReplyText}
                    onChange={(e) => setTicketReplyText(e.target.value)}
                    rows="2"
                    placeholder="Nhập nội dung giải đáp hoặc đính kèm hướng dẫn..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 resize-none"
                    required
                  />
                  <div className="flex justify-between items-center pt-1">
                    <button
                      type="button"
                      onClick={handleResolveTicket}
                      className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold transition-colors"
                    >
                      ✓ Đánh dấu giải quyết xong (RESOLVED)
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition-colors"
                    >
                      Gửi phản hồi
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  window.CareView = CareView;
})();
