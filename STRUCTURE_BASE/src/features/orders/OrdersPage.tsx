import { useState } from 'react'
import { ORDER_STATUS, PAGINATION } from '@/config/constants'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { ApiErrorState } from '@/shared/ui/ApiErrorState'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Icon } from '@/shared/ui/Icon'
import { LoadingOverlay, PageLoading } from '@/shared/ui/Loading'
import { PageHeader } from '@/shared/ui/PageHeader'
import { PaginationBar } from '@/shared/ui/PaginationBar'
import { formatCurrency, formatDateTime } from '@/shared/utils/format'
import { CreateOrderModal } from './CreateOrderModal'
import { OrderDetailModal } from './OrderDetailModal'
import { useGetOrdersQuery } from './orderApi'

export default function OrdersPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<number | undefined>()
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState<number>(PAGINATION.defaultPage)
  const [pageSize, setPageSize] = useState<number>(PAGINATION.defaultPageSize)
  const [createVisible, setCreateVisible] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const query = useGetOrdersQuery({ PageNumber: page, PageSize: pageSize, Search: debouncedSearch || undefined, Status: status, SortBy: 'createdAt', SortDirection: 'desc' })

  return (
    <>
      <PageHeader title="Đơn hàng" description="Theo dõi lịch sử và tạo đơn hàng từ sản phẩm còn tồn kho." actions={
        <button className="button button-primary" type="button" onClick={() => setCreateVisible(true)}><Icon name="plus" size={18} /> Tạo đơn hàng</button>
      } />
      <section className="card"><div className="card-body">
        <LoadingOverlay visible={query.isFetching} label="Đang tải đơn hàng…">
          <div className="toolbar toolbar-wrap">
            <div className="input-icon"><Icon name="search" size={18} /><input className="form-control" aria-label="Tìm đơn hàng" placeholder="Tìm đơn hàng…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></div>
            <select className="form-select filter-select" aria-label="Lọc trạng thái" value={status ?? ''} onChange={(event) => { setStatus(event.target.value === '' ? undefined : Number(event.target.value)); setPage(1) }}><option value="">Tất cả trạng thái</option>{Object.entries(ORDER_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          {query.isLoading ? <PageLoading /> : query.error ? <ApiErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.items.length ? <EmptyState /> : <>
            <div className="table-responsive"><table className="data-table"><thead><tr><th>Mã đơn</th><th>Ngày tạo</th><th>Số dòng</th><th>Trạng thái</th><th>Tổng tiền</th><th className="text-right">Thao tác</th></tr></thead><tbody>
              {query.data.items.map((item) => <tr key={item.id}><td><strong>#{item.id}</strong></td><td>{formatDateTime(item.createdAt)}</td><td>{item.items.length}</td><td><span className="badge badge-info">{item.status || '—'}</span></td><td>{formatCurrency(item.totalAmount)}</td><td className="text-right"><button className="button button-sm button-primary-outline" type="button" onClick={() => setDetailId(item.id)}>Xem chi tiết</button></td></tr>)}
            </tbody></table></div>
            <PaginationBar page={page} pageSize={pageSize} totalCount={query.data.totalCount} totalPages={query.data.totalPages} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} />
          </>}
        </LoadingOverlay>
      </div></section>
      <CreateOrderModal visible={createVisible} onClose={() => setCreateVisible(false)} />
      <OrderDetailModal orderId={detailId} onClose={() => setDetailId(null)} />
    </>
  )
}
