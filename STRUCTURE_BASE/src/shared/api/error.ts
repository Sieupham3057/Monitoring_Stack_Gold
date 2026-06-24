import type { ApiError, ProblemDetails } from '@/shared/types/api'

const statusMessages: Record<number, string> = {
  400: 'Dữ liệu gửi lên không hợp lệ.',
  401: 'Phiên đăng nhập đã hết hạn.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu yêu cầu.',
  409: 'Dữ liệu đã tồn tại hoặc đang bị xung đột.',
  422: 'Không thể xử lý dữ liệu đã nhập.',
  429: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
  500: 'Máy chủ gặp sự cố. Vui lòng thử lại sau.',
  502: 'Không thể kết nối dịch vụ phía sau.',
  503: 'Dịch vụ đang tạm thời gián đoạn.',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asProblem = (value: unknown): ProblemDetails => (isRecord(value) ? value : {})

export const normalizeApiError = (error: unknown): ApiError => {
  if (!isRecord(error)) {
    return { title: 'Có lỗi xảy ra', message: 'Không thể hoàn tất thao tác.', fieldErrors: {} }
  }

  const rawStatus = error.status
  const status = typeof rawStatus === 'number' || typeof rawStatus === 'string' ? rawStatus : undefined
  const problem = asProblem(error.data)
  const numericStatus = typeof status === 'number' ? status : problem.status
  const fieldErrors = Object.fromEntries(
    Object.entries(problem.errors ?? {}).map(([key, messages]) => [
      key.charAt(0).toLowerCase() + key.slice(1),
      messages[0] ?? 'Dữ liệu không hợp lệ',
    ]),
  )

  if (status === 'FETCH_ERROR') {
    return {
      status,
      title: 'Không thể kết nối',
      message: 'Không kết nối được máy chủ. Hãy kiểm tra mạng hoặc địa chỉ API.',
      fieldErrors,
    }
  }

  if (status === 'TIMEOUT_ERROR') {
    return {
      status,
      title: 'Yêu cầu quá thời gian',
      message: 'Máy chủ phản hồi quá chậm. Vui lòng thử lại.',
      fieldErrors,
    }
  }

  return {
    status: numericStatus ?? status,
    title: problem.title || 'Có lỗi xảy ra',
    message:
      problem.detail ||
      (numericStatus ? statusMessages[numericStatus] : undefined) ||
      'Không thể hoàn tất thao tác.',
    fieldErrors,
    traceId: problem.traceId,
  }
}
