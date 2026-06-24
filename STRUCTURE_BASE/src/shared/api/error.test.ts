import { describe, expect, it } from 'vitest'
import { normalizeApiError } from './error'

describe('normalizeApiError', () => {
  it('maps RFC 7807 validation errors to form fields', () => {
    const result = normalizeApiError({
      status: 400,
      data: {
        title: 'Validation failed',
        errors: { Name: ['Tên không hợp lệ'], Price: ['Giá phải lớn hơn 0'] },
      },
    })
    expect(result.fieldErrors).toEqual({
      name: 'Tên không hợp lệ',
      price: 'Giá phải lớn hơn 0',
    })
  })

  it('returns a friendly network error', () => {
    expect(normalizeApiError({ status: 'FETCH_ERROR' }).title).toBe('Không thể kết nối')
  })
})
