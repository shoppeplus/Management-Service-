/**
 * OverviewView Component (SmartSales Dashboard - Image 01)
 * ────────────────────────────────────────────────────────
 * Highly Interactive Dashboard:
 * - Dynamic Time Range Filter (Hôm nay, Tuần này, Tháng này, Quý này) recalculating KPI stats
 * - Dynamic Wave Curve Line Chart adapting smoothly to the selected time filter with hover tooltips
 * - Interactive To-do items linking to care / orders with direct quick-filter actions
 * - "+ Tạo đơn hàng" action opening the creation modal
 */

(function () {
  'use strict';

  const { useState, useMemo } = window.React;

  function OverviewView({ currentUser, onOpenCreateOrder, onNavigate }) {
    const [timeRange, setTimeRange] = useState('month'); // 'today' | 'week' | 'month' | 'quarter'
    const [hoveredPoint, setHoveredPoint] = useState(null);

    // Dynamic stats based on time filter
    const statsData = useMemo(() => {
      switch (timeRange) {
        case 'today':
          return {
            revenue: '4,5 triệu',
            revenueDiff: '+5%',
            orders: '3',
            ordersDiff: '+10%',
            newCustomers: '2',
            customersDiff: '+50%',
            needSupport: '1',
            supportDiff: '-20%',
            chart: [
              { date: '08:00', value: 0.5 },
              { date: '10:00', value: 1.2 },
              { date: '12:00', value: 0.8 },
              { date: '14:00', value: 1.5 },
              { date: '16:00', value: 2.1 },
              { date: '18:00', value: 3.4 },
              { date: '20:00', value: 4.5 },
            ],
            maxVal: 6,
          };
        case 'week':
          return {
            revenue: '28 triệu',
            revenueDiff: '+14%',
            orders: '19',
            ordersDiff: '+12%',
            newCustomers: '6',
            customersDiff: '+25%',
            needSupport: '3',
            supportDiff: '+15%',
            chart: [
              { date: 'T2', value: 3 },
              { date: 'T3', value: 4.5 },
              { date: 'T4', value: 3.8 },
              { date: 'T5', value: 5.2 },
              { date: 'T6', value: 4.0 },
              { date: 'T7', value: 6.5 },
              { date: 'CN', value: 7.2 },
            ],
            maxVal: 8,
          };
        case 'quarter':
          return {
            revenue: '380 triệu',
            revenueDiff: '+22%',
            orders: '245',
            ordersDiff: '+18%',
            newCustomers: '80',
            customersDiff: '+35%',
            needSupport: '15',
            supportDiff: '+5%',
            chart: [
              { date: 'Thg 1', value: 110 },
              { date: 'Thg 2', value: 125 },
              { date: 'Thg 3', value: 145 },
            ],
            maxVal: 160,
          };
        case 'month':
        default:
          return {
            revenue: '125 triệu',
            revenueDiff: '12%',
            orders: '86',
            ordersDiff: '8%',
            newCustomers: '24',
            customersDiff: '20%',
            needSupport: '8',
            supportDiff: '33%',
            chart: [
              { date: '01/03', value: 12 },
              { date: '05/03', value: 8 },
              { date: '10/03', value: 16 },
              { date: '15/03', value: 24 },
              { date: '20/03', value: 18 },
              { date: '25/03', value: 25 },
              { date: '31/03', value: 28 },
            ],
            maxVal: 32,
          };
      }
    }, [timeRange]);

    // Generate smooth SVG wave path
    const svgPath = useMemo(() => {
      const width = 600;
      const height = 180;
      const paddingX = 40;
      const paddingBottom = 30;
      const paddingTop = 20;

      const availableW = width - paddingX * 2;
      const availableH = height - paddingTop - paddingBottom;
      const maxVal = statsData.maxVal;

      const pts = statsData.chart.map((pt, idx) => {
        const x = paddingX + (idx / (statsData.chart.length - 1)) * availableW;
        const y = height - paddingBottom - (pt.value / maxVal) * availableH;
        return { x, y, ...pt };
      });

      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const cpX = (p0.x + p1.x) / 2;
        d += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
      }

      const areaD = `${d} L ${pts[pts.length - 1].x} ${height - paddingBottom} L ${pts[0].x} ${height - paddingBottom} Z`;

      return { lineD: d, areaD, pts };
    }, [statsData]);

    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-8 space-y-6">
        {/* Top Greeting & Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span>Xin chào, {currentUser?.name || 'Nam'}</span>
              <span className="text-xl">👋</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
              Cùng nhau tạo nên nhiều cơ hội hôm nay!
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter Dropdown */}
            <div className="relative">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="appearance-none bg-white border border-slate-200 text-xs font-semibold text-slate-700 py-2.5 pl-3.5 pr-8 rounded-xl hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer"
              >
                <option value="today">Hôm nay</option>
                <option value="week">Tuần này</option>
                <option value="month">Tháng này</option>
                <option value="quarter">Quý này</option>
              </select>
              <span className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>

            {/* "+ Tạo đơn hàng" Primary Blue Button */}
            <button
              type="button"
              onClick={onOpenCreateOrder}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-200 transition-all active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Tạo đơn hàng</span>
            </button>
          </div>
        </div>

        {/* 4 Metric KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {/* 1. Doanh thu */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Doanh thu</p>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">{statsData.revenue}</h3>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span>{statsData.revenueDiff}</span>
              <span className="text-slate-400 font-normal">So với kỳ trước</span>
            </div>
          </div>

          {/* 2. Đơn hàng */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Đơn hàng</p>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">{statsData.orders}</h3>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 font-semibold">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span>{statsData.ordersDiff}</span>
              <span className="text-slate-400 font-normal">So với kỳ trước</span>
            </div>
          </div>

          {/* 3. Khách mới */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Khách mới</p>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">{statsData.newCustomers}</h3>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-purple-600 font-semibold">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span>{statsData.customersDiff}</span>
              <span className="text-slate-400 font-normal">So với kỳ trước</span>
            </div>
          </div>

          {/* 4. Cần hỗ trợ */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cần hỗ trợ</p>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">{statsData.needSupport}</h3>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-rose-600 font-semibold">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              <span>{statsData.supportDiff}</span>
              <span className="text-slate-400 font-normal">So với kỳ trước</span>
            </div>
          </div>
        </div>

        {/* Bottom 2 Columns: Chart (2/3) & To-do List (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Doanh thu theo ngày (2 Columns) */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                Doanh thu {timeRange === 'today' ? 'theo giờ' : timeRange === 'week' ? 'theo thứ' : 'theo ngày'}
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                <span className="capitalize">{timeRange === 'today' ? 'Hôm nay' : timeRange === 'week' ? 'Tuần này' : timeRange === 'quarter' ? 'Quý này' : 'Tháng này'}</span>
                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Interactive Area Chart */}
            <div className="relative w-full h-56 pt-2">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[10px] text-slate-400 pr-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span>{statsData.maxVal}M</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span>{(statsData.maxVal * 0.66).toFixed(0)}M</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span>{(statsData.maxVal * 0.33).toFixed(0)}M</span>
                </div>
                <div className="flex items-center justify-between pb-1">
                  <span>0</span>
                </div>
              </div>

              {/* Wave SVG Area */}
              <svg className="w-full h-full overflow-visible" viewBox="0 0 600 180" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                <path d={svgPath.areaD} fill="url(#chartGradient)" />

                <path
                  d={svgPath.lineD}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {svgPath.pts.map((pt, i) => (
                  <g key={i}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hoveredPoint === i ? 6 : 4}
                      fill="#FFFFFF"
                      stroke="#2563EB"
                      strokeWidth="2.5"
                      className="transition-all cursor-pointer"
                      onMouseEnter={() => setHoveredPoint(i)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  </g>
                ))}
              </svg>

              {/* Hover Tooltip */}
              {hoveredPoint !== null && (
                <div
                  className="absolute -top-3 bg-slate-900 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full transition-all"
                  style={{
                    left: `${(svgPath.pts[hoveredPoint].x / 600) * 100}%`,
                    top: `${(svgPath.pts[hoveredPoint].y / 180) * 100}%`,
                  }}
                >
                  {statsData.chart[hoveredPoint].date}: {statsData.chart[hoveredPoint].value} triệu VNĐ
                </div>
              )}

              {/* X-axis Labels */}
              <div className="flex justify-between text-[11px] text-slate-400 mt-2 px-6">
                {statsData.chart.map((pt, i) => (
                  <span key={i}>{pt.date}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Việc cần làm (1 Column) */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-xs flex flex-col">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Việc cần làm</h3>

            <div className="space-y-3.5 flex-1 flex flex-col justify-between">
              {/* 1. 5 khách cần gọi lại */}
              <div
                onClick={() => onNavigate && onNavigate('care')}
                className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-100 flex items-center justify-between hover:bg-rose-100/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shadow-xs">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-slate-800">5 khách cần gọi lại</span>
                </div>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* 2. 3 đơn chờ xác nhận */}
              <div
                onClick={() => onNavigate && onNavigate('orders')}
                className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-100 flex items-center justify-between hover:bg-amber-100/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-slate-800">3 đơn chờ xác nhận</span>
                </div>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {/* 3. 2 yêu cầu quá hạn */}
              <div
                onClick={() => onNavigate && onNavigate('care')}
                className="p-3.5 rounded-xl bg-red-50/70 border border-red-100 flex items-center justify-between hover:bg-red-100/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-500 text-white flex items-center justify-center shadow-xs">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-slate-800">2 yêu cầu quá hạn</span>
                </div>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  window.OverviewView = OverviewView;
})();
