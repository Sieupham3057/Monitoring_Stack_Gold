import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { APP_ROUTES } from '@/config/constants'
import { clearSession } from './authSlice'

export function AuthGuard() {
  const dispatch = useAppDispatch()
  const session = useAppSelector((state) => state.auth.session)
  const location = useLocation()

  useEffect(() => {
    if (!session) return
    const remaining = new Date(session.expiresAt).getTime() - Date.now()
    if (remaining <= 0) {
      dispatch(clearSession())
      return
    }
    const timeout = window.setTimeout(() => dispatch(clearSession()), remaining)
    return () => window.clearTimeout(timeout)
  }, [dispatch, session])

  if (!session) {
    return <Navigate to={APP_ROUTES.login} replace state={{ from: location }} />
  }

  return <Outlet />
}

export function GuestGuard() {
  const session = useAppSelector((state) => state.auth.session)
  return session ? <Navigate to={APP_ROUTES.dashboard} replace /> : <Outlet />
}
