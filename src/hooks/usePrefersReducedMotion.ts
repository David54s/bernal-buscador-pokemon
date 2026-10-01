import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Si el sistema pide reducir el movimiento.
 *
 * Hace falta en JavaScript y no basta el CSS: la regla global del proyecto apaga
 * animaciones y transiciones, pero `scrollBy({ behavior: 'smooth' })` ignora
 * `scroll-behavior` del CSS y desplaza con animación de todos modos. Las flechas
 * de las filas tienen que consultarlo desde aquí.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => globalThis.matchMedia?.(QUERY).matches ?? false,
  )

  useEffect(() => {
    const media = globalThis.matchMedia?.(QUERY)
    if (!media) return
    const onChange = () => setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return reduced
}
