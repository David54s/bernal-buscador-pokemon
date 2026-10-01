import { FALLBACK_TYPE_COLOR, GENERATION_COLORS, TYPE_COLORS } from '../constants.ts'
import { tagLabel } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'
import type { Doc, PokedexIndex, Tag } from '../lib/index-types.ts'

interface TagListProps {
  index: PokedexIndex
  doc: Doc
  tags: Tag[]
  lang: Lang
  /** Si se pasa, las etiquetas de tipo se vuelven botones que activan esa faceta. */
  onToggleType?: (typeId: number) => void
  activeTypes?: ReadonlySet<number>
}

function colorFor(index: PokedexIndex, tag: Tag): string | undefined {
  if (tag.kind === 'type') {
    const type = index.typeById.get(tag.typeId)
    return (type ? TYPE_COLORS[type.slug] : undefined) ?? FALLBACK_TYPE_COLOR
  }
  if (tag.kind === 'generation') return GENERATION_COLORS[tag.genId]
  return undefined
}

/**
 * Las etiquetas de una tarjeta.
 *
 * Todas salen del índice, así que se pintan en el primer frame. En el buscador
 * anterior los tipos venían de una petición por tarjeta visible, de modo que
 * aparecían con retraso y solo para lo que estaba en pantalla; ahora están
 * disponibles para los 1351 desde el arranque, que es precisamente lo que permite
 * filtrar y agrupar por ellos.
 */
export function TagList({
  index,
  doc,
  tags,
  lang,
  onToggleType,
  activeTypes,
}: TagListProps) {
  return (
    <div className="tags">
      {tags.map((tag) => {
        const label = tagLabel(index, doc, tag, lang)
        const background = colorFor(index, tag)
        const className = `tag tag--${tag.kind}`

        if (tag.kind === 'type' && onToggleType) {
          const active = activeTypes?.has(tag.typeId) ?? false
          return (
            <button
              aria-pressed={active}
              className={`${className} tag--button${active ? ' tag--active' : ''}`}
              key={`type-${tag.typeId}`}
              onClick={() => onToggleType(tag.typeId)}
              style={{ backgroundColor: background }}
              type="button"
            >
              {label}
            </button>
          )
        }

        return (
          <span
            className={className}
            key={tag.kind === 'type' ? `type-${tag.typeId}` : tag.kind}
            style={background ? { backgroundColor: background } : undefined}
          >
            {label}
          </span>
        )
      })}
    </div>
  )
}
