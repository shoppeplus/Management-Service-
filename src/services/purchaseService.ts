import { APP_MODE } from './inboxService'
import {
  analyzePurchaseDemo,
  conversationRevision,
  validatePurchaseAnalysis,
} from '../lib/purchase'
import type { Conversation } from '../types/inbox'
import type { Product } from '../modules/operations/types'
import type { PurchaseAnalysis } from '../types/purchase'

export function createPurchaseService(mode: 'demo' | 'live', baseUrl = '') {
  return {
    async analyze(
      conversation: Conversation,
      products: Product[],
      signal?: AbortSignal,
    ): Promise<PurchaseAnalysis> {
      if (mode === 'demo') return analyzePurchaseDemo(conversation, products)
      let url: URL
      try {
        url = new URL(baseUrl)
      } catch {
        throw new Error('Chưa cấu hình API phân tích. / Analysis API is not configured.')
      }
      if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('Địa chỉ API không hợp lệ. / Invalid API URL.')
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) controller.abort()
      const timer = setTimeout(abort, 30000)
      try {
        const response = await fetch(
          `${baseUrl.replace(/\/$/, '')}/conversations/${encodeURIComponent(conversation.id)}/purchase-analysis`,
          {
            method: 'POST',
            credentials: 'include',
            signal: controller.signal,
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ revision: conversationRevision(conversation) }),
          },
        )
        if (!response.ok)
          throw new Error(
            response.status === 503
              ? 'Chưa kết nối dịch vụ AI trên máy chủ. / AI service is not configured on the server.'
              : `Phân tích thất bại (API ${response.status}). / Analysis failed (API ${response.status}).`,
          )
        const result: unknown = await response.json()
        validatePurchaseAnalysis(result, conversation, products)
        if (result.source !== 'model')
          throw new Error('API chưa trả về phân tích AI thực. / API did not return model analysis.')
        return result
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
    },
  }
}
export const purchaseService = createPurchaseService(
  APP_MODE,
  import.meta.env.VITE_API_BASE_URL ?? '',
)
