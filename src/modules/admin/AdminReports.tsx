import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DollarSign,
  Headphones,
  MessageSquare,
  Package,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CHANNELS } from '../../lib/inbox'
import { useI18n } from '../../i18n'
import { dateTime, money } from '../operations/domain'
import { operationLabel } from '../operations/labels'
import type { OperationsData, OrderStatus } from '../operations/types'
import type { InboxData } from '../../types/inbox'
import type { DashboardData } from '../dashboard/metrics'

interface AdminReportProps {
  inbox: InboxData
  data: OperationsData
  overview: DashboardData
  now: Date
}

const orderStatuses: OrderStatus[] = [
  'draft',
  'confirmed',
  'packing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
]

const isInPeriod = (value: string, start: number, end: number) => {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end
}

const isValidOrderValue = (status: OrderStatus) => status !== 'cancelled' && status !== 'returned'

const formatDuration = (minutes: number, t: (vi: string, en: string) => string) => {
  if (minutes < 60) return t(`${Math.round(minutes)} phút`, `${Math.round(minutes)} min`)
  const hours = minutes / 60
  if (hours < 24) return t(`${hours.toFixed(1)} giờ`, `${hours.toFixed(1)} hr`)
  return t(`${(hours / 24).toFixed(1)} ngày`, `${(hours / 24).toFixed(1)} days`)
}

