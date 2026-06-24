import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { normalizeApiError } from '@/shared/api/error'

export function applyApiFormErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
) {
  const normalized = normalizeApiError(error)
  Object.entries(normalized.fieldErrors).forEach(([field, message]) => {
    setError(field as Path<T>, { type: 'server', message })
  })
  return normalized
}
