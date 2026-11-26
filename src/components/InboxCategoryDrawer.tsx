import { ChevronRight, FolderTree, Package, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Conversation } from '../types/inbox'
import {
  PRODUCT_CATEGORY_TREE,
  filterCategoryTree,
  formatVndInteger,
  inferConversationCategory,
  matchesCategoryFilter,
} from '../lib/productCategories'
import { useI18n } from '../i18n'

interface InboxCategoryDrawerProps {
  isOpen: boolean
  conversations: Conversation[]
  selectedCategory: string
  onSelectCategory: (category: string) => void
  onClose: () => void
}

export function InboxCategoryDrawer({
  isOpen,
  conversations,
  selectedCategory,
  onSelectCategory,
  onClose,
}: InboxCategoryDrawerProps) {
  const { t, locale } = useI18n()
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({
    'cat-electronics': true,
    'cat-cosmetics': true,
  })

  const visibleTree = useMemo(() => filterCategoryTree(PRODUCT_CATEGORY_TREE, search), [search])

  const countForCategory = (categoryName: string) =>
    conversations.filter((conv) => matchesCategoryFilter(conv, categoryName)).length

  if (!isOpen) return null

  return (
    <div
      className="category-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('Danh mục sản phẩm', 'Product categories')}
    >
      <div className="category-drawer-overlay" onClick={onClose} />
      <aside className="category-drawer-panel">
        <header className="category-drawer-header">
          <div className="category-drawer-title">
            <span className="category-drawer-icon">
              <FolderTree size={18} />
            </span>
            <div>
              <h3>{t('Cây danh mục & Sản phẩm', 'Categories & Products')}</h3>
              <p>
                {t(
                  'Lọc hội thoại theo danh mục mặt hàng',
                  'Filter conversations by product category',
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={t('Đóng danh mục', 'Close categories')}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="category-drawer-search">
          <Search size={15} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Tìm danh mục hoặc sản phẩm…', 'Search category or product…')}
            aria-label={t('Tìm danh mục hoặc sản phẩm', 'Search category or product')}
          />
          {search && (
            <button
              type="button"
              className="icon-button"
              aria-label={t('Xóa từ khóa', 'Clear search')}
              onClick={() => setSearch('')}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="category-drawer-body">
          <button
            type="button"
            className={`category-node-button ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => {
              onSelectCategory('all')
              onClose()
            }}
          >
            <span className="category-node-label">
              <strong>{t('Tất cả danh mục', 'All categories')}</strong>
              <small>{t('Hiển thị toàn bộ hội thoại', 'Show all conversations')}</small>
            </span>
            <span className="category-node-badge">{conversations.length}</span>
          </button>

          {visibleTree.map((category) => {
            const isExpanded = Boolean(expandedIds[category.id]) || search.trim().length > 0
            const isSelected = selectedCategory === category.name
            const convCount = countForCategory(category.name)

            return (
              <div key={category.id} className="category-tree-group">
                <div className={`category-node-row ${isSelected ? 'active' : ''}`}>
                  <button
                    type="button"
                    className="category-expand-toggle"
                    aria-label={
                      isExpanded
                        ? t(`Thu gọn ${category.name}`, `Collapse ${category.englishName}`)
                        : t(`Mở rộng ${category.name}`, `Expand ${category.englishName}`)
                    }
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedIds((prev) => ({
                        ...prev,
                        [category.id]: !prev[category.id],
                      }))
                    }
                  >
                    <ChevronRight size={14} className={isExpanded ? 'category-chevron-open' : ''} />
                  </button>
                  <button
                    type="button"
                    className="category-node-select"
                    onClick={() => {
                      onSelectCategory(category.name)
                      onClose()
                    }}
                  >
                    <span className="category-node-label">
                      <strong>{locale === 'vi' ? category.name : category.englishName}</strong>
                      <small>
                        {t(
                          `${category.children.length} nhóm con · ${category.products.length} sản phẩm`,
                          `${category.children.length} subcategories · ${category.products.length} products`,
                        )}
                      </small>
                    </span>
                    <span className="category-node-badge">{convCount}</span>
                  </button>
                </div>

                {isExpanded && (
                  <div className="category-tree-children">
                    {category.children.map((sub) => {
                      const subSelected = selectedCategory === sub.name
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          className={`category-subnode-button ${subSelected ? 'active' : ''}`}
                          onClick={() => {
                            onSelectCategory(sub.name)
                            onClose()
                          }}
                        >
                          <span>• {locale === 'vi' ? sub.name : sub.englishName}</span>
                          <small>{sub.products.length} SP</small>
                        </button>
                      )
                    })}

                    <div className="category-attached-products">
                      {category.products.map((prod) => (
                        <div key={prod.id} className="category-product-item">
                          <Package size={13} />
                          <div className="category-product-info">
                            <strong>{prod.name}</strong>
                            <small>
                              {prod.sku} · {formatVndInteger(prod.priceVnd)} ·{' '}
                              {t(`Tồn: ${prod.stock}`, `Stock: ${prod.stock}`)}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>
    </div>
  )
}

export function ConversationCategoryBadge({ conversation }: { conversation: Conversation }) {
  const category = inferConversationCategory(conversation)
  return <span className="conversation-category-tag">{category}</span>
}
