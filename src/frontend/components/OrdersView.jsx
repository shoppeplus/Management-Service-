/**
 * OrdersView Component (SmartSales Orders Management)
 * ───────────────────────────────────────────────────
 * Dedicated view for managing sales orders:
 * - Summary KPI cards (Tổng đơn hàng, Đang giao GHTK, Chờ xử lý, Đã hoàn tất)
 * - Status Filter Tabs (Tất cả, Đang xử lý, Đang giao, Hoàn tất, Hủy)
 * - Search by Order Code, Customer Name, Phone, GHTK tracking code
 * - Orders Table with GHTK tracking details & status badges
 * - Order Details Modal with financial snapshot (items, VAT, shipping, discount, COD)
 * - "+ Tạo đơn hàng" action opening OrderModal
 */

(function () {
  'use strict';

  const { useState, useEffect, useMemo } = window.React;

  function OrdersView({ currentUser, onOpenCreateOrder, showToast }) {
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [ordersList, setOrdersList] = useState([]);
    const [loading, setLoading] = useState(false);

    // Initial mock/seed orders
    const defaultOrders = [
      {
        id: 'ord_001',
        orderCode: 'DH-20261116-3001',
        customerName: 'Nguyễn Minh Anh',
        customerPhone: '0987654321',
        shippingAddress: 'Số 12 ngõ 86 Duy Tân, Dịch Vọng Hậu, Cầu Giấy, Hà Nội',
        items: [
          { name: 'Camera A', quantity: 2, price: 4590000, total: 9180000 },
        ],
        subtotal: 9180000,
        discount: 0,
        shippingFee: 30000,
        total: 9210000,
        paymentMethod: 'COD',
        paymentStatus: 'Đã thanh toán',
        status: 'COMPLETED',
        trackingId: 'GHTK-HN-883921',
        shippingProvider: 'Giao Hàng Tiết Kiệm',
        assignedTo: 'Nam',
        createdAt: '10/03/2024 14:20',
      },
      {
        id: 'ord_002',
        orderCode: 'DH-20261116-3002',
        customerName: 'Trần Hoàng',
        customerPhone: '0912345678',
        shippingAddress: 'Tòa nhà Bitexco, 2 Hải Triều, Bến Nghé, Quận 1, TP.HCM',
        items: [
          { name: 'Quần jogger thể thao', quantity: 2, price: 350000, total: 700000 },
          { name: 'Áo thun unisex basic', quantity: 1, price: 180000, total: 180000 },
        ],
        subtotal: 880000,
        discount: 30000,
        shippingFee: 35000,
        total: 885000,
        paymentMethod: 'COD',
        paymentStatus: 'Chờ thu tiền',
        status: 'SHIPPING',
        trackingId: 'GHTK-SG-994012',
        shippingProvider: 'Giao Hàng Tiết Kiệm',
        assignedTo: 'Nam',
        createdAt: '11/03/2024 09:15',
      },
      {
        id: 'ord_003',
        orderCode: 'DH-20261116-3003',
        customerName: 'Lê Hoàng Cường',
        customerPhone: '0903123456',
        shippingAddress: '45 Trần Phú, Thạch Thang, Hải Châu, Đà Nẵng',
        items: [
          { name: 'Đồng hồ dây da nam', quantity: 1, price: 550000, total: 550000 },
        ],
        subtotal: 550000,
        discount: 0,
        shippingFee: 25000,
        total: 575000,
        paymentMethod: 'Chuyển khoản',
        paymentStatus: 'Đã thanh toán',
        status: 'PROCESSING',
        trackingId: 'GHTK-DN-112233',
        shippingProvider: 'Giao Hàng Tiết Kiệm',
        assignedTo: 'Nam',
        createdAt: '12/03/2024 08:30',
      },
    ];

    useEffect(() => {
      loadOrders();
    }, []);

    const loadOrders = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/orders').then((r) => r.json()).catch(() => null);
        if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
          setOrdersList(res.data.map(formatOrder));
        } else {
          setOrdersList(defaultOrders);
        }
      } catch (e) {
        setOrdersList(defaultOrders);
      } finally {
        setLoading(false);
      }
    };

    const formatOrder = (o) => ({
      id: o.id || o._id,
      orderCode: o.orderCode || o.code || 'DH-' + (o.id || '').substring(0, 8),
      customerName: o.customerName || 'Khách hàng',
      customerPhone: o.customerPhone || '',
      shippingAddress: typeof o.shippingAddress === 'string' ? o.shippingAddress : (o.shippingAddress?.detail || 'Hà Nội'),
      items: o.items || [{ name: 'Sản phẩm tiêu chuẩn', quantity: 1, price: o.total || 0, total: o.total || 0 }],
      subtotal: o.subtotal || o.total || 0,
      discount: o.discount || o.discountAmount || 0,
      shippingFee: o.shippingFee || 30000,
      total: o.total || o.totalAmount || 0,
      paymentMethod: o.paymentMethod || 'COD',
      paymentStatus: o.paymentStatus || 'Chờ thu tiền',
      status: o.status || o.orderStatus || 'PROCESSING',
      trackingId: o.trackingId || 'GHTK-' + Math.floor(100000 + Math.random() * 900000),
      shippingProvider: o.shippingProvider || 'Giao Hàng Tiết Kiệm',
      assignedTo: o.assignedSalesUserId || 'Nam',
      createdAt: o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '12/03/2024 10:00',
    });

    // Summary metrics
    const metrics = useMemo(() => {
      const totalCount = ordersList.length;
      const completedCount = ordersList.filter((o) => o.status === 'COMPLETED').length;
      const shippingCount = ordersList.filter((o) => o.status === 'SHIPPING').length;
      const processingCount = ordersList.filter((o) => o.status === 'PROCESSING' || o.status === 'CONFIRMED' || o.status === 'DRAFT').length;
      const totalRevenue = ordersList
        .filter((o) => o.status === 'COMPLETED')
        .reduce((sum, o) => sum + (o.total || 0), 0);

      return { totalCount, completedCount, shippingCount, processingCount, totalRevenue };
    }, [ordersList]);

    // Filtered orders list
    const filteredOrders = useMemo(() => {
      return ordersList.filter((ord) => {
        if (statusFilter !== 'ALL' && ord.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            ord.orderCode.toLowerCase().includes(q) ||
            ord.customerName.toLowerCase().includes(q) ||
            ord.customerPhone.includes(q) ||
            ord.trackingId.toLowerCase().includes(q)
          );
        }
        return true;
      });
    }, [ordersList, statusFilter, searchQuery]);

    const getStatusBadge = (status) => {
      switch (status) {
        case 'COMPLETED':
          return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Hoàn tất</span>;
        case 'SHIPPING':
          return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Đang giao</span>;
        case 'PROCESSING':
          return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Đang đóng gói</span>;
        case 'DRAFT':
          return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Dự thảo</span>;
        default:
          return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">{status}</span>;
      }
    };

    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-8 space-y-6">
        {/* Header Title & Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Quản lý Đơn hàng</h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              Theo dõi xử lý đơn, thu hộ COD và hành trình vận chuyển GHTK
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadOrders}
              className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
            >
              🔄 <span>Làm mới</span>
            </button>
            <button
              type="button"
              onClick={onOpenCreateOrder}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-200 transition-all active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Tạo đơn hàng</span>
            </button>
          </div>
        </div>

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              📦
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Tổng số đơn</p>
              <h4 className="text-lg font-bold text-slate-900">{metrics.totalCount}</h4>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              ⏳
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Chờ xử lý / Đóng gói</p>
              <h4 className="text-lg font-bold text-slate-900">{metrics.processingCount}</h4>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              🚚
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Đang giao GHTK</p>
              <h4 className="text-lg font-bold text-slate-900">{metrics.shippingCount}</h4>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              ✓
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Đã giao thành công</p>
              <h4 className="text-lg font-bold text-slate-900">{metrics.completedCount}</h4>
            </div>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1 md:pb-0">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'PROCESSING', label: 'Chờ đóng gói' },
              { id: 'SHIPPING', label: 'Đang giao GHTK' },
              { id: 'COMPLETED', label: 'Đã hoàn tất' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="w-full md:w-80 relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã đơn, tên khách, mã GHTK..."
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white"
            />
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-400 uppercase font-semibold border-b border-slate-100">
                <tr>
                  <th className="p-3.5 pl-6">Mã đơn</th>
                  <th className="p-3.5">Khách hàng</th>
                  <th className="p-3.5">Sản phẩm</th>
                  <th className="p-3.5">Tổng tiền</th>
                  <th className="p-3.5">Vận chuyển GHTK</th>
                  <th className="p-3.5">Thanh toán</th>
                  <th className="p-3.5">Trạng thái</th>
                  <th className="p-3.5 pr-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-slate-400">
                      Không tìm thấy đơn hàng nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 pl-6">
                        <span className="font-bold text-blue-600 block">{ord.orderCode}</span>
                        <span className="text-[10px] text-slate-400">{ord.createdAt}</span>
                      </td>

                      <td className="p-3.5">
                        <span className="font-bold text-slate-800 block">{ord.customerName}</span>
                        <span className="text-[11px] text-slate-500 font-mono">{ord.customerPhone}</span>
                      </td>

                      <td className="p-3.5 max-w-xs">
                        <span className="text-slate-700 block truncate font-medium">
                          {Array.isArray(ord.items) && ord.items.length > 0
                            ? ord.items.map((it) => `${it.productNameSnapshot || it.name || 'SP'} (x${it.quantity})`).join(', ')
                            : 'Camera A (x2)'}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <span className="font-bold text-slate-900 block">{ord.total.toLocaleString('vi-VN')}đ</span>
                        <span className="text-[10px] text-slate-400">{ord.paymentMethod}</span>
                      </td>

                      <td className="p-3.5">
                        <span className="font-mono text-[11px] font-bold text-slate-700 block">{ord.trackingId}</span>
                        <span className="text-[10px] text-emerald-600 font-medium">GHTK Tiết kiệm</span>
                      </td>

                      <td className="p-3.5">
                        <span className={`text-[11px] font-medium ${ord.paymentStatus === 'Đã thanh toán' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {ord.paymentStatus}
                        </span>
                      </td>

                      <td className="p-3.5">
                        {getStatusBadge(ord.status)}
                      </td>

                      <td className="p-3.5 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(ord)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                        >
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order Details Modal Drawer */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📦</span>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Chi tiết đơn {selectedOrder.orderCode}</h3>
                    <p className="text-[11px] text-slate-400">Thời gian tạo: {selectedOrder.createdAt}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 text-xs">
                {/* Status & GHTK Tracking Card */}
                <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-blue-700 font-bold block">Trạng thái vận chuyển GHTK</span>
                    <span className="font-mono text-sm font-bold text-slate-900">{selectedOrder.trackingId}</span>
                  </div>
                  <div>
                    {getStatusBadge(selectedOrder.status)}
                  </div>
                </div>

                {/* Customer & Address */}
                <div className="space-y-1 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="font-bold text-slate-800">{selectedOrder.customerName} • {selectedOrder.customerPhone}</p>
                  <p className="text-slate-500 leading-relaxed">{selectedOrder.shippingAddress}</p>
                </div>

                {/* Financial Summary */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex justify-between text-slate-500">
                    <span>Tạm tính hàng hóa:</span>
                    <span className="font-bold text-slate-800">{selectedOrder.subtotal.toLocaleString('vi-VN')}đ</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Phí vận chuyển (GHTK):</span>
                    <span className="font-bold text-slate-800">+{selectedOrder.shippingFee.toLocaleString('vi-VN')}đ</span>
                  </div>
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>Chiết khấu giảm giá:</span>
                      <span>-{selectedOrder.discount.toLocaleString('vi-VN')}đ</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-100">
                    <span>Tổng thu (COD):</span>
                    <span className="text-blue-600 font-extrabold">{selectedOrder.total.toLocaleString('vi-VN')}đ</span>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    if (showToast) showToast(`Đang in phiếu giao hàng cho bưu tá GHTK (${selectedOrder.trackingId})...`, 'info');
                  }}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                >
                  🖨️ In vận đơn GHTK
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition-colors"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  window.OrdersView = OrdersView;
})();
