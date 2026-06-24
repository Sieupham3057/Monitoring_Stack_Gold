import type { PageQuery } from '@/shared/types/api'

export interface Category {
  id: number
  name: string
  description: string | null
  productCount: number
}

export interface CategoryRequest {
  name: string
  description?: string | null
}

export interface CategoryQuery extends PageQuery {
  SortBy?: 'id' | 'name' | 'productCount'
}
