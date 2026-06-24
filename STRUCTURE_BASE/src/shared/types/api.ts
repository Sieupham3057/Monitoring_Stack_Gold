export interface PagedResult<T> {
  items: T[]
  totalCount: number
  pageNumber: number
  pageSize: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export interface PageQuery {
  PageNumber: number
  PageSize: number
  Search?: string
  SortBy?: string
  SortDirection?: 'asc' | 'desc'
}

export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string[]>
  traceId?: string
}

export type ApiError = {
  status?: number | string
  title: string
  message: string
  fieldErrors: Record<string, string>
  traceId?: string
}
