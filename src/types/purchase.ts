export interface PurchaseItemSuggestion {
  productId: string
  quantity: number | null
  confidence: 'high' | 'medium'
  messageId: string
  quote: string
}
export interface ExtractedContactField {
  value: string
  messageId: string
}
export interface PurchaseAnalysis {
  conversationId: string
  revision: string
  source: 'demo-rules' | 'model'
  intent: 'purchase' | 'inquiry' | 'support' | 'none'
  summary: string
  items: PurchaseItemSuggestion[]
  phone: ExtractedContactField | null
  shippingAddress: ExtractedContactField | null
}
