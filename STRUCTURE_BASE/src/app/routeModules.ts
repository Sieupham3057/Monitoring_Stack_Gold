export const routeModules = {
  dashboard: () => import('@/features/dashboard/DashboardPage'),
  products: () => import('@/features/products/ProductsPage'),
  categories: () => import('@/features/categories/CategoriesPage'),
  orders: () => import('@/features/orders/OrdersPage'),
} as const

export type AppRouteModule = keyof typeof routeModules

export const preloadRoute = (route: AppRouteModule) => {
  void routeModules[route]()
}

export const preloadAppRoutes = () => {
  void Promise.allSettled(Object.values(routeModules).map((load) => load()))
}
