const { useState, useEffect, useRef, useMemo, useCallback } = React;

/**
 * ProductAnalysisModal Component
 * Deep dive AI market analysis modal for trending products.
 * Assigned to window.ProductAnalysisModal (React 18 + TailwindCSS, no import/export).
 */
(function () {
  'use strict';

  function ProductAnalysisModal({ product, isOpen, onClose, onAddToCatalog, showToast }) {
    if (!isOpen || !product) return null;

    const [isWatchlisted, setIsWatchlisted] = useState(false);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'pricing' | 'forecast'
    const [actionLoading, setActionLoading] = useState(false);

    // Close on Escape key
    useEffect(() => {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Format currency
    const formatCurrency = (val) => {
      if (!val && val !== 0) return '0 ₫';
      return Number(val).toLocaleString('vi-VN') + ' ₫';
    };

    // Trend Score color class helper
    const getScoreColorClass = (score) => {
      if (score >= 80) return 'bg-emerald-500 text-white';
      if (score >= 60) return 'bg-blue-500 text-white';
      if (score >= 40) return 'bg-amber-500 text-white';
      if (score >= 20) return 'bg-orange-500 text-white';
      return 'bg-red-500 text-white';
    };

    const getScoreBadgeBg = (score) => {
      if (score >= 80) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (score >= 60) return 'bg-blue-50 text-blue-700 border-blue-200';
      if (score >= 40) return 'bg-amber-50 text-amber-700 border-amber-200';
      if (score >= 20) return 'bg-orange-50 text-orange-700 border-orange-200';
      return 'bg-red-50 text-red-700 border-red-200';
    };

    // Synthesize 14-day history for the product
    const history14Days = useMemo(() => {
      const days = [];
      const base = product.trendScore || 80;
      for (let i = 13; i >= 0; i--) {
        const d = new Date(2026, 10, 15 - i); // Nov 2026
        const dateStr = `${d.getDate() < 10 ? '0' : ''}${d.getDate()}/${d.getMonth() + 1 < 10 ? '0' : ''}${d.getMonth() + 1}`;
        // Slight natural curve towards current trend score
        const variance = Math.sin((14 - i) / 2) * 5 + (13 - i) * 0.4;
        const scoreVal = Math.min(99, Math.max(35, Math.round(base - (i * 0.8) + (i % 3 === 0 ? 2 : -1))));
        days.push({
          day: dateStr,
          score: i === 0 ? product.trendScore : scoreVal,
          isToday: i === 0,
        });
      }
      return days;
    }, [product]);

    // Platform comparison breakdown
    const platformComparisons = useMemo(() => {
      const avg = product.avgPrice || 250000;
      return [
        {
          name: 'TikTok Shop',
          icon: '🎵',
          badgeClass: 'bg-slate-900 text-white',
          price: Math.round((avg * 0.94) / 1000) * 1000,
          promo: 'Voucher -25k & Freeship Extra',
          rating: '4.9 ★',
          sales: `${product.salesVelocity ? Math.round(product.salesVelocity * 1.4) : 1500}+ đơn/tuần`,
          competition: 'Cao (Livestream liên tục)',
          status: 'Bán chạy nhất',
          statusColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        },
        {
          name: 'Shopee Mall',
          icon: '🧡',
          badgeClass: 'bg-orange-500 text-white',
          price: Math.round((avg * 0.98) / 1000) * 1000,
          promo: 'Flash Sale & Xu tích lũy',
          rating: '4.8 ★',
          sales: `${product.salesVelocity || 1000}+ đơn/tuần`,
          competition: 'Cạnh tranh gay gắt',
          status: 'Cầu ổn định',
          statusColor: 'text-blue-600 bg-blue-50 border-blue-200',
        },
        {
          name: 'Lazada Mall',
          icon: '💙',
          badgeClass: 'bg-blue-600 text-white',
          price: Math.round((avg * 1.02) / 1000) * 1000,
          promo: 'Hoàn tiền MAX 12%',
          rating: '4.7 ★',
          sales: `${Math.round((product.salesVelocity || 800) * 0.6)}+ đơn/tuần`,
          competition: 'Trung bình',
          status: 'Biên lợi nhuận tốt',
          statusColor: 'text-indigo-600 bg-indigo-50 border-indigo-200',
        },
        {
          name: 'Google Shopping',
          icon: '🌐',
          badgeClass: 'bg-emerald-600 text-white',
          price: Math.round((avg * 1.06) / 1000) * 1000,
          promo: 'Giá niêm yết website chính hãng',
          rating: '4.6 ★',
          sales: 'Tìm kiếm tự nhiên cao',
          competition: 'Thấp (Cần tối ưu SEO)',
          status: 'Tiềm năng ngách',
          statusColor: 'text-purple-600 bg-purple-50 border-purple-200',
        },
      ];
    }, [product]);

    // Recommended calculations
    const pricingRecommendation = useMemo(() => {
      const avg = product.avgPrice || 250000;
      const minRec = Math.round((avg * 0.92) / 1000) * 1000;
      const maxRec = Math.round((avg * 1.08) / 1000) * 1000;
      const estimatedCost = Math.round((avg * 0.52) / 1000) * 1000;
      const estimatedMargin = Math.round(((avg - estimatedCost) / avg) * 100);
      return {
        minRec,
        maxRec,
        estimatedCost,
        estimatedMargin,
      };
    }, [product]);

    // Handle watchlisting
    const handleToggleWatchlist = () => {
      setIsWatchlisted(!isWatchlisted);
      if (showToast) {
        showToast(
          !isWatchlisted
            ? `Đã thêm "${product.name}" vào danh sách theo dõi xu hướng!`
            : `Đã gỡ "${product.name}" khỏi danh sách theo dõi.`,
          'info'
        );
      }
    };

    // Handle adding to catalog
    const handleAddToCatalog = () => {
      setActionLoading(true);
      setTimeout(() => {
        setActionLoading(false);
        if (onAddToCatalog) {
          onAddToCatalog(product);
        } else if (showToast) {
          showToast(`Đã nhập "${product.name}" vào danh mục kho Mini Pancake!`, 'success');
        }
      }, 400);
    };

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
        <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] transform transition-all">
          {/* Header */}
          <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0 pr-4">
              <span className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-xl flex-shrink-0">
                🔍
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                    Phân tích chuyên sâu AI
                  </span>
                  <span className="text-xs text-slate-300">Mã: {product.id}</span>
                </div>
                <h3 className="font-bold text-lg sm:text-xl text-white truncate mt-0.5">
                  {product.name}
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors focus:outline-none flex-shrink-0"
              title="Đóng (Esc)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Subheader: Key Metrics Summary Bar */}
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-wrap gap-3 flex-shrink-0 text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <span className="text-slate-500 block text-[11px]">Danh mục:</span>
                <span className="font-bold text-slate-800">{product.category}</span>
              </div>
              <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
              <div>
                <span className="text-slate-500 block text-[11px]">Điểm Trending:</span>
                <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md text-xs ${getScoreBadgeBg(product.trendScore)}`}>
                  ⚡ {product.trendScore}/100 ({product.trendScore >= 80 ? 'Rất hot' : product.trendScore >= 60 ? 'Tăng trưởng' : 'Ổn định'})
                </span>
              </div>
              <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
              <div>
                <span className="text-slate-500 block text-[11px]">Giá thị trường TB:</span>
                <span className="font-bold text-indigo-600 text-sm">{formatCurrency(product.avgPrice)}</span>
              </div>
              <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
              <div>
                <span className="text-slate-500 block text-[11px]">Tốc độ bán ước tính:</span>
                <span className="font-semibold text-slate-800">🔥 ~{Number(product.salesVelocity || 900).toLocaleString('vi-VN')} đơn/ngày</span>
              </div>
            </div>

            {/* Navigation Tabs inside Modal */}
            <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1 rounded-lg font-semibold text-xs transition-all ${
                  activeTab === 'overview'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tổng quan & AI
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pricing')}
                className={`px-3 py-1 rounded-lg font-semibold text-xs transition-all ${
                  activeTab === 'pricing'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                So sánh giá sàn
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('forecast')}
                className={`px-3 py-1 rounded-lg font-semibold text-xs transition-all ${
                  activeTab === 'forecast'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lịch sử 14 ngày
              </button>
            </div>
          </div>

          {/* Modal Body: Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            {/* TAB 1: OVERVIEW & AI INSIGHTS */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Product Bio + Tags */}
                <div className="flex flex-col md:flex-row gap-5 items-start p-4 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50 rounded-2xl border border-indigo-100">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-white border border-slate-200 overflow-hidden flex-shrink-0 shadow-sm relative group">
                    <img
                      src={product.imageUrl || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=200&h=200&fit=crop'}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=200&h=200&fit=crop';
                      }}
                    />
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-xs text-white text-[9px] font-bold">
                      {product.trend === 'rising' ? '↑ TĂNG' : product.trend === 'declining' ? '↓ GIẢM' : '→ ỔN ĐỊNH'}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                        {product.category}
                      </span>
                      {product.tags &&
                        product.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
                          >
                            #{tag}
                          </span>
                        ))}
                      <span className="text-[11px] text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md font-semibold">
                        Tâm lý thị trường: {product.sentiment === 'positive' ? 'Rất tích cực (89%)' : 'Trung lập'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {product.description ||
                        'Sản phẩm ghi nhận lượng thảo luận bùng nổ trên các nền tảng mạng xã hội và sàn TMĐT trong 72 giờ qua, tỷ lệ chuyển đổi đơn hàng trung bình đạt 4.8%.'}
                    </p>

                    {/* Sources Badge Row */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-slate-500 font-medium">Hiện diện trên sàn:</span>
                      <div className="flex items-center gap-1.5">
                        {product.sources?.map((s) => (
                          <span
                            key={s}
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full capitalize ${
                              s === 'shopee'
                                ? 'bg-orange-500 text-white'
                                : s === 'lazada'
                                ? 'bg-blue-600 text-white'
                                : s === 'tiktok'
                                ? 'bg-slate-900 text-white'
                                : 'bg-emerald-600 text-white'
                            }`}
                          >
                            {s === 'tiktok' ? 'TikTok Shop' : s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Deep Analysis Cards (3 Pillars) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Pillar 1: Demand Forecast */}
                  <div className="p-4 rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50/60 to-white shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                        <span>📈</span>
                        <span>Dự báo nhu cầu</span>
                      </span>
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        +35% / 14 ngày
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Nhu cầu tìm kiếm có xu hướng tiếp tục tăng vọt trong 2 tuần tới nhờ hiệu ứng truyền miệng và thời điểm mua sắm cận mùa khuyến mãi lớn.
                    </p>
                    <div className="pt-1 flex items-center gap-2 text-[11px] font-semibold text-blue-800">
                      <span>Mức độ tự tin AI:</span>
                      <span className="font-bold">92%</span>
                    </div>
                  </div>

                  {/* Pillar 2: Competition Level */}
                  <div className="p-4 rounded-xl border border-amber-100 bg-gradient-to-b from-amber-50/60 to-white shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <span>⚔️</span>
                        <span>Mức độ cạnh tranh</span>
                      </span>
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        Trung bình - Thấp
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Phân khúc giá tầm trung vẫn còn nhiều khoảng trống thị trường; các shop lớn chủ yếu tập trung phân khúc giá rẻ với chất lượng thấp hơn.
                    </p>
                    <div className="pt-1 flex items-center gap-2 text-[11px] font-semibold text-amber-800">
                      <span>Rào cản gia nhập:</span>
                      <span className="font-bold">Thấp (Nguồn hàng sẵn)</span>
                    </div>
                  </div>

                  {/* Pillar 3: Profit Potential */}
                  <div className="p-4 rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/60 to-white shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                        <span>💰</span>
                        <span>Tiềm năng lợi nhuận</span>
                      </span>
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        {pricingRecommendation.estimatedMargin}% Biên lãi
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Biên lợi nhuận gộp hấp dẫn ước tính đạt từ 45% đến 58%. Khả năng bán kèm (cross-sell) và upsell đạt tỉ lệ trên 35%.
                    </p>
                    <div className="pt-1 flex items-center gap-2 text-[11px] font-semibold text-emerald-800">
                      <span>ROI ước tính:</span>
                      <span className="font-bold">1.8x - 2.4x</span>
                    </div>
                  </div>
                </div>

                {/* Price Recommendation & Financial Matrix */}
                <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4 shadow-md">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-indigo-300 flex items-center gap-2">
                        <span>🏷️</span>
                        <span>Khuyến nghị định giá bán tối ưu (AI Recommendation)</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Dựa trên phân tích 1.200 giao dịch tương tự và điểm co giãn giá của người tiêu dùng.
                      </p>
                    </div>
                    <div className="px-3 py-1 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 font-bold text-xs">
                      Đề xuất: {formatCurrency(pricingRecommendation.minRec)} - {formatCurrency(pricingRecommendation.maxRec)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-[11px] text-slate-400 block">Giá vốn ước tính (COGS)</span>
                      <span className="text-sm sm:text-base font-bold text-slate-200">
                        {formatCurrency(pricingRecommendation.estimatedCost)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-[11px] text-slate-400 block">Giá bán đề xuất</span>
                      <span className="text-sm sm:text-base font-bold text-emerald-400">
                        {formatCurrency(product.avgPrice)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-[11px] text-slate-400 block">Lợi nhuận gộp / SP</span>
                      <span className="text-sm sm:text-base font-bold text-amber-300">
                        {formatCurrency(product.avgPrice - pricingRecommendation.estimatedCost)}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <span className="text-[11px] text-slate-400 block">Tỷ suất lợi nhuận</span>
                      <span className="text-sm sm:text-base font-bold text-indigo-300">
                        ~{pricingRecommendation.estimatedMargin}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Target Audience & Marketing Channels Strategy */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Target Audience */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                    <h4 className="font-bold text-xs text-slate-800 flex items-center gap-2">
                      <span className="p-1 rounded bg-indigo-50 text-indigo-600">🎯</span>
                      <span>Chân dung khách hàng mục tiêu</span>
                    </h4>
                    <ul className="text-xs text-slate-600 space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span><strong>Nhân khẩu học:</strong> Nam & Nữ từ 18 - 32 tuổi, sinh viên, nhân viên văn phòng thu nhập 8M - 20M/tháng.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span><strong>Hành vi mua sắm:</strong> Thường xuyên lướt TikTok sau 20h, thích săn voucher giảm giá và freeship.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span><strong>Động lực chính:</strong> Bị thuyết phục bởi video trải nghiệm thực tế (unboxing), trước/sau sử dụng.</span>
                      </li>
                    </ul>
                  </div>

                  {/* Marketing Channels */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                    <h4 className="font-bold text-xs text-slate-800 flex items-center gap-2">
                      <span className="p-1 rounded bg-amber-50 text-amber-600">🚀</span>
                      <span>Kênh tiếp thị & Kịch bản bán hàng đề xuất</span>
                    </h4>
                    <ul className="text-xs text-slate-600 space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold">•</span>
                        <span><strong>TikTok Shop Livestream:</strong> Khung giờ vàng 12h-14h và 20h-23h, tạo combo độc quyền giảm 10%.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold">•</span>
                        <span><strong>Shopee Video:</strong> Đăng video review ngắn gắn link sản phẩm để nhận trợ giá sàn lên tới 20%.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold">•</span>
                        <span><strong>Chatbot Mini Pancake:</strong> Kịch bản tư vấn tự động khi khách hỏi về giá hoặc công dụng sản phẩm.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PLATFORM PRICE COMPARISON */}
            {activeTab === 'pricing' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">
                      So sánh giá và doanh số trên các sàn TMĐT Việt Nam
                    </h4>
                    <p className="text-xs text-slate-500">
                      Dữ liệu tổng hợp từ hệ thống theo dõi giá thị trường trong 24 giờ qua.
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">Khoảng giá chung: {formatCurrency(product.priceRange?.min)} - {formatCurrency(product.priceRange?.max)}</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4">Sàn thương mại</th>
                        <th className="py-3 px-4">Giá trung bình</th>
                        <th className="py-3 px-4">Chương trình khuyến mãi</th>
                        <th className="py-3 px-4">Đánh giá & Bán ra</th>
                        <th className="py-3 px-4">Cạnh tranh</th>
                        <th className="py-3 px-4 text-right">Nhận định AI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {platformComparisons.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2 font-bold text-slate-800">
                              <span className="text-base">{item.icon}</span>
                              <span>{item.name}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-indigo-600 text-sm">
                            {formatCurrency(item.price)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                              {item.promo}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-slate-800 font-semibold">{item.sales}</div>
                            <div className="text-amber-500 text-[11px]">{item.rating} (Hài lòng)</div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 text-[11px]">
                            {item.competition}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${item.statusColor}`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>💡</span>
                    <span>Mẹo cạnh tranh cho chủ shop:</span>
                  </div>
                  <p>
                    Để đạt doanh số tốt nhất khi đăng bán sản phẩm này, hãy định giá niêm yết ở mức <strong>{formatCurrency(pricingRecommendation.maxRec)}</strong> kèm voucher giảm giá trực tiếp <strong>15%</strong> để hiển thị nhãn Flash Sale trên sàn Shopee và TikTok Shop.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 3: 14-DAY TREND HISTORY CHART */}
            {activeTab === 'forecast' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">
                      Lịch sử điểm số xu hướng trong 14 ngày qua
                    </h4>
                    <p className="text-xs text-slate-500">
                      Biểu đồ ghi nhận biến động chỉ số sức hút từ ngày 02/11/2026 đến hôm nay.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-emerald-500 inline-block"></span>
                      <span>Điểm cao (&gt;80)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-blue-500 inline-block"></span>
                      <span>Ổn định (60-79)</span>
                    </span>
                  </div>
                </div>

                {/* CSS Bars Chart Container */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="h-56 w-full flex items-end justify-between gap-1.5 sm:gap-3 px-2 pt-8 pb-2 border-b border-slate-200">
                    {history14Days.map((item, idx) => {
                      const isHot = item.score >= 80;
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative">
                          {/* Tooltip on Hover */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[10px] font-bold py-1 px-2 rounded whitespace-nowrap pointer-events-none z-10 shadow-lg">
                            {item.day}: {item.score} điểm
                          </div>

                          {/* Top score number */}
                          <span className={`text-[10px] font-semibold ${item.isToday ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
                            {item.score}
                          </span>

                          {/* Bar */}
                          <div className="w-full max-w-[28px] bg-slate-200 rounded-t-md overflow-hidden flex flex-col justify-end">
                            <div
                              style={{ height: `${item.score}%` }}
                              className={`w-full rounded-t-md transition-all duration-500 ${
                                item.isToday
                                  ? 'bg-gradient-to-t from-indigo-600 to-indigo-400 ring-2 ring-indigo-300'
                                  : isHot
                                  ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                                  : 'bg-gradient-to-t from-blue-600 to-blue-400'
                              } group-hover:brightness-110`}
                            ></div>
                          </div>

                          {/* Day Label */}
                          <span className={`text-[10px] mt-1 ${item.isToday ? 'text-indigo-700 font-bold' : 'text-slate-500'}`}>
                            {item.day}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <span>14 ngày trước (02/11)</span>
                    <span className="font-semibold text-indigo-700">Hôm nay ({product.trendScore} điểm - Xu hướng {product.trend === 'rising' ? 'Tăng mạnh' : 'Ổn định'})</span>
                  </div>
                </div>

                <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-200 text-xs text-indigo-950 flex items-start gap-3">
                  <span className="text-xl">📊</span>
                  <div className="space-y-1">
                    <p className="font-bold">Đánh giá động lượng xu hướng (Trend Momentum):</p>
                    <p className="text-indigo-900/80 leading-relaxed">
                      Chỉ số xu hướng của <strong>{product.name}</strong> tăng liên tục trong 5 ngày qua (+{product.changeFromYesterday || 4} điểm so với hôm qua). Động lượng hiện tại báo hiệu chu kỳ tăng trưởng sẽ đạt đỉnh trong khoảng 7 đến 10 ngày tới. Đây là thời điểm vàng để nhập hàng và mở rộng chiến dịch quảng cáo.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleWatchlist}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border ${
                  isWatchlisted
                    ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span>{isWatchlisted ? '⭐ Đã theo dõi' : '☆ Thêm vào theo dõi'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  if (showToast) showToast('Đã sao chép liên kết phân tích!', 'info');
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors"
                title="Chia sẻ báo cáo"
              >
                🔗 Chia sẻ
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                Đóng
              </button>

              <button
                type="button"
                onClick={handleAddToCatalog}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 shadow-md shadow-indigo-200 flex items-center gap-2 transition-all transform active:scale-95 disabled:opacity-50"
              >
                {actionLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Đang thêm...</span>
                  </>
                ) : (
                  <>
                    <span>📦</span>
                    <span>Thêm vào kho hàng Mini Pancake</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Assign to window
  if (typeof window !== 'undefined') {
    window.ProductAnalysisModal = ProductAnalysisModal;
  }
})();
