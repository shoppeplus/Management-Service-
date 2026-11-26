import type { Conversation } from '../types/inbox'
import type { InventorySnapshot } from '../modules/inventory/types'
import type { QuotationCatalog } from '../services/quotationCatalog'

export interface CatalogProductItem {
  id: string
  sku: string
  name: string
  priceVnd: number
  stock: number
  categoryName: string
  subCategoryName: string
}

export interface ProductSubCategory {
  id: string
  name: string
  englishName: string
  parentName: string
  products: CatalogProductItem[]
}

export interface ProductCategoryNode {
  id: string
  name: string
  englishName: string
  code: string
  children: ProductSubCategory[]
  products: CatalogProductItem[]
}

export const PRODUCT_CATEGORY_TREE: ProductCategoryNode[] = [
  {
    id: 'cat-electronics',
    name: 'Điện tử',
    englishName: 'Electronics',
    code: 'DIEN_TU',
    children: [
      {
        id: 'sub-camera',
        name: 'Camera & An ninh',
        englishName: 'Cameras & Security',
        parentName: 'Điện tử',
        products: [
          {
            id: 'PROD-011',
            sku: 'SKU-DT-011',
            name: 'Camera An Ninh AI 4K',
            priceVnd: 4590000,
            stock: 40,
            categoryName: 'Điện tử',
            subCategoryName: 'Camera & An ninh',
          },
        ],
      },
      {
        id: 'sub-smartlock',
        name: 'Khóa vân tay & SmartHome',
        englishName: 'Smart Locks & Home',
        parentName: 'Điện tử',
        products: [
          {
            id: 'PROD-012',
            sku: 'SKU-DT-012',
            name: 'Khóa Vân Tay SmartLock Pro',
            priceVnd: 3850000,
            stock: 25,
            categoryName: 'Điện tử',
            subCategoryName: 'Khóa vân tay & SmartHome',
          },
        ],
      },
    ],
    products: [
      {
        id: 'PROD-011',
        sku: 'SKU-DT-011',
        name: 'Camera An Ninh AI 4K',
        priceVnd: 4590000,
        stock: 40,
        categoryName: 'Điện tử',
        subCategoryName: 'Camera & An ninh',
      },
      {
        id: 'PROD-012',
        sku: 'SKU-DT-012',
        name: 'Khóa Vân Tay SmartLock Pro',
        priceVnd: 3850000,
        stock: 25,
        categoryName: 'Điện tử',
        subCategoryName: 'Khóa vân tay & SmartHome',
      },
    ],
  },
  {
    id: 'cat-home',
    name: 'Đồ gia dụng',
    englishName: 'Home & Living',
    code: 'DO_GIA_DUNG',
    children: [
      {
        id: 'sub-lighting',
        name: 'Đèn LED & Chiếu sáng',
        englishName: 'LED Lighting',
        parentName: 'Đồ gia dụng',
        products: [
          {
            id: 'PROD-010',
            sku: 'SKU-GD-010',
            name: 'Đèn Bàn LED Chống Cận',
            priceVnd: 380000,
            stock: 55,
            categoryName: 'Đồ gia dụng',
            subCategoryName: 'Đèn LED & Chiếu sáng',
          },
        ],
      },
      {
        id: 'sub-kitchen',
        name: 'Bình nhiệt & Gốm sứ',
        englishName: 'Drinkware & Ceramics',
        parentName: 'Đồ gia dụng',
        products: [
          {
            id: 'PROD-009',
            sku: 'SKU-GD-009',
            name: 'Bình Giữ Nhiệt Inox 500ml',
            priceVnd: 220000,
            stock: 150,
            categoryName: 'Đồ gia dụng',
            subCategoryName: 'Bình nhiệt & Gốm sứ',
          },
        ],
      },
    ],
    products: [
      {
        id: 'PROD-009',
        sku: 'SKU-GD-009',
        name: 'Bình Giữ Nhiệt Inox 500ml',
        priceVnd: 220000,
        stock: 150,
        categoryName: 'Đồ gia dụng',
        subCategoryName: 'Bình nhiệt & Gốm sứ',
      },
      {
        id: 'PROD-010',
        sku: 'SKU-GD-010',
        name: 'Đèn Bàn LED Chống Cận',
        priceVnd: 380000,
        stock: 55,
        categoryName: 'Đồ gia dụng',
        subCategoryName: 'Đèn LED & Chiếu sáng',
      },
    ],
  },
  {
    id: 'cat-cosmetics',
    name: 'Mỹ phẩm',
    englishName: 'Cosmetics & Beauty',
    code: 'MY_PHAM',
    children: [
      {
        id: 'sub-skincare',
        name: 'Chăm sóc da (Skincare)',
        englishName: 'Skincare',
        parentName: 'Mỹ phẩm',
        products: [
          {
            id: 'PROD-002',
            sku: 'SKU-MP-002',
            name: 'Kem Chống Nắng SPF50+',
            priceVnd: 320000,
            stock: 85,
            categoryName: 'Mỹ phẩm',
            subCategoryName: 'Chăm sóc da (Skincare)',
          },
          {
            id: 'PROD-003',
            sku: 'SKU-MP-003',
            name: 'Serum Vitamin C Dưỡng Trắng',
            priceVnd: 450000,
            stock: 64,
            categoryName: 'Mỹ phẩm',
            subCategoryName: 'Chăm sóc da (Skincare)',
          },
        ],
      },
      {
        id: 'sub-makeup',
        name: 'Trang điểm (Makeup)',
        englishName: 'Makeup',
        parentName: 'Mỹ phẩm',
        products: [
          {
            id: 'PROD-001',
            sku: 'SKU-MP-001',
            name: 'Son Môi Lì Cao Cấp',
            priceVnd: 250000,
            stock: 120,
            categoryName: 'Mỹ phẩm',
            subCategoryName: 'Trang điểm (Makeup)',
          },
        ],
      },
    ],
    products: [
      {
        id: 'PROD-001',
        sku: 'SKU-MP-001',
        name: 'Son Môi Lì Cao Cấp',
        priceVnd: 250000,
        stock: 120,
        categoryName: 'Mỹ phẩm',
        subCategoryName: 'Trang điểm (Makeup)',
      },
      {
        id: 'PROD-002',
        sku: 'SKU-MP-002',
        name: 'Kem Chống Nắng SPF50+',
        priceVnd: 320000,
        stock: 85,
        categoryName: 'Mỹ phẩm',
        subCategoryName: 'Chăm sóc da (Skincare)',
      },
      {
        id: 'PROD-003',
        sku: 'SKU-MP-003',
        name: 'Serum Vitamin C Dưỡng Trắng',
        priceVnd: 450000,
        stock: 64,
        categoryName: 'Mỹ phẩm',
        subCategoryName: 'Chăm sóc da (Skincare)',
      },
    ],
  },
  {
    id: 'cat-fashion',
    name: 'Thời trang',
    englishName: 'Fashion',
    code: 'THOI_TRANG',
    children: [
      {
        id: 'sub-shirt',
        name: 'Áo thun Unisex',
        englishName: 'Unisex T-Shirts',
        parentName: 'Thời trang',
        products: [
          {
            id: 'PROD-004',
            sku: 'SKU-TT-004',
            name: 'Áo Thun Unisex Basic',
            priceVnd: 180000,
            stock: 210,
            categoryName: 'Thời trang',
            subCategoryName: 'Áo thun Unisex',
          },
        ],
      },
      {
        id: 'sub-jogger',
        name: 'Quần thể thao & Jogger',
        englishName: 'Joggers & Sportswear',
        parentName: 'Thời trang',
        products: [
          {
            id: 'PROD-005',
            sku: 'SKU-TT-005',
            name: 'Quần Jogger Thể Thao',
            priceVnd: 350000,
            stock: 95,
            categoryName: 'Thời trang',
            subCategoryName: 'Quần thể thao & Jogger',
          },
        ],
      },
    ],
    products: [
      {
        id: 'PROD-004',
        sku: 'SKU-TT-004',
        name: 'Áo Thun Unisex Basic',
        priceVnd: 180000,
        stock: 210,
        categoryName: 'Thời trang',
        subCategoryName: 'Áo thun Unisex',
      },
      {
        id: 'PROD-005',
        sku: 'SKU-TT-005',
        name: 'Quần Jogger Thể Thao',
        priceVnd: 350000,
        stock: 95,
        categoryName: 'Thời trang',
        subCategoryName: 'Quần thể thao & Jogger',
      },
    ],
  },
  {
    id: 'cat-accessories',
    name: 'Phụ kiện',
    englishName: 'Accessories',
    code: 'PHU_KIEN',
    children: [
      {
        id: 'sub-bags',
        name: 'Túi xách & Ví da',
        englishName: 'Bags & Wallets',
        parentName: 'Phụ kiện',
        products: [
          {
            id: 'PROD-006',
            sku: 'SKU-PK-006',
            name: 'Túi Xách Nữ Mini',
            priceVnd: 290000,
            stock: 42,
            categoryName: 'Phụ kiện',
            subCategoryName: 'Túi xách & Ví da',
          },
        ],
      },
      {
        id: 'sub-watches',
        name: 'Đồng hồ & Kính mắt',
        englishName: 'Watches & Eyewear',
        parentName: 'Phụ kiện',
        products: [
          {
            id: 'PROD-008',
            sku: 'SKU-PK-008',
            name: 'Đồng Hồ Dây Da Nam',
            priceVnd: 550000,
            stock: 30,
            categoryName: 'Phụ kiện',
            subCategoryName: 'Đồng hồ & Kính mắt',
          },
        ],
      },
    ],
    products: [
      {
        id: 'PROD-006',
        sku: 'SKU-PK-006',
        name: 'Túi Xách Nữ Mini',
        priceVnd: 290000,
        stock: 42,
        categoryName: 'Phụ kiện',
        subCategoryName: 'Túi xách & Ví da',
      },
      {
        id: 'PROD-008',
        sku: 'SKU-PK-008',
        name: 'Đồng Hồ Dây Da Nam',
        priceVnd: 550000,
        stock: 30,
        categoryName: 'Phụ kiện',
        subCategoryName: 'Đồng hồ & Kính mắt',
      },
    ],
  },
]

