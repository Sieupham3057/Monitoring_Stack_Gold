import type { PageQuery } from '@/shared/types/api'

export interface OrderItem {
  productId: number
  productName: string | null
  quantity: number
  unitPrice: number
}

export interface Order {
  id: number
  totalAmount: number
  status: string | null
  createdAt: string
  items: OrderItem[]
}

export interface CreateOrderRequest {
  items: Array<{ productId: number; quantity: number }>
}

export interface OrderQuery extends PageQuery {
  Status?: number
  FromDate?: string
  ToDate?: string
  SortBy?: 'id' | 'totalAmount' | 'status' | 'createdAt'
}
