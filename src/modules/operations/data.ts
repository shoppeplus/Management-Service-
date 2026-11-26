import type { InboxData } from '../../types/inbox'
import type {
  OperationsData,
  Order,
  OrderStatus,
  Product,
  Shipment,
  ShipmentStatus,
  Ticket,
  TicketStatus,
} from './types'
import { trackingDescription } from './carriers'

type ProductMetadata = Required<Pick<Product, 'imageUrl' | 'description' | 'unit' | 'category'>>

export const demoProductMetadata: Partial<Record<string, ProductMetadata>> = {
  'prod-nordic': {
    imageUrl: '/products/nordic.svg',
    description:
      'Bộ bình gốm tông cát và trắng ngà, dáng tối giản để cắm hoa hoặc trang trí bàn, kệ. Hình minh họa sản phẩm Demo.',
    unit: 'Bộ',
    category: 'Gốm trang trí',
  },
  'prod-mug': {
    imageUrl: '/products/mug.svg',
    description:
      'Cốc gốm màu kem có quai cầm, bề mặt mộc nhẹ; phù hợp dùng trà, cà phê và làm quà tặng. Hình minh họa sản phẩm Demo.',
    unit: 'Cốc',
    category: 'Gốm gia dụng',
  },
  'prod-plate': {
    imageUrl: '/products/plate.svg',
    description:
      'Bộ đĩa gốm thủ công tông trung tính, đường viền mềm, dùng bày món ăn hoặc trang trí bàn tiệc. Hình minh họa sản phẩm Demo.',
    unit: 'Bộ',
    category: 'Gốm gia dụng',
  },
  'prod-tea': {
    imageUrl: '/products/tea.svg',
    description:
      'Bộ trà Mộc gồm ấm và các chén đồng điệu, sắc men ấm, thích hợp cho góc trà và quà tặng. Hình minh họa sản phẩm Demo.',
    unit: 'Bộ',
    category: 'Bộ trà',
  },
  'prod-candle': {
    imageUrl: '/products/candle.svg',
    description:
      'Nến thơm Santal trong hũ thủy tinh màu hổ phách, phong cách ấm cúng cho không gian sống. Hình minh họa sản phẩm Demo.',
    unit: 'Hũ',
    category: 'Hương thơm',
  },
  'prod-tray': {
    imageUrl: '/products/tray.svg',
    description:
      'Khay gỗ trang trí tông nâu tự nhiên, lòng khay rộng, dùng bày đồ uống hoặc sắp xếp vật dụng nhỏ. Hình minh họa sản phẩm Demo.',
    unit: 'Khay',
    category: 'Đồ gỗ',
  },
}

const at = (day: number, hour = 9) =>
  new Date(
    `2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+07:00`,
  ).toISOString()

