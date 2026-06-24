import { baseApi } from '@/shared/api/baseApi'
import type { AuthResponse, LoginRequest, RegisterRequest } from './types'

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<AuthResponse, LoginRequest>({
      query: (body) => ({ url: '/api/Auth/login', method: 'POST', body }),
    }),
    register: builder.mutation<AuthResponse, RegisterRequest>({
      query: (body) => ({ url: '/api/Auth/register', method: 'POST', body }),
    }),
  }),
})

export const { useLoginMutation, useRegisterMutation } = authApi
