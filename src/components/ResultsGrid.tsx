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
}

/** Cuadrícula plana, para el modo "sin agrupar". */
export function ResultsGrid({
  index,
  docIds,
  lang,
  onToggleType,
  activeTypes,
  matches,
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
          onToggleType={onToggleType}
        />
      ))}
    </div>
  )
}