export function createOperationsDemoData(inbox: InboxData): OperationsData {
  const products: Product[] = [
    { id: 'prod-nordic', sku: 'CER-NOR-01', name: 'Bộ bình gốm Nordic', price: 650000, stock: 36 },
    { id: 'prod-mug', sku: 'CER-MUG-02', name: 'Cốc gốm màu kem', price: 180000, stock: 80 },
    { id: 'prod-plate', sku: 'CER-PLT-03', name: 'Bộ đĩa thủ công', price: 420000, stock: 42 },
    { id: 'prod-tea', sku: 'CER-TEA-04', name: 'Bộ trà Mộc', price: 890000, stock: 24 },
    { id: 'prod-candle', sku: 'DEC-CAN-05', name: 'Nến thơm Santal', price: 290000, stock: 55 },
    { id: 'prod-tray', sku: 'DEC-TRY-06', name: 'Khay gỗ trang trí', price: 350000, stock: 31 },
  ].map((product) => ({ ...product, ...demoProductMetadata[product.id] }))
  const statusList: OrderStatus[] = [
    'packing',
    'draft',
    'confirmed',
    'shipped',
    'delivered',
    'packing',
    'shipped',
    'delivered',
    'cancelled',
    'returned',
    'draft',
    'confirmed',
  ]
  const orders: Order[] = statusList.map((status, index) => {
    const customer = inbox.customers[index % inbox.customers.length]
    const product = products[index % products.length]
    const quantity = (index % 3) + 1
    const discount = index === 4 ? 50000 : 0
    // CRM contacts may omit delivery details. Demo seeding must not change those
    // contacts or make resetting unrelated modules depend on optional fields.
    const phone = customer.phone.trim()
    const hasDeliveryPhone =
      /^\+?[\d\s().-]{8,24}$/.test(phone) && phone.replace(/\D/g, '').length >= 8
    const address = customer.location.trim()
    return {
      id: `order-${String(index + 1).padStart(3, '0')}`,
      number: `SS-${2048 + index}`,
      customerId: customer.id,
      items: [
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity,
          unitPrice: product.price,
        },
      ],
      status,
      paymentMethod: index % 2 ? 'bank_transfer' : 'cod',
      paymentStatus: status === 'delivered' || index === 2 || index === 9 ? 'paid' : 'unpaid',
      subtotal: product.price * quantity,
      discount,
      shippingFee: 30000,
      total: product.price * quantity - discount + 30000,
      recipientName: customer.name,
      recipientPhone: hasDeliveryPhone ? phone : '0900000000',
      shippingAddress: address.length >= 5 ? address : 'Địa chỉ giao hàng mẫu (Demo)',
      note: index === 0 ? 'Gói quà sinh nhật, gửi trước chiều 18/11.' : '',
      createdAt: at(index < 7 ? 16 : 15, 8 + (index % 5)),
      updatedAt: at(17, 8 + (index % 4)),
    }
  })
  // Available stock already excludes confirmed, packed, shipped and delivered items.
  for (const order of orders.filter((order) =>
    ['confirmed', 'packing', 'shipped', 'delivered'].includes(order.status),
  )) {
    for (const line of order.items)
      products.find((product) => product.id === line.productId)!.stock -= line.quantity
  }
  const shipmentSeeds: [number, ShipmentStatus][] = [
    [0, 'ready'],
    [3, 'in_transit'],
    [4, 'delivered'],
    [5, 'ready'],
    [6, 'exception'],
    [7, 'delivered'],
    [9, 'returned'],
  ]
  const shipments: Shipment[] = shipmentSeeds.map(([index, status], position) => {
    const order = orders[index]
    const states: ShipmentStatus[] =
      status === 'ready'
        ? ['ready']
        : status === 'exception'
          ? ['ready', 'in_transit', 'exception']
          : status === 'in_transit'
            ? ['ready', 'in_transit']
            : ['ready', 'in_transit', status]
    return {
      id: `shipment-${String(position + 1).padStart(3, '0')}`,
      trackingNumber: `DEMO-${2048 + index}`,
      orderId: order.id,
      carrierId: index % 2 ? 'demo-economy' : 'demo-express',
      status,
      shippingFee: order.shippingFee,
      codAmount:
        order.paymentMethod === 'cod' && order.paymentStatus !== 'refunded' ? order.total : 0,
      estimatedDeliveryAt: at(status === 'delivered' || status === 'returned' ? 17 : 18, 16),
      events: states.map((state, eventIndex) => ({
        id: `seed-tracking-${position}-${eventIndex}`,
        status: state,
        description: trackingDescription(state),
        createdAt: at(17, 8 + eventIndex),
      })),
      createdAt: at(17, 8),
      updatedAt: at(17, 8 + states.length - 1),
    }
  })
  const ticketStatuses: TicketStatus[] = [
    'open',
    'in_progress',
    'waiting',
    'resolved',
    'open',
    'closed',
    'in_progress',
    'waiting',
  ]
  const subjects = [
    'Kiểm tra lịch giao quà sinh nhật',
    'Tư vấn bộ cốc gốm mới',
    'Xác nhận thanh toán đơn hàng',
    'Cập nhật địa chỉ nhận hàng',
    'Hỗ trợ bảo hành sản phẩm',
    'Tư vấn chương trình thành viên',
    'Giao hàng gặp sự cố',
    'Theo dõi đổi trả sản phẩm',
  ]
  const tickets: Ticket[] = ticketStatuses.map((status, index) => {
    const order = orders[index]
    const conversation = inbox.conversations.find((item) => item.customerId === order.customerId)
    const done = status === 'resolved' || status === 'closed'
    return {
      id: `ticket-${String(index + 1).padStart(3, '0')}`,
      number: `CS-${1001 + index}`,
      customerId: order.customerId,
      orderId: order.id,
      conversationId: conversation?.id ?? null,
      subject: subjects[index],
      description:
        index === 0
          ? 'Khách hàng cần nhận đơn #SS-2048 trước chiều mai để tặng sinh nhật. Nhờ đội vận hành kiểm tra lịch lấy hàng.'
          : `Tiếp nhận yêu cầu: ${subjects[index].toLowerCase()}.`,
      category:
        index % 4 === 0
          ? 'delivery'
          : index % 4 === 1
            ? 'product'
            : index % 4 === 2
              ? 'payment'
              : 'return',
      status,
      priority: index === 0 || index === 6 ? 'high' : index === 4 ? 'urgent' : 'normal',
      assigneeId: index === 4 ? null : inbox.agents[index % inbox.agents.length].id,
      dueAt: at(index === 0 ? 17 : 18, index === 0 ? 14 : 10),
      resolution: done ? 'Đã kiểm tra thông tin và xác nhận phương án hỗ trợ với khách hàng.' : '',
      comments:
        index % 2 === 0
          ? [
              {
                id: `seed-comment-${index}`,
                text: 'Đã tiếp nhận, đang phối hợp với bộ phận phụ trách.',
                authorId: 'agent-linh',
                createdAt: at(17, 9),
              },
            ]
          : [],
      createdAt: at(17, 8),
      updatedAt: at(17, 10),
      resolvedAt: done ? at(17, 10) : null,
    }
  })
  return {
    schemaVersion: 1,
    customerProfiles: inbox.customers.map((customer, index) => ({
      customerId: customer.id,
      status: index === 3 ? 'lead' : index === 7 ? 'inactive' : 'active',
      ownerId: inbox.agents[index % inbox.agents.length]?.id ?? null,
      source:
        inbox.conversations.find((conversation) => conversation.customerId === customer.id)
          ?.channel ?? 'manual',
      tags:
        index === 0 ? ['Khách thân thiết', 'Quà tặng'] : index % 3 === 0 ? ['Tiềm năng B2B'] : [],
      notes:
        index === 0
          ? [
              {
                id: 'customer-note-seed-001',
                text: 'Ưu tiên tư vấn các bộ sưu tập gốm thủ công. Khách thường mua quà tặng.',
                createdAt: at(16, 10),
                authorId: 'agent-linh',
              },
            ]
          : [],
      createdAt: at(1 + index, 9),
      updatedAt: at(17, 9),
    })),
    products,
    orders,
    shipments,
    tickets,
    auditEvents: [
      {
        id: 'audit-demo-seed',
        entity: 'order',
        entityId: 'order-001',
        action: 'order.created',
        description: 'Dữ liệu mẫu: tạo đơn SS-2048 từ hội thoại Instagram.',
        createdAt: at(16, 9),
        actorId: 'agent-linh',
      },
    ],
  }
}
