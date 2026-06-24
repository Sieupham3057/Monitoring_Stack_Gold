type IconName =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'orders'
  | 'menu'
  | 'logout'
  | 'plus'
  | 'search'
  | 'edit'
  | 'trash'
  | 'inbox'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'

const paths: Record<IconName, string> = {
  dashboard: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  products: 'M4 7h16l-1.5 13h-13L4 7Zm4-3h8l2 3H6l2-3Zm1 7v5m6-5v5',
  categories: 'M3 5h8l2 2h8v12H3V5Zm4 6h10m-10 4h7',
  orders: 'M3 4h2l2.2 10.5h10.7L20 8H7m2 10a1.5 1.5 0 1 0 0 .01M17 18a1.5 1.5 0 1 0 0 .01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  logout: 'M10 5H5v14h5m4-3 4-4-4-4m4 4H9',
  plus: 'M12 5v14M5 12h14',
  search: 'm20 20-4.5-4.5m2.5-5A7.5 7.5 0 1 1 3 10.5a7.5 7.5 0 0 1 15 0Z',
  edit: 'm4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Zm9.5-13.5L17 10',
  trash: 'M5 7h14m-9-3h4l1 3H9l1-3Zm-3 3 1 13h8l1-13M10 11v5m4-5v5',
  inbox: 'M4 5h16l2 10v4H2v-4L4 5Zm-2 10h6l2 2h4l2-2h6',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  close: 'M6 6l12 12M18 6 6 18',
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d={paths[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  )
}
