import { notifyAuthenticationExpired } from '../../services/authSession'

export interface MarketResearchRun {
  id: string
  industry: string
  market: string
  question: string
  status: 'running' | 'completed' | 'failed'
  model: string
  analysis: string | null
  errorCode: string | null
  createdAt: string
  finishedAt: string | null
}

export interface MarketProviderStatus {
  ready: boolean
  provider: { name: string; configured: boolean; model: string }
}

export class MarketIntelligenceApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const isRun = (value: unknown): value is MarketResearchRun =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.industry === 'string' &&
  typeof value.market === 'string' &&
  typeof value.question === 'string' &&
  ['running', 'completed', 'failed'].includes(String(value.status)) &&
  typeof value.model === 'string' &&
  (value.analysis === null || typeof value.analysis === 'string') &&
  (typeof value.errorCode === 'string' || value.errorCode === null) &&
  typeof value.createdAt === 'string' &&
  (typeof value.finishedAt === 'string' || value.finishedAt === null)
const isProviderStatus = (value: unknown): value is MarketProviderStatus =>
  isRecord(value) &&
  typeof value.ready === 'boolean' &&
  isRecord(value.provider) &&
  value.provider.name === 'Google Gemini' &&
  typeof value.provider.configured === 'boolean' &&
  typeof value.provider.model === 'string'

export function createMarketIntelligenceService({
  baseUrl = import.meta.env.VITE_INVENTORY_API_BASE_URL || '',
  fetchImpl = globalThis.fetch,
}: {
  baseUrl?: string
  fetchImpl?: typeof fetch
} = {}) {
  const request = async (
    path: string,
    { method = 'GET', body, key }: { method?: string; body?: unknown; key?: string } = {},
  ): Promise<unknown> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), method === 'POST' ? 65000 : 15000)
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/v1${path}`, {
        method,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (response.headers.get('content-type')?.toLowerCase().includes('text/html'))
        throw new MarketIntelligenceApiError(
          response.status >= 500 ? 0 : response.status,
          'API_NOT_READY',
          'Máy chủ chưa sẵn sàng. Chạy npm run server:inventory rồi tải lại trang.',
        )
      let value: unknown
      try {
        value = await response.json()
      } catch {
        throw new MarketIntelligenceApiError(
          502,
          'INVALID_RESPONSE',
          'Máy chủ phân tích thị trường trả về dữ liệu không hợp lệ.',
        )
      }
      if (!response.ok) {
        if (response.status === 401) notifyAuthenticationExpired()
        const error = isRecord(value) && isRecord(value.error) ? value.error : {}
        throw new MarketIntelligenceApiError(
          response.status,
          typeof error.code === 'string' ? error.code : 'API_ERROR',
          typeof error.message === 'string' ? error.message : 'Không thể xử lý yêu cầu.',
        )
      }
      return value
    } catch (error) {
      if (error instanceof MarketIntelligenceApiError) throw error
      if (error instanceof Error && error.name === 'AbortError')
        throw new MarketIntelligenceApiError(
          0,
          'REQUEST_TIMEOUT',
          'Yêu cầu mất quá nhiều thời gian. Hãy tải lại lịch sử trước khi chạy lại.',
        )
      throw new MarketIntelligenceApiError(
        0,
        'CONNECTION_ERROR',
        'Không kết nối được máy chủ phân tích thị trường.',
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    async status() {
      const value = await request('/market-intelligence/status')
      if (!isProviderStatus(value))
        throw new MarketIntelligenceApiError(
          502,
          'INVALID_STATUS',
          'Trạng thái nhà cung cấp không hợp lệ.',
        )
      return value
    },
    async listRuns() {
      const value = await request('/market-intelligence/runs')
      if (!isRecord(value) || !Array.isArray(value.runs) || !value.runs.every(isRun))
        throw new MarketIntelligenceApiError(
          502,
          'INVALID_HISTORY',
          'Lịch sử phân tích không hợp lệ.',
        )
      return value.runs
    },
    async research(input: { industry: string; market: string; question: string }) {
      const value = await request('/market-intelligence/research', {
        method: 'POST',
        body: input,
        key: crypto.randomUUID(),
      })
      if (!isRecord(value) || typeof value.reused !== 'boolean' || !isRun(value.run))
        throw new MarketIntelligenceApiError(
          502,
          'INVALID_RESEARCH',
          'Kết quả phân tích không hợp lệ.',
        )
      return { run: value.run, reused: value.reused }
    },
  }
}

export const marketIntelligenceService = createMarketIntelligenceService()
