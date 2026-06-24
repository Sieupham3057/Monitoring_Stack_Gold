import { baseApi } from '@/shared/api/baseApi'
import type { PagedResult } from '@/shared/types/api'
import type { CreateOrderRequest, Order, OrderQuery } from './types'

export const orderApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getOrders: builder.query<PagedResult<Order>, OrderQuery>({
      query: (params) => ({ url: '/api/Orders', params }),
      providesTags: (result) =>
        result
          ? [
              ...result.items.map(({ id }) => ({ type: 'Order' as const, id })),
              { type: 'Order', id: 'LIST' },
            ]
          : [{ type: 'Order', id: 'LIST' }],
    }),
    getOrder: builder.query<Order, number>({
      query: (id) => `/api/Orders/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Order', id }],
    }),
    createOrder: builder.mutation<Order, CreateOrderRequest>({
      query: (body) => ({ url: '/api/Orders', method: 'POST', body }),
      invalidatesTags: [
        { type: 'Order', id: 'LIST' },
        { type: 'Product', id: 'LIST' },
      ],
    }),
  }),
})

export const { useGetOrdersQuery, useLazyGetOrderQuery, useCreateOrderMutation } = orderApi