export function formatVndInteger(amount: number): string {
  const safe = Number.isSafeInteger(amount) ? amount : Math.round(Number(amount) || 0)
  return `${safe.toLocaleString('vi-VN')} ₫`
}

export function inferConversationCategory(conversation: Conversation): string {
  if (conversation.category && conversation.category.trim().length > 0) {
    return conversation.category.trim()
  }
  const text = [
    conversation.subject,
    ...conversation.tags,
    ...conversation.messages.map((m) => m.text),
  ]
    .join(' ')
    .toLowerCase()

  if (/serum|kem|son|mỹ phẩm|skincare|da|nến thơm|tinh dầu/.test(text)) return 'Mỹ phẩm'
  if (/áo|quần|size|thời trang|jogger|linen|lụa/.test(text)) return 'Thời trang'
  if (/camera|khóa|điện tử|bảo hành|kỹ thuật|cảm biến/.test(text)) return 'Điện tử'
  if (/túi|đồng hồ|kính|phụ kiện|ví/.test(text)) return 'Phụ kiện'
  if (/cốc|gốm|bình|đèn|gia dụng|khay|bàn/.test(text)) return 'Đồ gia dụng'

  const deterministicMap: Record<string, string> = {
    shopee: 'Đồ gia dụng',
    tiktok: 'Mỹ phẩm',
    lazada: 'Điện tử',
    zalo: 'Điện tử',
    messenger: 'Thời trang',
    instagram: 'Phụ kiện',
  }
  return deterministicMap[conversation.channel] ?? 'Đồ gia dụng'
}