export function SalesReport({ inbox, data, overview, now }: AdminReportProps) {
  const { t, locale } = useI18n()
  const count = (value: number) => value.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB')
  const start = new Date(`${overview.period.start}T00:00:00`).getTime()
  const end = now.getTime()
  const orders = data.orders
    .filter((order) => isInPeriod(order.createdAt, start, end))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const validOrders = orders.filter((order) => isValidOrderValue(order.status))
  const validOrderValue = validOrders.reduce((total, order) => total + order.total, 0)
  const paidValue = validOrders
    .filter((order) => order.paymentStatus === 'paid')
    .reduce((total, order) => total + order.total, 0)
  const refundedValue = orders
    .filter((order) => order.paymentStatus === 'refunded')
    .reduce((total, order) => total + order.total, 0)
  const totalUnits = validOrders.reduce(
    (total, order) => total + order.items.reduce((lineTotal, item) => lineTotal + item.quantity, 0),
    0,
  )
  const previousStart = new Date(`${overview.period.previousStart}T00:00:00`).getTime()
  const previousEnd = new Date(`${overview.period.previousEnd}T23:59:59.999`).getTime()
  const previousUnits = data.orders
    .filter(
      (order) =>
        isInPeriod(order.createdAt, previousStart, previousEnd) && isValidOrderValue(order.status),
    )
    .reduce(
      (total, order) =>
        total + order.items.reduce((lineTotal, item) => lineTotal + item.quantity, 0),
      0,
    )
  const customers = new Map(inbox.customers.map((customer) => [customer.id, customer.name]))
  const shipments = new Map(data.shipments.map((shipment) => [shipment.orderId, shipment]))
  const statusCounts = new Map(
    overview.orderStatuses.map((status) => [status.status, status.count]),
  )
  const shipmentsInPeriod = data.shipments.filter((shipment) =>
    isInPeriod(shipment.createdAt, start, end),
  )
  const deliveredShipments = shipmentsInPeriod.filter((shipment) => shipment.status === 'delivered')
  const exceptions = data.shipments.filter((shipment) => shipment.status === 'exception')
  const paymentStatuses = ['paid', 'unpaid', 'refunded'] as const
  const paymentMethods = ['cod', 'bank_transfer'] as const
  const shipmentStatuses = [
    'ready',
    'in_transit',
    'delivered',
    'exception',
    'returned',
    'cancelled',
  ] as const
  const products = new Map<
    string,
    { id: string; sku: string; name: string; quantity: number; value: number; orders: Set<string> }
  >()
  for (const order of validOrders) {
    for (const item of order.items) {
      const product = products.get(item.productId) ?? {
        id: item.productId,
        sku: item.sku,
        name: item.name,
        quantity: 0,
        value: 0,
        orders: new Set<string>(),
      }
      product.quantity += item.quantity
      product.value += item.quantity * item.unitPrice
      product.orders.add(order.id)
      products.set(item.productId, product)
    }
  }
  const topProducts = [...products.values()].sort(
    (left, right) =>
      right.value - left.value ||
      right.quantity - left.quantity ||
      left.name.localeCompare(right.name),
  )
  const maxDailyValue = Math.max(1, ...overview.trend.map((day) => day.orderValue))
  const percentageChange = (current: number, previous: number) =>
    previous === 0 ? null : ((current - previous) / previous) * 100
  const changeLabel = (current: number, previous: number) => {
    const change = percentageChange(current, previous)
    return change === null
      ? t('Chưa có kỳ so sánh', 'No prior-period baseline')
      : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
  }

  return (
    <>
      <section className="dashboard-metrics" aria-label={t('Báo cáo bán hàng', 'Sales report')}>
        <Metric
          title={t('Giá trị đơn hợp lệ', 'Eligible order value')}
          value={money(validOrderValue, locale)}
          detail={t(
            `${validOrders.length} đơn sau loại trừ hủy/hoàn`,
            `${validOrders.length} orders excluding cancellations/returns`,
          )}
          icon={ShoppingBag}
          tone="purple"
        />
        <Metric
          title={t('Đơn tạo trong kỳ', 'Orders created')}
          value={count(overview.summary.orderCount)}
          detail={t(
            `${count(overview.summary.orderCount)} đơn tạo · số lượng hàng chỉ tính đơn hợp lệ`,
            `${count(overview.summary.orderCount)} created · units count eligible orders only`,
          )}
          icon={Package}
          tone="blue"
        />
        <Metric
          title={t('Giá trị đơn trung bình', 'Average order value')}
          value={money(validOrders.length ? validOrderValue / validOrders.length : 0, locale)}
          detail={t('Trên đơn hợp lệ trong kỳ', 'Per eligible order in this period')}
          icon={DollarSign}
          tone="blue"
        />
        <Metric
          title={t('Giá trị được đánh dấu đã thanh toán', 'Order value marked paid')}
          value={money(paidValue, locale)}
          detail={t(
            'Theo trạng thái hiện tại; chưa đối soát ngân hàng',
            'Current status only; not bank-reconciled',
          )}
          icon={CheckCircle2}
          tone="green"
        />
        <Metric
          title={t('Giá trị đơn đã giao', 'Delivered order value')}
          value={money(overview.summary.deliveredValue, locale)}
          detail={t(
            `${deliveredShipments.length} vận đơn tạo trong kỳ`,
            `${deliveredShipments.length} shipments created in period`,
          )}
          icon={ShoppingBag}
          tone="green"
        />
        <Metric
          title={t('Đơn hủy / hoàn', 'Cancelled / returned orders')}
          value={count(
            orders.filter((order) => ['cancelled', 'returned'].includes(order.status)).length,
          )}
          detail={t(
            `${money(refundedValue, locale)} có trạng thái hoàn tiền`,
            `${money(refundedValue, locale)} marked refunded`,
          )}
          icon={AlertTriangle}
          tone="amber"
        />
        <Metric
          title={t('Vận đơn có sự cố', 'Shipment exceptions')}
          value={count(exceptions.length)}
          detail={t('Tồn tại trong trạng thái hiện tại', 'Current shipment snapshot')}
          icon={Truck}
          tone="amber"
        />
      </section>

      <section className="admin-report-panel admin-report-full">
        <header>
          <h2>{t('So sánh kỳ báo cáo', 'Period comparison')}</h2>
          <p>
            {t(
              'So sánh cùng số ngày liền trước; trạng thái đơn là trạng thái hiện tại của dữ liệu.',
              'Compared with the immediately preceding equal-length period; order statuses are current snapshot values.',
            )}
          </p>
        </header>
        <div className="admin-report-table-wrap">
          <table className="admin-report-table">
            <thead>
              <tr>
                <th>{t('Chỉ số', 'Metric')}</th>
                <th>{t('Kỳ này', 'This period')}</th>
                <th>{t('Kỳ trước', 'Previous period')}</th>
                <th>{t('Thay đổi', 'Change')}</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: t('Đơn tạo', 'Orders created'),
                  current: overview.summary.orderCount,
                  previous: overview.previous.orderCount,
                  format: count,
                },
                {
                  label: t('Giá trị đơn hợp lệ', 'Eligible order value'),
                  current: overview.summary.orderValue,
                  previous: overview.previous.orderValue,
                  format: (value: number) => money(value, locale),
                },
                {
                  label: t('Giá trị đơn đã giao', 'Delivered order value'),
                  current: overview.summary.deliveredValue,
                  previous: overview.previous.deliveredValue,
                  format: (value: number) => money(value, locale),
                },
                {
                  label: t('Sản phẩm đã bán', 'Units sold'),
                  current: totalUnits,
                  previous: previousUnits,
                  format: count,
                },
              ].map(({ label, current, previous, format }) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{format(current)}</td>
                  <td>{format(previous)}</td>
                  <td>{changeLabel(current, previous)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-report-panel admin-report-full">
        <header>
          <h2>{t('Xu hướng đơn hàng theo ngày', 'Daily order trend')}</h2>
          <p>
            {t(
              'Giá trị đơn hợp lệ và số đơn tạo trong từng ngày của kỳ đang chọn.',
              'Eligible order value and created orders for each day in the selected period.',
            )}
          </p>
        </header>
        <div className="admin-trend-scroll">
          <div className="admin-sales-trend">
            {overview.trend.map((day) => {
              const height = Math.max(3, (day.orderValue / maxDailyValue) * 100)
              return (
                <div
                  className="admin-sales-trend-day"
                  key={day.date}
                  title={`${day.date} · ${money(day.orderValue, locale)} · ${count(day.orderCount)} ${t('đơn', 'orders')}`}
                >
                  <span className="admin-sales-trend-value">
                    {day.orderValue ? count(day.orderCount) : ''}
                  </span>
                  <span className="admin-sales-trend-bar" style={{ height: `${height}%` }} />
                  <time>{day.date.slice(5)}</time>
                </div>
              )
            })}
          </div>
        </div>
        <div className="admin-report-table-wrap admin-table-scroll">
          <table className="admin-report-table">
            <thead>
              <tr>
                <th>{t('Ngày', 'Date')}</th>
                <th>{t('Số đơn', 'Orders')}</th>
                <th>{t('Giá trị đơn hợp lệ', 'Eligible order value')}</th>
                <th>{t('Tin nhắn đến', 'Incoming messages')}</th>
              </tr>
            </thead>
            <tbody>
              {overview.trend.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{day.date}</th>
                  <td>{count(day.orderCount)}</td>
                  <td>{money(day.orderValue, locale)}</td>
                  <td>{count(day.incomingMessages)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="admin-report-panel admin-report-full"
        aria-label={t('Đơn hàng chi tiết', 'Order details')}
      >
        <header>
          <h2>{t('Danh sách đơn hàng', 'Orders')}</h2>
          <p>
            {t(
              'Theo ngày tạo và trạng thái hiện tại; số tiền là giá trị đơn, không phải tiền đã thu.',
              'By creation date and current status; amounts are order value, not cash collected.',
            )}
          </p>
        </header>
        <div className="admin-report-table-wrap admin-table-scroll">
          <table className="admin-report-table">
            <thead>
              <tr>
                <th>{t('Mã đơn', 'Order')}</th>
                <th>{t('Khách hàng', 'Customer')}</th>
                <th>{t('Ngày tạo', 'Created')}</th>
                <th>{t('Trạng thái', 'Status')}</th>
                <th>{t('Thanh toán', 'Payment')}</th>
                <th>{t('Vận chuyển', 'Shipping')}</th>
                <th>{t('Sản phẩm / SKU', 'Products / SKU')}</th>
                <th>{t('Tạm tính', 'Subtotal')}</th>
                <th>{t('Giảm giá', 'Discount')}</th>
                <th>{t('Phí giao hàng', 'Shipping fee')}</th>
                <th>{t('Tổng đơn', 'Order total')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const shipment = shipments.get(order.id)
                return (
                  <tr key={order.id}>
                    <th scope="row">{order.number}</th>
                    <td>{customers.get(order.customerId) ?? order.recipientName}</td>
                    <td>{dateTime(order.createdAt, locale)}</td>
                    <td>{operationLabel(order.status, locale)}</td>
                    <td>{operationLabel(order.paymentStatus, locale)}</td>
                    <td>
                      {shipment
                        ? operationLabel(shipment.status, locale)
                        : t('Chưa tạo', 'Not created')}
                    </td>
                    <td>
                      {order.items.map((item) => (
                        <span
                          className="admin-report-line-item"
                          key={`${order.id}-${item.productId}`}
                        >
                          {item.name} × {count(item.quantity)} <small>{item.sku}</small>
                        </span>
                      ))}
                    </td>
                    <td>{money(order.subtotal, locale)}</td>
                    <td>{money(order.discount, locale)}</td>
                    <td>{money(order.shippingFee, locale)}</td>
                    <td>{money(order.total, locale)}</td>
                  </tr>
                )
              })}
              {!orders.length && (
                <tr>
                  <td colSpan={11}>
                    {t('Không có đơn hàng trong kỳ.', 'No orders in this period.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="admin-report-grid">
        <section className="admin-report-panel">
          <header>
            <h2>{t('Đơn theo trạng thái', 'Orders by status')}</h2>
            <p>{t('Số liệu trong khoảng thời gian đang chọn', 'Selected reporting period')}</p>
          </header>
          <div className="admin-report-table-wrap">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>{t('Trạng thái', 'Status')}</th>
                  <th>{t('Số đơn', 'Orders')}</th>
                  <th>{t('Tỷ trọng', 'Share')}</th>
                </tr>
              </thead>
              <tbody>
                {orderStatuses.map((status) => {
                  const value = statusCounts.get(status) ?? 0
                  const percent = overview.summary.orderCount
                    ? Math.round((value / overview.summary.orderCount) * 100)
                    : 0
                  return (
                    <tr key={status}>
                      <th scope="row">{operationLabel(status, locale)}</th>
                      <td>{count(value)}</td>
                      <td>{percent}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="admin-report-panel">
          <header>
            <h2>{t('Thanh toán theo trạng thái', 'Payment status')}</h2>
            <p>
              {t(
                'Số đơn và tổng giá trị đơn theo trạng thái hiện tại',
                'Order count and value by current payment status',
              )}
            </p>
          </header>
          <div className="admin-report-table-wrap">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>{t('Trạng thái', 'Status')}</th>
                  <th>{t('Số đơn', 'Orders')}</th>
                  <th>{t('Giá trị đơn', 'Order value')}</th>
                </tr>
              </thead>
              <tbody>
                {paymentStatuses.map((status) => {
                  const matching = orders.filter((order) => order.paymentStatus === status)
                  return (
                    <tr key={status}>
                      <th scope="row">{operationLabel(status, locale)}</th>
                      <td>{count(matching.length)}</td>
                      <td>
                        {money(
                          matching.reduce((total, order) => total + order.total, 0),
                          locale,
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="admin-report-panel">
          <header>
            <h2>{t('Phương thức thanh toán', 'Payment methods')}</h2>
            <p>
              {t(
                'Phân loại theo phương thức ghi nhận trên đơn',
                'By payment method recorded on each order',
              )}
            </p>
          </header>
          <div className="admin-report-table-wrap">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>{t('Phương thức', 'Method')}</th>
                  <th>{t('Số đơn', 'Orders')}</th>
                  <th>{t('Giá trị đơn', 'Order value')}</th>
                </tr>
              </thead>
              <tbody>
                {paymentMethods.map((method) => {
                  const matching = orders.filter((order) => order.paymentMethod === method)
                  return (
                    <tr key={method}>
                      <th scope="row">{operationLabel(method, locale)}</th>
                      <td>{count(matching.length)}</td>
                      <td>
                        {money(
                          matching.reduce((total, order) => total + order.total, 0),
                          locale,
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="admin-report-panel">
          <header>
            <h2>{t('Vận đơn theo trạng thái', 'Shipments by status')}</h2>
            <p>
              {t(
                'Vận đơn tạo trong kỳ, phân theo trạng thái hiện tại',
                'Shipments created in period, grouped by current status',
              )}
            </p>
          </header>
          <div className="admin-report-table-wrap">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>{t('Trạng thái', 'Status')}</th>
                  <th>{t('Vận đơn', 'Shipments')}</th>
                  <th>{t('COD ghi nhận', 'Recorded COD')}</th>
                </tr>
              </thead>
              <tbody>
                {shipmentStatuses.map((status) => {
                  const matching = shipmentsInPeriod.filter(
                    (shipment) => shipment.status === status,
                  )
                  return (
                    <tr key={status}>
                      <th scope="row">{operationLabel(status, locale)}</th>
                      <td>{count(matching.length)}</td>
                      <td>
                        {money(
                          matching.reduce((total, shipment) => total + shipment.codAmount, 0),
                          locale,
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="admin-report-panel">
          <header>
            <h2>{t('Sản phẩm bán chạy', 'Top products')}</h2>
            <p>
              {t('Tổng hợp từ các đơn hợp lệ trong kỳ', 'Based on eligible orders in this period')}
            </p>
          </header>
          <div className="admin-report-table-wrap">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>{t('Sản phẩm', 'Product')}</th>
                  <th>{t('Số lượng', 'Quantity')}</th>
                  <th>{t('Giá trị', 'Value')}</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product) => (
                  <tr key={product.id}>
                    <th scope="row">
                      {product.name}{' '}
                      <small>
                        {product.sku} · {count(product.orders.size)} {t('đơn', 'orders')}
                      </small>
                    </th>
                    <td>{count(product.quantity)}</td>
                    <td>{money(product.value, locale)}</td>
                  </tr>
                ))}
                {!topProducts.length && (
                  <tr>
                    <td colSpan={3}>{t('Chưa có dữ liệu sản phẩm.', 'No product data yet.')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <p className="admin-readonly-note">
        <ShoppingBag size={14} />
        {t(
          'Báo cáo chỉ đọc. Kỳ lọc theo ngày tạo đơn/vận đơn; trạng thái là trạng thái hiện tại. Giá trị không phải doanh thu thuần, chưa trừ chi phí và chưa đối soát tiền thực nhận.',
          'Read-only report. Period filters by order/shipment creation date; statuses are current. Values are not net revenue, do not deduct costs and are not reconciled to received funds.',
        )}
      </p>
    </>
  )
}

export function CustomerCareReport({ inbox, data, overview, now }: AdminReportProps) {
  const { t, locale } = useI18n()
  const count = (value: number) => value.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB')
  const start = new Date(`${overview.period.start}T00:00:00`).getTime()
  const end = now.getTime()
  const nowTime = now.getTime()
  const customers = new Map(inbox.customers.map((customer) => [customer.id, customer.name]))
  const agents = new Map(inbox.agents.map((agent) => [agent.id, agent.name]))
  const teams = new Map(inbox.teams.map((team) => [team.id, team.name]))
  const ticketStatuses = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const
  const ticketCategories = ['delivery', 'return', 'payment', 'product', 'other'] as const
  const activeConversation = (status: string) => status === 'open' || status === 'pending'
  const activeTicket = (status: string) => ['open', 'in_progress', 'waiting'].includes(status)
  const overdue = (dueAt: string) => {
    const time = Date.parse(dueAt)
    return Number.isFinite(time) && time < nowTime
  }
  const conversations = [...inbox.conversations].sort((left, right) =>
    right.lastMessageAt.localeCompare(left.lastMessageAt),
  )
  const tickets = [...data.tickets].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
  const messageActivity = inbox.conversations.flatMap((conversation) =>
    conversation.messages
      .filter((message) => isInPeriod(message.sentAt, start, end))
      .map((message) => ({ conversation, message })),
  )
  const periodMessages = messageActivity.map((item) => item.message)
  const incomingCount = periodMessages.filter((message) => message.type === 'incoming').length
  const outgoingCount = periodMessages.filter((message) => message.type === 'outgoing').length
  const noteCount = periodMessages.filter((message) => message.type === 'note').length
  const activeConversations = conversations.filter((conversation) =>
    activeConversation(conversation.status),
  )
  const openTickets = tickets.filter((ticket) => activeTicket(ticket.status))
  const overdueConversations = activeConversations.filter((conversation) =>
    overdue(conversation.dueAt),
  )
  const overdueTickets = openTickets.filter((ticket) => overdue(ticket.dueAt))
  const createdTicketsInPeriod = tickets.filter((ticket) =>
    isInPeriod(ticket.createdAt, start, end),
  )
  const resolvedTicketsInPeriod = tickets.filter(
    (ticket) => ticket.resolvedAt && isInPeriod(ticket.resolvedAt, start, end),
  )
  const firstResponseRecords = conversations.flatMap((conversation) => {
    const messages = conversation.messages
      .filter((message) => Date.parse(message.sentAt) <= end)
      .sort((left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt))
    const firstIncoming = messages.find(
      (message) => message.type === 'incoming' && isInPeriod(message.sentAt, start, end),
    )
    if (!firstIncoming) return []
    const incomingTime = Date.parse(firstIncoming.sentAt)
    const response = messages.find(
      (message) => message.type === 'outgoing' && Date.parse(message.sentAt) > incomingTime,
    )
    return [
      {
        conversation,
        responseMinutes: response
          ? Math.max(0, (Date.parse(response.sentAt) - incomingTime) / 60000)
          : null,
      },
    ]
  })
  const responseTimes = firstResponseRecords
    .map((record) => record.responseMinutes)
    .filter((value): value is number => value !== null)
  const averageFirstResponse = responseTimes.length
    ? responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length
    : null
  const sortedResponseTimes = [...responseTimes].sort((left, right) => left - right)
  const medianFirstResponse = sortedResponseTimes.length
    ? sortedResponseTimes[Math.floor(sortedResponseTimes.length / 2)]
    : null
  const noFirstResponse = firstResponseRecords.filter(
    (record) => record.responseMinutes === null,
  ).length
  const channelStats = new Map<
    string,
    {
      conversations: number
      open: number
      unread: number
      overdue: number
      incoming: number
      outgoing: number
      notes: number
    }
  >()
  const periodMessagesByConversation = new Map<string, number[]>()
  for (const { conversation, message } of messageActivity) {
    const stats = channelStats.get(conversation.channel) ?? {
      conversations: 0,
      open: 0,
      unread: 0,
      overdue: 0,
      incoming: 0,
      outgoing: 0,
      notes: 0,
    }
    if (message.type === 'incoming') stats.incoming += 1
    else if (message.type === 'outgoing') stats.outgoing += 1
    else stats.notes += 1
    channelStats.set(conversation.channel, stats)
    const times = periodMessagesByConversation.get(conversation.id) ?? [0, 0, 0]
    times[message.type === 'incoming' ? 0 : message.type === 'outgoing' ? 1 : 2] += 1
    periodMessagesByConversation.set(conversation.id, times)
  }
  for (const conversation of conversations) {
    const stats = channelStats.get(conversation.channel) ?? {
      conversations: 0,
      open: 0,
      unread: 0,
      overdue: 0,
      incoming: 0,
      outgoing: 0,
      notes: 0,
    }
    stats.conversations += 1
    if (activeConversation(conversation.status)) {
      stats.open += 1
      if (conversation.unread > 0) stats.unread += 1
      if (overdue(conversation.dueAt)) stats.overdue += 1
    }
    channelStats.set(conversation.channel, stats)
  }
  const categories = ticketCategories.map((category) => {
    const matching = tickets.filter((ticket) => ticket.category === category)
    return {
      category,
      total: matching.length,
      open: matching.filter((ticket) => activeTicket(ticket.status)).length,
      urgent: matching.filter((ticket) => ticket.priority === 'urgent').length,
      overdue: matching.filter((ticket) => activeTicket(ticket.status) && overdue(ticket.dueAt))
        .length,
    }
  })
  const recentMessages = [...messageActivity]
    .sort((left, right) => right.message.sentAt.localeCompare(left.message.sentAt))
    .slice(0, 100)

  return (
    <>
      <section
        className="dashboard-metrics"
        aria-label={t('Chỉ số tin nhắn và chăm sóc', 'Messaging and care metrics')}
      >
        <Metric
          title={t('Hội thoại đang xử lý', 'Active conversations')}
          value={count(activeConversations.length)}
          detail={t(
            `${overview.workload.unreadConversations} hội thoại có tin chưa đọc`,
            `${overview.workload.unreadConversations} conversations with unread messages`,
          )}
          icon={MessageSquare}
          tone="purple"
        />
        <Metric
          title={t('Hội thoại quá hạn', 'Overdue conversations')}
          value={count(overdueConversations.length)}
          detail={t('Theo hạn phản hồi hiện tại', 'Against current response deadlines')}
          icon={Clock3}
          tone="amber"
        />
        <Metric
          title={t('Tin nhắn đến trong kỳ', 'Incoming messages')}
          value={count(incomingCount)}
          detail={t(
            `${overview.channels.length} kênh có tin khách gửi`,
            `${overview.channels.length} channels with customer messages`,
          )}
          icon={MessageSquare}
          tone="blue"
        />
        <Metric
          title={t('Phản hồi gửi trong kỳ', 'Replies sent')}
          value={count(outgoingCount)}
          detail={t(
            `${noteCount} ghi chú nội bộ, không gửi khách`,
            `${noteCount} internal notes, not sent to customers`,
          )}
          icon={Headphones}
          tone="green"
        />
        <Metric
          title={t('Phản hồi đầu tiên trung bình', 'Average first response')}
          value={averageFirstResponse === null ? '—' : formatDuration(averageFirstResponse, t)}
          detail={
            medianFirstResponse === null
              ? t('Chưa đủ dữ liệu phản hồi', 'Not enough response data')
              : t(
                  `${responseTimes.length} hội thoại · trung vị ${formatDuration(medianFirstResponse, t)}`,
                  `${responseTimes.length} conversations · median ${formatDuration(medianFirstResponse, t)}`,
                )
          }
          icon={Clock3}
          tone="purple"
        />
        <Metric
          title={t('Yêu cầu chăm sóc đang mở', 'Open care requests')}
          value={count(openTickets.length)}
          detail={t(`${overdueTickets.length} quá hạn`, `${overdueTickets.length} overdue`)}
          icon={Headphones}
          tone="amber"
        />
        <Metric
          title={t('Yêu cầu mới trong kỳ', 'Requests created')}
          value={count(createdTicketsInPeriod.length)}
          detail={t(
            `${resolvedTicketsInPeriod.length} yêu cầu được giải quyết trong kỳ`,
            `${resolvedTicketsInPeriod.length} resolved in period`,
          )}
          icon={Users}
          tone="blue"
        />
        <Metric
          title={t('Chưa ghi nhận phản hồi đầu tiên', 'No first response recorded')}
          value={count(noFirstResponse)}
          detail={t(
            'Hội thoại có tin khách gửi trong kỳ',
            'Conversations with an incoming message in period',
          )}
          icon={AlertTriangle}
          tone="amber"
        />
      </section>

      <section className="admin-report-panel admin-report-full">
        <header>
          <h2>{t('Hiệu quả theo kênh', 'Channel performance')}</h2>
          <p>
            {t(
              'Tin nhắn theo kỳ; hội thoại mở, chưa đọc và quá hạn theo trạng thái hiện tại.',
              'Messages in period; open, unread and overdue conversations reflect current status.',
            )}
          </p>
        </header>
        <div className="admin-report-table-wrap admin-table-scroll">
          <table className="admin-report-table">
            <thead>
              <tr>
                <th>{t('Kênh', 'Channel')}</th>
                <th>{t('Hội thoại', 'Conversations')}</th>
                <th>{t('Đang mở', 'Open')}</th>
                <th>{t('Chưa đọc', 'Unread')}</th>
                <th>{t('Quá hạn', 'Overdue')}</th>
                <th>{t('Tin đến', 'Incoming')}</th>
                <th>{t('Phản hồi', 'Replies')}</th>
                <th>{t('Ghi chú', 'Notes')}</th>
              </tr>
            </thead>
            <tbody>
              {[...channelStats.entries()]
                .sort((left, right) => right[1].incoming - left[1].incoming)
                .map(([channel, stats]) => (
                  <tr key={channel}>
                    <th scope="row">
                      {t(CHANNELS.find((item) => item.id === channel)?.label ?? channel, channel)}
                    </th>
                    <td>{count(stats.conversations)}</td>
                    <td>{count(stats.open)}</td>
                    <td>{count(stats.unread)}</td>
                    <td>{count(stats.overdue)}</td>
                    <td>{count(stats.incoming)}</td>
                    <td>{count(stats.outgoing)}</td>
                    <td>{count(stats.notes)}</td>
                  </tr>
                ))}
              {!channelStats.size && (
                <tr>
                  <td colSpan={8}>
                    {t('Chưa có hội thoại hoặc tin nhắn.', 'No conversations or messages yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="admin-report-grid">
        <section className="admin-report-panel">
          <header>
            <h2>{t('Yêu cầu theo trạng thái', 'Requests by status')}</h2>
            <p>
              {t(
                'Tồn đọng hiện tại; đã giải quyết trong kỳ được thống kê riêng.',
                'Current backlog; period resolutions are reported separately.',
              )}
            </p>
          </header>
          <div className="admin-report-table-wrap">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>{t('Trạng thái', 'Status')}</th>
                  <th>{t('Số yêu cầu', 'Requests')}</th>
                  <th>{t('Tỷ trọng', 'Share')}</th>
                </tr>
              </thead>
              <tbody>
                {ticketStatuses.map((status) => {
                  const total = tickets.filter((ticket) => ticket.status === status).length
                  const share = tickets.length ? Math.round((total / tickets.length) * 100) : 0
                  return (
                    <tr key={status}>
                      <th scope="row">{operationLabel(status, locale)}</th>
                      <td>{count(total)}</td>
                      <td>{share}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="admin-report-panel">
          <header>
            <h2>{t('Yêu cầu theo nhóm vấn đề', 'Requests by category')}</h2>
            <p>
              {t(
                'Tổng yêu cầu, còn mở, khẩn cấp và quá hạn theo nhóm',
                'Total, open, urgent and overdue by category',
              )}
            </p>
          </header>
          <div className="admin-report-table-wrap">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>{t('Nhóm', 'Category')}</th>
                  <th>{t('Tổng', 'Total')}</th>
                  <th>{t('Đang mở', 'Open')}</th>
                  <th>{t('Khẩn cấp', 'Urgent')}</th>
                  <th>{t('Quá hạn', 'Overdue')}</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((item) => (
                  <tr key={item.category}>
                    <th scope="row">{operationLabel(item.category, locale)}</th>
                    <td>{count(item.total)}</td>
                    <td>{count(item.open)}</td>
                    <td>{count(item.urgent)}</td>
                    <td>{count(item.overdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="admin-report-panel admin-report-full">
        <header>
          <h2>{t('Theo dõi hội thoại', 'Conversation monitoring')}</h2>
          <p>
            {t(
              'Tin nhắn đếm trong kỳ báo cáo; trạng thái phân công và hạn xử lý là hiện tại.',
              'Messages count within the selected period; assignment and due status are current.',
            )}
          </p>
        </header>
        <div className="admin-report-table-wrap admin-table-scroll">
          <table className="admin-report-table">
            <thead>
              <tr>
                <th>{t('Khách hàng', 'Customer')}</th>
                <th>{t('Chủ đề', 'Subject')}</th>
                <th>{t('Kênh', 'Channel')}</th>
                <th>{t('Trạng thái / ưu tiên', 'Status / priority')}</th>
                <th>{t('Phụ trách / nhóm', 'Assignee / team')}</th>
                <th>{t('Chưa đọc', 'Unread')}</th>
                <th>{t('Tin đến / phản hồi / ghi chú', 'Incoming / replies / notes')}</th>
                <th>{t('Tin cuối', 'Last activity')}</th>
                <th>{t('Hạn xử lý', 'Due')}</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((conversation) => {
                const messageCounts = periodMessagesByConversation.get(conversation.id) ?? [0, 0, 0]
                return (
                  <tr key={conversation.id}>
                    <td>{customers.get(conversation.customerId) ?? conversation.customerId}</td>
                    <th scope="row">{conversation.subject}</th>
                    <td>
                      {t(
                        CHANNELS.find((item) => item.id === conversation.channel)?.label ??
                          conversation.channel,
                        conversation.channel,
                      )}
                    </td>
                    <td>
                      {operationLabel(conversation.status, locale)} ·{' '}
                      {operationLabel(conversation.priority, locale)}
                    </td>
                    <td>
                      {agents.get(conversation.assigneeId ?? '') ??
                        t('Chưa phân công', 'Unassigned')}
                      <small>
                        {teams.get(conversation.teamId ?? '') ?? t('Chưa có nhóm', 'No team')}
                      </small>
                    </td>
                    <td>{count(conversation.unread)}</td>
                    <td>{messageCounts.map(count).join(' / ')}</td>
                    <td>{dateTime(conversation.lastMessageAt, locale)}</td>
                    <td
                      className={
                        activeConversation(conversation.status) && overdue(conversation.dueAt)
                          ? 'admin-overdue-cell'
                          : ''
                      }
                    >
                      {dateTime(conversation.dueAt, locale)}
                      {activeConversation(conversation.status) && overdue(conversation.dueAt) && (
                        <small>{t('Quá hạn', 'Overdue')}</small>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!conversations.length && (
                <tr>
                  <td colSpan={9}>{t('Chưa có hội thoại.', 'No conversations yet.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-report-panel admin-report-full">
        <header>
          <h2>{t('Chi tiết yêu cầu chăm sóc', 'Care request details')}</h2>
          <p>
            {t(
              'Hiển thị liên kết, người phụ trách, thời hạn, trao đổi và kết quả xử lý.',
              'Includes linked records, ownership, deadlines, comments and resolution details.',
            )}
          </p>
        </header>
        <div className="admin-report-table-wrap admin-table-scroll">
          <table className="admin-report-table">
            <thead>
              <tr>
                <th>{t('Mã / yêu cầu', 'ID / request')}</th>
                <th>{t('Khách hàng', 'Customer')}</th>
                <th>{t('Nhóm / ưu tiên', 'Category / priority')}</th>
                <th>{t('Trạng thái', 'Status')}</th>
                <th>{t('Phụ trách', 'Assignee')}</th>
                <th>{t('Liên kết đơn / hội thoại', 'Linked order / conversation')}</th>
                <th>{t('Tạo / cập nhật', 'Created / updated')}</th>
                <th>{t('Hạn / trao đổi', 'Due / comments')}</th>
                <th>{t('Mô tả / kết quả', 'Description / resolution')}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <th scope="row">
                    {ticket.number}
                    <small>{ticket.subject}</small>
                  </th>
                  <td>{customers.get(ticket.customerId) ?? ticket.customerId}</td>
                  <td>
                    {operationLabel(ticket.category, locale)} ·{' '}
                    {operationLabel(ticket.priority, locale)}
                  </td>
                  <td>{operationLabel(ticket.status, locale)}</td>
                  <td>
                    {agents.get(ticket.assigneeId ?? '') ?? t('Chưa phân công', 'Unassigned')}
                  </td>
                  <td>
                    {ticket.orderId ?? '—'}
                    <small>{ticket.conversationId ?? '—'}</small>
                  </td>
                  <td>
                    {dateTime(ticket.createdAt, locale)}
                    <small>{dateTime(ticket.updatedAt, locale)}</small>
                  </td>
                  <td
                    className={
                      activeTicket(ticket.status) && overdue(ticket.dueAt)
                        ? 'admin-overdue-cell'
                        : ''
                    }
                  >
                    {dateTime(ticket.dueAt, locale)}
                    <small>
                      {count(ticket.comments.length)} {t('trao đổi', 'comments')}
                    </small>
                  </td>
                  <td className="admin-report-description">
                    {ticket.description || '—'}
                    {ticket.resolution && <small>{ticket.resolution}</small>}
                  </td>
                </tr>
              ))}
              {!tickets.length && (
                <tr>
                  <td colSpan={9}>{t('Chưa có yêu cầu chăm sóc.', 'No care requests yet.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-report-panel admin-report-full">
        <header>
          <h2>{t('Nhật ký tin nhắn trong kỳ', 'Message activity in period')}</h2>
          <p>
            {t(
              `Hiển thị ${recentMessages.length} / ${messageActivity.length} hoạt động mới nhất; không hiển thị nội dung hội thoại.`,
              `Showing the latest ${recentMessages.length} of ${messageActivity.length} events; message content is omitted.`,
            )}
          </p>
        </header>
        <div className="admin-report-table-wrap admin-table-scroll">
          <table className="admin-report-table">
            <thead>
              <tr>
                <th>{t('Thời gian', 'Time')}</th>
                <th>{t('Loại', 'Type')}</th>
                <th>{t('Khách hàng', 'Customer')}</th>
                <th>{t('Hội thoại', 'Conversation')}</th>
                <th>{t('Kênh', 'Channel')}</th>
                <th>{t('Trạng thái gửi', 'Delivery')}</th>
              </tr>
            </thead>
            <tbody>
              {recentMessages.map(({ conversation, message }) => (
                <tr key={`${conversation.id}-${message.id}`}>
                  <td>{dateTime(message.sentAt, locale)}</td>
                  <td>
                    {message.type === 'incoming'
                      ? t('Khách gửi', 'Customer message')
                      : message.type === 'outgoing'
                        ? t('Nhân viên trả lời', 'Agent reply')
                        : t('Ghi chú nội bộ', 'Internal note')}
                  </td>
                  <td>{customers.get(conversation.customerId) ?? conversation.customerId}</td>
                  <th scope="row">{conversation.subject}</th>
                  <td>
                    {t(
                      CHANNELS.find((item) => item.id === conversation.channel)?.label ??
                        conversation.channel,
                      conversation.channel,
                    )}
                  </td>
                  <td>
                    {message.type === 'note' ? '—' : operationLabel(message.delivery, locale)}
                  </td>
                </tr>
              ))}
              {!recentMessages.length && (
                <tr>
                  <td colSpan={6}>
                    {t(
                      'Chưa có hoạt động tin nhắn trong kỳ.',
                      'No message activity in this period.',
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="admin-readonly-note">
        <ShieldCheck size={14} />
        {t(
          'Số tin nhắn và thời gian phản hồi tính theo lịch sử tin hiện có. Phản hồi đầu tiên là tin outbound đầu tiên sau tin inbound đầu tiên trong kỳ; ghi chú nội bộ không được tính là phản hồi. Trạng thái và hạn ticket là ảnh chụp hiện tại.',
          'Message counts and response times use the available message history. First response is the first outbound message after the first inbound message in the period; internal notes are excluded. Ticket status and due dates are current snapshots.',
        )}
      </p>
    </>
  )
}

export function WorkReport({ inbox, data, overview, now }: AdminReportProps) {
  const { t, locale } = useI18n()
  const count = (value: number) => value.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB')
  const start = new Date(`${overview.period.start}T00:00:00`).getTime()
  const end = now.getTime()
  const activeConversation = (status: string) => status === 'open' || status === 'pending'
  const activeTicket = (status: string) => ['open', 'in_progress', 'waiting'].includes(status)
  const overdue = (dueAt: string) => {
    const time = Date.parse(dueAt)
    return Number.isFinite(time) && time < end
  }
  const staff = new Map(
    inbox.agents.map((agent) => [
      agent.id,
      {
        id: agent.id,
        name: agent.name,
        conversations: 0,
        unread: 0,
        overdueConversations: 0,
        urgentConversations: 0,
        tickets: 0,
        overdueTickets: 0,
        urgentTickets: 0,
      },
    ]),
  )
  const addStaff = (id: string | null) => {
    const key = id ?? 'unassigned'
    const row = staff.get(key) ?? {
      id: key,
      name: '',
      conversations: 0,
      unread: 0,
      overdueConversations: 0,
      urgentConversations: 0,
      tickets: 0,
      overdueTickets: 0,
      urgentTickets: 0,
    }
    staff.set(key, row)
    return row
  }
  const conversations = inbox.conversations.filter((conversation) =>
    activeConversation(conversation.status),
  )
  const tickets = data.tickets.filter((ticket) => activeTicket(ticket.status))
  for (const conversation of conversations) {
    const row = addStaff(conversation.assigneeId)
    row.conversations += 1
    if (conversation.unread > 0) row.unread += 1
    if (overdue(conversation.dueAt)) row.overdueConversations += 1
    if (conversation.priority === 'urgent') row.urgentConversations += 1
  }
  for (const ticket of tickets) {
    const row = addStaff(ticket.assigneeId)
    row.tickets += 1
    if (overdue(ticket.dueAt)) row.overdueTickets += 1
    if (ticket.priority === 'urgent') row.urgentTickets += 1
  }
  const workload = [...staff.values()]
    .map((row) => ({ ...row, total: row.conversations + row.tickets }))
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name))
  const assignedStaff = workload.filter((row) => row.id !== 'unassigned' && row.total > 0)
  const activeWorkCount = conversations.length + tickets.length
  const unassigned = workload.find((row) => row.id === 'unassigned')
  const overdueConversationCount = conversations.filter((conversation) =>
    overdue(conversation.dueAt),
  ).length
  const overdueTicketCount = tickets.filter((ticket) => overdue(ticket.dueAt)).length
  const ordersInProgress = data.orders.filter((order) =>
    ['draft', 'confirmed', 'packing'].includes(order.status),
  )
  const shipmentExceptions = data.shipments.filter((shipment) => shipment.status === 'exception')
  const eventsInPeriod = [...data.auditEvents]
    .filter((event) => isInPeriod(event.createdAt, start, end))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const activity = eventsInPeriod.slice(0, 100)
  const activityByActor = new Map<string, number>()
  for (const event of eventsInPeriod)
    activityByActor.set(event.actorId, (activityByActor.get(event.actorId) ?? 0) + 1)
  const teamStats = new Map(
    inbox.teams.map((team) => [
      team.id,
      { id: team.id, name: team.name, open: 0, unread: 0, overdue: 0 },
    ]),
  )
  for (const conversation of conversations) {
    const key = conversation.teamId ?? 'unassigned'
    const row = teamStats.get(key) ?? {
      id: key,
      name: t('Chưa xếp nhóm', 'No team'),
      open: 0,
      unread: 0,
      overdue: 0,
    }
    row.open += 1
    if (conversation.unread > 0) row.unread += 1
    if (overdue(conversation.dueAt)) row.overdue += 1
    teamStats.set(key, row)
  }
  const statusGroups = [
    {
      label: t('Hội thoại', 'Conversations'),
      statuses: ['open', 'pending', 'resolved', 'closed'],
      values: inbox.conversations.map((conversation) => conversation.status),
    },
    {
      label: t('Yêu cầu chăm sóc', 'Care requests'),
      statuses: ['open', 'in_progress', 'waiting', 'resolved', 'closed'],
      values: data.tickets.map((ticket) => ticket.status),
    },
    {
      label: t('Đơn hàng', 'Orders'),
      statuses: orderStatuses,
      values: data.orders.map((order) => order.status),
    },
    {
      label: t('Vận đơn', 'Shipments'),
      statuses: ['ready', 'in_transit', 'delivered', 'exception', 'returned', 'cancelled'],
      values: data.shipments.map((shipment) => shipment.status),
    },
  ]

  return (
    <>
      <section
        className="dashboard-metrics"
        aria-label={t('Tổng quan khối lượng công việc', 'Workload overview')}
      >
        <Metric
          title={t('Hội thoại đang xử lý', 'Active conversations')}
          value={count(conversations.length)}
          detail={t(
            `${conversations.filter((conversation) => conversation.unread > 0).length} có tin chưa đọc`,
            `${conversations.filter((conversation) => conversation.unread > 0).length} with unread messages`,
          )}
          icon={MessageSquare}
          tone="purple"
        />
        <Metric
          title={t('Yêu cầu chăm sóc đang mở', 'Open care requests')}
          value={count(tickets.length)}
          detail={t(`${overdueTicketCount} quá hạn`, `${overdueTicketCount} overdue`)}
          icon={Headphones}
          tone="amber"
        />
        <Metric
          title={t('Đầu việc chưa phân công', 'Unassigned work')}
          value={count((unassigned?.conversations ?? 0) + (unassigned?.tickets ?? 0))}
          detail={t('Hội thoại + yêu cầu chăm sóc đang mở', 'Open conversations + care requests')}
          icon={ShoppingBag}
          tone="blue"
        />
        <Metric
          title={t('Đầu việc quá hạn', 'Overdue work')}
          value={count(overdueConversationCount + overdueTicketCount)}
          detail={t(
            `${overdueConversationCount} hội thoại · ${overdueTicketCount} yêu cầu`,
            `${overdueConversationCount} conversations · ${overdueTicketCount} requests`,
          )}
          icon={Clock3}
          tone="amber"
        />
        <Metric
          title={t('Đơn cần xử lý', 'Orders to process')}
          value={count(ordersInProgress.length)}
          detail={t('Nháp, xác nhận hoặc đóng gói', 'Draft, confirmed or packing')}
          icon={ShoppingBag}
          tone="blue"
        />
        <Metric
          title={t('Sự cố giao hàng', 'Delivery exceptions')}
          value={count(shipmentExceptions.length)}
          detail={t('Trạng thái vận đơn hiện tại', 'Current shipment snapshot')}
          icon={AlertTriangle}
          tone="amber"
        />
        <Metric
          title={t('Nhân viên có đầu việc', 'Staff with active work')}
          value={count(assignedStaff.length)}
          detail={t(
            `${activeWorkCount} hội thoại / yêu cầu đang mở`,
            `${activeWorkCount} active conversations / requests`,
          )}
          icon={Users}
          tone="green"
        />
        <Metric
          title={t('Hoạt động ghi nhận trong kỳ', 'Recorded activity in period')}
          value={count(eventsInPeriod.length)}
          detail={t(
            `${count(activity.length)} dòng mới nhất được hiển thị`,
            `${count(activity.length)} latest entries shown`,
          )}
          icon={Clock3}
          tone="green"
        />
      </section>
      <section className="admin-report-panel admin-report-full">
        <header>
          <h2>{t('Tải công việc theo nhân viên', 'Staff workload')}</h2>
          <p>
            {t(
              'Ảnh chụp hiện tại: hội thoại và yêu cầu chăm sóc đang mở, theo người phụ trách hiện tại.',
              'Current snapshot of open conversations and care requests by current assignee.',
            )}
          </p>
        </header>
        <div className="admin-report-table-wrap">
          <table className="admin-report-table">
            <thead>
              <tr>
                <th>{t('Nhân viên', 'Teammate')}</th>
                <th>{t('Hội thoại', 'Conversations')}</th>
                <th>{t('Chưa đọc', 'Unread')}</th>
                <th>{t('Hội thoại quá hạn', 'Overdue conversations')}</th>
                <th>{t('Yêu cầu mở', 'Open requests')}</th>
                <th>{t('Yêu cầu quá hạn', 'Overdue requests')}</th>
                <th>{t('Khẩn cấp', 'Urgent')}</th>
                <th>{t('Tổng đầu việc', 'Total workload')}</th>
                <th>{t('Tỷ trọng tải', 'Load share')}</th>
              </tr>
            </thead>
            <tbody>
              {workload.map((agent) => (
                <tr key={agent.id}>
                  <th scope="row">
                    {agent.id === 'unassigned' ? t('Chưa phân công', 'Unassigned') : agent.name}
                  </th>
                  <td>{count(agent.conversations)}</td>
                  <td>{count(agent.unread)}</td>
                  <td>{count(agent.overdueConversations)}</td>
                  <td>{count(agent.tickets)}</td>
                  <td>{count(agent.overdueTickets)}</td>
                  <td>{count(agent.urgentConversations + agent.urgentTickets)}</td>
                  <td>{count(agent.total)}</td>
                  <td>
                    {activeWorkCount
                      ? `${Math.round((agent.total / activeWorkCount) * 100)}%`
                      : '0%'}
                  </td>
                </tr>
              ))}
              {!workload.length && (
                <tr>
                  <td colSpan={9}>{t('Chưa có dữ liệu phân công.', 'No assignment data yet.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="admin-report-grid">
        <section className="admin-report-panel">
          <header>
            <h2>{t('Tải hội thoại theo nhóm', 'Conversation workload by team')}</h2>
            <p>
              {t(
                'Chỉ tính hội thoại đang mở hoặc chờ xử lý; ticket chưa có trường nhóm.',
                'Open and pending conversations only; care requests do not have a team field.',
              )}
            </p>
          </header>
          <div className="admin-report-table-wrap">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>{t('Nhóm', 'Team')}</th>
                  <th>{t('Hội thoại', 'Conversations')}</th>
                  <th>{t('Chưa đọc', 'Unread')}</th>
                  <th>{t('Quá hạn', 'Overdue')}</th>
                </tr>
              </thead>
              <tbody>
                {[...teamStats.values()]
                  .sort((left, right) => right.open - left.open)
                  .map((team) => (
                    <tr key={team.id}>
                      <th scope="row">{team.name}</th>
                      <td>{count(team.open)}</td>
                      <td>{count(team.unread)}</td>
                      <td>{count(team.overdue)}</td>
                    </tr>
                  ))}
                {!teamStats.size && (
                  <tr>
                    <td colSpan={4}>
                      {t(
                        'Chưa có nhóm hoặc hội thoại đang mở.',
                        'No teams or active conversations.',
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="admin-report-panel">
          <header>
            <h2>{t('Hoạt động theo nhân viên', 'Activity by staff')}</h2>
            <p>
              {t(
                'Số bản ghi nhật ký nghiệp vụ trong kỳ; không phải số giờ làm hay số phiên đăng nhập.',
                'Operational audit records in period; not hours worked or login sessions.',
              )}
            </p>
          </header>
          <div className="admin-report-table-wrap">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>{t('Người thực hiện', 'Actor')}</th>
                  <th>{t('Bản ghi', 'Records')}</th>
                </tr>
              </thead>
              <tbody>
                {[...activityByActor.entries()]
                  .sort((left, right) => right[1] - left[1])
                  .map(([actorId, total]) => (
                    <tr key={actorId}>
                      <th scope="row">
                        {inbox.agents.find((agent) => agent.id === actorId)?.name ?? actorId}
                      </th>
                      <td>{count(total)}</td>
                    </tr>
                  ))}
                {!activityByActor.size && (
                  <tr>
                    <td colSpan={2}>
                      {t(
                        'Chưa có nhật ký nghiệp vụ trong kỳ.',
                        'No operational audit records in period.',
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="admin-report-panel admin-report-full">
        <header>
          <h2>{t('Khối lượng theo phân hệ và trạng thái', 'Work by module and status')}</h2>
          <p>
            {t(
              'Trạng thái hiện tại của toàn bộ dữ liệu, không chỉ các phát sinh trong kỳ.',
              'Current status of all records, not only those created in the period.',
            )}
          </p>
        </header>
        <div className="admin-report-table-wrap admin-table-scroll">
          <table className="admin-report-table">
            <thead>
              <tr>
                <th>{t('Phân hệ', 'Module')}</th>
                <th>{t('Trạng thái', 'Status')}</th>
                <th>{t('Số lượng', 'Count')}</th>
                <th>{t('Tỷ trọng phân hệ', 'Share of module')}</th>
              </tr>
            </thead>
            <tbody>
              {statusGroups.flatMap((group) =>
                group.statuses.map((status) => {
                  const total = group.values.filter((value) => value === status).length
                  const share = group.values.length
                    ? Math.round((total / group.values.length) * 100)
                    : 0
                  return (
                    <tr key={`${group.label}-${status}`}>
                      <th scope="row">{group.label}</th>
                      <td>{operationLabel(status, locale)}</td>
                      <td>{count(total)}</td>
                      <td>{share}%</td>
                    </tr>
                  )
                }),
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="admin-report-panel admin-report-full">
        <header>
          <h2>{t('Nhật ký nghiệp vụ', 'Operational activity')}</h2>
          <p>
            {t(
              `Hiển thị ${count(activity.length)} / ${count(eventsInPeriod.length)} bản ghi mới nhất trong kỳ`,
              `Showing ${count(activity.length)} latest of ${count(eventsInPeriod.length)} records in period`,
            )}
          </p>
        </header>
        <div className="admin-report-table-wrap admin-table-scroll">
          <table className="admin-report-table">
            <thead>
              <tr>
                <th>{t('Thời gian', 'Time')}</th>
                <th>{t('Đối tượng / hành động', 'Entity / action')}</th>
                <th>{t('Mô tả', 'Description')}</th>
                <th>{t('Người thực hiện', 'Performed by')}</th>
                <th>{t('Mã bản ghi', 'Record ID')}</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((event) => (
                <tr key={event.id}>
                  <td>{dateTime(event.createdAt, locale)}</td>
                  <td>
                    {operationLabel(event.entity, locale)}
                    <small>{event.action}</small>
                  </td>
                  <td>{event.description}</td>
                  <td>
                    {inbox.agents.find((agent) => agent.id === event.actorId)?.name ??
                      event.actorId}
                  </td>
                  <td>{event.entityId}</td>
                </tr>
              ))}
              {!activity.length && (
                <tr>
                  <td colSpan={5}>
                    {t('Chưa có nhật ký trong kỳ.', 'No activity in this period.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="admin-readonly-note">
        <ShieldCheck size={14} />
        {t(
          'Tải nhân viên chỉ gồm hội thoại và yêu cầu chăm sóc đang mở theo người được giao hiện tại. Nhật ký là audit nghiệp vụ được lưu trong hệ thống; không đại diện giờ công, KPI doanh số, đăng nhập hoặc toàn bộ hoạt động nhân sự.',
          'Staff workload only counts currently assigned open conversations and care requests. The audit log is the operational history stored in this system; it is not work hours, sales KPIs, sign-ins or a complete HR activity record.',
        )}
      </p>
    </>
  )
}

function Metric({
  title,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  title: string
  value: string
  detail: string
  icon: LucideIcon
  tone: 'purple' | 'blue' | 'green' | 'amber'
}) {
  return (
    <article className="dashboard-metric">
      <div className="dashboard-metric-heading">
        <span>{title}</span>
        <span className={`dashboard-icon dashboard-tone-${tone}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong className="dashboard-metric-value">{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
