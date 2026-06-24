import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { preloadAppRoutes, preloadRoute, type AppRouteModule } from '@/app/routeModules'
import { APP_ROUTES } from '@/config/constants'
import { env } from '@/config/env'
import { clearSession } from '@/features/auth/authSlice'
import { baseApi } from '@/shared/api/baseApi'
import { Icon } from '@/shared/ui/Icon'
import { LoadingOverlay } from '@/shared/ui/Loading'
import { ToastHost } from '@/shared/ui/ToastHost'
import {
  finishNavigation,
  setSidebarVisible,
  startNavigation,
  toggleSidebar,
  toggleSidebarUnfoldable,
} from '@/shared/ui/uiSlice'

const navItems = [
  { to: APP_ROUTES.dashboard, label: 'Tổng quan', icon: 'dashboard', module: 'dashboard' },
  { to: APP_ROUTES.products, label: 'Sản phẩm', icon: 'products', module: 'products' },
  { to: APP_ROUTES.categories, label: 'Danh mục', icon: 'categories', module: 'categories' },
  { to: APP_ROUTES.orders, label: 'Đơn hàng', icon: 'orders', module: 'orders' },
] satisfies Array<{
  to: string
  label: string
  icon: 'dashboard' | 'products' | 'categories' | 'orders'
  module: AppRouteModule
}>

export function AppLayout() {
  const dispatch = useAppDispatch()
  const location = useLocation()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const visible = useAppSelector((state) => state.ui.sidebarVisible)
  const collapsed = useAppSelector((state) => state.ui.sidebarUnfoldable)
  const navigationPending = useAppSelector((state) => state.ui.navigationPending)
  const username = useAppSelector((state) => state.auth.session?.username)
  const currentPage = navItems.find((item) => location.pathname.startsWith(item.to))

  useEffect(() => {
    const timeout = window.setTimeout(preloadAppRoutes, 400)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!navigationPending) return
    const timeout = window.setTimeout(() => dispatch(finishNavigation()), 500)
    return () => window.clearTimeout(timeout)
  }, [dispatch, location.pathname, navigationPending])

  const logout = () => {
    dispatch(clearSession())
    dispatch(baseApi.util.resetApiState())
    void navigate(APP_ROUTES.login, { replace: true })
  }

  return (
    <div className={`admin-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${visible ? 'sidebar-visible' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">S</span>
          <span className="brand-name">{env.appName}</span>
          <button aria-label="Đóng menu" className="sidebar-mobile-close" type="button" onClick={() => dispatch(setSidebarVisible(false))}>
            <Icon name="close" />
          </button>
        </div>
        <hr className="sidebar-divider" />
        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              onFocus={() => preloadRoute(item.module)}
              onMouseEnter={() => preloadRoute(item.module)}
              onClick={() => {
                if (location.pathname !== item.to) dispatch(startNavigation())
                if (window.innerWidth < 992) dispatch(setSidebarVisible(false))
              }}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          className="sidebar-collapse"
          type="button"
          onClick={() => dispatch(toggleSidebarUnfoldable())}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} />
        </button>
      </aside>
      {visible && <button aria-label="Đóng menu" className="sidebar-backdrop" type="button" onClick={() => dispatch(setSidebarVisible(false))} />}

      <div className="admin-wrapper">
        <header className="topbar">
          <button aria-label="Ẩn hoặc hiện menu" className="topbar-menu" type="button" onClick={() => dispatch(toggleSidebar())}>
            <Icon name="menu" />
          </button>
          <div className="user-menu">
            <button className="user-menu-trigger" type="button" onClick={() => setUserMenuOpen((value) => !value)}>
              <span className="user-avatar">{username?.charAt(0).toUpperCase()}</span>
              <span className="user-name">{username}</span>
            </button>
            {userMenuOpen && (
              <div className="user-dropdown">
                <span className="dropdown-label">Tài khoản</span>
                <button type="button" onClick={logout}>
                  <Icon name="logout" size={18} /> Đăng xuất
                </button>
              </div>
            )}
          </div>
        </header>
        <div className="breadcrumb-bar">
          <NavLink to={APP_ROUTES.dashboard}>Trang chủ</NavLink>
          {currentPage && currentPage.to !== APP_ROUTES.dashboard && <><span>/</span><strong>{currentPage.label}</strong></>}
        </div>
        <main className="admin-content">
          <LoadingOverlay visible={navigationPending} label="Đang chuyển trang…" page>
            <Outlet />
          </LoadingOverlay>
        </main>
        <footer className="admin-footer"><span>{env.appName}</span><span>React + TypeScript + RTK Query</span></footer>
      </div>
      <ToastHost />
    </div>
  )
}
