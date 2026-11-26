// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nContext } from '../../i18n/context'
import { marketIntelligenceService } from './service'
import type { MarketResearchRun } from './service'
import MarketIntelligencePage from './MarketIntelligencePage'

vi.mock('../../services/inboxService', () => ({ APP_MODE: 'live' }))

const run: MarketResearchRun = {
  id: 'run-1',
  industry: 'Nhà thông minh',
  market: 'Việt Nam',
  question: 'Phân tích xu hướng thị trường',
  status: 'completed',
  model: 'gemini-3.8-flash',
  analysis: '- Nhu cầu tiết kiệm năng lượng đang tăng.\n- Nên kiểm chứng quy mô trước khi mở rộng.',
  errorCode: null,
  createdAt: '2026-11-18T12:00:00.000Z',
  finishedAt: '2026-11-18T12:00:10.000Z',
}

const renderPage = () =>
  render(
    <I18nContext.Provider
      value={{
        locale: 'vi',
        setLocale: vi.fn(),
        t: (vi) => vi,
        label: (name) => name,
      }}
    >
      <MarketIntelligencePage />
    </I18nContext.Provider>,
  )

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('market intelligence page', () => {
  it('renders only the concise analysis and stores a completed research run', async () => {
    const user = userEvent.setup()
    vi.spyOn(marketIntelligenceService, 'status').mockResolvedValue({
      ready: true,
      provider: { name: 'Google Gemini', configured: true, model: 'gemini-3.8-flash' },
    })
    vi.spyOn(marketIntelligenceService, 'listRuns').mockResolvedValue([])
    const research = vi.spyOn(marketIntelligenceService, 'research').mockResolvedValue({
      run,
      reused: false,
    })

    renderPage()
    await screen.findAllByText('Đã cấu hình')
    await user.click(screen.getByRole('button', { name: 'Phân tích thị trường' }))

    const summary = await screen.findByRole('region', { name: 'Phân tích tóm tắt' })
    expect(
      within(summary).getByText(/Nhu cầu tiết kiệm năng lượng đang tăng/),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Nhà thông minh · Việt Nam' })).toHaveFocus()
    expect(screen.queryByText('Nguồn tham khảo')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /example/i })).not.toBeInTheDocument()
    expect(research).toHaveBeenCalledWith(
      expect.objectContaining({ industry: 'Nhà thông minh', market: 'Việt Nam' }),
    )
  })

  it('keeps research disabled until both providers are configured', async () => {
    vi.spyOn(marketIntelligenceService, 'status').mockResolvedValue({
      ready: false,
      provider: { name: 'Google Gemini', configured: false, model: 'gemini-3.8-flash' },
    })
    vi.spyOn(marketIntelligenceService, 'listRuns').mockResolvedValue([])

    renderPage()

    expect(await screen.findByText('Chưa cấu hình')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Phân tích thị trường' })).toBeDisabled()
  })

  it('explains when a saved Gemini model is no longer available', async () => {
    const failedRun: MarketResearchRun = {
      ...run,
      status: 'failed',
      analysis: null,
      errorCode: 'MARKET_AI_MODEL_NOT_FOUND',
    }
    vi.spyOn(marketIntelligenceService, 'status').mockResolvedValue({
      ready: true,
      provider: { name: 'Google Gemini', configured: true, model: 'gemini-2.5-flash' },
    })
    vi.spyOn(marketIntelligenceService, 'listRuns').mockResolvedValue([failedRun])

    renderPage()

    expect(
      await screen.findByText(/đổi model thành gemini-3\.8-flash rồi lưu/i),
    ).toBeInTheDocument()
  })
})
