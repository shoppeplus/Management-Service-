const { useState, useEffect, useRef, useMemo, useCallback } = React;

/**
 * TrendDashboard Component
 * Comprehensive market trend intelligence dashboard for Mini Pancake SaaS.
 * Real-time ecommerce multi-channel product trends, AI market insights & predictive analytics.
 * Assigned to window.TrendDashboard (CDN-loaded React 18 + TailwindCSS).
 */
(function () {
  'use strict';

  function TrendDashboard({ trendsData, showToast, onOpenChat, onAddToCatalog }) {
    // -----------------------------------------------------------------------
    // State Initialization
    // -----------------------------------------------------------------------
    const rawTrends = useMemo(() => {
      return trendsData || window.MockData?.trends || { latest: [], report: {}, history: {}, categories: [] };
    }, [trendsData]);

    const [productsList, setProductsList] = useState(rawTrends.latest || []);
    const [reportData, setReportData] = useState(rawTrends.report || {});
    const [historyData, setHistoryData] = useState(rawTrends.history || {});
    const [categoriesData, setCategoriesData] = useState(rawTrends.categories || []);

    // Filter & Sorting state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedSource, setSelectedSource] = useState('all');
    const [selectedTrendFilter, setSelectedTrendFilter] = useState('all'); // all, rising, stable, declining
    const [sortField, setSortField] = useState('trendScore'); // trendScore, avgPrice, salesVelocity, changeFromYesterday
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'
    const [dateRange, setDateRange] = useState('today'); // today, yesterday, this_week, custom

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    // Controls state
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState('11:28 - 15/11/2026');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [isReportExpanded, setIsReportExpanded] = useState(true);

    // Modal state for deep analysis
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Watchlist state
    const [watchlistedIds, setWatchlistedIds] = useState(new Set());

    // Sync when prop updates
    useEffect(() => {
      if (rawTrends.latest) setProductsList(rawTrends.latest);
      if (rawTrends.report) setReportData(rawTrends.report);
      if (rawTrends.history) setHistoryData(rawTrends.history);
      if (rawTrends.categories) setCategoriesData(rawTrends.categories);
    }, [rawTrends]);

    // Auto-refresh timer
    useEffect(() => {
      let interval;
      if (autoRefresh) {
        interval = setInterval(() => {
          handleManualRefresh(true);
        }, 30000); // 30 seconds for demo
      }
      return () => {
        if (interval) clearInterval(interval);
      };
    }, [autoRefresh]);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------
    const handleManualRefresh = (isAuto = false) => {
      setIsRefreshing(true);
      setTimeout(() => {
        const now = new Date();
        const timeStr = `${now.getHours() < 10 ? '0' : ''}${now.getHours()}:${
          now.getMinutes() < 10 ? '0' : ''
        }${now.getMinutes()} - ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
        setLastUpdated(timeStr);
        setIsRefreshing(false);
        if (showToast) {
          showToast(
            isAuto
              ? 'Tự động đồng bộ xu hướng thị trường mới nhất'
              : 'Đã cập nhật dữ liệu xu hướng thị trường mới nhất!',
            'success'
          );
        }
      }, 700);
    };

    const handleOpenAnalysis = (product) => {
      setSelectedProduct(product);
      setIsModalOpen(true);
    };

    const handleCloseAnalysis = () => {
      setIsModalOpen(false);
      setSelectedProduct(null);
    };

    const handleAddProductToInventory = (product) => {
      if (onAddToCatalog) {
        onAddToCatalog(product);
      } else if (showToast) {
        showToast(`Đã thêm "${product.name}" vào danh mục kho hàng!`, 'success');
      }
    };

    const handleToggleWatchlist = (productId) => {
      setWatchlistedIds((prev) => {
        const next = new Set(prev);
        if (next.has(productId)) {
          next.delete(productId);
          if (showToast) showToast('Đã xóa khỏi danh sách theo dõi', 'info');
        } else {
          next.add(productId);
          if (showToast) showToast('Đã lưu vào danh sách theo dõi xu hướng', 'success');
        }
        return next;
      });
    };

    const handleSendReportEmail = () => {
      if (showToast) {
        showToast('Đang gửi báo cáo phân tích AI tới email admin@minipancake.vn...', 'info');
        setTimeout(() => {
          showToast('Báo cáo phân tích thị trường đã được gửi thành công!', 'success');
        }, 1200);
      }
    };

    const handleExportPDF = () => {
      if (showToast) {
        showToast('Đang kết xuất báo cáo xu hướng định dạng PDF...', 'info');
        setTimeout(() => {
          showToast('Đã tải xuống file: Bao_Cao_Xu_Huong_20261115.pdf', 'success');
        }, 1400);
      }
    };

    // -----------------------------------------------------------------------
    // Calculations & Helpers
    // -----------------------------------------------------------------------
    const formatCurrency = (val) => {
      if (!val && val !== 0) return '0 ₫';
      return Number(val).toLocaleString('vi-VN') + ' ₫';
    };

    // Progress bar color based on score specification:
    // 80-100: bg-emerald-500 (hot)
    // 60-79: bg-blue-500 (rising)
    // 40-59: bg-amber-500 (stable)
    // 20-39: bg-orange-500 (cooling)
    // 0-19: bg-red-500 (declining)
    const getTrendScoreColor = (score) => {
      if (score >= 80) return 'bg-emerald-500';
      if (score >= 60) return 'bg-blue-500';
      if (score >= 40) return 'bg-amber-500';
      if (score >= 20) return 'bg-orange-500';
      return 'bg-red-500';
    };

    const getTrendScoreTextClass = (score) => {
      if (score >= 80) return 'text-emerald-700 font-bold';
      if (score >= 60) return 'text-blue-700 font-bold';
      if (score >= 40) return 'text-amber-700 font-bold';
      if (score >= 20) return 'text-orange-700 font-bold';
      return 'text-red-700 font-bold';
    };

    // Source badge styles
    // Shopee=orange, Lazada=blue, TikTok=black, Google=green
    const renderSourceBadge = (source) => {
      const s = (source || '').toLowerCase();
      if (s === 'shopee') {
        return (
          <span key={s} className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white shadow-xs">
            Shopee
          </span>
        );
      }
      if (s === 'lazada') {
        return (
          <span key={s} className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-xs">
            Lazada
          </span>
        );
      }
      if (s === 'tiktok') {
        return (
          <span key={s} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white shadow-xs">
            TikTok
          </span>
        );
      }
      if (s === 'google') {
        return (
          <span key={s} className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white shadow-xs">
            Google
          </span>
        );
      }
      return (
        <span key={s} className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700">
          {source}
        </span>
      );
    };

    // Trend Direction with arrows:
    // rising (↑ ↗), stable (→), declining (↓ ↘)
    const renderTrendDirection = (trend, change) => {
      if (trend === 'rising') {
        return (
          <span className="inline-flex items-center gap-1 font-bold text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <span>↑ Tăng</span>
            {change !== undefined && change > 0 && <span className="text-[10px]">(+{change})</span>}
          </span>
        );
      }
      if (trend === 'declining') {
        return (
          <span className="inline-flex items-center gap-1 font-bold text-xs text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
            <span>↓ Giảm</span>
            {change !== undefined && change < 0 && <span className="text-[10px]">({change})</span>}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 font-medium text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
          <span>→ Ổn định</span>
        </span>
      );
    };

    // Filter & Sort Products
    const filteredProducts = useMemo(() => {
      let list = [...productsList];

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q) ||
            (p.tags && p.tags.some((t) => t.toLowerCase().includes(q)))
        );
      }

      // Category filter
      if (selectedCategory !== 'all') {
        list = list.filter((p) => p.category.toLowerCase() === selectedCategory.toLowerCase());
      }

      // Source filter
      if (selectedSource !== 'all') {
        list = list.filter((p) => p.sources && p.sources.includes(selectedSource));
      }

      // Trend direction filter
      if (selectedTrendFilter !== 'all') {
        list = list.filter((p) => p.trend === selectedTrendFilter);
      }

      // Sort
      list.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (valA === undefined) valA = 0;
        if (valB === undefined) valB = 0;

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });

      return list;
    }, [productsList, searchQuery, selectedCategory, selectedSource, selectedTrendFilter, sortField, sortDirection]);

    // Paginated Products
    const paginatedProducts = useMemo(() => {
      const start = (currentPage - 1) * pageSize;
      return filteredProducts.slice(start, start + pageSize);
    }, [filteredProducts, currentPage, pageSize]);

    const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;

    // Summary Metrics
    const metrics = useMemo(() => {
      const totalCount = productsList.length || 20;
      const risingCount = productsList.filter((p) => p.trend === 'rising').length;
      const hotCategoriesCount = categoriesData.filter((c) => c.trend === 'rising' || c.avgScore >= 75).length || 4;
      const opportunitiesCount = reportData.opportunities?.length || 8;

      const sumScore = productsList.reduce((acc, p) => acc + (p.trendScore || 0), 0);
      const avgScore = productsList.length ? Math.round(sumScore / productsList.length) : 78;

      return {
        trendingCount: totalCount,
        trendingRising: risingCount,
        hotCategories: hotCategoriesCount,
        opportunities: opportunitiesCount,
        avgScore: avgScore,
      };
    }, [productsList, categoriesData, reportData]);

    // Top 5 Products for History Chart
    const top5ProductNames = useMemo(() => {
      return Object.keys(historyData).slice(0, 5);
    }, [historyData]);

    const chartDays = ['09/11', '10/11', '11/11', '12/11', '13/11', '14/11', '15/11'];
    const productColors = [
      { name: 'emerald', bg: 'bg-emerald-500', bar: 'from-emerald-600 to-emerald-400', text: 'text-emerald-700' },
      { name: 'indigo', bg: 'bg-indigo-600', bar: 'from-indigo-600 to-indigo-400', text: 'text-indigo-700' },
      { name: 'blue', bg: 'bg-blue-500', bar: 'from-blue-600 to-blue-400', text: 'text-blue-700' },
      { name: 'amber', bg: 'bg-amber-500', bar: 'from-amber-600 to-amber-400', text: 'text-amber-700' },
      { name: 'rose', bg: 'bg-rose-500', bar: 'from-rose-600 to-rose-400', text: 'text-rose-700' },
    ];

    return (
      <div className="flex-1 h-full overflow-y-auto bg-slate-50 text-slate-800 scrollbar-thin">
        {/* Main Container */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
          {/* ================================================================= */}
          {/* SECTION A: HEADER & CONTROLS BAR */}
          {/* ================================================================= */}
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/80 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white text-xl shadow-md shadow-indigo-100 flex-shrink-0">
                  📊
                </span>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Phân tích xu hướng thị trường</span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      LIVE DATA
                    </span>
                  </h1>
                  <p className="text-xs text-slate-500">
                    Dự báo & phân tích hành vi mua sắm đa kênh (Shopee, TikTok Shop, Lazada, Google)
                  </p>
                </div>
              </div>
            </div>

            {/* Controls Bar */}
            <div className="flex items-center flex-wrap gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
              {/* Date selector dropdown */}
              <div className="relative">
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer pr-8 shadow-xs"
                >
                  <option value="today">Hôm nay (15/11/2026)</option>
                  <option value="yesterday">Hôm qua (14/11/2026)</option>
                  <option value="this_week">Tuần này (7 ngày qua)</option>
                  <option value="custom">Khoảng thời gian tùy chọn</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Auto Refresh Toggle */}
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 text-xs text-slate-600 cursor-pointer select-none transition-colors shadow-xs">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 rounded border-slate-300"
                />
                <span className="font-medium whitespace-nowrap">Tự động làm mới</span>
              </label>

              {/* Manual Refresh Button */}
              <button
                type="button"
                onClick={() => handleManualRefresh(false)}
                disabled={isRefreshing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-200 flex items-center gap-2 active:scale-95 disabled:opacity-60"
              >
                <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
                <span>{isRefreshing ? 'Đang cập nhật...' : 'Cập nhật ngay'}</span>
              </button>

              {/* Last Updated Timestamp */}
              <div className="text-[11px] text-slate-400 hidden xl:block pl-2 border-l border-slate-200">
                <span>Cập nhật: </span>
                <span className="font-semibold text-slate-600">{lastUpdated}</span>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION B: SUMMARY CARDS ROW (4 CARDS) */}
          {/* ================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Trending Products */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Sản phẩm trending
                </span>
                <span className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 text-lg group-hover:scale-110 transition-transform">
                  🔥
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tracking-tight">
                  {metrics.trendingCount}
                </span>
                <span className="text-xs text-slate-400 font-medium">sản phẩm hot</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <span>↑ +14.2%</span>
                <span className="text-slate-400 font-normal">so với hôm qua</span>
              </div>
            </div>

            {/* Card 2: Hot Categories */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Danh mục hot
                </span>
                <span className="p-2.5 rounded-xl bg-blue-50 text-blue-600 text-lg group-hover:scale-110 transition-transform">
                  🏷️
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tracking-tight">
                  {metrics.hotCategories}
                </span>
                <span className="text-xs text-slate-400 font-medium">/ 5 ngành hàng</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-blue-600">
                <span>↑ +2 ngành</span>
                <span className="text-slate-400 font-normal">tăng tốc đột phá</span>
              </div>
            </div>

            {/* Card 3: Business Opportunities */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-600"></div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Cơ hội kinh doanh
                </span>
                <span className="p-2.5 rounded-xl bg-purple-50 text-purple-600 text-lg group-hover:scale-110 transition-transform">
                  💡
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tracking-tight">
                  {metrics.opportunities}
                </span>
                <span className="text-xs text-slate-400 font-medium">gợi ý AI</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-indigo-600">
                <span>↑ +3 cơ hội mới</span>
                <span className="text-slate-400 font-normal">biên lãi &gt; 45%</span>
              </div>
            </div>

            {/* Card 4: Avg Trend Score Gauge */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500"></div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Điểm xu hướng TB
                </span>
                <span className="p-2.5 rounded-xl bg-amber-50 text-amber-600 text-lg group-hover:scale-110 transition-transform">
                  ⚡
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tracking-tight">
                  {metrics.avgScore}
                </span>
                <span className="text-xs text-slate-400 font-medium">/ 100 điểm</span>
              </div>
              {/* Progress Mini Gauge */}
              <div className="mt-2 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  style={{ width: `${metrics.avgScore}%` }}
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-500"
                ></div>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                <span className="text-emerald-600 font-bold">↑ +3.5 tuần này</span>
                <span>Thị trường sôi động</span>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION C: TOP TRENDING PRODUCTS TABLE */}
          {/* ================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
            {/* Table Header & Filters */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-extrabold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                  <span>🔥 Danh sách sản phẩm thịnh hành (Top Trending)</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {filteredProducts.length} sản phẩm
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Cập nhật theo doanh số và lưu lượng tìm kiếm thời gian thực
                </p>
              </div>

              {/* Filters toolbar */}
              <div className="flex items-center flex-wrap gap-2 w-full md:w-auto">
                {/* Search Box */}
                <div className="relative flex-1 md:w-56">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Tìm tên sản phẩm, tag..."
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                  />
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {/* Category Dropdown Filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">Tất cả danh mục</option>
                  <option value="Mỹ phẩm">Mỹ phẩm</option>
                  <option value="Thời trang">Thời trang</option>
                  <option value="Điện tử">Điện tử</option>
                  <option value="Đồ gia dụng">Đồ gia dụng</option>
                  <option value="Thực phẩm">Thực phẩm</option>
                </select>

                {/* Source Filter */}
                <select
                  value={selectedSource}
                  onChange={(e) => {
                    setSelectedSource(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">Tất cả nguồn</option>
                  <option value="shopee">Shopee</option>
                  <option value="tiktok">TikTok Shop</option>
                  <option value="lazada">Lazada</option>
                  <option value="google">Google</option>
                </select>

                {/* Trend Filter */}
                <select
                  value={selectedTrendFilter}
                  onChange={(e) => {
                    setSelectedTrendFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">Mọi chiều hướng</option>
                  <option value="rising">↑ Đang tăng</option>
                  <option value="stable">→ Ổn định</option>
                  <option value="declining">↓ Đang giảm</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] select-none">
                  <tr>
                    <th className="py-3 px-3.5 w-12 text-center">#</th>
                    <th className="py-3 px-4 min-w-[240px]">Sản phẩm</th>
                    <th className="py-3 px-3">Danh mục</th>
                    <th
                      className="py-3 px-4 min-w-[170px] cursor-pointer hover:text-indigo-600 transition-colors"
                      onClick={() => {
                        if (sortField === 'trendScore') {
                          setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                        } else {
                          setSortField('trendScore');
                          setSortDirection('desc');
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span>Điểm Trending</span>
                        <span>{sortField === 'trendScore' ? (sortDirection === 'desc' ? '▼' : '▲') : '⇅'}</span>
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-indigo-600 transition-colors"
                      onClick={() => {
                        if (sortField === 'avgPrice') {
                          setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                        } else {
                          setSortField('avgPrice');
                          setSortDirection('desc');
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span>Giá TB</span>
                        <span>{sortField === 'avgPrice' ? (sortDirection === 'desc' ? '▼' : '▲') : '⇅'}</span>
                      </div>
                    </th>
                    <th className="py-3 px-3">Nguồn</th>
                    <th className="py-3 px-3 text-center">Xu hướng</th>
                    <th className="py-3 px-4 text-right">Hành động</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-12 text-center text-slate-400">
                        <div className="text-3xl mb-2">🔍</div>
                        <p className="font-medium text-xs">Không tìm thấy sản phẩm nào khớp với bộ lọc</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setSelectedCategory('all');
                            setSelectedSource('all');
                            setSelectedTrendFilter('all');
                          }}
                          className="mt-2 text-indigo-600 hover:underline font-semibold text-xs"
                        >
                          Xóa bộ lọc
                        </button>
                      </td>
                    </tr>
                  ) : (
                    paginatedProducts.map((p, index) => {
                      const rank = (currentPage - 1) * pageSize + index + 1;
                      const isWatched = watchlistedIds.has(p.id);

                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-indigo-50/30 transition-colors group"
                        >
                          {/* Rank # */}
                          <td className="py-3.5 px-3.5 text-center font-bold text-slate-500">
                            {rank === 1 ? (
                              <span className="text-base" title="Top 1">🥇</span>
                            ) : rank === 2 ? (
                              <span className="text-base" title="Top 2">🥈</span>
                            ) : rank === 3 ? (
                              <span className="text-base" title="Top 3">🥉</span>
                            ) : (
                              <span className="text-xs text-slate-400">{rank}</span>
                            )}
                          </td>

                          {/* Product Info */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 relative">
                                <img
                                  src={p.imageUrl || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=100&h=100&fit=crop'}
                                  alt={p.name}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                  onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=100&h=100&fit=crop';
                                  }}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    onClick={() => handleOpenAnalysis(p)}
                                    className="font-bold text-slate-800 hover:text-indigo-600 transition-colors cursor-pointer truncate max-w-xs block"
                                    title={p.name}
                                  >
                                    {p.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {p.tags?.slice(0, 2).map((tag, tIdx) => (
                                    <span
                                      key={tIdx}
                                      className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                  <span className="text-[10px] text-emerald-600 font-medium">
                                    ~{p.salesVelocity?.toLocaleString('vi-VN')} đơn/ngày
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-3.5 px-3">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 whitespace-nowrap border border-slate-200/80">
                              {p.category}
                            </span>
                          </td>

                          {/* Trend Score (Progress Bar 0-100) */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className={getTrendScoreTextClass(p.trendScore)}>
                                  {p.trendScore}/100
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {p.trendScore >= 80 ? 'Hot' : p.trendScore >= 60 ? 'Tăng' : 'Ổn định'}
                                </span>
                              </div>
                              {/* Tailwind Progress Bar */}
                              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div
                                  style={{ width: `${Math.min(100, Math.max(5, p.trendScore))}%` }}
                                  className={`h-full rounded-full transition-all duration-500 ${getTrendScoreColor(
                                    p.trendScore
                                  )}`}
                                ></div>
                              </div>
                            </div>
                          </td>

                          {/* Avg Price */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 whitespace-nowrap">
                              {formatCurrency(p.avgPrice)}
                            </div>
                            <div className="text-[10px] text-slate-400 whitespace-nowrap">
                              {formatCurrency(p.priceRange?.min)} - {formatCurrency(p.priceRange?.max)}
                            </div>
                          </td>

                          {/* Sources */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              {p.sources?.map((s) => renderSourceBadge(s))}
                            </div>
                          </td>

                          {/* Trend Direction */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            {renderTrendDirection(p.trend, p.changeFromYesterday)}
                          </td>

                          {/* Actions: "Phân tích" & "Thêm vào kho" */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenAnalysis(p)}
                                className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 transition-all shadow-xs flex items-center gap-1"
                                title="Phân tích chi tiết AI"
                              >
                                <span>🔍</span>
                                <span>Phân tích</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAddProductToInventory(p)}
                                className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] bg-slate-100 hover:bg-emerald-600 text-slate-700 hover:text-white border border-slate-200 hover:border-emerald-600 transition-all shadow-xs flex items-center gap-1"
                                title="Nhập vào danh mục kho Mini Pancake"
                              >
                                <span>➕</span>
                                <span className="hidden sm:inline">Thêm vào kho</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleWatchlist(p.id)}
                                className={`p-1.5 rounded-lg text-xs border transition-colors ${
                                  isWatched
                                    ? 'bg-amber-50 text-amber-500 border-amber-300'
                                    : 'text-slate-400 hover:text-slate-600 border-transparent hover:bg-slate-100'
                                }`}
                                title={isWatched ? 'Đang theo dõi' : 'Lưu theo dõi'}
                              >
                                {isWatched ? '⭐' : '☆'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 px-1 text-xs text-slate-500">
                <div>
                  Hiển thị {(currentPage - 1) * pageSize + 1} -{' '}
                  {Math.min(currentPage * pageSize, filteredProducts.length)} trên tổng số{' '}
                  {filteredProducts.length} sản phẩm
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    Trước
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      type="button"
                      onClick={() => setCurrentPage(pg)}
                      className={`w-7 h-7 rounded-lg font-semibold transition-all ${
                        currentPage === pg
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pg}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* SECTION D: AI INSIGHTS PANEL */}
          {/* ================================================================= */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white shadow-lg space-y-6 border border-indigo-900/60">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3 border-b border-indigo-800/60 pb-4">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-2xl flex-shrink-0">
                  🤖
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold tracking-tight text-white">
                      Phân tích AI & Khuyến nghị kinh doanh
                    </h2>
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                      Gemini 2.0 Flash
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200/70">
                    Mô hình học máy tổng hợp dữ liệu giao dịch, tin nhắn chat và tín hiệu mạng xã hội
                  </p>
                </div>
              </div>

              <div className="text-xs text-indigo-300 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                <span>Trạng thái thị trường: </span>
                <span className="font-bold text-emerald-400">{reportData.forecast?.marketOutlook || 'Tích cực'}</span>
              </div>
            </div>

            {/* AI Summary Highlight Box */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-indigo-100 leading-relaxed space-y-2">
              <div className="font-bold text-indigo-300 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <span>📌</span>
                <span>Tóm lược thị trường hôm nay ({reportData.date || '15/11/2026'})</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-200 font-medium">
                {reportData.summary ||
                  'Thị trường hôm nay sôi động với nhiều sản phẩm mỹ phẩm dưỡng trắng, bảo vệ da và thời trang mùa đông. Nhu cầu đồ gia dụng mini tiện ích tăng cao trước các đợt khuyến mãi cuối năm.'}
              </p>
            </div>

            {/* Sub-grid: Cơ hội kinh doanh & Cảnh báo */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Opportunities Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <span>✨</span>
                    <span>Cơ hội kinh doanh tiềm năng</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">Độ tin cậy &gt; 85%</span>
                </div>

                <div className="space-y-3">
                  {reportData.opportunities?.map((opp, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-white/5 border border-emerald-500/20 hover:border-emerald-500/40 transition-colors space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-white">{opp.product}</h4>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ROI: {opp.potentialROI}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{opp.reason}</p>
                      <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="text-indigo-300">
                          Hành động: <strong>{opp.recommendedAction}</strong>
                        </span>
                        <span className="text-emerald-400 font-semibold">
                          {(opp.confidence * 100).toFixed(0)}% tin cậy
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warnings Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span>Cảnh báo & Rủi ro thị trường</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">Khuyến cáo điều chỉnh</span>
                </div>

                <div className="space-y-3">
                  {reportData.warnings?.map((warn, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-white/5 border border-amber-500/20 hover:border-amber-500/40 transition-colors space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-amber-300">{warn.issue}</h4>
                        <div className="flex gap-1">
                          {warn.affectedCategories?.map((cat, cIdx) => (
                            <span
                              key={cIdx}
                              className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{warn.suggestion}</p>
                      <div className="pt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span>Độ ưu tiên:</span>
                        <span className="text-rose-400 font-semibold">Cần rà soát kho ngay</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 7-Day Forecast Section */}
            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                  <span>🔮</span>
                  <span>Dự báo xu hướng 7 ngày tới theo nhóm ngành hàng</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {reportData.forecast?.predictions?.map((pred, pIdx) => (
                  <div
                    key={pIdx}
                    className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2 hover:bg-white/10 transition-colors"
                  >
                    <div className="text-xs font-bold text-white truncate">{pred.category}</div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Hiện tại: {pred.currentTrend}</span>
                      <span className="text-emerald-400 font-bold">{pred.predictedTrend}</span>
                    </div>
                    {/* Mini Forecast Bar */}
                    <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                      <div
                        style={{ width: `${pred.confidence * 100}%` }}
                        className="h-full bg-gradient-to-r from-indigo-400 to-emerald-400 rounded-full"
                      ></div>
                    </div>
                    <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                      💡 {pred.action}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION E: CATEGORY BREAKDOWN */}
          {/* ================================================================= */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                  <span>📂 Hiệu suất phân loại theo ngành hàng</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Đánh giá tốc độ tăng trưởng và sản phẩm đại diện theo từng danh mục
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {categoriesData.map((cat, idx) => {
                const isHot = cat.trend === 'rising' || cat.avgScore >= 75;
                const isStable = cat.trend === 'stable';

                const borderClass = isHot
                  ? 'border-emerald-200 hover:border-emerald-400 bg-white'
                  : isStable
                  ? 'border-amber-200 hover:border-amber-400 bg-white'
                  : 'border-rose-200 hover:border-rose-400 bg-white';

                const badgeBg = isHot
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isStable
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200';

                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border p-5 shadow-xs hover:shadow-md transition-all space-y-4 ${borderClass}`}
                  >
                    {/* Header: Cat Name + Count + Direction */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="p-2 rounded-xl bg-slate-100 text-lg">
                          {cat.name.includes('Mỹ phẩm')
                            ? '💄'
                            : cat.name.includes('Thời trang')
                            ? '👗'
                            : cat.name.includes('Điện tử')
                            ? '🎧'
                            : cat.name.includes('gia dụng')
                            ? '🏠'
                            : '🧋'}
                        </span>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">{cat.name}</h3>
                          <span className="text-[11px] text-slate-500">{cat.productCount} sản phẩm theo dõi</span>
                        </div>
                      </div>

                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeBg}`}>
                        {cat.trend === 'rising' ? '↑ Tăng mạnh' : cat.trend === 'declining' ? '↓ Giảm nhiệt' : '→ Ổn định'}
                      </span>
                    </div>

                    {/* Score Bar */}
                    <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Điểm trung bình ngành:</span>
                        <span className="font-black text-slate-900">{cat.avgScore}/100</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          style={{ width: `${cat.avgScore}%` }}
                          className={`h-full rounded-full ${
                            cat.avgScore >= 80 ? 'bg-emerald-500' : cat.avgScore >= 60 ? 'bg-blue-500' : 'bg-amber-500'
                          }`}
                        ></div>
                      </div>
                    </div>

                    {/* Top 3 Products List */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        Top sản phẩm dẫn đầu:
                      </span>
                      <div className="space-y-1.5">
                        {cat.topProducts?.map((tp, tIdx) => (
                          <div
                            key={tIdx}
                            className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 hover:bg-indigo-50/50 transition-colors"
                          >
                            <span className="font-medium text-slate-700 truncate mr-2">
                              #{tIdx + 1} {tp}
                            </span>
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded flex-shrink-0">
                              Trending
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION F: TREND HISTORY CHART (CSS BARS) */}
          {/* ================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-extrabold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                  <span>📈 Biểu đồ lịch sử xu hướng Top 5 sản phẩm (7 ngày qua)</span>
                </h2>
                <p className="text-xs text-slate-500">
                  So sánh trực quan biến động điểm số giữa các sản phẩm dẫn đầu thị trường
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center flex-wrap gap-3 text-xs">
                {top5ProductNames.map((name, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded-full ${productColors[idx]?.bg || 'bg-slate-500'}`}></span>
                    <span className="text-slate-600 font-medium truncate max-w-[120px]">{name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CSS Grouped Bars Chart */}
            <div className="p-4 sm:p-6 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
              <div className="h-64 flex items-end justify-between gap-3 sm:gap-6 pt-6 pb-2 border-b border-slate-200">
                {chartDays.map((day, dayIdx) => (
                  <div key={dayIdx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    {/* Bar group for this day */}
                    <div className="w-full flex items-end justify-center gap-1 sm:gap-1.5 h-full">
                      {top5ProductNames.map((name, pIdx) => {
                        const scores = historyData[name] || [70, 72, 75, 78, 80, 82, 85];
                        const score = scores[dayIdx] || 75;
                        const col = productColors[pIdx] || productColors[0];

                        return (
                          <div
                            key={pIdx}
                            className="flex-1 max-w-[18px] bg-slate-200/70 rounded-t-md overflow-hidden flex flex-col justify-end group relative"
                            title={`${name} (${day}): ${score} điểm`}
                          >
                            {/* Hover Tooltip */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold py-0.5 px-1.5 rounded whitespace-nowrap pointer-events-none z-20 shadow-md">
                              {score}đ
                            </div>

                            <div
                              style={{ height: `${score}%` }}
                              className={`w-full bg-gradient-to-t ${col.bar} rounded-t-md group-hover:brightness-110 transition-all duration-300`}
                            ></div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Day label */}
                    <span className={`text-[11px] font-semibold ${dayIdx === 6 ? 'text-indigo-600 font-bold' : 'text-slate-500'}`}>
                      {day} {dayIdx === 6 ? '(Nay)' : ''}
                    </span>
                  </div>
                ))}
              </div>

              {/* Chart Footer note */}
              <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
                <span className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-600"></span>
                  <span>Điểm số chuẩn hóa 0 - 100 dựa trên số lượng đơn, bình luận và lượt xem video</span>
                </span>
                <span className="font-semibold text-slate-700">Dữ liệu cập nhật tự động hàng ngày lúc 06:00</span>
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION G: DAILY REPORT SECTION (EXPANDABLE) */}
          {/* ================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div
              onClick={() => setIsReportExpanded(!isReportExpanded)}
              className="p-5 flex items-center justify-between bg-slate-50 hover:bg-slate-100/60 cursor-pointer select-none transition-colors border-b border-slate-200"
            >
              <div className="flex items-center gap-3">
                <span className="p-2 bg-indigo-100 text-indigo-700 rounded-xl text-lg">📑</span>
                <div>
                  <h2 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                    <span>Báo cáo phân tích thị trường toàn diện hàng ngày</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                      Bản tin ngày {reportData.date || '15/11/2026'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Báo cáo tổng hợp tự động từ hệ thống trí tuệ nhân tạo Mini Pancake
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  {isReportExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                </span>
                <span className="text-lg text-slate-400 font-bold transform transition-transform duration-200">
                  {isReportExpanded ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {/* Expandable Content Body */}
            {isReportExpanded && (
              <div className="p-6 space-y-6 animate-fadeIn">
                {/* 1. Executive Summary */}
                <div className="space-y-2">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-indigo-600 rounded-full inline-block"></span>
                    <span>1. Tổng quan tình hình thị trường (Executive Summary)</span>
                  </h3>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed space-y-2">
                    <p>{reportData.summary}</p>
                    <p className="font-semibold text-slate-800">
                      • Tín hiệu tăng trưởng mạnh nhất: <strong>Mỹ phẩm dưỡng da</strong> và <strong>Thời trang mùa đông</strong>.<br />
                      • Tỉ lệ phản hồi tích cực từ người tiêu dùng đạt mức trung bình <strong>87.4%</strong>.<br />
                      • Khung giờ mua sắm cao điểm trên sàn: <strong>11:30 - 13:30</strong> và <strong>20:00 - 23:00</strong> hàng ngày.
                    </p>
                  </div>
                </div>

                {/* 2. Top Trends Detailed Table */}
                <div className="space-y-2">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-indigo-600 rounded-full inline-block"></span>
                    <span>2. Chi tiết các mặt hàng đột phá (Top Breakthroughs)</span>
                  </h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs divide-y divide-slate-200">
                      <thead className="bg-slate-50 text-slate-600 font-bold text-[11px] uppercase">
                        <tr>
                          <th className="py-2.5 px-4">Tên sản phẩm</th>
                          <th className="py-2.5 px-4">Lý do thúc đẩy tăng trưởng</th>
                          <th className="py-2.5 px-4 text-center">Độ tin cậy</th>
                          <th className="py-2.5 px-4">Khuyến nghị hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {reportData.topTrends?.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4 font-bold text-slate-800">{item.name}</td>
                            <td className="py-3 px-4 text-slate-600">{item.reason}</td>
                            <td className="py-3 px-4 text-center">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                                {(item.confidence * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-indigo-700 font-medium">{item.recommendedAction}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Actionable Takeaways */}
                <div className="space-y-2">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-indigo-600 rounded-full inline-block"></span>
                    <span>3. Danh mục sản phẩm được khuyến nghị triển khai ngay</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {reportData.forecast?.recommendedProducts?.map((rec, rIdx) => (
                      <div key={rIdx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="font-bold text-xs text-slate-900">{rec.name}</div>
                        <div className="text-[11px] text-slate-600">{rec.reason}</div>
                        <div className="pt-1 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Giá đề xuất:</span>
                          <span className="font-bold text-emerald-600">{rec.suggestedPrice}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 italic">
                          Đối tượng: {rec.targetAudience}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Report Action Buttons */}
                <div className="pt-4 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
                  <div className="text-xs text-slate-400">
                    Báo cáo được khởi tạo lúc {reportData.analyzedAt || '06:30 - 15/11/2026'} bởi AI Scheduler
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSendReportEmail}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors flex items-center gap-2 shadow-xs"
                    >
                      <span>✉️</span>
                      <span>Gửi báo cáo qua email</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportPDF}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-colors flex items-center gap-2"
                    >
                      <span>📥</span>
                      <span>Tải PDF báo cáo</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* MODAL: PRODUCT ANALYSIS DETAIL MODAL */}
        {/* =================================================================== */}
        {window.ProductAnalysisModal && (
          <window.ProductAnalysisModal
            product={selectedProduct}
            isOpen={isModalOpen}
            onClose={handleCloseAnalysis}
            onAddToCatalog={handleAddProductToInventory}
            showToast={showToast}
          />
        )}
      </div>
    );
  }

  // Expose to window
  if (typeof window !== 'undefined') {
    window.TrendDashboard = TrendDashboard;
  }
})();
