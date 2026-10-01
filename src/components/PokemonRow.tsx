import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ROW_PAGE_SIZE } from '../constants.ts'
import { groupLabel, t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'
import type { Group, PokedexIndex } from '../lib/index-types.ts'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.ts'
import { PokemonCard } from './PokemonCard.tsx'

interface PokemonRowProps {
  index: PokedexIndex
  group: Group
  lang: Lang
  onToggleType: (typeId: number) => void
  activeTypes: ReadonlySet<number>
  /** Abre este grupo completo en la cuadrícula plana. */
  onSeeRest: (group: Group) => void
  /** `docId -> términos`, solo cuando los resultados vienen de una descripción. */
  matches?: ReadonlyMap<number, readonly string[]> | null
}

/** Cuánto desplaza cada flecha: algo menos de una pantalla, para no perder el hilo. */
const SCROLL_FRACTION = 0.8

/**
 * Una fila horizontal de resultados, al estilo de Netflix.
 *
 * El estado de desplazamiento se queda AQUÍ, no en `App`: si subiera, cada
 * desplazamiento horizontal volvería a renderizar todas las filas.
 */
export function PokemonRow({
  index,
  group,
  lang,
  onToggleType,
  activeTypes,
  onSeeRest,
  matches,
}: PokemonRowProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const headingId = useId()

  const shown = group.docIds.slice(0, ROW_PAGE_SIZE)
  const rest = group.docIds.length - shown.length

  const refresh = useCallback(() => {
    const track = trackRef.current
    if (track === null) return
    setCanLeft(track.scrollLeft > 1)
    setCanRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (track === null) return

    // El evento de scroll se dispara muy seguido: se agrupa en un frame para no
    // provocar un render por cada píxel.
    let frame = 0
    const onScroll = () => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        refresh()
      })
    }

    track.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(refresh)
    observer.observe(track)
    refresh()

    return () => {
      track.removeEventListener('scroll', onScroll)
      observer.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [refresh, group.docIds])

  const scrollBy = useCallback(
    (direction: -1 | 1) => {
      const track = trackRef.current
      if (track === null) return
      track.scrollBy({
        left: direction * track.clientWidth * SCROLL_FRACTION,
        // `behavior: 'smooth'` ignora el `scroll-behavior` del CSS, así que
        // respetar la preferencia del sistema hay que hacerlo aquí.
        behavior: reducedMotion ? 'auto' : 'smooth',
      })
    },
    [reducedMotion],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Solo cuando el foco está en la pista misma. Si está en una tarjeta, las
      // flechas son suyas y el navegador ya desplaza al mover el foco.
      if (event.target !== event.currentTarget) return
      const track = trackRef.current
      if (track === null) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        scrollBy(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        scrollBy(-1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        track.scrollTo({ left: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
      } else if (event.key === 'End') {
        event.preventDefault()
        track.scrollTo({ left: track.scrollWidth, behavior: reducedMotion ? 'auto' : 'smooth' })
      }
    },
    [reducedMotion, scrollBy],
  )

  return (
    <section aria-labelledby={headingId} className="row">
      <div className="row__head">
        <h2 className="row__title" id={headingId}>
          {groupLabel(index, group.key, lang)}
        </h2>
        <span className="row__count">{group.docIds.length}</span>

        <div className="row__arrows">
          <button
            aria-label={t(lang, 'scrollLeft')}
            className="row__arrow"
            disabled={!canLeft}
            onClick={() => scrollBy(-1)}
            type="button"
          >
            ‹
          </button>
          <button
            aria-label={t(lang, 'scrollRight')}
            className="row__arrow"
            disabled={!canRight}
            onClick={() => scrollBy(1)}
            type="button"
          >
            ›
          </button>
        </div>
      </div>

      {/* `tabIndex` explícito: Chrome hace enfocables los contenedores con
          desplazamiento por su cuenta, pero Firefox y Safari no, y sin él no hay
          forma de recorrer la fila con el teclado. */}
      <div
        aria-labelledby={headingId}
        className="row__track"
        onKeyDown={onKeyDown}
        ref={trackRef}
        role="group"
        tabIndex={0}
      >
        {shown.map((docId) => (
          <PokemonCard
            activeTypes={activeTypes}
            docId={docId}
            index={index}
            key={docId}
            lang={lang}
            matchedTerms={matches?.get(docId)}
            onToggleType={onToggleType}
          />
        ))}

        {rest > 0 && (
          <button className="card card--more" onClick={() => onSeeRest(group)} type="button">
            <span className="card--more__count">+{rest}</span>
            <span className="card--more__label">{t(lang, 'loadMore')}</span>
          </button>
        )}
      </div>
    </section>
  )
}
