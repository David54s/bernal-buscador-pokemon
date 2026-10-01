import { t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'

interface DidYouMeanProps {
  query: string
  suggestion: string
  onAccept: (suggestion: string) => void
  lang: Lang
}

/**
 * La corrección propuesta cuando la consulta no encontró nada exacto.
 *
 * Se presenta aparte y nunca entremezclada con los resultados exactos, y el botón
 * sustituye el texto de la búsqueda: así el usuario puede aceptar la corrección y
 * pasar a tener resultados normales en lugar de aproximados.
 */
export function DidYouMean({ query, suggestion, onAccept, lang }: DidYouMeanProps) {
  return (
    <p className="suggestion" role="status">
      <span className="suggestion__query">«{query}»</span>{' '}
      {t(lang, 'didYouMean')}{' '}
      <button className="suggestion__button" onClick={() => onAccept(suggestion)} type="button">
        {suggestion}
      </button>
      ?
    </p>
  )
}
