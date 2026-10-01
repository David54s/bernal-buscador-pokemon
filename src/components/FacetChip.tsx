interface FacetChipProps {
  label: string
  count: number
  active: boolean
  color?: string
  onToggle: () => void
}

/**
 * Un chip de faceta con su conteo.
 *
 * Con conteo 0 se deshabilita en lugar de desaparecer: si los chips se ocultaran,
 * el panel cambiaría de tamaño en cada tecla y sería imposible apuntar a uno. Un
 * chip ya marcado nunca se deshabilita, para poder desmarcarlo siempre.
 */
export function FacetChip({ label, count, active, color, onToggle }: FacetChipProps) {
  const disabled = count === 0 && !active

  return (
    <button
      aria-pressed={active}
      className={`chip${active ? ' chip--active' : ''}`}
      disabled={disabled}
      onClick={onToggle}
      style={active && color ? { backgroundColor: color, borderColor: color } : undefined}
      type="button"
    >
      <span className="chip__label">{label}</span>
      <span className="chip__count">{count}</span>
    </button>
  )
}
