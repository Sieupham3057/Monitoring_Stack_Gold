import { Icon } from './Icon'

export function EmptyState({ message = 'Chưa có dữ liệu phù hợp.' }: { message?: string }) {
  return (
    <div className="empty-state">
      <Icon name="inbox" size={48} />
      <p>{message}</p>
    </div>
  )
}
