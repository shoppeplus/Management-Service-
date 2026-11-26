export interface TikTokShopConfig {
  shopId: string
  accountName: string
  appKey: string
  appSecret: string
  accessToken: string
  categoryName?: string
}

export interface TikTokShopPublicInfo {
  shopId: string
  accountName: string
  connected: boolean
  categoryName: string | null
}

export type AccountRoleTier = 'F0' | 'F1' | 'F2'

export interface UserShopScope {
  roleTier: AccountRoleTier
  allowedShopIds?: string[] | null
  allowedCategories?: string[] | null
}

export interface TikTokWebhookPayload {
  type?: string
  shop_id?: string
  shopId?: string
  data?: {
    shop_id?: string
    shopId?: string
    order_id?: string
    order_status?: string
  }
}

export interface TikTokWebhookRouteResult {
  accepted: boolean
  shopId: string | null
  accountName: string | null
  eventType: string | null
  reason?: 'INVALID_PAYLOAD' | 'UNCONFIGURED_SHOP'
}

export const DEFAULT_TIKTOK_SHOPS: TikTokShopConfig[] = [
  {
    shopId: 'tiktok-shop-01',
    accountName: 'TikTok Shop 01 · Mỹ Phẩm & Skincare',
    appKey: 'tt-demo-key-01',
    appSecret: 'tt-demo-secret-01',
    accessToken: 'tt-demo-token-01',
    categoryName: 'Mỹ phẩm',
  },
  {
    shopId: 'tiktok-shop-02',
    accountName: 'TikTok Shop 02 · Gia Dụng & Điện Tử',
    appKey: 'tt-demo-key-02',
    appSecret: 'tt-demo-secret-02',
    accessToken: 'tt-demo-token-02',
    categoryName: 'Đồ gia dụng',
  },
  {
    shopId: 'tiktok-shop-03',
    accountName: 'TikTok Shop 03 · Thời Trang Unisex',
    appKey: 'tt-demo-key-03',
    appSecret: 'tt-demo-secret-03',
    accessToken: 'tt-demo-token-03',
    categoryName: 'Thời trang',
  },
]

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n))
}

function sha256Bytes(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8
  const padLen = ((data.length + 9 + 63) >> 6) << 6
  const padded = new Uint8Array(padLen)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false)
  view.setUint32(padLen - 4, bitLen >>> 0, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  const w = new Uint32Array(64)

  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3)
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, false)
  outView.setUint32(4, h1, false)
  outView.setUint32(8, h2, false)
  outView.setUint32(12, h3, false)
  outView.setUint32(16, h4, false)
  outView.setUint32(20, h5, false)
  outView.setUint32(24, h6, false)
  outView.setUint32(28, h7, false)
  return out
}

function hmacSha256Hex(secret: string, message: string): string {
  const encoder = new TextEncoder()
  const keyBytes = encoder.encode(secret)
  const msgBytes = encoder.encode(message)
  const blockKey = new Uint8Array(64)
  blockKey.set(keyBytes.length > 64 ? sha256Bytes(keyBytes) : keyBytes)

  const oKeyPad = new Uint8Array(64)
  const iKeyPad = new Uint8Array(64)
  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = blockKey[i] ^ 0x5c
    iKeyPad[i] = blockKey[i] ^ 0x36
  }

  const innerInput = new Uint8Array(64 + msgBytes.length)
  innerInput.set(iKeyPad, 0)
  innerInput.set(msgBytes, 64)
  const innerHash = sha256Bytes(innerInput)

  const outerInput = new Uint8Array(64 + innerHash.length)
  outerInput.set(oKeyPad, 0)
  outerInput.set(innerHash, 64)
  const digest = sha256Bytes(outerInput)

  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function resolveTikTokShop(
  shops: TikTokShopConfig[],
  shopId: string | null | undefined,
): TikTokShopConfig | null {
  if (!shopId) return null
  return shops.find((item) => item.shopId === shopId) ?? null
}

export function listPublicTikTokShops(shops: TikTokShopConfig[]): TikTokShopPublicInfo[] {
  return shops.map((item) => ({
    shopId: item.shopId,
    accountName: item.accountName,
    connected: Boolean(item.accessToken && item.accessToken.trim().length > 0),
    categoryName: item.categoryName ?? null,
  }))
}

export function getTikTokShopsForUser(
  shops: TikTokShopConfig[],
  scope?: UserShopScope | null,
): TikTokShopPublicInfo[] {
  const all = listPublicTikTokShops(shops)
  if (!scope || scope.roleTier === 'F0') return all
  if (!Array.isArray(scope.allowedShopIds) || scope.allowedShopIds.length === 0) return all
  const allowedSet = new Set(scope.allowedShopIds)
  return all.filter((shop) => allowedSet.has(shop.shopId))
}

export function generateTikTokSignature(
  appSecret: string,
  path: string,
  params: Record<string, string>,
  body = '',
): string {
  if (!appSecret.trim()) {
    throw new Error('TikTok appSecret chưa được cấu hình.')
  }
  const sortedKeys = Object.keys(params).sort()
  const paramString = sortedKeys.map((key) => `${key}${params[key]}`).join('')
  const baseString = `${appSecret}${path}${paramString}${body}${appSecret}`
  return hmacSha256Hex(appSecret, baseString)
}

export function verifyTikTokWebhookSignature(options: {
  shops: TikTokShopConfig[]
  shopId: string
  path?: string
  params?: Record<string, string>
  rawBody: string
  signature: string
}): boolean {
  const shop = resolveTikTokShop(options.shops, options.shopId)
  if (!shop || !options.signature) return false
  const expected = generateTikTokSignature(
    shop.appSecret,
    options.path ?? '/api/webhooks/tiktok',
    options.params ?? {},
    options.rawBody,
  )
  if (expected.length !== options.signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ options.signature.charCodeAt(i)
  }
  return diff === 0
}

export function routeTikTokWebhookEvent(
  shops: TikTokShopConfig[],
  payload: TikTokWebhookPayload | null | undefined,
): TikTokWebhookRouteResult {
  if (!payload || !payload.type) {
    return {
      accepted: false,
      shopId: null,
      accountName: null,
      eventType: null,
      reason: 'INVALID_PAYLOAD',
    }
  }
  const shopId =
    payload.shop_id ?? payload.shopId ?? payload.data?.shop_id ?? payload.data?.shopId ?? null
  const shop = resolveTikTokShop(shops, shopId)
  if (!shop) {
    return {
      accepted: false,
      shopId,
      accountName: null,
      eventType: payload.type,
      reason: 'UNCONFIGURED_SHOP',
    }
  }
  return {
    accepted: true,
    shopId: shop.shopId,
    accountName: shop.accountName,
    eventType: payload.type,
  }
}
