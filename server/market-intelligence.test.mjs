import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainError, openDatabase } from './database.mjs'
import { createMarketIntelligence } from './market-intelligence.mjs'

const createdAt = '2026-11-18T12:00:00.000Z'
const admin = { userId: 'owner-a', tenantId: 'tenant-a', role: 'owner' }
const topic = {
  industry: 'Nhà thông minh',
  market: 'Việt Nam',
  question: 'Phân tích xu hướng và đối thủ',
}
const summary = '- Nhu cầu thiết bị tiết kiệm năng lượng đang được quan tâm.\n- Cần kiểm chứng quy mô trước khi mở rộng danh mục.'
const groundingMetadata = {
  groundingChunks: [
    { web: { title: 'Xu hướng nhà thông minh', uri: 'https://example.com/smart-home' } },
  ],
}

describe('market intelligence service', () => {
  let db
  let fetchImpl
  let service

  beforeEach(() => {
    db = openDatabase()
    db.prepare('INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)').run(
      'tenant-a',
      'Tenant A',
      createdAt,
    )
    db.prepare('INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)').run(
      'tenant-b',
      'Tenant B',
      createdAt,
    )
    db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
      'owner-a',
      'tenant-a',
      'Owner A',
      'owner',
    )
    db.prepare('INSERT INTO users(id,tenant_id,name,role,active) VALUES(?,?,?,?,1)').run(
      'owner-b',
      'tenant-b',
      'Owner B',
      'owner',
    )
    fetchImpl = vi.fn(async () =>
      Response.json({
        candidates: [
          {
            content: { parts: [{ text: summary }] },
            groundingMetadata,
          },
        ],
      }),
    )
    service = createMarketIntelligence(db, {
      fetchImpl,
      geminiApiKey: 'server-only-ai-key',
      now: () => new Date(createdAt),
    })
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  it('uses Gemini web grounding and returns only a concise analysis, scoped to the tenant', async () => {
    const result = await service.research(admin, topic, 'market-run-key-001')

    expect(result.reused).toBe(false)
    expect(result.run).toMatchObject({
      industry: topic.industry,
      market: topic.market,
      question: topic.question,
      status: 'completed',
      analysis: summary,
    })
    expect(result.run).not.toHaveProperty('sources')
    expect(service.listRuns({ ...admin, tenantId: 'tenant-b', userId: 'owner-b' }).runs).toEqual([])
    expect(service.listRuns(admin).runs).toHaveLength(1)
    expect(service.status(admin)).toEqual({
      ready: true,
      provider: { name: 'Google Gemini', configured: true, model: 'gemini-3.8-flash' },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0][0])).toContain('generativelanguage.googleapis.com')
    expect(fetchImpl.mock.calls[0][1].headers['x-goog-api-key']).toBe('server-only-ai-key')
    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(requestBody.tools).toEqual([{ google_search: {} }])
    expect(requestBody.generationConfig.maxOutputTokens).toBeLessThanOrEqual(700)
    expect(requestBody.contents[0].parts[0].text).toContain('Không tạo danh sách bài viết')
    const [saved] = service.listRuns(admin).runs
    expect(JSON.parse(db.prepare('SELECT sources_json FROM market_research_runs').get().sources_json))
      .toMatchObject([{ url: 'https://example.com/smart-home' }])
    expect(
      JSON.stringify({ result, status: service.status(admin), runs: service.listRuns(admin) }),
    ).not.toContain('server-only-ai-key')
    expect(JSON.stringify({ result, runs: service.listRuns(admin) })).not.toContain(
      'example.com/smart-home',
    )
    expect(saved.analysis).toBe(summary)
  })

  it('reuses an idempotent result and rejects a different payload for the same key', async () => {
    const first = await service.research(admin, topic, 'market-run-key-002')
    const repeated = await service.research(admin, topic, 'market-run-key-002')

    expect(repeated).toMatchObject({ reused: true, run: { id: first.run.id } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await expect(
      service.research(
        admin,
        { ...topic, question: 'Khác nội dung nghiên cứu' },
        'market-run-key-002',
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })

  it('refuses non-admin access and reports missing provider configuration', async () => {
    expect(() => service.status({ ...admin, role: 'staff' })).toThrow(DomainError)
    const unconfigured = createMarketIntelligence(db, {
      fetchImpl,
      geminiApiKey: '',
    })
    expect(unconfigured.status(admin).ready).toBe(false)
    await expect(unconfigured.research(admin, topic, 'market-run-key-003')).rejects.toMatchObject({
      code: 'MARKET_PROVIDER_NOT_CONFIGURED',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a response without grounding sources or a concise analysis', async () => {
    fetchImpl.mockResolvedValueOnce(
      Response.json({
        candidates: [{ content: { parts: [{ text: summary }] }, groundingMetadata: {} }],
      }),
    )
    await expect(service.research(admin, topic, 'market-run-key-004')).rejects.toMatchObject({
      code: 'MARKET_NO_SOURCES',
    })

    fetchImpl.mockResolvedValueOnce(
      Response.json({
        candidates: [{ content: { parts: [{ text: '' }] }, groundingMetadata }],
      }),
    )
    await expect(service.research(admin, topic, 'market-run-key-005')).rejects.toMatchObject({
      code: 'MARKET_ANALYSIS_INVALID',
    })
    expect(service.listRuns(admin).runs.map((run) => run.status)).toEqual(['failed', 'failed'])
  })
})
