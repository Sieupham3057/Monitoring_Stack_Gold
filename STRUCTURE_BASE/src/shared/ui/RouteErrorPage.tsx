import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { APP_ROUTES } from '@/config/constants'

export function RouteErrorPage() {
  const error = useRouteError()
  const status = isRouteErrorResponse(error) ? error.status : 500
  const message =
    status === 404 ? 'Trang bạn tìm kiếm không tồn tại.' : 'Ứng dụng gặp lỗi ngoài dự kiến.'

  return (
    <main className="error-page">
      <div className="error-code">{status}</div>
      <h1>Ôi, có gì đó chưa ổn.</h1>
      <p>{message}</p>
      <a className="button button-primary" href={APP_ROUTES.dashboard}>
        Về trang tổng quan
      </a>
    </main>
  )
}
