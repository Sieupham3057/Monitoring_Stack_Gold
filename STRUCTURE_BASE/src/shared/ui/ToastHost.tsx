import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Icon } from './Icon'
import { removeToast, type ToastMessage } from './uiSlice'

function Toast({ toast }: { toast: ToastMessage }) {
  const dispatch = useAppDispatch()
  useEffect(() => {
    const timeout = window.setTimeout(() => dispatch(removeToast(toast.id)), 4500)
    return () => window.clearTimeout(timeout)
  }, [dispatch, toast.id])

  return (
    <article className={`toast toast-${toast.color}`} role="status">
      <div>
        <strong>{toast.title}</strong>
        {toast.message && <p>{toast.message}</p>}
      </div>
      <button aria-label="Đóng thông báo" className="toast-close" type="button" onClick={() => dispatch(removeToast(toast.id))}>
        <Icon name="close" size={17} />
      </button>
    </article>
  )
}

export function ToastHost() {
  const toasts = useAppSelector((state) => state.ui.toasts)
  return <div className="toast-host">{toasts.map((toast) => <Toast key={toast.id} toast={toast} />)}</div>
}
