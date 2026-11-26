import { describe, expect, it } from 'vitest'
import { createDemoData } from '../data/demo'
import { channelDemoConversation } from '../data/channelDemo'
import { createOperationsDemoData } from '../modules/operations/data'
import { analyzePurchaseDemo, validatePurchaseAnalysis } from './purchase'
import type { Conversation } from '../types/inbox'

const products = createOperationsDemoData(createDemoData()).products
const conversation = (...texts: string[]): Conversation => ({
  ...channelDemoConversation('shopee', '2026-11-17T03:00:00Z'),
  messages: texts.map((text, index) => ({
    id: `m-${index}`,
    type: 'incoming',
    text,
    sentAt: '2026-11-17T03:00:00Z',
    delivery: 'delivered',
  })),
})

describe('Purchase intent and order suggestions', () => {
  it('finds multiple products, quantities and explicit delivery information in Vietnamese', () => {
    const chat = channelDemoConversation('shopee', '2026-11-17T03:00:00Z')
    const result = analyzePurchaseDemo(chat, products)
    expect(result.intent).toBe('purchase')
    expect(result.items).toMatchObject([
      { productId: 'prod-mug', quantity: 2, confidence: 'high' },
      { productId: 'prod-candle', quantity: 1, confidence: 'high' },
    ])
    expect(result.phone?.value).toBe('0912345678')
    expect(result.shippingAddress?.value).toBe('12 Cầu Giấy, Hà Nội')
    expect(() => validatePurchaseAnalysis(result, chat, products)).not.toThrow()
  })
  it('recognizes accent-free names and exact SKUs without assigning nearby products', () => {
    const result = analyzePurchaseDemo(
      conversation('Chot 3 coc gom mau kem va 2 DEC-CAN-05'),
      products,
    )
    expect(result.items.map(({ productId, quantity }) => ({ productId, quantity }))).toEqual([
      { productId: 'prod-mug', quantity: 3 },
      { productId: 'prod-candle', quantity: 2 },
    ])
    expect(
      analyzePurchaseDemo(
        conversation('Mình muốn mua một sản phẩm chưa có trong danh mục'),
        products,
      ).items,
    ).toEqual([])
  })
  it('does not infer a quantity from inquiry text or unrelated numbers', () => {
    const result = analyzePurchaseDemo(
      conversation('Cốc gốm màu kem còn hàng không? Giao trước 16h nhé.'),
      products,
    )
    expect(result.intent).toBe('inquiry')
    expect(result.items).toMatchObject([
      { productId: 'prod-mug', quantity: null, confidence: 'medium' },
    ])
  })
  it('does not treat order tracking, staff messages or internal notes as a new purchase', () => {
    const chat = createDemoData().conversations[0]
    expect(analyzePurchaseDemo(chat, products)).toMatchObject({ intent: 'support', items: [] })
    const empty = conversation('Chào shop')
    empty.messages.push({
      ...empty.messages[0],
      id: 'staff',
      type: 'outgoing',
      text: 'Chốt 3 cốc gốm màu kem nhé',
    })
    empty.messages.push({
      ...empty.messages[0],
      id: 'note',
      type: 'note',
      text: 'Khách muốn 5 nến thơm Santal',
    })
    expect(analyzePurchaseDemo(empty, products).items).toEqual([])
  })
  it('honors later refusal and product replacement, and leaves ambiguous quantity changes unset', () => {
    const original = 'Chốt 2 cốc gốm màu kem'
    expect(
      analyzePurchaseDemo(conversation(original, 'Mình không mua nữa'), products),
    ).toMatchObject({ intent: 'none', items: [] })
    expect(
      analyzePurchaseDemo(conversation(original, 'Chỉ lấy 1 nến thơm Santal'), products).items,
    ).toMatchObject([{ productId: 'prod-candle', quantity: 1 }])
    expect(
      analyzePurchaseDemo(conversation(original, 'Đổi thành 3 cái nhé'), products).items[0]
        .quantity,
    ).toBeNull()
  })
  it('rejects invented products, quantities, contact fields, staff evidence and stale analysis', () => {
    const chat = conversation('Chốt 2 cốc gốm màu kem')
    const analysis = analyzePurchaseDemo(chat, products)
    const invalid = [
      { ...analysis, items: [{ ...analysis.items[0], productId: 'invented' }] },
      { ...analysis, items: [{ ...analysis.items[0], quantity: 0 }] },
      { ...analysis, items: [{ ...analysis.items[0], quote: 'Invented evidence' }] },
      { ...analysis, phone: { value: '0900000000', messageId: chat.messages[0].id } },
      { ...analysis, revision: 'old' },
    ]
    for (const result of invalid)
      expect(() => validatePurchaseAnalysis(result, chat, products)).toThrow()
    chat.messages[0].type = 'outgoing'
    expect(() => validatePurchaseAnalysis(analysis, chat, products)).toThrow()
  })
})
