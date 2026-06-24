import { useGetCategoriesQuery } from '@/features/categories/categoryApi'
import { useGetOrdersQuery } from '@/features/orders/orderApi'
import { useGetProductsQuery } from '@/features/products/productApi'
import { Icon } from '@/shared/ui/Icon'
import { LoadingOverlay } from '@/shared/ui/Loading'
import { PageHeader } from '@/shared/ui/PageHeader'
import { formatCurrency, formatDateTime } from '@/shared/utils/format'

export default function DashboardPage() {
  const products = useGetProductsQuery({ PageNumber: 1, PageSize: 5, SortBy: 'id', SortDirection: 'desc' })
  const categories = useGetCategoriesQuery({ PageNumber: 1, PageSize: 5 })
  const orders = useGetOrdersQuery({ PageNumber: 1, PageSize: 5, SortBy: 'createdAt', SortDirection: 'desc' })
  const cards = [
    { label: 'Sản phẩm', value: products.data?.totalCount, icon: 'products', color: 'primary' },
    { label: 'Danh mục', value: categories.data?.totalCount, icon: 'categories', color: 'info' },
    { label: 'Đơn hàng', value: orders.data?.totalCount, icon: 'orders', color: 'success' },
  ] as const

  return (
    <LoadingOverlay visible={products.isFetching || categories.isFetching || orders.isFetching} label="Đang tải tổng quan…" page>
      <PageHeader title="Tổng quan" description="Một lát cắt nhanh về dữ liệu đang vận hành." />
      <div className="stats-grid">
        {cards.map((card) => (
          <article className={`stat-card stat-${card.color}`} key={card.label}>
            <div><span>{card.label}</span><strong>{card.value?.toLocaleString('vi-VN') ?? '—'}</strong></div>
            <Icon name={card.icon} size={42} />
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card"><div className="card-header"><h2>Đơn hàng gần đây</h2></div><div className="card-body">
          <div className="activity-list">
            {orders.data?.items.map((order) => <div className="activity-item" key={order.id}><div><strong>Đơn hàng #{order.id}</strong><span>{formatDateTime(order.createdAt)}</span></div><strong>{formatCurrency(order.totalAmount)}</strong></div>)}
            {!orders.isLoading && !orders.data?.items.length && <p>Chưa có đơn hàng.</p>}
          </div>
        </div></section>
        <section className="card"><div className="card-header"><h2>Sản phẩm mới</h2></div><div className="card-body">
          <div className="activity-list">{products.data?.items.map((product) => <div className="activity-item" key={product.id}><div><strong>{product.name}</strong><span>{product.categoryName || 'Chưa phân loại'}</span></div><span>{product.stock} tồn kho</span></div>)}</div>
        </div></section>
      </div>
    </LoadingOverlay>
  )
}
