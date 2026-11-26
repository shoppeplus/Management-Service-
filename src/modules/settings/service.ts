import { notifyAuthenticationExpired } from '../../services/authSession'

export type IntegrationProvider =
  | 'gemini'
  | 'telegram'
  | 'shopee'
  | 'lazada'
  | 'tiktokshop'

export interface ProviderCredentialStatus {
  configured: boolean
  source: 'workspace' | 'server'
  model?: string
  accountName?: string | null
}

export interface IntegrationSettingsStatus {
  canSaveCredentials: boolean
  encryptionKeyConfigured: boolean
  providers: Record<IntegrationProvider, ProviderCredentialStatus>
}

export type ProviderCredentials =
  | { apiKey: string; model?: string }
  | { apiKey: string }
  | { botToken: string }
  | {
      partnerId: string
      partnerKey: string
      shopId: string
      accessToken: string
      refreshToken?: string
    }
  | {
      appKey: string
      appSecret: string
      accessToken: string
      refreshToken?: string
      region?: string
      shopCipher?: string
    }

export class IntegrationSettingsApiError extends Error {
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

const isProviderStatus = (value: unknown): value is ProviderCredentialStatus =>
  isRecord(value) &&
  typeof value.configured === 'boolean' &&
  ['workspace', 'server'].includes(String(value.source)) &&
  (value.model === undefined || typeof value.model === 'string') &&
  (value.accountName === undefined ||
    value.accountName === null ||
    typeof value.accountName === 'string')

const isStatus = (value: unknown): value is IntegrationSettingsStatus => {
  if (
    !isRecord(value) ||
    typeof value.canSaveCredentials !== 'boolean' ||
    typeof value.encryptionKeyConfigured !== 'boolean'
  )
    return false
  const providers = value.providers
  return (
    isRecord(providers) &&
    (['gemini', 'telegram', 'shopee', 'lazada', 'tiktokshop'] as const).every((provider) =>
      isProviderStatus(providers[provider]),
    )
  )
}

export function createIntegrationSettingsService({
  baseUrl = import.meta.env.VITE_INVENTORY_API_BASE_URL || '',
  fetchImpl = globalThis.fetch,
}: {
  baseUrl?: string
  fetchImpl?: typeof fetch
} = {}) {
  const request = async (
    path: string,
    { method = 'GET', body }: { method?: string; body?: unknown } = {},
  ): Promise<unknown> => {
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/v1${path}`, {
        method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      })
    } catch (error) {
      throw new IntegrationSettingsApiError(
        0,
        'CONNECTION_ERROR',
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Yêu cầu quá thời gian. Hãy thử lại.'
          : 'Không kết nối được máy chủ tích hợp.',
      )
    }

    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new IntegrationSettingsApiError(
        502,
        'INVALID_RESPONSE',
        'Máy chủ tích hợp trả về dữ liệu không hợp lệ.',
      )
    }
    if (!response.ok) {
      if (response.status === 401) notifyAuthenticationExpired()
      const error = isRecord(value) && isRecord(value.error) ? value.error : {}
      throw new IntegrationSettingsApiError(
        response.status,
        typeof error.code === 'string' ? error.code : 'API_ERROR',
        typeof error.message === 'string' ? error.message : 'Không thể xử lý yêu cầu.',
      )
    }
    return value
  }

  const settingsPath = (provider?: IntegrationProvider) =>
    `/integrations/settings${provider ? `/${provider}` : ''}`

  return {
    async status() {
      const value = await request(settingsPath())
      if (!isStatus(value))
        throw new IntegrationSettingsApiError(
          502,
          'INVALID_STATUS',
          'Trạng thái tích hợp không hợp lệ.',
        )
      return value
    },
    async test(provider: IntegrationProvider, credentials: ProviderCredentials) {
      const value = await request(`${settingsPath(provider)}/test`, {
        method: 'POST',
        body: credentials,
      })
      if (
        !isRecord(value) ||
        value.provider !== provider ||
        value.tested !== true ||
        typeof value.accountName !== 'string'
      )
        throw new IntegrationSettingsApiError(
          502,
          'INVALID_TEST_RESULT',
          'Kết quả kiểm tra kết nối không hợp lệ.',
        )
      return { accountName: value.accountName }
    },
    async save(provider: IntegrationProvider, credentials: ProviderCredentials) {
      const value = await request(settingsPath(provider), {
        method: 'PUT',
        body: credentials,
      })
      if (
        !isRecord(value) ||
        value.provider !== provider ||
        typeof value.accountName !== 'string' ||
        !isStatus(value.status)
      )
        throw new IntegrationSettingsApiError(
          502,
          'INVALID_SAVE_RESULT',
          'Máy chủ không xác nhận đã lưu cấu hình.',
        )
      return { accountName: value.accountName, status: value.status }
    },
    async remove(provider: IntegrationProvider) {
      const value = await request(settingsPath(provider), { method: 'DELETE' })
      if (!isStatus(value))
        throw new IntegrationSettingsApiError(
          502,
          'INVALID_REMOVE_RESULT',
          'Máy chủ không xác nhận đã ngắt cấu hình.',
        )
      return value
    },
  }
}

export const integrationSettingsService = createIntegrationSettingsService()
