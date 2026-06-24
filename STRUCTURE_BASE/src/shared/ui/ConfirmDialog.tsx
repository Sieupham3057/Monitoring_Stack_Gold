import { Modal } from './Modal'

interface ConfirmDialogProps {
  visible: boolean
  title?: string
  message: string
  busy?: boolean
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  visible,
  title = 'Xác nhận thao tác',
  message,
  busy = false,
  confirmLabel = 'Xác nhận',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      visible={visible}
      title={title}
      onClose={onCancel}
      footer={
        <>
        <button className="button button-secondary" disabled={busy} type="button" onClick={onCancel}>
          Hủy
        </button>
        <button className="button button-danger" disabled={busy} type="button" onClick={onConfirm}>
          {busy ? 'Đang xử lý…' : confirmLabel}
        </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  )
}
