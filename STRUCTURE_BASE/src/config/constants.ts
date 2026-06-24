export const APP_ROUTES = {
  root: '/',
  login: '/login',
  register: '/register',
  dashboard: '/dashboard',
  products: '/products',
  categories: '/categories',
  orders: '/orders',
} as const

export const STORAGE_KEYS = {
  auth: 'shop-admin.auth',
  theme: 'shop-admin.theme',
} as const

export const PAGINATION = {
  defaultPage: 1,
  defaultPageSize: 10,
  pageSizeOptions: [10, 20, 50, 100],
} as const

export const ORDER_STATUS = {
  0: 'Mới tạo',
  1: 'Đã xác nhận',
  2: 'Đang giao',
  3: 'Hoàn thành',
  4: 'Đã hủy',
} as const
