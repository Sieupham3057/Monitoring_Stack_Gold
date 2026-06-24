import { normalizeApiError } from '@/shared/api/error'

interface ApiErrorStateProps {
  error: unknown
  onRetry?: () => void
}

export function ApiErrorState({ error, onRetry }: ApiErrorStateProps) {
  const normalized = normalizeApiError(error)

  return (
    <div className="alert alert-danger alert-row" role="alert">
      <div>
        <strong>{normalized.title}</strong>
        <div>{normalized.message}</div>
        {normalized.traceId && <small>Mã tra cứu: {normalized.traceId}</small>}
      </div>
      {onRetry && (
        <button className="button button-danger-outline" type="button" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  )
}
