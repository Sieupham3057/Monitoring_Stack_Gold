import { useState } from 'react'
import { useAppDispatch } from '@/app/hooks'
import { PAGINATION } from '@/config/constants'
import { useGetCategoriesQuery } from '@/features/categories/categoryApi'
import { normalizeApiError } from '@/shared/api/error'
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue'
import { ApiErrorState } from '@/shared/ui/ApiErrorState'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Icon } from '@/shared/ui/Icon'
import { LoadingOverlay, PageLoading } from '@/shared/ui/Loading'
import { PageHeader } from '@/shared/ui/PageHeader'
import { PaginationBar } from '@/shared/ui/PaginationBar'
import { showToast } from '@/shared/ui/uiSlice'
import { formatCurrency } from '@/shared/utils/format'
import { ProductFormModal } from './ProductFormModal'
import { useDeleteProductMutation, useGetProductsQuery } from './productApi'
import type { Product } from './types'

export default function ProductsPage() {
  const dispatch = useAppDispatch()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [stockFilter, setStockFilter] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState<number>(PAGINATION.defaultPage)
  const [pageSize, setPageSize] = useState<number>(PAGINATION.defaultPageSize)
  const [editing, setEditing] = useState<Product | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const categories = useGetCategoriesQuery({ PageNumber: 1, PageSize: 100, SortBy: 'name' })
  const query = useGetProductsQuery({ PageNumber: page, PageSize: pageSize, Search: debouncedSearch || undefined, CategoryId: categoryId, InStock: stockFilter === '' ? undefined : stockFilter === 'true', SortBy: 'id', SortDirection: 'desc' })
  const [deleteProduct, deleteState] = useDeleteProductMutation()

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deleteProduct(deleting.id).unwrap()
      dispatch(showToast({ color: 'success', title: 'Đã xóa sản phẩm' }))
      setDeleting(null)
    } catch (error) {
      dispatch(showToast({ color: 'danger', title: 'Không thể xóa sản phẩm', message: normalizeApiError(error).message }))
    }
  }

  return (
    <>
      <PageHeader title="Sản phẩm" description="Quản lý giá bán, tồn kho và phân loại sản phẩm." actions={
        <button className="button button-primary" type="button" onClick={() => setEditing(null)}><Icon name="plus" size={18} /> Thêm sản phẩm</button>
      } />
      <section className="card"><div className="card-body">
        <LoadingOverlay visible={query.isFetching} label="Đang tải sản phẩm…">
          <div className="toolbar toolbar-wrap">
            <div className="input-icon"><Icon name="search" size={18} /><input className="form-control" aria-label="Tìm sản phẩm" placeholder="Tìm theo tên…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></div>
            <select className="form-select filter-select" aria-label="Lọc danh mục" value={categoryId ?? ''} onChange={(event) => { setCategoryId(event.target.value ? Number(event.target.value) : undefined); setPage(1) }}><option value="">Tất cả danh mục</option>{categories.data?.items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <select className="form-select filter-select" aria-label="Lọc tồn kho" value={stockFilter} onChange={(event) => { setStockFilter(event.target.value); setPage(1) }}><option value="">Tất cả tồn kho</option><option value="true">Còn hàng</option><option value="false">Hết hàng</option></select>
          </div>
          {query.isLoading ? <PageLoading /> : query.error ? <ApiErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.items.length ? <EmptyState /> : <>
            <div className="table-responsive"><table className="data-table"><thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Giá bán</th><th>Tồn kho</th><th className="text-right">Thao tác</th></tr></thead><tbody>
              {query.data.items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small className="table-subtitle">{item.description || 'Không có mô tả'}</small></td><td>{item.categoryName || '—'}</td><td>{formatCurrency(item.price)}</td><td><span className={`badge ${item.stock > 0 ? 'badge-success' : 'badge-danger'}`}>{item.stock > 0 ? `${item.stock} sản phẩm` : 'Hết hàng'}</span></td><td className="text-right table-actions">
                <button aria-label={`Sửa ${item.name}`} className="icon-button text-primary" type="button" onClick={() => setEditing(item)}><Icon name="edit" size={18} /></button>
                <button aria-label={`Xóa ${item.name}`} className="icon-button text-danger" type="button" onClick={() => setDeleting(item)}><Icon name="trash" size={18} /></button>
              </td></tr>)}
            </tbody></table></div>
            <PaginationBar page={page} pageSize={pageSize} totalCount={query.data.totalCount} totalPages={query.data.totalPages} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} />
          </>}
        </LoadingOverlay>
      </div></section>
      <ProductFormModal visible={editing !== undefined} product={editing ?? null} onClose={() => setEditing(undefined)} />
      <ConfirmDialog visible={Boolean(deleting)} title="Xóa sản phẩm" message={`Bạn chắc chắn muốn xóa “${deleting?.name ?? ''}”? Thao tác này không thể hoàn tác.`} busy={deleteState.isLoading} onCancel={() => setDeleting(null)} onConfirm={() => void confirmDelete()} />
    </>
  )
}
