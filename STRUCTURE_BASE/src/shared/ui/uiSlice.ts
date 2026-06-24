import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit'

export type ToastColor = 'success' | 'danger' | 'warning' | 'info'
export interface ToastMessage {
  id: string
  color: ToastColor
  title: string
  message?: string
}

interface UiState {
  sidebarVisible: boolean
  sidebarUnfoldable: boolean
  navigationPending: boolean
  toasts: ToastMessage[]
}

const initialState: UiState = {
  sidebarVisible: true,
  sidebarUnfoldable: false,
  navigationPending: false,
  toasts: [],
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarVisible = !state.sidebarVisible
    },
    setSidebarVisible(state, action: PayloadAction<boolean>) {
      state.sidebarVisible = action.payload
    },
    toggleSidebarUnfoldable(state) {
      state.sidebarUnfoldable = !state.sidebarUnfoldable
    },
    startNavigation(state) {
      state.navigationPending = true
    },
    finishNavigation(state) {
      state.navigationPending = false
    },
    showToast: {
      reducer(state, action: PayloadAction<ToastMessage>) {
        state.toasts.push(action.payload)
      },
      prepare(payload: Omit<ToastMessage, 'id'>) {
        return { payload: { ...payload, id: nanoid() } }
      },
    },
    removeToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload)
    },
  },
})

export const {
  toggleSidebar,
  setSidebarVisible,
  toggleSidebarUnfoldable,
  startNavigation,
  finishNavigation,
  showToast,
  removeToast,
} = uiSlice.actions
export const uiReducer = uiSlice.reducer
