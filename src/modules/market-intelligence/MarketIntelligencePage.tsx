import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Globe2,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { APP_MODE } from '../../services/inboxService'
import { ModulePageHeader } from '../operations/ui'
import { marketIntelligenceService } from './service'
import type { MarketProviderStatus, MarketResearchRun } from './service'
import './market-intelligence.css'

const initialQuestion =
  'Phân tích ngắn xu hướng nhu cầu, đối thủ, cơ hội và rủi ro trong 12 tháng gần đây.'

const formatDate = (value: string, locale: string) =>
  new Date(value).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

const researchFailureMessage = (code: string | null, t: (vi: string, en: string) => string) => {
  const messages: Record<string, [string, string]> = {
    MARKET_AI_FAILED: [
      'Gemini từ chối yêu cầu. Model gemini-2.5-flash hiện bị giới hạn với một số tài khoản; hãy đổi sang gemini-3.8-flash trong Cài đặt. Nếu vẫn lỗi, kiểm tra API key và quota.',
      'Gemini rejected the request. gemini-2.5-flash is restricted for some accounts; change it to gemini-3.8-flash in Settings. If it still fails, check the API key and quota.',
    ],
    MARKET_AI_MODEL_NOT_FOUND: [
      'Model Gemini không khả dụng. Vào Cài đặt, đổi model thành gemini-3.8-flash rồi lưu.',
      'The selected Gemini model is unavailable. In Settings, change it to gemini-3.8-flash and save.',
    ],
    MARKET_AI_AUTH_FAILED: [
      'Gemini từ chối API key hoặc quyền truy cập. Hãy kiểm tra khóa và quyền dùng Google Search grounding.',
      'Gemini rejected the API key or access. Check the key and Google Search grounding permissions.',
    ],
    MARKET_AI_QUOTA_EXCEEDED: [
      'Gemini đã hết quota hoặc giới hạn tốc độ. Hãy kiểm tra quota API rồi thử lại.',
      'Gemini quota or rate limit was reached. Check the API quota and try again.',
    ],
    MARKET_AI_BAD_REQUEST: [
      'Gemini từ chối cấu hình yêu cầu. Hãy kiểm tra model đang chọn có hỗ trợ Google Search grounding.',
      'Gemini rejected the request configuration. Check that the selected model supports Google Search grounding.',
    ],
    MARKET_AI_TIMEOUT: [
      'Gemini phản hồi quá thời gian. Hãy thử lại sau.',
      'Gemini timed out. Please try again later.',
    ],
    MARKET_AI_CONNECTION_FAILED: [
      'Máy chủ không kết nối được Gemini. Hãy kiểm tra mạng máy chủ.',
      'The server could not connect to Gemini. Check the server network.',
    ],
    MARKET_AI_UNAVAILABLE: [
      'Gemini tạm thời không xử lý được yêu cầu. Hãy thử lại sau.',
      'Gemini is temporarily unavailable. Please try again later.',
    ],
  }
  const message = code ? messages[code] : undefined
  return message ? t(message[0], message[1]) : t(
    'Lần nghiên cứu này không hoàn tất. Hãy kiểm tra cấu hình và thử lại.',
    'This research run did not complete. Check configuration and try again.',
  )
}

