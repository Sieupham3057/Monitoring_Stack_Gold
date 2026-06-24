import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

interface ModalProps {
  visible: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'normal' | 'large'
  onClose: () => void
}

export function Modal({ visible, title, children, footer, size = 'normal', onClose }: ModalProps) {
  useEffect(() => {
    if (!visible) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.body.classList.remove('modal-open')
    }
  }, [onClose, visible])

  if (!visible) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="modal-title"
        aria-modal="true"
        className={`modal-panel modal-${size}`}
        role="dialog"
      >
        <header className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button aria-label="Đóng" className="icon-button" type="button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>
  )
}
