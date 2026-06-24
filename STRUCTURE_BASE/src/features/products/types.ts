import type { PageQuery } from '@/shared/types/api'

export interface Product {
  id: number
  name: string
  description: string | null
  price: number
  stock: number
  categoryId: number
  categoryName: string | null
}

export interface ProductRequest {
  name: string
  description?: string | null
  price: number
  stock: number
  categoryId: number
}

export interface ProductQuery extends PageQuery {
  CategoryId?: number
  MinPrice?: number
  MaxPrice?: number
  InStock?: boolean
  SortBy?: 'id' | 'name' | 'price' | 'stock'
}
