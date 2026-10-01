import { t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'
import type { Group, PokedexIndex } from '../lib/index-types.ts'
import { PokemonRow } from './PokemonRow.tsx'

interface RowListProps {
  index: PokedexIndex
  groups: Group[]
  visibleRows: number
  onShowMoreRows: () => void
  lang: Lang
  onToggleType: (typeId: number) => void
  activeTypes: ReadonlySet<number>
  onSeeRest: (group: Group) => void
  /** `docId -> términos`, solo cuando los resultados vienen de una descripción. */
  matches?: ReadonlyMap<number, readonly string[]> | null
}

/**
 * Las filas de resultados.
 *
 * Se limita cuántas se montan a la vez, y el CSS añade `content-visibility: auto`
 * a cada fila para que el navegador se salte el maquetado y el pintado de las que
 * quedan fuera de la pantalla. Con eso y el `loading="lazy"` de las imágenes, no
 * hace falta ningún virtualizador —que además pelearía con `scroll-snap` y con el
 * recorrido por teclado.
 */
export function RowList({
  index,
  groups,
  visibleRows,
  onShowMoreRows,
  lang,
  onToggleType,
  activeTypes,
  onSeeRest,
  matches,
}: RowListProps) {
  const shown = groups.slice(0, visibleRows)
  const hidden = groups.length - shown.length

  return (
    <div className="rows">
      {shown.map((group) => (
        <PokemonRow
          activeTypes={activeTypes}
          group={group}
          index={index}
          key={`${group.key.kind}-${JSON.stringify(group.key)}`}
          lang={lang}
          matches={matches}
          onSeeRest={onSeeRest}
          onToggleType={onToggleType}
        />
      ))}

      {hidden > 0 && (
        <button className="load-more" onClick={onShowMoreRows} type="button">
          {t(lang, 'moreGroups')} ({hidden})
        </button>
      )}
    </div>
  )
}
