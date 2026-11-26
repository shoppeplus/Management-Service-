import { lazy, Suspense, useState } from 'react'
import { FileText } from 'lucide-react'
import { useI18n } from '../../i18n'

const QuotationBuilder = lazy(() => import('../../components/QuotationBuilder'))

interface Props {
  tenantId: string
  userId: string
  warehouseId: string
  disabled: boolean
  onSessionExpired: () => void
  onNotify: (text: string, kind?: 'success' | 'error') => void
}

export default function InventoryQuotationAction({
  tenantId,
  userId,
  warehouseId,
  disabled,
  onSessionExpired,
  onNotify,
}: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="button button-primary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <FileText size={15} />
        {t('Tạo báo giá PDF', 'Create quotation PDF')}
      </button>
      {open && (
        <Suspense fallback={<p role="status">{t('Đang mở báo giá…', 'Opening quotation…')}</p>}>
          <QuotationBuilder
            initialWarehouseId={warehouseId}
            expectedScope={{ tenantId, userId }}
            onSessionExpired={onSessionExpired}
            onClose={() => setOpen(false)}
            onNotify={onNotify}
          />
        </Suspense>
      )}
    </>
  )
}