export default function MarketIntelligencePage() {
  const { t, locale } = useI18n()
  const [status, setStatus] = useState<MarketProviderStatus | null>(null)
  const [runs, setRuns] = useState<MarketResearchRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [industry, setIndustry] = useState('Nhà thông minh')
  const [market, setMarket] = useState('Việt Nam')
  const [question, setQuestion] = useState(initialQuestion)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [reportToReveal, setReportToReveal] = useState('')
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const reportRef = useRef<HTMLElement>(null)

  const loadPage = useCallback(async () => {
    if (APP_MODE !== 'live') {
      setLoading(false)
      setError(
        t(
          'Phân tích thị trường cần chế độ Live và phiên đăng nhập quản trị.',
          'Market analysis requires Live mode and an administrator session.',
        ),
      )
      return
    }
    setLoading(true)
    setError('')
    try {
      const [providerStatus, history] = await Promise.all([
        marketIntelligenceService.status(),
        marketIntelligenceService.listRuns(),
      ])
      setStatus(providerStatus)
      setRuns(history)
      setSelectedRunId((selected) => selected || history[0]?.id || '')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không tải được phân tích thị trường.', 'Unable to load market analysis.'),
      )
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  )

  useEffect(() => {
    if (!reportToReveal || selectedRun?.id !== reportToReveal) return
    const report = reportRef.current
    if (!report) return
    if (typeof report.scrollIntoView === 'function')
      report.scrollIntoView({ behavior: 'smooth', block: 'start' })
    report.focus({ preventScroll: true })
    setReportToReveal('')
  }, [reportToReveal, selectedRun])

  const runResearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (running || !status?.ready) return
    setRunning(true)
    setError('')
    setHistoryError('')
    try {
      const result = await marketIntelligenceService.research({
        industry: industry.trim(),
        market: market.trim(),
        question: question.trim(),
      })
      setRuns((current) =>
        [result.run, ...current.filter((run) => run.id !== result.run.id)].slice(0, 20),
      )
      setSelectedRunId(result.run.id)
      setReportToReveal(result.run.id)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Không thể hoàn tất phân tích.', 'Unable to complete analysis.'),
      )
      try {
        const history = await marketIntelligenceService.listRuns()
        setRuns(history)
        setSelectedRunId((selected) => selected || history[0]?.id || '')
      } catch (historyCause) {
        setHistoryError(
          historyCause instanceof Error
            ? historyCause.message
            : t('Không tải được lịch sử nghiên cứu.', 'Unable to load research history.'),
        )
      }
    } finally {
      setRunning(false)
    }
  }

  const providerState = (configured: boolean) => (
    <span className={`market-provider-state ${configured ? 'is-ready' : 'is-missing'}`}>
      {configured ? (
        <CheckCircle2 size={14} aria-hidden="true" />
      ) : (
        <AlertTriangle size={14} aria-hidden="true" />
      )}
      {configured ? t('Đã cấu hình', 'Configured') : t('Chưa cấu hình', 'Not configured')}
    </span>
  )

  return (
    <main className="ops-page market-page">
      <ModulePageHeader
        eyebrow="SMARTSALES / MARKET INTELLIGENCE"
        title={t('Phân tích thị trường bằng AI', 'AI market intelligence')}
        description={t(
          'Gemini tự tìm kiếm thông tin công khai trên web và trả về bản phân tích ngắn gọn.',
          'Gemini searches public web information and returns a concise analysis.',
        )}
      />

      {error && (
        <div className="market-alert" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="market-loading" role="status">
          <LoaderCircle size={19} className="spin" aria-hidden="true" />
          {t('Đang tải trạng thái dịch vụ…', 'Loading provider status…')}
        </div>
      ) : (
        <>
          {status && (
            <section className={`market-provider-panel ${status.ready ? 'is-ready' : ''}`}>
              <div className="market-provider-title">
                <span className="market-icon">
                  <ShieldCheck size={19} aria-hidden="true" />
                </span>
                <div>
                  <h2>{t('Trạng thái dịch vụ AI', 'AI provider status')}</h2>
                  <p>
                    {status.ready
                      ? t(
                          'Gemini đã sẵn sàng tìm kiếm web và phân tích khi bạn gửi yêu cầu.',
                          'Gemini is ready to search the web and analyze when you submit a request.',
                        )
                      : t(
                          'Thiếu cấu hình Gemini. Thêm khóa vào .env rồi khởi động lại API.',
                          'Gemini configuration is missing. Add its key to .env and restart the API.',
                        )}
                  </p>
                </div>
              </div>
              <div className="market-provider-list">
                <div>
                  <strong>
                    {t('Tìm kiếm web & phân tích', 'Web search & analysis')}
                  </strong>
                  <small>
                    {status.provider.name} · {status.provider.model}
                  </small>
                  {providerState(status.provider.configured)}
                </div>
              </div>
              {!status.ready && (
                <p className="market-env-hint">
                  <code>GEMINI_API_KEY</code>
                </p>
              )}
            </section>
          )}

          <div className="market-content-grid">
            <section className="market-card market-research-card">
              <div className="market-card-heading">
                <span className="market-icon">
                  <Search size={19} aria-hidden="true" />
                </span>
                <div>
                  <h2>{t('Tạo nghiên cứu mới', 'Start new research')}</h2>
                  <p>
                    {t(
                      'Chọn ngành, thị trường và câu hỏi cần trả lời.',
                      'Choose the industry, market, and research question.',
                    )}
                  </p>
                </div>
              </div>
              <form className="market-research-form" onSubmit={(event) => void runResearch(event)}>
                <div className="market-field-row">
                  <label>
                    {t('Ngành hàng', 'Industry')}
                    <input
                      value={industry}
                      maxLength={120}
                      minLength={2}
                      required
                      onChange={(event) => setIndustry(event.target.value)}
                    />
                  </label>
                  <label>
                    {t('Thị trường / khu vực', 'Market / region')}
                    <input
                      value={market}
                      maxLength={120}
                      minLength={2}
                      required
                      onChange={(event) => setMarket(event.target.value)}
                    />
                  </label>
                </div>
                <label>
                  {t('Câu hỏi nghiên cứu', 'Research question')}
                  <textarea
                    value={question}
                    rows={4}
                    minLength={8}
                    maxLength={600}
                    required
                    onChange={(event) => setQuestion(event.target.value)}
                  />
                </label>
                <div className="market-privacy-note">
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>
                    {t(
                      'Ngành hàng, khu vực và câu hỏi được gửi tới Gemini để tìm kiếm web và phân tích. Không nhập dữ liệu khách hàng hoặc bí mật doanh nghiệp.',
                      'The industry, region, and question are sent to Gemini for web search and analysis. Do not enter customer data or business secrets.',
                    )}
                  </span>
                </div>
                <button
                  type="submit"
                  className="button button-primary market-submit"
                  disabled={!status?.ready || running}
                >
                  {running ? (
                    <LoaderCircle size={16} className="spin" aria-hidden="true" />
                  ) : (
                    <Sparkles size={16} aria-hidden="true" />
                  )}
                  {running
                    ? t('Gemini đang tìm trên web và phân tích…', 'Gemini is searching the web and analyzing…')
                    : t('Phân tích thị trường', 'Analyze market')}
                </button>
              </form>
            </section>

            <section className="market-card market-history-card">
              <div className="market-card-heading">
                <span className="market-icon">
                  <Clock3 size={19} aria-hidden="true" />
                </span>
                <div>
                  <h2>{t('Lịch sử nghiên cứu', 'Research history')}</h2>
                  <p>
                    {t(
                      'Tối đa 20 lần nghiên cứu gần nhất của doanh nghiệp.',
                      'The 20 most recent runs for this business.',
                    )}
                  </p>
                </div>
              </div>
              {historyError && (
                <p className="market-history-error" role="alert">
                  {historyError}
                </p>
              )}
              {runs.length ? (
                <ul className="market-history-list">
                  {runs.map((run) => (
                    <li key={run.id}>
                      <button
                        type="button"
                        className={run.id === selectedRun?.id ? 'is-selected' : ''}
                        aria-current={run.id === selectedRun?.id ? 'true' : undefined}
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <span className={`market-run-dot status-${run.status}`} />
                        <span className="market-history-copy">
                          <strong>
                            {run.industry} · {run.market}
                          </strong>
                          <small>{run.question}</small>
                          <small>{formatDate(run.createdAt, locale)}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="market-empty">
                  <Globe2 size={24} aria-hidden="true" />
                  <p>{t('Chưa có nghiên cứu nào được lưu.', 'No research has been saved yet.')}</p>
                </div>
              )}
            </section>
          </div>

          {selectedRun && (
            <section
              ref={reportRef}
              className="market-report"
              aria-labelledby="market-report-title"
              tabIndex={-1}
            >
              <header className="market-report-header">
                <div>
                  <span className="market-report-eyebrow">
                    <BrainCircuit size={15} aria-hidden="true" />
                    {t('BÁO CÁO NGHIÊN CỨU', 'RESEARCH REPORT')}
                  </span>
                  <h2 id="market-report-title">
                    {selectedRun.industry} · {selectedRun.market}
                  </h2>
                  <p>{selectedRun.question}</p>
                </div>
                <div className={`market-report-status status-${selectedRun.status}`}>
                  {selectedRun.status === 'completed'
                    ? t('Hoàn tất', 'Completed')
                    : selectedRun.status === 'running'
                      ? t('Đang chạy', 'Running')
                      : t('Không hoàn tất', 'Failed')}
                </div>
              </header>
              {selectedRun.status === 'failed' && (
                <div className="market-alert" role="status">
                  <AlertTriangle size={17} aria-hidden="true" />
                  <p>
                    {selectedRun.errorCode === 'MARKET_NO_SOURCES'
                      ? t(
                          'Không tìm thấy nguồn phù hợp. Hãy thử câu hỏi hoặc khu vực khác.',
                          'No suitable sources were found. Try a different question or region.',
                        )
                      : researchFailureMessage(selectedRun.errorCode, t)}
                  </p>
                </div>
              )}
              {selectedRun.analysis && (
                <>
                  <section className="market-summary" aria-labelledby="market-summary-title">
                    <CheckCircle2 size={21} aria-hidden="true" />
                    <div>
                      <h3 id="market-summary-title">
                        {t('Phân tích tóm tắt', 'Concise analysis')}
                      </h3>
                      <p>{selectedRun.analysis}</p>
                    </div>
                  </section>
                </>
              )}
              <p className="market-report-meta">
                {t('Mô hình', 'Model')}: {selectedRun.model} ·{' '}
                {formatDate(selectedRun.createdAt, locale)}
              </p>
            </section>
          )}
        </>
      )}
    </main>
  )
}
