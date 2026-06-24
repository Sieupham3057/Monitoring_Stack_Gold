import type { ReactNode } from 'react'

export function PageLoading() {
  return (
    <div className="data-loading" aria-label="Đang tải dữ liệu" aria-busy="true">
      {Array.from({ length: 7 }).map((_, index) => (
        <div className="data-loading-row" key={index}>
          <span className={`skeleton skeleton-${index % 2 === 0 ? 'wide' : 'medium'}`} />
          <span className="skeleton skeleton-short" />
          <span className="skeleton skeleton-short" />
        </div>
      ))}
    </div>
  )
}

export function RouteLoading() {
  return (
    <div className="route-loading" aria-label="Đang mở trang" aria-busy="true">
      <div className="route-loading-header">
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-medium" />
      </div>
      <div className="card">
        <div className="card-body">
          <PageLoading />
        </div>
      </div>
    </div>
  )
}

export function AppLoading() {
  return (
    <div className="app-loading">
      <span className="spinner" />
      <span>Đang tải ứng dụng…</span>
    </div>
  )
}

interface LoadingOverlayProps {
  visible: boolean
  label?: string
  children?: ReactNode
  page?: boolean
}

export function LoadingOverlay({
  visible,
  label = 'Đang tải dữ liệu…',
  children,
  page = false,
}: LoadingOverlayProps) {
  return (
    <div className={page ? 'loading-container loading-container-page' : 'loading-container'}>
      {children}
      {visible && (
        <div className="loading-overlay" role="status" aria-live="polite" aria-label={label}>
          <div className="loading-overlay-content">
            <span className="spinner spinner-small" />
            <span>{label}</span>
          </div>
        </div>
      )}
    </div>
  )
}
