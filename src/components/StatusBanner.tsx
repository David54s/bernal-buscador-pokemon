interface StatusBannerProps {
  title: string
  message: string
  /** Si se pasa, se dibuja un botón de acción (por ejemplo "Reintentar"). */
  actionLabel?: string
  onAction?: () => void
}

/** Aviso a pantalla completa para los estados de carga, error y sin resultados. */
export function StatusBanner({ title, message, actionLabel, onAction }: StatusBannerProps) {
  return (
    <div className="status" role="status">
      <p className="status__title">{title}</p>
      <p className="status__message">{message}</p>
      {actionLabel && onAction && (
        <button className="status__action" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
