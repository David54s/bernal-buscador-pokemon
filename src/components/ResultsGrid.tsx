import type { Rating } from '../constants.ts'
import type { Lang } from '../i18n/strings.ts'
import type { PokedexIndex } from '../lib/index-types.ts'
import { PokemonCard } from './PokemonCard.tsx'

interface ResultsGridProps {
  index: PokedexIndex
  docIds: readonly number[]
  lang: Lang
  onToggleType: (typeId: number) => void
  activeTypes: ReadonlySet<number>
  /** `docId -> términos`, solo cuando los resultados vienen de una descripción. */
  matches?: ReadonlyMap<number, readonly string[]> | null
  /** Valoraciones y cómo cambiarlas; opcionales, igual que en la tarjeta. */
  ratings?: ReadonlyMap<number, Rating> | undefined
  onRate?: ((pokeId: number, rating: Rating) => void) | undefined
}

/** Cuadrícula plana, para el modo "sin agrupar". */
export function ResultsGrid({
  index,
  docIds,
  lang,
  onToggleType,
  activeTypes,
  matches,
  ratings,
  onRate,
}: ResultsGridProps) {
  return (
    <div className="grid">
      {docIds.map((docId) => (
        <PokemonCard
          activeTypes={activeTypes}
          docId={docId}
          index={index}
          key={docId}
          lang={lang}
          matchedTerms={matches?.get(docId)}
          onRate={onRate}
          onToggleType={onToggleType}
          rating={ratings?.get(index.docs[docId]?.pokeId ?? -1)}
        />
      ))}
    </div>
  )
}
