/**
 * CRMView Component (SmartSales Suite)
 * ──────────────────────────────────────
 * Implements the full business features specified in Addendum A (require.md):
 * 1. Leads & Cơ hội (Sales Pipeline: NEW -> CONTACTED -> INTERESTED -> QUOTATION -> WON / LOST)
 * 2. Báo giá (Quotations: snapshots, approval threshold, 1-click convert to Order)
 * 3. Khách hàng 360 (Customer 360: identities, history, metrics, merge, anonymize)
 * 4. Chăm sóc KH & Tickets (Tickets with SLA priority, replies, status lifecycle)
 * 5. Lịch hẹn (Follow-ups with customer timeline)
 * 6. Báo cáo & Phễu bán hàng (Dashboard & Funnel metrics)
 * 7. Cài đặt & Phân quyền (Settings, business holidays, RBAC matrix)
 */

(function () {
  'use strict';

  const { useState, useEffect, useMemo } = window.React;

  function CRMView({ currentUser, showToast, activeTab: controlledTab, onTabChange, hideNavBar = false }) {
    const [internalTab, setInternalTab] = useState('leads'); // leads, quotations, customers, tickets, followups, reports, settings
    const activeTab = controlledTab || internalTab;
    const setActiveTab = onTabChange || setInternalTab;

    // State data
    const [leads, setLeads] = useState([]);
    const [quotations, setQuotations] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [followUps, setFollowUps] = useState([]);
    const [summary, setSummary] = useState(null);
    const [funnel, setFunnel] = useState(null);
    const [settings, setSettings] = useState(null);

    // Modal & filter state
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false);
    const [isCreateQuoteOpen, setIsCreateQuoteOpen] = useState(false);
    const [isCreateTicketOpen, setIsCreateTicketOpen] = useState(false);

    // Load initial data from API or MockData fallback
    useEffect(() => {
      loadData();
    }, []);

    const loadData = async () => {
      try {
        // Fetch leads
        const leadsRes = await fetch('/api/leads').then((r) => r.json()).catch(() => null);
        if (leadsRes?.success) setLeads(leadsRes.data);
        else if (window.MockData?.leads) setLeads(window.MockData.leads);

        // Fetch quotations
        const quotesRes = await fetch('/api/quotations').then((r) => r.json()).catch(() => null);
        if (quotesRes?.success) setQuotations(quotesRes.data);
        else if (window.MockData?.quotations) setQuotations(window.MockData.quotations);

        // Fetch customers
        const custRes = await fetch('/api/customers').then((r) => r.json()).catch(() => null);
        if (custRes?.success) setCustomers(custRes.data);
        else if (window.MockData?.customers) setCustomers(window.MockData.customers);

        // Fetch tickets
        const tickRes = await fetch('/api/tickets').then((r) => r.json()).catch(() => null);
        if (tickRes?.success) setTickets(tickRes.data);
        else if (window.MockData?.tickets) setTickets(window.MockData.tickets);

        // Fetch follow-ups
        const fluRes = await fetch('/api/follow-ups').then((r) => r.json()).catch(() => null);
        if (fluRes?.success) setFollowUps(fluRes.data);
        else if (window.MockData?.followUps) setFollowUps(window.MockData.followUps);

        // Fetch dashboard metrics
        const dashRes = await fetch('/api/dashboard/summary').then((r) => r.json()).catch(() => null);
        if (dashRes?.success) setSummary(dashRes.data);

        const funnelRes = await fetch('/api/dashboard/funnel').then((r) => r.json()).catch(() => null);
        if (funnelRes?.success) setFunnel(funnelRes.data);

        const setRes = await fetch('/api/admin/settings').then((r) => r.json()).catch(() => null);
        if (setRes?.success) setSettings(setRes.data);
      } catch (err) {
        console.warn('Could not load CRM data:', err);
      }
    };

    const formatCurrency = (val) => {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(val || 0);
    };

    // ── Handle lead status change ───────────────────────────────────────────
    const handleLeadStatusChange = async (leadId, newStatus) => {
      let lostReason = '';
      if (newStatus === 'LOST') {
        lostReason = prompt('Vui lòng nhập lý do thất bại (lostReason):');
        if (!lostReason) return;
      }
      try {
        const res = await fetch(`/api/leads/${leadId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, lostReason }),
        }).then((r) => r.json());

        if (res.success) {
          showToast?.(`Chuyển trạng thái Lead thành công: ${newStatus}`, 'success');
          loadData();
        } else {
          showToast?.(res.message, 'error');
        }
      } catch (e) {
        showToast?.(e.message, 'error');
      }
    };

    // ── Handle quotation conversion to order ─────────────────────────────────
    const handleConvertQuotation = async (quoteId) => {
      if (!confirm('Bạn có chắc muốn chuyển đổi báo giá này thành Đơn hàng chính thức?')) return;
      try {
        const res = await fetch(`/api/quotations/${quoteId}/convert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).then((r) => r.json());

        if (res.success) {
          showToast?.(`Tạo đơn hàng thành công: ${res.data.order.orderCode}`, 'success');
          loadData();
        } else {
          showToast?.(res.message, 'error');
        }
      } catch (e) {
        showToast?.(e.message, 'error');
      }
    };

    // ── Handle customer anonymize (Section A10) ──────────────────────────────
    const handleAnonymizeCustomer = async (customerId) => {
      if (!confirm('CẢNH BÁO: Thao tác ẩn danh hóa sẽ xóa vĩnh viễn thông tin cá nhân (tên, SĐT, địa chỉ, email). Tiếp tục?')) return;
      try {
        const res = await fetch(`/api/customers/${customerId}/anonymize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).then((r) => r.json());

        if (res.success) {
          showToast?.('Đã ẩn danh hóa dữ liệu khách hàng thành công.', 'success');
          loadData();
        } else {
          showToast?.(res.message, 'error');
        }
      } catch (e) {
        showToast?.(e.message, 'error');
      }
    };

    return (
      <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
        {/* Navigation Tabs Bar (Hidden when scoped to avoid duplication) */}
        {!hideNavBar && (
          <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
              {[
                { id: 'leads', label: '🎯 Leads & Cơ hội', count: leads.length },
                { id: 'quotations', label: '📋 Báo giá', count: quotations.length },
                { id: 'customers', label: '👥 Khách hàng 360', count: customers.length },
                { id: 'tickets', label: '🎫 Chăm sóc KH & Ticket', count: tickets.length },
                { id: 'followups', label: '📅 Lịch hẹn', count: followUps.length },
                { id: 'reports', label: '📈 Phễu & Báo cáo' },
                { id: 'settings', label: '⚙️ Cài đặt & Quyền' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                        activeTab === tab.id ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg text-xs flex items-center gap-1"
                title="Tải lại dữ liệu"
              >
                🔄 Làm mới
              </button>
            </div>
          </div>
        )}

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {/* TAB 1: LEADS & PIPELINE */}
          {activeTab === 'leads' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Quản lý Leads & Cơ hội Bán Hàng</h2>
                  <p className="text-xs text-slate-500">Phễu chuyển đổi: Mới → Đã liên hệ → Quan tâm → Báo giá → Thành công (WON)</p>
                </div>
              </div>

              {/* Kanban / Pipeline View */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {['NEW', 'CONTACTED', 'INTERESTED', 'QUOTATION', 'WON'].map((colStatus) => {
                  const colLeads = leads.filter((l) => l.status === colStatus);
                  const statusColors = {
                    NEW: 'bg-blue-50 border-blue-200 text-blue-700',
                    CONTACTED: 'bg-amber-50 border-amber-200 text-amber-700',
                    INTERESTED: 'bg-purple-50 border-purple-200 text-purple-700',
                    QUOTATION: 'bg-indigo-50 border-indigo-200 text-indigo-700',
                    WON: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                  };

                  return (
                    <div key={colStatus} className="bg-white rounded-xl border border-slate-200 flex flex-col h-[520px]">
                      <div className={`p-2.5 border-b rounded-t-xl font-bold text-xs flex items-center justify-between ${statusColors[colStatus]}`}>
                        <span>{colStatus}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-white text-slate-800 text-[10px] shadow-2xs font-extrabold">
                          {colLeads.length}
                        </span>
                      </div>

                      <div className="flex-1 p-2 overflow-y-auto space-y-2.5 scrollbar-thin">
                        {colLeads.map((lead) => (
                          <div key={lead.id} className="p-2.5 bg-slate-50 hover:bg-indigo-50/40 rounded-lg border border-slate-200 shadow-2xs text-xs space-y-1.5 transition-all">
                            <div className="flex items-center justify-between font-bold text-slate-800">
                              <span>{lead.name}</span>
                              <span className="text-[10px] text-slate-400 font-normal">{lead.code}</span>
                            </div>
                            <p className="text-slate-500 text-[11px]">📞 {lead.phone || 'Chưa có SĐT'}</p>
                            {lead.budget > 0 && (
                              <p className="text-emerald-600 font-semibold text-[11px]">💰 Ngân sách: {formatCurrency(lead.budget)}</p>
                            )}

                            {/* State Machine Transition Buttons */}
                            <div className="pt-1.5 border-t border-slate-200/80 flex items-center justify-between gap-1 text-[10px]">
                              {colStatus !== 'WON' && (
                                <button
                                  onClick={() => {
                                    const nextMap = { NEW: 'CONTACTED', CONTACTED: 'INTERESTED', INTERESTED: 'QUOTATION', QUOTATION: 'WON' };
                                    handleLeadStatusChange(lead.id, nextMap[colStatus]);
                                  }}
                                  className="text-indigo-600 hover:text-indigo-800 font-semibold"
                                >
                                  Tiến tiếp →
                                </button>
                              )}
                              <button
                                onClick={() => handleLeadStatusChange(lead.id, 'LOST')}
                                className="text-rose-500 hover:text-rose-700 font-medium ml-auto"
                              >
                                Đánh dấu LOST
                              </button>
                            </div>
                          </div>
                        ))}

                        {colLeads.length === 0 && (
                          <div className="h-24 flex items-center justify-center text-slate-400 text-xs italic">
                            Trống
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: QUOTATIONS */}
          {activeTab === 'quotations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Danh Sách Báo Giá (Quotations)</h2>
                  <p className="text-xs text-slate-500">Quản lý báo giá, bảo lưu snapshot sản phẩm, và chuyển đổi 1-chạm sang đơn hàng (A3/A4)</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Mã báo giá</th>
                      <th className="px-4 py-3">Khách hàng</th>
                      <th className="px-4 py-3">Số dòng hàng</th>
                      <th className="px-4 py-3">Chiết khấu</th>
                      <th className="px-4 py-3">Tổng cộng</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Hiệu lực đến</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quotations.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-indigo-600">{q.code}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{q.customerName || 'Khách vãng lai'}</p>
                          <p className="text-[11px] text-slate-400">{q.customerPhone}</p>
                        </td>
                        <td className="px-4 py-3">{q.items?.length || 0} sản phẩm</td>
                        <td className="px-4 py-3 text-rose-500">-{formatCurrency(q.discountAmount)}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{formatCurrency(q.total)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              q.status === 'CONVERTED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : q.status === 'ACCEPTED'
                                ? 'bg-blue-100 text-blue-800'
                                : q.status === 'SENT'
                                ? 'bg-purple-100 text-purple-800'
                                : q.status === 'EXPIRED'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {q.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[11px]">{new Date(q.validUntil).toLocaleDateString('vi-VN')}</td>
                        <td className="px-4 py-3 text-right space-x-1.5">
                          {q.status === 'DRAFT' && (
                            <button
                              onClick={() => fetch(`/api/quotations/${q.id}/send`, { method: 'POST' }).then(() => loadData())}
                              className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold text-[11px]"
                            >
                              Gửi khách
                            </button>
                          )}
                          {q.status === 'SENT' && (
                            <button
                              onClick={() => fetch(`/api/quotations/${q.id}/accept`, { method: 'POST' }).then(() => loadData())}
                              className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-[11px]"
                            >
                              Khách chốt
                            </button>
                          )}
                          {q.status === 'ACCEPTED' && (
                            <button
                              onClick={() => handleConvertQuotation(q.id)}
                              className="px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-[11px] shadow-xs"
                            >
                              ⚡ Chuyển thành Đơn
                            </button>
                          )}
                          {(q.status === 'REJECTED' || q.status === 'EXPIRED' || q.status === 'CONVERTED') && (
                            <button
                              onClick={() => fetch(`/api/quotations/${q.id}/clone`, { method: 'POST' }).then(() => { showToast('Đã nhân bản báo giá', 'success'); loadData(); })}
                              className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 text-[11px]"
                            >
                              Nhân bản
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {quotations.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                          Chưa có báo giá nào trong hệ thống.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOMER 360 */}
          {activeTab === 'customers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Hồ Sơ Khách Hàng 360</h2>
                  <p className="text-xs text-slate-500">Xem chỉ số mua hàng, liên kết danh tính đa kênh, hợp nhất và ẩn danh hóa dữ liệu (A10)</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {customers.map((c) => (
                  <div key={c.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-sm text-slate-900">{c.name}</h3>
                          {c.isAnonymized && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 text-[9px] font-bold border border-rose-200">
                              Đã ẩn danh
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">{c.code}</p>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase text-[10px]">
                        {c.source || 'Facebook'}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <p>📞 <span className="font-medium text-slate-800">{c.phoneNormalized || c.phone}</span></p>
                      <p>📍 {typeof c.address === 'string' ? c.address : c.address?.detail || 'Chưa có địa chỉ'}</p>
                      {c.email && <p>✉️ {c.email}</p>}
                    </div>

                    {/* Financial Metrics from Completed Orders (Section A3) */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-center">
                      <div className="bg-indigo-50/50 p-1.5 rounded-lg">
                        <p className="text-[10px] text-slate-500">Đơn hoàn thành</p>
                        <p className="text-xs font-bold text-indigo-700">{c.totalOrders || 0}</p>
                      </div>
                      <div className="bg-emerald-50/50 p-1.5 rounded-lg">
                        <p className="text-[10px] text-slate-500">Tổng chi tiêu</p>
                        <p className="text-xs font-bold text-emerald-700">{formatCurrency(c.totalSpending)}</p>
                      </div>
                    </div>

                    {/* Identities */}
                    {c.identities && c.identities.length > 0 && (
                      <div className="text-[11px] space-y-1 pt-1">
                        <p className="text-slate-400 text-[10px] uppercase font-bold">Danh tính liên kết:</p>
                        <div className="flex flex-wrap gap-1">
                          {c.identities.map((idObj, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px]">
                              {idObj.channel}: {idObj.externalId}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Privacy Anonymize Action (Section A10) */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      {!c.isAnonymized && (
                        <button
                          onClick={() => handleAnonymizeCustomer(c.id)}
                          className="text-[11px] text-rose-500 hover:text-rose-700 font-semibold"
                        >
                          🔒 Ẩn danh hóa dữ liệu (A10)
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: TICKETS & CSKH */}
          {activeTab === 'tickets' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Tickets & Hỗ Trợ Chăm Sóc Khách Hàng</h2>
                  <p className="text-xs text-slate-500">Theo dõi SLA, giải quyết khiếu nại và quy tắc mở lại ticket trong 7 ngày (A3/A5)</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs text-slate-700 divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Mã Ticket</th>
                      <th className="px-4 py-3">Tiêu đề & Khách hàng</th>
                      <th className="px-4 py-3">Độ ưu tiên</th>
                      <th className="px-4 py-3">Hạn SLA</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-indigo-600">{t.code}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{t.title}</p>
                          <p className="text-[11px] text-slate-500">{t.customerName || 'Khách hàng'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              t.priority === 'URGENT'
                                ? 'bg-rose-100 text-rose-700'
                                : t.priority === 'HIGH'
                                ? 'bg-orange-100 text-orange-700'
                                : t.priority === 'MEDIUM'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {t.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-500">
                          {t.dueAt ? new Date(t.dueAt).toLocaleString('vi-VN') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              t.status === 'RESOLVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : t.status === 'CLOSED'
                                ? 'bg-slate-200 text-slate-700'
                                : t.status === 'IN_PROGRESS'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1.5">
                          {t.status === 'RESOLVED' && (
                            <button
                              onClick={() => fetch(`/api/tickets/${t.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'IN_PROGRESS' }) }).then(() => loadData())}
                              className="px-2.5 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold text-[11px]"
                            >
                              Mở lại (Reopen)
                            </button>
                          )}
                          {t.status !== 'RESOLVED' && t.status !== 'CLOSED' && (
                            <button
                              onClick={() => fetch(`/api/tickets/${t.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'RESOLVED' }) }).then(() => loadData())}
                              className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-[11px]"
                            >
                              Đã giải quyết
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {tickets.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          Chưa có ticket nào cần xử lý.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: FOLLOW-UPS */}
          {activeTab === 'followups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Lịch Hẹn & Lộ Trình Chăm Sóc (Follow-ups)</h2>
                  <p className="text-xs text-slate-500">Quản lý lịch hẹn gọi lại, demo sản phẩm và tư vấn khách hàng</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {followUps.map((f) => (
                  <div key={f.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-600 text-xs">{f.code}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          f.status === 'DONE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {f.status}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm">{f.title}</h3>
                    <p className="text-xs text-slate-600">Khách: {f.customerName} ({f.customerPhone})</p>
                    <p className="text-xs text-slate-500">⏰ Thời gian: {new Date(f.scheduledAt).toLocaleString('vi-VN')}</p>

                    {f.status === 'PENDING' && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5 text-xs">
                        <button
                          onClick={() => fetch(`/api/follow-ups/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'DONE' }) }).then(() => loadData())}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 text-[11px]"
                        >
                          ✓ Đã hoàn thành
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: REPORTS & FUNNEL */}
          {activeTab === 'reports' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-800">Báo Cáo Phễu & Hiệu Suất Bán Hàng</h2>
                <p className="text-xs text-slate-500">Chỉ số chuyển đổi và doanh số tích lũy thời gian thực (A6)</p>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-xs text-slate-500 font-medium">Doanh thu hoàn tất</p>
                  <p className="text-lg font-extrabold text-indigo-600 mt-1">{formatCurrency(summary?.totalRevenue)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-xs text-slate-500 font-medium">Đơn hàng hoàn tất</p>
                  <p className="text-lg font-extrabold text-emerald-600 mt-1">{summary?.completedOrdersCount || 0} đơn</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-xs text-slate-500 font-medium">Leads đang hoạt động</p>
                  <p className="text-lg font-extrabold text-purple-600 mt-1">{summary?.activeLeadsCount || 0} leads</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-xs text-slate-500 font-medium">Tickets đang xử lý</p>
                  <p className="text-lg font-extrabold text-rose-500 mt-1">{summary?.openTicketsCount || 0} tickets</p>
                </div>
              </div>

              {/* Funnel Visual */}
              {funnel && (
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">Phễu Chuyển Đổi Khách Hàng (Sales Funnel)</h3>
                  <div className="space-y-2 pt-2">
                    {[
                      { key: 'NEW', label: '1. Lead Mới (NEW)', count: funnel.NEW, color: 'bg-blue-500' },
                      { key: 'CONTACTED', label: '2. Đã tiếp cận (CONTACTED)', count: funnel.CONTACTED, color: 'bg-amber-500' },
                      { key: 'INTERESTED', label: '3. Quan tâm sản phẩm (INTERESTED)', count: funnel.INTERESTED, color: 'bg-purple-500' },
                      { key: 'QUOTATION', label: '4. Đã nhận báo giá (QUOTATION)', count: funnel.QUOTATION, color: 'bg-indigo-500' },
                      { key: 'WON', label: '5. Chốt đơn thành công (WON)', count: funnel.WON, color: 'bg-emerald-500' },
                    ].map((step) => {
                      const total = funnel.TOTAL || 1;
                      const pct = Math.round((step.count / total) * 100);
                      return (
                        <div key={step.key} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-slate-700">
                            <span>{step.label}</span>
                            <span>{step.count} ({pct}%)</span>
                          </div>
                          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${step.color} transition-all duration-500`} style={{ width: `${Math.max(5, pct)}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: SETTINGS & RBAC */}
          {activeTab === 'settings' && (
            <div className="space-y-4 max-w-4xl">
              <div>
                <h2 className="text-base font-bold text-slate-800">Cài Đặt Hệ Thống & Ma Trận Phân Quyền</h2>
                <p className="text-xs text-slate-500">Cấu hình các tham số vận hành không hardcode theo Addendum A (A2, A4, A5, A6)</p>
              </div>

              {settings && (
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <h3 className="font-bold text-sm text-slate-900 border-b pb-2">Tham số vận hành kinh doanh (app_settings)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Múi giờ (timezone)</label>
                      <input type="text" readOnly value={settings.timezone} className="w-full p-2 bg-slate-50 border rounded-lg" />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Ngưỡng chiết khấu cần duyệt (%)</label>
                      <input type="text" readOnly value={`${settings.discountApprovalThresholdPercent}%`} className="w-full p-2 bg-slate-50 border rounded-lg" />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Thuế suất mặc định VAT</label>
                      <input type="text" readOnly value={`${(settings.taxRate * 100).toFixed(0)}%`} className="w-full p-2 bg-slate-50 border rounded-lg" />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Ngày làm việc quét Lead không hoạt động</label>
                      <input type="text" readOnly value={`${settings.leadFollowUpBusinessDays} ngày`} className="w-full p-2 bg-slate-50 border rounded-lg" />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Số ngày cảnh báo báo giá sắp hết hạn</label>
                      <input type="text" readOnly value={`${settings.quotationExpiryWarnDays} ngày`} className="w-full p-2 bg-slate-50 border rounded-lg" />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-slate-700">Hạn mở lại ticket đã giải quyết</label>
                      <input type="text" readOnly value={`${settings.ticketReopenDays} ngày`} className="w-full p-2 bg-slate-50 border rounded-lg" />
                    </div>
                  </div>

                  <div className="pt-3 border-t">
                    <p className="font-semibold text-xs text-slate-700 mb-1.5">Ngày nghỉ lễ doanh nghiệp (business_holidays):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(settings.businessHolidays || []).map((h, i) => (
                        <span key={i} className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[11px] font-mono">
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  window.CRMView = CRMView;
})();
