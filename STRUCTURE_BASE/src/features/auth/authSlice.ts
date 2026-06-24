import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { STORAGE_KEYS } from '@/config/constants'
import { safeStorage } from '@/shared/utils/storage'
import type { AuthResponse, AuthState } from './types'

const storedSession = safeStorage.get<AuthResponse>(STORAGE_KEYS.auth)
const isValidSession = storedSession && new Date(storedSession.expiresAt).getTime() > Date.now()

const initialState: AuthState = {
  session: isValidSession ? storedSession : null,
}

if (!isValidSession) safeStorage.remove(STORAGE_KEYS.auth)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession(state, action: PayloadAction<AuthResponse>) {
      state.session = action.payload
      safeStorage.set(STORAGE_KEYS.auth, action.payload)
    },
    clearSession(state) {
      state.session = null
      safeStorage.remove(STORAGE_KEYS.auth)
    },
  },
})

export const { setSession, clearSession } = authSlice.actions
export const authReducer = authSlice.reducer
