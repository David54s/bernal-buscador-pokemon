import { RATING } from '../constants.ts'
import type { Rating } from '../constants.ts'
import { docName, matchedBy, t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'
import type { PokedexIndex } from '../lib/index-types.ts'
import { tagsFor } from '../lib/tags.ts'
import { TagList } from './TagList.tsx'

interface PokemonCardProps {
  index: PokedexIndex
  docId: number
  lang: Lang
  onToggleType: (typeId: number) => void
  activeTypes: ReadonlySet<number>
  /**
   * Los términos de la consulta reducida que ESTE Pokémon satisface.
   *
   * Opcional porque solo existe en la ruta reducida: en una búsqueda normal, el
   * motivo por el que un resultado está ahí es evidente —se parece a lo que se
   * escribió—, pero al describir con una frase no lo es en absoluto.
   */
  matchedTerms?: readonly string[] | undefined
  /**
   * Qué valoración tiene este Pokémon, si tiene alguna, y cómo cambiarla.
   *
   * Opcionales las dos: una vista que no las pase no enseña los botones y no
   * cambia en nada. Es el mismo camino que ya recorrió `matchedTerms`.
   */
  rating?: Rating | undefined
  onRate?: ((pokeId: number, rating: Rating) => void) | undefined
  /**
   * Saltar a este Pokémon en el grafo. Solo lo pasa la vista de exploración:
   * en el buscador una tarjeta no navega a ninguna parte.
   */
  onNavigate?: ((docId: number) => void) | undefined
}

/** 4 -> "#004", 10034 -> "#10034" */
function formatId(id: number): string {
  return `#${String(id).padStart(3, '0')}`
}

/**
 * Tarjeta de un resultado.
 *
 * Se pinta completa de una vez: nombre, número y etiquetas salen del índice, y la
 * URL del sprite viene ya resuelta en el corpus. No hay estados de carga por
 * tarjeta ni esqueletos, porque no queda nada que esperar.
 *
 * La imagen usa `loading="lazy"` del navegador, que también se aplica al
 * desbordamiento horizontal: en una fila que no se ha desplazado, las tarjetas de
 * la derecha no descargan nada.
 */
export function PokemonCard({
  index,
  docId,
  lang,
  onToggleType,
  activeTypes,
  matchedTerms,
  rating,
  onRate,
  onNavigate,
}: PokemonCardProps) {
  const doc = index.docs[docId]
  if (doc === undefined) return null

  const name = docName(doc, lang)

  return (
    <article className="card">
      <div className="card__art">
        {doc.spriteUrl === null ? (
          <div className="card__img-missing">?</div>
        ) : (
          <img alt={name} className="card__img" loading="lazy" src={doc.spriteUrl} />
        )}
      </div>

      {onNavigate && (
        <button
          aria-label={name}
          className="card__navigate"
          onClick={() => onNavigate(docId)}
          type="button"
        />
      )}

      <p className="card__id">{formatId(doc.pokeId)}</p>
      <h3 className="card__name">{name}</h3>

      <TagList
        activeTypes={activeTypes}
        doc={doc}
        index={index}
        lang={lang}
        onToggleType={onToggleType}
        tags={tagsFor(index, docId)}
      />

      {/* Por qué está aquí. Sin esto, una descripción devuelve tarjetas que el
          usuario no puede relacionar con lo que escribió: fue justo la queja que
          originó este trabajo. */}
      {onRate && (
        <div className="card__rate">
          {/* `aria-pressed` y no dos estados sueltos: son conmutadores, y volver
              a pulsar el activo quita la valoración. */}
          <button
            aria-label={t(lang, 'like')}
            aria-pressed={rating === RATING.LIKE}
            className={`card__rate-button${rating === RATING.LIKE ? ' card__rate-button--on' : ''}`}
            onClick={() => onRate(doc.pokeId, RATING.LIKE)}
            title={t(lang, 'like')}
            type="button"
          >
            ▲
          </button>
          <button
            aria-label={t(lang, 'dislike')}
            aria-pressed={rating === RATING.DISLIKE}
            className={`card__rate-button card__rate-button--down${rating === RATING.DISLIKE ? ' card__rate-button--on' : ''}`}
            onClick={() => onRate(doc.pokeId, RATING.DISLIKE)}
            title={t(lang, 'dislike')}
            type="button"
          >
            ▼
          </button>
        </div>
      )}

      {matchedTerms !== undefined && matchedTerms.length > 0 && (
        <p className="card__why">
          <span className="card__why-label">{matchedBy(lang)}</span>{' '}
          {matchedTerms.join(', ')}
        </p>
      )}
    </article>
  )
}
