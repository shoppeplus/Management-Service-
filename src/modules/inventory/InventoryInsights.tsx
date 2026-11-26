import { useI18n } from '../../i18n'
import type { InventorySnapshot } from './types'

export default function InventoryInsights({
  data,
  warehouseId,
  skuIds,
}: {
  data: InventorySnapshot
  warehouseId: string
  skuIds: Set<string>
}) {
  const { t } = useI18n()
  const days = data.metrics.dailyMovements ?? []
  const maximum = Math.max(1, ...days.flatMap((day) => [day.receiptQuantity, day.issueQuantity]))
  const suggestions =
    data.metrics.replenishmentSuggestions?.filter(
      (item) => skuIds.has(item.skuId) && (!warehouseId || item.warehouseId === warehouseId),
    ) ?? []
  const transfers =
    data.metrics.transferSuggestions?.filter(
      (item) =>
        skuIds.has(item.skuId) &&
        (!warehouseId ||
          item.fromWarehouseId === warehouseId ||
          item.toWarehouseId === warehouseId),
    ) ?? []
  const pending =
    data.metrics.pendingIncoming
      ?.filter(
        (item) => skuIds.has(item.skuId) && (!warehouseId || item.warehouseId === warehouseId),
      )
      .reduce((total, item) => total + item.quantity, 0) ?? 0
  const skuName = (id: string) => data.skus.find((sku) => sku.id === id)?.name ?? id
  const warehouseName = (id: string) =>
    data.warehouses.find((warehouse) => warehouse.id === id)?.name ?? id
  if (!days.length && !suggestions.length && !transfers.length) return null
  return (
    <>
      <section className="inv-panel">
        <header>
          <h2>
            {t(
              'Biến động nhập / xuất · toàn doanh nghiệp · 30 ngày UTC',
              'Receipts / issues · entire business · 30 UTC days',
            )}
          </h2>
        </header>
        <div className="inv-trend-content">
          <p className="inv-note">
            {t(
              'Số lượng từ phiếu nhập / xuất đã ghi sổ. Điều chuyển và điều chỉnh không nằm trong biểu đồ; biểu đồ dùng cửa sổ 30 ngày cố định.',
              'Quantities from posted receipts / issues. Transfers and adjustments are excluded; the chart uses a fixed 30-day window.',
            )}
          </p>
          <div className="inv-chart-legend">
            <span>
              <i />
              {t('Nhập', 'Receipts')}
            </span>
            <span>
              <i />
              {t('Xuất', 'Issues')}
            </span>
          </div>
          <div
            className="inv-movement-chart"
            role="img"
            aria-label={t(
              'So sánh số lượng nhập và xuất theo từng ngày trong 30 ngày UTC. Mở bảng dữ liệu để đọc số chính xác.',
              'Daily receipt and issue quantities for 30 UTC days. Expand the data table for exact values.',
            )}
          >
            {days.map((day) => (
              <div
                className="inv-day-bars"
                key={day.date}
                title={`${day.date}: ${t('nhập', 'receipts')} ${day.receiptQuantity}, ${t('xuất', 'issues')} ${day.issueQuantity}`}
              >
                <div className="inv-bar-pair">
                  <span style={{ height: `${(day.receiptQuantity / maximum) * 100}%` }} />
                  <span style={{ height: `${(day.issueQuantity / maximum) * 100}%` }} />
                </div>
                <small>{day.date.slice(8)}</small>
              </div>
            ))}
          </div>
          <details className="inv-chart-data">
            <summary>{t('Xem dữ liệu biểu đồ', 'View chart data')}</summary>
            <div className="inv-table-scroll">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>{t('Ngày UTC', 'UTC date')}</th>
                    <th>{t('Nhập', 'Receipts')}</th>
                    <th>{t('Xuất', 'Issues')}</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td>{day.receiptQuantity}</td>
                      <td>{day.issueQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </section>
      <section className="inv-panel">
        <header>
          <h2>
            {t(
              'Đề xuất theo tốc độ xuất và định mức',
              'Suggestions from issue velocity and thresholds',
            )}
          </h2>
        </header>
        <p className="inv-note inv-panel-note">
          {t(
            'Đây là gợi ý bằng quy tắc từ lịch sử xuất, không phải dự báo AI hoặc số liệu bán hàng. Kiểm tra đơn mua, nhu cầu và hạn giao trước khi thực hiện.',
            'These are rules based on issue history, not AI forecasts or sales figures. Review purchases, demand and lead times before acting.',
          )}{' '}
          {t('Đang chờ nhập đã duyệt', 'Approved pending receipts')}: <strong>{pending}</strong>.
        </p>
        <div className="inv-reorder-list">
          {suggestions.length ? (
            suggestions.map((item) => (
              <div key={`${item.warehouseId}-${item.skuId}`}>
                <div>
                  <strong>{skuName(item.skuId)}</strong>
                  <small>
                    {warehouseName(item.warehouseId)} · {t('Khả dụng', 'Available')}:{' '}
                    {item.available} · {t('Chờ nhập', 'Pending')}: {item.pendingIncoming} ·{' '}
                    {t('Xuất/ngày', 'Issues/day')}: {item.averageDailyIssue.toFixed(2)}
                  </small>
                </div>
                <span>
                  {t('Đề xuất nhập', 'Suggested receipt')}: <strong>{item.quantity}</strong>
                </span>
              </div>
            ))
          ) : (
            <p className="inv-note">
              {t(
                'Chưa có đề xuất bổ sung trong bộ lọc.',
                'No replenishment suggestions for these filters.',
              )}
            </p>
          )}
          {transfers.map((item) => (
            <div key={`${item.fromWarehouseId}-${item.toWarehouseId}-${item.skuId}`}>
              <div>
                <strong>{skuName(item.skuId)}</strong>
                <small>
                  {warehouseName(item.fromWarehouseId)} → {warehouseName(item.toWarehouseId)}
                </small>
              </div>
              <span>
                {t('Gợi ý chuyển', 'Suggested transfer')}: <strong>{item.quantity}</strong>
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
