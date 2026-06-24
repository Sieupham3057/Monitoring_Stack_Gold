import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react'
import { clearSession } from '@/features/auth/authSlice'
import { env } from '@/config/env'
import type { RootState } from '@/app/store'

const rawBaseQuery = fetchBaseQuery({
  baseUrl: env.apiUrl,
  timeout: env.requestTimeoutMs,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.session?.token
    if (token) headers.set('authorization', `Bearer ${token}`)
    headers.set('accept', 'application/json')
    return headers
  },
})

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions)
  if (result.error?.status === 401) api.dispatch(clearSession())
  return result
}

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  keepUnusedDataFor: 60,
  tagTypes: ['Category', 'Product', 'Order'],
  endpoints: () => ({}),
})
