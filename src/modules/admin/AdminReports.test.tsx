// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nContext } from '../../i18n/context'
import type { InboxData } from '../../types/inbox'
import type { OperationsData, Order, Ticket } from '../operations/types'
import { buildDashboard } from '../dashboard/metrics'
import { CustomerCareReport, SalesReport, WorkReport } from './AdminReports'

const now = new Date('2026-11-18T12:00:00.000Z')
const at = (hour: number) => `2026-11-18T${String(hour).padStart(2, '0')}:00:00.000Z`

const inboxFixture = (): InboxData => ({
  customers: [
    {
      id: 'customer-a',
      name: 'Customer A',
      phone: '',
      email: '',
      company: '',
      membership: 'Standard',
      location: '',
      avatarColor: '#eee',
    },
  ],
  agents: [{ id: 'agent-a', name: 'Agent A', initials: 'AA', color: '#eee' }],
  teams: [{ id: 'team-a', name: 'Support' }],
  conversations: [
    {
      id: 'conversation-a',
      customerId: 'customer-a',
      channel: 'shopee',
      status: 'open',
      priority: 'urgent',
      assigneeId: 'agent-a',
      teamId: 'team-a',
      subject: 'Order status',
      unread: 1,
      lastMessageAt: at(8),
      dueAt: at(9),
      sourceUrl: null,
      tags: [],
      mentioned: false,
      bot: false,
      messages: [
        { id: 'incoming-a', type: 'incoming', text: 'Hello', sentAt: at(8), delivery: 'delivered' },
        {
          id: 'reply-a',
          type: 'outgoing',
          text: 'We can help',
          sentAt: at(8).replace(':00:00', ':15:00'),
          delivery: 'sent',
        },
        {
          id: 'note-a',
          type: 'note',
          text: 'Internal note',
          sentAt: at(8).replace(':00:00', ':20:00'),
          delivery: 'read',
        },
      ],
    },
  ],
})

const orderFixture = (patch: Partial<Order> = {}): Order => ({
  id: 'order-a',
  number: 'SS-1001',
  customerId: 'customer-a',
  items: [
    { productId: 'product-a', sku: 'SKU-A', name: 'Product A', quantity: 2, unitPrice: 50000 },
  ],
  status: 'confirmed',
  paymentStatus: 'paid',
  paymentMethod: 'cod',
  subtotal: 100000,
  discount: 0,
  shippingFee: 0,
  total: 100000,
  shippingAddress: 'Address',
  recipientName: 'Customer A',
  recipientPhone: '0900000000',
  note: '',
  createdAt: at(7),
  updatedAt: at(8),
  ...patch,
})

const ticketFixture = (patch: Partial<Ticket> = {}): Ticket => ({
  id: 'ticket-a',
  number: 'CS-1001',
  customerId: 'customer-a',
  orderId: 'order-a',
  conversationId: 'conversation-a',
  subject: 'Late order',
  description: 'Please check the delivery',
  category: 'delivery',
  status: 'open',
  priority: 'high',
  assigneeId: null,
  dueAt: at(9),
  resolution: '',
  comments: [],
  createdAt: at(7),
  updatedAt: at(8),
  resolvedAt: null,
  ...patch,
})

const operationsFixture = (
  orders: Order[] = [orderFixture()],
  tickets: Ticket[] = [ticketFixture()],
): OperationsData => ({
  schemaVersion: 1,
  customerProfiles: [],
  products: [],
  orders,
  shipments: [],
  tickets,
  auditEvents: [
    {
      id: 'audit-a',
      entity: 'ticket',
      entityId: 'ticket-a',
      action: 'ticket.created',
      description: 'Created care request',
      createdAt: at(8),
      actorId: 'agent-a',
    },
  ],
})

function renderReport(report: 'sales' | 'care' | 'work') {
  const inbox = inboxFixture()
  const data = operationsFixture()
  const overview = buildDashboard(inbox, data, 7, now)
  const props = { inbox, data, overview, now }
  return render(
    <I18nContext.Provider
      value={{
        locale: 'en',
        setLocale: vi.fn(),
        t: (_vi, en) => en,
        label: (name) => name,
      }}
    >
      {report === 'sales' ? (
        <SalesReport {...props} />
      ) : report === 'care' ? (
        <CustomerCareReport {...props} />
      ) : (
        <WorkReport {...props} />
      )}
    </I18nContext.Provider>,
  )
}

afterEach(cleanup)

describe('admin detail reports', () => {
  it('shows order-level amounts, full product detail and daily trend', () => {
    renderReport('sales')

    expect(screen.getByRole('heading', { name: 'Daily order trend' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Payment methods' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Discount' })).toBeInTheDocument()
    expect(screen.getByText('SKU-A')).toBeInTheDocument()
    expect(screen.getByText('Previous period')).toBeInTheDocument()
  })

  it('counts replies separately from notes and derives first response time', () => {
    renderReport('care')

    const responseMetric = screen.getByText('Average first response').closest('article')
    expect(responseMetric).toHaveTextContent('15 min')
    expect(screen.getByRole('heading', { name: 'Message activity in period' })).toBeInTheDocument()
    expect(screen.getByText('Internal note')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Requests by category' })).toBeInTheDocument()
  })

  it('breaks down assigned, unassigned and overdue work by staff and workflow', () => {
    renderReport('work')

    const workload = screen.getByRole('heading', { name: 'Staff workload' }).closest('section')
    expect(within(workload!).getByRole('row', { name: /Agent A/ })).toHaveTextContent('50%')
    expect(within(workload!).getByRole('row', { name: /Unassigned/ })).toHaveTextContent('50%')
    expect(screen.getByRole('heading', { name: 'Work by module and status' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Operational activity' })).toBeInTheDocument()
  })
})
