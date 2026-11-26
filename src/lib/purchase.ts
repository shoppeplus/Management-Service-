import type { Conversation } from '../types/inbox'
import type { Product } from '../modules/operations/types'
import type {
  ExtractedContactField,
  PurchaseAnalysis,
  PurchaseItemSuggestion,
} from '../types/purchase'

export const normalizeVietnamese = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
export const conversationRevision = (conversation: Conversation) =>
  JSON.stringify([
    conversation.id,
    conversation.messages.map(({ id, type, text, sentAt }) => [id, type, text, sentAt]),
  ])
const boundary = (text: string) =>
  new RegExp(`(?:^|[^a-z0-9])${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`)
const units = 'cai|chiec|bo|coc|ly|nen|khay|dia|set|pcs|pieces?'
const numbers: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  nam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
  muoi: 10,
}
const amount = '\\d{1,4}|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi'
const quantityFor = (text: string, index: number, length: number): number | null => {
  const before = text.slice(Math.max(0, index - 35), index)
  const after = text.slice(index + length, index + length + 35)
  const found =
    new RegExp(`(?:^|\\b)(${amount})\\s*(?:(?:${units})\\s*)?$`).exec(before)?.[1] ??
    new RegExp(`^\\s*(?:x|so luong|sl|:)\\s*(${amount})(?:\\b|$)`).exec(after)?.[1]
  const value = found ? (numbers[found] ?? Number(found)) : NaN
  return Number.isInteger(value) && value >= 1 && value <= 999 ? value : null
}
const purchaseWords = /\b(chot|dat mua|muon mua|can mua|lay them|dat them|lay|mua|order|buy)\b/
const supportWords =
  /\b(doi tra|tra hang|hoan tien|bao hanh|da dat|da mua|(?:dat|mua) .*hom qua|ma don|don #|giao chua|khi nao .*hang|refund|return|tracking)\b/
const refusal =
  /\b(khong (?:mua|lay|can|dat)|chua (?:mua|lay|dat)|thoi (?:khong|bo)|huy (?:don|dat)|dung (?:dat|len don)|cancel|do not buy)\b/

export function analyzePurchaseDemo(
  conversation: Conversation,
  products: Product[],
): PurchaseAnalysis {
  const incoming = conversation.messages.filter(
    (message) => message.type === 'incoming' && message.text.trim(),
  )
  const suggestions = new Map<string, PurchaseItemSuggestion>()
  let intent: PurchaseAnalysis['intent'] = 'none'
  let phone: ExtractedContactField | null = null
  let shippingAddress: ExtractedContactField | null = null
  for (const message of incoming) {
    const text = normalizeVietnamese(message.text)
    const phoneValue = /(?:sđt|sdt|điện thoại|dien thoai|phone)\s*[:：]?\s*(\+?\d[\d .()-]{7,23})/i
      .exec(message.text)?.[1]
      ?.trim()
      .replace(/[.,;:]+$/, '')
    const addressValue = /(?:địa chỉ|dia chi|address)\s*[:：]\s*([^\n;]+?)(?:\.(?:\s|$)|$)/i
      .exec(message.text)?.[1]
      ?.trim()
    if (phoneValue) phone = { value: phoneValue, messageId: message.id }
    if (addressValue) shippingAddress = { value: addressValue, messageId: message.id }
    if (refusal.test(text)) {
      suggestions.clear()
      intent = 'none'
      continue
    }
    if (supportWords.test(text)) {
      suggestions.clear()
      intent = 'support'
      continue
    }
    const matched: PurchaseItemSuggestion[] = []
    for (const product of products) {
      const fullName = normalizeVietnamese(product.name)
      // Accept full names, SKUs and distinctive names without the optional "Bộ" prefix.
      const aliases = [
        ...new Set([normalizeVietnamese(product.sku), fullName, fullName.replace(/^bo /, '')]),
      ]
      const match = aliases.map((alias) => boundary(alias).exec(text)).find(Boolean)
      if (!match) continue
      const matchedText = match[0].trim()
      const start = match.index + match[0].indexOf(matchedText)
      matched.push({
        productId: product.id,
        quantity: quantityFor(text, start, matchedText.length),
        confidence: purchaseWords.test(text) ? 'high' : 'medium',
        messageId: message.id,
        quote: message.text,
      })
    }
    if (matched.length) {
      const buying = purchaseWords.test(text)
      if (/\b(doi sang|thay bang|chi lay|chi mua|instead|only)\b/.test(text)) suggestions.clear()
      if (buying && intent !== 'purchase') suggestions.clear()
      if (buying || intent !== 'purchase') intent = buying ? 'purchase' : 'inquiry'
      for (const item of matched) {
        if (buying || !suggestions.has(item.productId)) suggestions.set(item.productId, item)
      }
    } else if (
      suggestions.size &&
      /\b(so luong|sl|doi thanh|thay doi|\d+ (?:cai|chiec|bo|coc|ly))\b/.test(text)
    ) {
      // A quantity correction without a named product is ambiguous in multi-item chats.
      for (const [key, suggestion] of suggestions)
        suggestions.set(key, { ...suggestion, quantity: null, confidence: 'medium' })
    }
  }
  return {
    conversationId: conversation.id,
    revision: conversationRevision(conversation),
    source: 'demo-rules',
    intent,
    summary:
      intent === 'purchase'
        ? 'Khách có lời đề nghị mua hàng; kiểm tra sản phẩm và thông tin giao hàng.'
        : intent === 'inquiry'
          ? 'Khách đang tìm hiểu sản phẩm, cần xác nhận trước khi lên đơn.'
          : intent === 'support'
            ? 'Khách đang cần hỗ trợ đơn đã mua. Chưa xác định nhu cầu mua mới.'
            : 'Chưa tìm thấy nhu cầu mua sản phẩm cụ thể trong tin nhắn của khách.',
    items: [...suggestions.values()],
    phone,
    shippingAddress,
  }
}

export function validatePurchaseAnalysis(
  value: unknown,
  conversation: Conversation,
  products: Product[],
): asserts value is PurchaseAnalysis {
  const invalid = () => {
    throw new Error(
      'Kết quả phân tích không hợp lệ hoặc đã cũ. / Invalid or stale purchase analysis.',
    )
  }
  if (!value || typeof value !== 'object') invalid()
  const result = value as PurchaseAnalysis
  if (
    result.conversationId !== conversation.id ||
    result.revision !== conversationRevision(conversation) ||
    !['demo-rules', 'model'].includes(result.source) ||
    !['purchase', 'inquiry', 'support', 'none'].includes(result.intent) ||
    typeof result.summary !== 'string' ||
    result.summary.length > 2000 ||
    !Array.isArray(result.items) ||
    result.items.length > 50 ||
    new Set(result.items.map((item) => item?.productId)).size !== result.items.length
  )
    invalid()
  for (const item of result.items) {
    if (
      !item ||
      !products.some((product) => product.id === item.productId) ||
      !(
        item.quantity === null ||
        (Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 999)
      ) ||
      !['high', 'medium'].includes(item.confidence) ||
      typeof item.quote !== 'string' ||
      !item.quote.trim() ||
      !conversation.messages.some(
        (message) =>
          message.id === item.messageId &&
          message.type === 'incoming' &&
          message.text.includes(item.quote),
      )
    )
      invalid()
  }
  for (const field of [result.phone, result.shippingAddress]) {
    if (
      field !== null &&
      (!field ||
        typeof field.value !== 'string' ||
        !field.value.trim() ||
        field.value.length > 500 ||
        !conversation.messages.some(
          (message) =>
            message.id === field.messageId &&
            message.type === 'incoming' &&
            message.text.includes(field.value),
        ))
    )
      invalid()
  }
  if (
    result.phone &&
    (!/^\+?[\d\s().-]{8,24}$/.test(result.phone.value) ||
      result.phone.value.replace(/\D/g, '').length < 8)
  )
    invalid()
  if (result.shippingAddress && result.shippingAddress.value.length < 10) invalid()
}