export function matchesCategoryFilter(conversation: Conversation, categoryFilter: string): boolean {
  if (!categoryFilter || categoryFilter === 'all') return true
  const target = categoryFilter.toLowerCase().trim()
  const convCategory = inferConversationCategory(conversation).toLowerCase()
  if (convCategory === target) return true

  const parentNode = PRODUCT_CATEGORY_TREE.find((node) => node.name.toLowerCase() === convCategory)
  if (!parentNode) return false
  return parentNode.children.some((child) => child.name.toLowerCase() === target)
}

export function filterCategoryTree(
  tree: ProductCategoryNode[],
  search: string,
  allowedCategories?: string[] | null,
): ProductCategoryNode[] {
  const allowedSet =
    Array.isArray(allowedCategories) && allowedCategories.length > 0
      ? new Set(allowedCategories.map((c) => c.toLowerCase().trim()))
      : null

  const scoped = allowedSet
    ? tree.filter(
        (node) =>
          allowedSet.has(node.name.toLowerCase()) ||
          node.children.some((child) => allowedSet.has(child.name.toLowerCase())),
      )
    : tree

  const query = search.trim().toLowerCase()
  if (!query) return scoped

  return scoped.reduce<ProductCategoryNode[]>((acc, node) => {
    const nodeMatch =
      node.name.toLowerCase().includes(query) || node.englishName.toLowerCase().includes(query)
    const matchingChildren = node.children.filter(
      (child) =>
        child.name.toLowerCase().includes(query) || child.englishName.toLowerCase().includes(query),
    )
    const matchingProducts = node.products.filter(
      (prod) => prod.name.toLowerCase().includes(query) || prod.sku.toLowerCase().includes(query),
    )

    if (nodeMatch) {
      acc.push(node)
    } else if (matchingChildren.length > 0 || matchingProducts.length > 0) {
      acc.push({
        ...node,
        children: matchingChildren.length > 0 ? matchingChildren : node.children,
        products: matchingProducts.length > 0 ? matchingProducts : node.products,
      })
    }
    return acc
  }, [])
}

