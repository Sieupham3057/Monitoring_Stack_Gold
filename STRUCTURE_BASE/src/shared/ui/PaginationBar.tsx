import { PAGINATION } from '@/config/constants'
import { Icon } from './Icon'

interface PaginationBarProps {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function PaginationBar({
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  if (totalCount === 0) return null
  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4))
    return start + index
  }).filter((value) => value <= totalPages)

  return (
    <div className="pagination-bar">
      <span>{totalCount.toLocaleString('vi-VN')} bản ghi</span>
      <div>
        <select
          aria-label="Số bản ghi mỗi trang"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="form-select page-size-select"
        >
          {PAGINATION.pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size} / trang
            </option>
          ))}
        </select>
        <nav className="pagination" aria-label="Phân trang">
          <button disabled={page <= 1} type="button" onClick={() => onPageChange(page - 1)}>
            <Icon name="chevron-left" size={16} />
          </button>
          {pages.map((item) => (
            <button className={item === page ? 'active' : ''} key={item} type="button" onClick={() => onPageChange(item)}>
              {item}
            </button>
          ))}
          <button
            disabled={page >= totalPages}
            type="button"
            onClick={() => onPageChange(page + 1)}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </nav>
      </div>
    </div>
  )
}
