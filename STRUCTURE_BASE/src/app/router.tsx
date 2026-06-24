import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { APP_ROUTES } from '@/config/constants'
import { AuthGuard, GuestGuard } from '@/features/auth/AuthGuard'
import { AppLayout } from '@/layouts/AppLayout'
import { AppLoading, RouteLoading } from '@/shared/ui/Loading'
import { RouteErrorPage } from '@/shared/ui/RouteErrorPage'
import { routeModules } from './routeModules'

const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'))
const DashboardPage = lazy(routeModules.dashboard)
const ProductsPage = lazy(routeModules.products)
const CategoriesPage = lazy(routeModules.categories)
const OrdersPage = lazy(routeModules.orders)

const authSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<AppLoading />}>{element}</Suspense>
)
const pageSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<RouteLoading />}>{element}</Suspense>
)

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <GuestGuard />,
        children: [
          { path: APP_ROUTES.login, element: authSuspense(<LoginPage />) },
          { path: APP_ROUTES.register, element: authSuspense(<RegisterPage />) },
        ],
      },
      {
        element: <AuthGuard />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: APP_ROUTES.root, element: <Navigate to={APP_ROUTES.dashboard} replace /> },
              { path: APP_ROUTES.dashboard, element: pageSuspense(<DashboardPage />) },
              { path: APP_ROUTES.products, element: pageSuspense(<ProductsPage />) },
              { path: APP_ROUTES.categories, element: pageSuspense(<CategoriesPage />) },
              { path: APP_ROUTES.orders, element: pageSuspense(<OrdersPage />) },
            ],
          },
        ],
      },
      { path: '*', element: <RouteErrorPage /> },
    ],
  },
])
