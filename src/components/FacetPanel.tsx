import { FALLBACK_TYPE_COLOR, GENERATION_COLORS, TYPE_COLORS } from '../constants.ts'
import { generationLabel, t, typeLabel } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'
import type { FacetCounts, PokedexIndex } from '../lib/index-types.ts'
import { FacetChip } from './FacetChip.tsx'

interface FacetPanelProps {
  index: PokedexIndex
  counts: FacetCounts
  selectedTypes: ReadonlySet<number>
  selectedGens: ReadonlySet<number>
  onToggleType: (typeId: number) => void
  onToggleGen: (genId: number) => void
  onClear: () => void
  lang: Lang
}

/**
 * Los filtros facetados.
 *
 * Los conteos vienen calculados con la regla del facetado de verdad: cada faceta
 * se cuenta aplicando las DEMÁS, pero no la propia. Por eso con Fuego marcado el
 * chip de Agua sigue mostrando un número —cuántos saldrían si además marcas
 * Agua— en lugar de quedarse en cero.
 */
export function FacetPanel({
  index,
  counts,
  selectedTypes,
  selectedGens,
  onToggleType,
  onToggleGen,
  onClear,
  lang,
}: FacetPanelProps) {
  const hasFilters = selectedTypes.size > 0 || selectedGens.size > 0

  return (
    <section aria-label={t(lang, 'filters')} className="facets">
      <div className="facets__group">
        <h2 className="facets__title">{t(lang, 'typesFacet')}</h2>
        <div className="facets__chips">
          {index.types.map((type) => (
            <FacetChip
              active={selectedTypes.has(type.id)}
              color={TYPE_COLORS[type.slug] ?? FALLBACK_TYPE_COLOR}
              count={counts.types[type.id] ?? 0}
              key={type.id}
              label={typeLabel(type, lang)}
              onToggle={() => onToggleType(type.id)}
            />
          ))}
        </div>
      </div>

      <div className="facets__group">
        <h2 className="facets__title">{t(lang, 'gensFacet')}</h2>
        <div className="facets__chips">
          {index.generations.map((generation) => (
            <FacetChip
              active={selectedGens.has(generation.id)}
              color={GENERATION_COLORS[generation.id]}
              count={counts.gens[generation.id] ?? 0}
              key={generation.id}
              label={generationLabel(generation, lang)}
              onToggle={() => onToggleGen(generation.id)}
            />
          ))}
        </div>
      </div>

      {hasFilters && (
        <button className="facets__clear" onClick={onClear} type="button">
          {t(lang, 'clearFilters')}
        </button>
      )}
    </section>
  )
}
