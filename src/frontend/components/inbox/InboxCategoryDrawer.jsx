/**
 * InboxCategoryDrawer Component (Menu 3 gạch: Cây danh mục & Sản phẩm con đính kèm)
 * ──────────────────────────────────────────────────────────────────────────────────
 * Đáp ứng yêu cầu Requirment_Ver1.0.xlsx:
 * - Tạo 1 dấu 3 gạch để hiển thị dạng list cây danh mục sản phẩm kèm các sản phẩm con.
 * - Tìm kiếm nhanh theo tên danh mục hoặc tên sản phẩm.
 * - Lọc hội thoại theo danh mục cha / danh mục con.
 * - Cho phép bấm chọn nhanh sản phẩm để chèn thông tin tư vấn/báo giá vào khung chat.
 */

(function () {
  'use strict';

  const { useState, useMemo } = window.React;

  function InboxCategoryDrawer({
    isOpen,
    onClose,
    categoryTree = [],
    categoryFilter = 'all',
    onSelectCategory,
    onSelectProductForChat,
    totalConversationCount = 0,
    loading = false,
    error = '',
  }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedIds, setExpandedIds] = useState({});

    const formatPrice = (price) => {
      if (window.InboxHelpers?.formatCurrencyVND) {
        return window.InboxHelpers.formatCurrencyVND(price);
      }
      return Number(price || 0).toLocaleString('vi-VN') + 'đ';
    };

    const visibleTree = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return categoryTree;

      return categoryTree.reduce((acc, cat) => {
        const catMatch = cat.name.toLowerCase().includes(q);
        const matchingChildren = (cat.children || []).filter((child) =>
          child.name.toLowerCase().includes(q)
        );
        const matchingProducts = (cat.products || []).filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.sku && p.sku.toLowerCase().includes(q))
        );

        if (catMatch) {
          acc.push(cat);
        } else if (matchingChildren.length > 0 || matchingProducts.length > 0) {
          acc.push({
            ...cat,
            children: matchingChildren.length > 0 ? matchingChildren : cat.children,
            products: matchingProducts.length > 0 ? matchingProducts : cat.products,
          });
        }
        return acc;
      }, []);
    }, [categoryTree, searchQuery]);

    if (!isOpen) return null;

    return (
      <div className="absolute inset-0 z-50 flex">
        <button
          type="button"
          aria-label="Đóng danh mục sản phẩm"
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]"
        />
        <aside className="relative h-full w-[380px] max-w-[92vw] bg-white border-r border-slate-200 shadow-[0_12px_40px_rgba(15,23,42,0.16)] flex flex-col animate-fadeIn">
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Danh mục & Sản phẩm</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lọc hội thoại hoặc chọn nhanh sản phẩm tư vấn
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
              aria-label="Đóng"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          {/* Search Input */}
          <div className="px-5 py-3.5 border-b border-slate-100">
            <label className="relative block">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" d="m16 16 4 4" />
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm danh mục hoặc tên sản phẩm..."
                aria-label="Tìm danh mục hoặc sản phẩm"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </label>
          </div>

          <div className="flex items-center justify-between px-5 pt-3.5 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Cây danh mục sản phẩm
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              {categoryTree.length} nhóm ngành
            </span>
          </div>

          {/* Tree Content */}
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
            {/* All Categories Option */}
            <button
              type="button"
              onClick={() => {
                onSelectCategory('all');
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  categoryFilter === 'all' ? 'bg-white text-blue-600' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold">Tất cả danh mục</span>
                <span
                  className={`block text-[10px] mt-0.5 ${
                    categoryFilter === 'all' ? 'text-blue-500' : 'text-slate-400'
                  }`}
                >
                  Hiển thị mọi hội thoại theo quyền tài khoản
                </span>
              </span>
              <span
                className={`min-w-7 text-center text-[10px] font-semibold px-2 py-1 rounded-full ${
                  categoryFilter === 'all' ? 'bg-white text-blue-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {totalConversationCount}
              </span>
            </button>

            {loading && (
              <div className="px-3 py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                <span className="w-4 h-4 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                Đang tải cây danh mục...
              </div>
            )}

            {!loading && error && (
              <div className="mx-1 my-3 p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700">
                <p className="font-semibold">Không tải được danh mục</p>
                <p className="mt-1 text-rose-600">{error}</p>
              </div>
            )}

            {!loading && !error && visibleTree.length === 0 && (
              <div className="px-3 py-10 text-center">
                <p className="text-xs font-medium text-slate-600">Không tìm thấy danh mục hoặc sản phẩm</p>
                <p className="mt-1 text-[11px] text-slate-400">Thử đổi từ khóa tìm kiếm khác.</p>
              </div>
            )}

            {!loading &&
              !error &&
              visibleTree.map((category) => {
                const hasSubItems =
                  (category.children && category.children.length > 0) ||
                  (category.products && category.products.length > 0);
                const isExpanded =
                  Boolean(expandedIds[category.id]) || Boolean(searchQuery.trim() && hasSubItems);
                const isSelected = categoryFilter === category.name;
                const productList = Array.isArray(category.products) ? category.products : [];

                return (
                  <div key={category.id} className="rounded-xl border border-transparent hover:border-slate-100">
                    <div
                      className={`flex items-center rounded-xl transition-colors ${
                        isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      {hasSubItems ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedIds((prev) => ({
                              ...prev,
                              [category.id]: !prev[category.id],
                            }))
                          }
                          className="w-8 h-9 ml-1 flex items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"
                          aria-label={isExpanded ? `Thu gọn ${category.name}` : `Mở rộng ${category.name}`}
                          aria-expanded={Boolean(isExpanded)}
                        >
                          <svg
                            className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                          </svg>
                        </button>
                      ) : (
                        <span className="w-8 ml-1 shrink-0" />
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          onSelectCategory(category.name);
                          onClose();
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2.5 py-2.5 pr-3 text-left"
                      >
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            isSelected ? 'bg-white text-blue-600' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.75 7.5A1.5 1.5 0 015.25 6h5.69a1.5 1.5 0 011.06.44l1.56 1.56h5.19a1.5 1.5 0 011.5 1.5v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V7.5z"
                            />
                          </svg>
                        </span>
                        <span className="flex-1 min-w-0">
                          <span
                            className={`block text-xs font-semibold truncate ${
                              isSelected ? 'text-blue-700' : 'text-slate-800'
                            }`}
                          >
                            {category.name}
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            {category.children?.length
                              ? `${category.children.length} nhóm con`
                              : 'Danh mục'}{' '}
                            • {productList.length} sản phẩm
                          </span>
                        </span>
                        <span
                          title="Số hội thoại trong danh mục"
                          className={`min-w-7 text-center text-[10px] font-semibold px-2 py-1 rounded-full ${
                            isSelected ? 'bg-white text-blue-700' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {category.count}
                        </span>
                      </button>
                    </div>

                    {/* Expanded Subcategories & Attached Products */}
                    {isExpanded && (
                      <div className="ml-8 mr-2 my-1.5 pl-2.5 border-l-2 border-slate-100 space-y-2">
                        {/* Child Categories */}
                        {category.children && category.children.length > 0 && (
                          <div className="space-y-1">
                            <span className="block px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Phân nhóm con
                            </span>
                            {category.children.map((child) => {
                              const childSelected = categoryFilter === child.name;
                              return (
                                <button
                                  key={child.id}
                                  type="button"
                                  onClick={() => {
                                    onSelectCategory(child.name);
                                    onClose();
                                  }}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                                    childSelected
                                      ? 'bg-blue-50 text-blue-700 font-semibold'
                                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                  }`}
                                >
                                  <span className="truncate">• {child.name}</span>
                                  <span
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                      childSelected
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                  >
                                    {child.count || 0} chat
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Attached Products inside this Category */}
                        {productList.length > 0 && (
                          <div className="space-y-1 pt-1">
                            <span className="block px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Sản phẩm đính kèm ({productList.length})
                            </span>
                            {productList.map((prod) => (
                              <div
                                key={prod.id}
                                className="p-2 rounded-lg bg-slate-50/80 hover:bg-blue-50/50 border border-slate-100 flex items-center justify-between gap-2 transition-colors"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-slate-800 truncate">
                                    {prod.name}
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-0.5">
                                    <span className="font-semibold text-blue-600">
                                      {formatPrice(prod.price)}
                                    </span>
                                    {prod.stock !== null && prod.stock !== undefined && (
                                      <span> • Tồn: {prod.stock}</span>
                                    )}
                                  </p>
                                </div>
                                {onSelectProductForChat && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onSelectProductForChat(prod, category.name);
                                      onClose();
                                    }}
                                    className="px-2 py-1 rounded-md bg-white hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200 text-[10px] font-bold whitespace-nowrap transition-colors shadow-2xs"
                                    title="Chèn thông tin sản phẩm vào khung tư vấn"
                                  >
                                    + Tư vấn
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </aside>
      </div>
    );
  }

  window.InboxCategoryDrawer = InboxCategoryDrawer;
})();
