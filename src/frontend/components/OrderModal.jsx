/**
 * OrderModal Component
 * ────────────────────
 * Interactive modal for quick creation of Orders, Quotations, Support Tickets, and Follow-up Appointments
 * from anywhere in the SmartSales layout (Overview, Inbox, or Customer Profile).
 */

(function () {
  'use strict';

  const { useState, useMemo } = window.React;

  function OrderModal({
    isOpen,
    type = 'order', // 'order' | 'quote' | 'ticket' | 'followup'
    onClose,
    customer,
    onSuccess,
    showToast,
  }) {
    if (!isOpen) return null;

    const [customerName, setCustomerName] = useState(customer?.name || 'Nguyễn Minh Anh');
    const [customerPhone, setCustomerPhone] = useState(customer?.phone || '0987654321');
    const [customerAddress, setCustomerAddress] = useState(
      customer?.address?.detail || customer?.location || 'Số 12 ngõ 86 Duy Tân, Cầu Giấy, Hà Nội'
    );
    const [selectedProduct, setSelectedProduct] = useState('Camera A');
    const [quantity, setQuantity] = useState(2);
    const [price, setPrice] = useState(4590000);
    const [shippingFee, setShippingFee] = useState(30000);
    const [discount, setDiscount] = useState(0);
    const [notes, setNotes] = useState('Giao hàng giờ hành chính, bọc kỹ xốp khí');

    // Ticket specific
    const [ticketSubject, setTicketSubject] = useState('Hỏi về phụ kiện và bảo hành Camera A');
    const [ticketPriority, setTicketPriority] = useState('HIGH');

    // Follow-up specific
    const [followUpDate, setFollowUpDate] = useState('2024-03-13T09:00');
    const [followUpTitle, setFollowUpTitle] = useState('Gọi xác nhận trải nghiệm và bảo hành');

    const totalAmount = useMemo(() => {
      return quantity * price + shippingFee - discount;
    }, [quantity, price, shippingFee, discount]);

    const handleSubmit = (e) => {
      e?.preventDefault();

      if (type === 'order') {
        const newOrder = {
          orderCode: 'DH-20240312-' + Math.floor(1000 + Math.random() * 9000),
          customerName,
          customerPhone,
          total: totalAmount,
          status: 'CONFIRMED',
          createdAt: new Date().toISOString(),
        };
        if (showToast) showToast(`Tạo đơn hàng ${newOrder.orderCode} thành công!`, 'success');
        if (onSuccess) onSuccess(newOrder);
      } else if (type === 'quote') {
        const newQuote = {
          code: 'QT-20240312-' + Math.floor(1000 + Math.random() * 9000),
          customerName,
          total: totalAmount,
          status: 'SENT',
        };
        if (showToast) showToast(`Tạo báo giá ${newQuote.code} thành công!`, 'success');
        if (onSuccess) onSuccess(newQuote);
      } else if (type === 'ticket') {
        const newTicket = {
          code: 'TK-20240312-' + Math.floor(1000 + Math.random() * 9000),
          subject: ticketSubject,
          priority: ticketPriority,
          status: 'OPEN',
        };
        if (showToast) showToast(`Đã tạo Ticket ${newTicket.code} (SLA 4h)`, 'success');
        if (onSuccess) onSuccess(newTicket);
      } else if (type === 'followup') {
        if (showToast) showToast(`Đã lên lịch hẹn gọi điện chăm sóc vào ${followUpDate}`, 'success');
        if (onSuccess) onSuccess({ title: followUpTitle, date: followUpDate });
      }

      onClose();
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">
                {type === 'order' ? '🛒' : type === 'quote' ? '📄' : type === 'ticket' ? '🎧' : '📅'}
              </span>
              <h3 className="font-bold text-slate-900 text-sm md:text-base">
                {type === 'order'
                  ? 'Tạo đơn hàng mới'
                  : type === 'quote'
                  ? 'Tạo báo giá'
                  : type === 'ticket'
                  ? 'Tạo Ticket hỗ trợ'
                  : 'Đặt lịch chăm sóc khách hàng'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Modal Form Body */}
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
            {/* Customer Details */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                Thông tin khách hàng
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-medium block mb-1">Họ và tên</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-medium block mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 font-medium block mb-1">Địa chỉ nhận hàng</label>
                <input
                  type="text"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Product selection for Order / Quote */}
            {(type === 'order' || type === 'quote') && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                  Sản phẩm &amp; Chi phí
                </h4>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-slate-500 font-medium block mb-1">Chọn sản phẩm</label>
                    <select
                      value={selectedProduct}
                      onChange={(e) => setSelectedProduct(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="Camera A">Camera A - 4.590.000đ</option>
                      <option value="Son môi lì cao cấp">Son môi lì cao cấp - 250.000đ</option>
                      <option value="Kem chống nắng SPF50+">Kem chống nắng SPF50+ - 320.000đ</option>
                      <option value="Serum Vitamin C">Serum Vitamin C - 450.000đ</option>
                      <option value="Áo thun unisex basic">Áo thun unisex basic - 180.000đ</option>
                      <option value="Quần jogger thể thao">Quần jogger thể thao - 350.000đ</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-500 font-medium block mb-1">Số lượng</label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 text-center font-bold"
                    />
                  </div>
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-center justify-between text-slate-800">
                  <span className="font-medium">Tổng thanh toán dự tính:</span>
                  <span className="text-base font-bold text-blue-700">
                    {totalAmount.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>
            )}

            {/* Ticket fields */}
            {type === 'ticket' && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-slate-500 font-medium block mb-1">Tiêu đề yêu cầu</label>
                  <input
                    type="text"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-medium block mb-1">Mức độ ưu tiên (SLA)</label>
                  <select
                    value={ticketPriority}
                    onChange={(e) => setTicketPriority(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="HIGH">Cao (SLA 4h giải quyết)</option>
                    <option value="MEDIUM">Trung bình (SLA 8h giải quyết)</option>
                    <option value="LOW">Thấp (SLA 24h giải quyết)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Follow-up fields */}
            {type === 'followup' && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-slate-500 font-medium block mb-1">Mục đích cuộc gọi</label>
                  <input
                    type="text"
                    value={followUpTitle}
                    onChange={(e) => setFollowUpTitle(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-slate-500 font-medium block mb-1">Thời gian hẹn</label>
                  <input
                    type="datetime-local"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-slate-500 font-medium block mb-1">Ghi chú nội bộ</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows="2"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-semibold transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm shadow-blue-200 transition-colors"
              >
                Xác nhận
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  window.OrderModal = OrderModal;
})();
