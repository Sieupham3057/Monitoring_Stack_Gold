import { useEffect } from 'react'
import { ApiErrorState } from '@/shared/ui/ApiErrorState'
import { PageLoading } from '@/shared/ui/Loading'
import { Modal } from '@/shared/ui/Modal'
import { formatCurrency, formatDateTime } from '@/shared/utils/format'
import { useLazyGetOrderQuery } from './orderApi'

export function OrderDetailModal({ orderId, onClose }: { orderId: number | null; onClose: () => void }) {
  const [load, query] = useLazyGetOrderQuery()
  useEffect(() => { if (orderId) void load(orderId, true) }, [load, orderId])

  return (
    <Modal visible={Boolean(orderId)} size="large" title={`Chi tiết đơn hàng #${orderId ?? ''}`} onClose={onClose}>
      {query.isLoading ? <PageLoading /> : query.error ? <ApiErrorState error={query.error} onRetry={() => { if (orderId) void load(orderId) }} /> : query.data ? <>
        <div className="detail-summary"><div><span>Ngày tạo</span><strong>{formatDateTime(query.data.createdAt)}</strong></div><div><span>Trạng thái</span><span className="badge badge-info">{query.data.status || '—'}</span></div><div><span>Tổng tiền</span><strong>{formatCurrency(query.data.totalAmount)}</strong></div></div>
        <div className="table-responsive"><table className="data-table"><thead><tr><th>Sản phẩm</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{query.data.items.map((item) => <tr key={item.productId}><td>{item.productName || `#${item.productId}`}</td><td>{item.quantity}</td><td>{formatCurrency(item.unitPrice)}</td><td>{formatCurrency(item.quantity * item.unitPrice)}</td></tr>)}</tbody></table></div>
      </> : null}
    </Modal>
  )
}