const DEMO_EXTRA_PRODUCTS: CatalogProductItem[] = [
  {
    id: 'PROD-NORDIC-01',
    sku: 'GD-NOR-01',
    name: 'Bộ bình gốm Nordic',
    priceVnd: 680000,
    stock: 28,
    categoryName: 'Đồ gia dụng',
    subCategoryName: 'Đèn & Decor phòng',
  },
  {
    id: 'PROD-CUP-02',
    sku: 'GD-CUP-02',
    name: 'Cốc gốm màu kem',
    priceVnd: 195000,
    stock: 64,
    categoryName: 'Đồ gia dụng',
    subCategoryName: 'Đèn & Decor phòng',
  },
  {
    id: 'PROD-CANDLE-03',
    sku: 'GD-CAN-03',
    name: 'Nến thơm Santal',
    priceVnd: 340000,
    stock: 42,
    categoryName: 'Đồ gia dụng',
    subCategoryName: 'Đèn & Decor phòng',
  },
]

export function listAllDemoCatalogProducts(): CatalogProductItem[] {
  return [...PRODUCT_CATEGORY_TREE.flatMap((node) => node.products), ...DEMO_EXTRA_PRODUCTS]
}

export function createDemoInventorySnapshot(): InventorySnapshot {
  const catalogItems = listAllDemoCatalogProducts()
  const nowIso = '2026-11-17T09:00:00.000Z'
  const whMain = 'WH-DEMO-HN'
  const whHcm = 'WH-DEMO-HCM'

  const skus: InventorySnapshot['skus'] = catalogItems.map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: item.categoryName,
    unit: 'cái',
    serialTracked: false,
    reorderPoint: 10,
    maxStock: 200,
    leadTimeDays: 3,
    warrantyMonths: 12,
    active: true,
    price: item.priceVnd,
    priceKnown: true,
    metadata: {
      description: `${item.name} · Danh mục ${item.categoryName} (${item.subCategoryName})`,
    },
  }))

  const balances: InventorySnapshot['balances'] = catalogItems.map((item) => {
    const avgCost = Math.round(item.priceVnd * 0.65)
    return {
      warehouseId: whMain,
      locationId: 'LOC-HN-A1',
      skuId: item.id,
      onHand: item.stock,
      reserved: 2,
      damaged: 0,
      warranty: 0,
      available: Math.max(0, item.stock - 2),
      inventoryValue: item.stock * avgCost,
      averageCost: avgCost,
      updatedAt: nowIso,
    }
  })

  return {
    tenant: {
      id: 'TENANT-DEMO-TT',
      name: 'SmartSales TikTok Shop Workspace',
      config: {
        inventoryEnabled: true,
        multiWarehouseEnabled: true,
        staleDays: 30,
      },
    },
    actor: {
      userId: 'USR-DEMO-01',
      role: 'admin',
    },
    permissions: [
      'inventory.read',
      'product.manage',
      'warehouse.manage',
      'supplier.manage',
      'purchase.create',
      'purchase.approve',
      'purchase.receive',
      'salesOrder.create',
      'salesOrder.confirm',
      'salesOrder.fulfill',
      'salesOrder.return',
      'salesOrder.cancel',
      'stock.adjust',
      'stock.transfer',
      'stock.count',
      'ledger.read',
      'report.read',
      'audit.read',
    ],
    warehouses: [
      {
        id: whMain,
        code: 'KHO-TT-01',
        name: 'Kho Tổng TikTok Shop Hà Nội',
        address: 'Quận Cầu Giấy, Hà Nội',
        active: true,
      },
      {
        id: whHcm,
        code: 'KHO-TT-02',
        name: 'Kho Fulfillment TikTok TP.HCM',
        address: 'Quận 7, TP.HCM',
        active: true,
      },
    ],
    locations: [
      {
        id: 'LOC-HN-A1',
        warehouseId: whMain,
        code: 'A1-01',
        name: 'Kệ A1 · Hàng TikTok Live',
      },
    ],
    suppliers: [],
    skus,
    balances,
    documents: [],
    purchaseRequests: [],
    purchaseOrders: [],
    salesOrders: [
      {
        id: 'SO-DEMO-001',
        number: 'SO-TT-2048',
        warehouseId: whMain,
        customerReference: 'Nguyễn Mai Anh (CUS-001)',
        reference: 'conversation:conv-001',
        note: 'Đơn TikTok Shop #SS-2048 · Ưu tiên đóng gói quà tặng',
        status: 'confirmed',
        fulfillmentDocumentId: null,
        createdAt: nowIso,
        lines: [
          {
            id: 'SOL-DEMO-01',
            skuId: 'PROD-NORDIC-01',
            sku: 'GD-NOR-01',
            name: 'Bộ bình gốm Nordic',
            quantity: 1,
            unitPrice: 680000,
            locationId: 'LOC-HN-A1',
            reservationId: 'RES-DEMO-01',
            returnedQuantity: 0,
            returnableQuantity: 0,
          },
          {
            id: 'SOL-DEMO-02',
            skuId: 'PROD-CANDLE-03',
            sku: 'GD-CAN-03',
            name: 'Nến thơm Santal',
            quantity: 1,
            unitPrice: 340000,
            locationId: 'LOC-HN-A1',
            reservationId: 'RES-DEMO-02',
            returnedQuantity: 0,
            returnableQuantity: 0,
          },
        ],
      },
    ],
    ledger: [],
    reservations: [],
    counts: [],
    serials: [],
    warranties: [],
    auditEvents: [],
    metrics: {},
  }
}

export function createDemoQuotationCatalog(warehouseId?: string | null): QuotationCatalog {
  const snapshot = createDemoInventorySnapshot()
  const activeWhId = warehouseId ?? null
  return {
    tenant: {
      id: snapshot.tenant.id,
      name: snapshot.tenant.name,
    },
    actor: snapshot.actor,
    warehouses: snapshot.warehouses.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
    })),
    warehouseId: activeWhId,
    asOf: '2026-11-17T09:00:00.000Z',
    products: snapshot.skus.map((sku) => {
      const stock = snapshot.balances
        .filter((b) => b.skuId === sku.id && (!activeWhId || b.warehouseId === activeWhId))
        .reduce((sum, b) => sum + b.available, 0)
      return {
        id: sku.id,
        sku: sku.sku,
        name: sku.name,
        category: sku.category,
        unit: sku.unit,
        price: sku.price ?? 0,
        stock,
        warrantyMonths: sku.warrantyMonths ?? 12,
        description: sku.metadata?.description,
      }
    }),
  }
}
