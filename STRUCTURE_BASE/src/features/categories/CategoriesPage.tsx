import { useState } from 'react'
import { useAppDispatch } from '@/app/hooks'
import { PAGINATION } from '@/config/constants'
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
import { CategoryFormModal } from './CategoryFormModal'
import { useDeleteCategoryMutation, useGetCategoriesQuery } from './categoryApi'
import type { Category } from './types'

export default function CategoriesPage() {
  const dispatch = useAppDispatch()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState<number>(PAGINATION.defaultPage)
  const [pageSize, setPageSize] = useState<number>(PAGINATION.defaultPageSize)
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const query = useGetCategoriesQuery({ PageNumber: page, PageSize: pageSize, Search: debouncedSearch || undefined, SortBy: 'name', SortDirection: 'asc' })
  const [deleteCategory, deleteState] = useDeleteCategoryMutation()

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deleteCategory(deleting.id).unwrap()
      dispatch(showToast({ color: 'success', title: 'Đã xóa danh mục' }))
      setDeleting(null)
    } catch (error) {
      dispatch(showToast({ color: 'danger', title: 'Không thể xóa danh mục', message: normalizeApiError(error).message }))
    }
  }

  return (
    <>
      <PageHeader title="Danh mục" description="Quản lý nhóm sản phẩm và số lượng sản phẩm liên quan." actions={
        <button className="button button-primary" type="button" onClick={() => setEditing(null)}><Icon name="plus" size={18} /> Thêm danh mục</button>
      } />
      <section className="card"><div className="card-body">
        <LoadingOverlay visible={query.isFetching} label="Đang tải danh mục…">
          <div className="toolbar"><div className="input-icon"><Icon name="search" size={18} /><input className="form-control" aria-label="Tìm danh mục" placeholder="Tìm theo tên…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></div></div>
          {query.isLoading ? <PageLoading /> : query.error ? <ApiErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.items.length ? <EmptyState /> : <>
            <div className="table-responsive"><table className="data-table"><thead><tr><th>Tên</th><th>Mô tả</th><th>Sản phẩm</th><th className="text-right">Thao tác</th></tr></thead><tbody>
              {query.data.items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.description || '—'}</td><td>{item.productCount}</td><td className="text-right table-actions">
                <button aria-label={`Sửa ${item.name}`} className="icon-button text-primary" type="button" onClick={() => setEditing(item)}><Icon name="edit" size={18} /></button>
                <button aria-label={`Xóa ${item.name}`} className="icon-button text-danger" type="button" onClick={() => setDeleting(item)}><Icon name="trash" size={18} /></button>
              </td></tr>)}
            </tbody></table></div>
            <PaginationBar page={page} pageSize={pageSize} totalCount={query.data.totalCount} totalPages={query.data.totalPages} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} />
          </>}
        </LoadingOverlay>
      </div></section>
      <CategoryFormModal visible={editing !== undefined} category={editing ?? null} onClose={() => setEditing(undefined)} />
      <ConfirmDialog visible={Boolean(deleting)} title="Xóa danh mục" message={`Bạn chắc chắn muốn xóa “${deleting?.name ?? ''}”? Thao tác này không thể hoàn tác.`} busy={deleteState.isLoading} onCancel={() => setDeleting(null)} onConfirm={() => void confirmDelete()} />
    </>
  )
}
