import type { Product } from '../modules/operations/types'

export interface QuotationParty {
  name: string
  phone: string
  email: string
  address: string
}
export interface QuotationProduct extends Product {
  specifications?: { label: string; value: string }[]
  sourceUrl?: string
  warrantyMonths?: number | null
}
export interface QuotationInput {
  number: string
  issuedAt: string
  validUntil: string
  seller: QuotationParty
  customer: QuotationParty
  conversationId: string
  items: { product: QuotationProduct; quantity: number }[]
  discount: number
  shippingFee: number
  notes: string
  paymentTerms: string
  deliveryTerms: string
}
export interface QuotationTotals {
  subtotal: number
  discount: number
  shippingFee: number
  total: number
  quantity: number
}
