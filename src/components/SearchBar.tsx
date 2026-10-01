import { t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  /** Se desactiva mientras el índice todavía se está cargando. */
  disabled?: boolean
  lang: Lang
}

/**
 * La barra de búsqueda. No sabe nada del índice: solo avisa hacia arriba de cada
 * tecla, y es `App` quien decide qué hacer con ella.
 */
export function SearchBar({ value, onChange, disabled = false, lang }: SearchBarProps) {
  return (
    <div className="search-bar">
      <label className="search-bar__label" htmlFor="pokemon-search">
        {t(lang, 'searchLabel')}
      </label>

      <div className="search-bar__field">
        <span aria-hidden="true" className="search-bar__icon">
          ⌕
        </span>

        <input
          aria-describedby="pokemon-search-hint"
          autoComplete="off"
          className="search-bar__input"
          disabled={disabled}
          id="pokemon-search"
          onChange={(event) => onChange(event.target.value)}
          placeholder={t(lang, 'searchPlaceholder')}
          type="search"
          value={value}
        />

        {value !== '' && (
          <button
            aria-label={t(lang, 'clearSearch')}
            className="search-bar__clear"
            onClick={() => onChange('')}
            type="button"
          >
            ✕
          </button>
        )}
      </div>

      <p className="search-bar__hint" id="pokemon-search-hint">
        {t(lang, 'searchHint')}
      </p>
    </div>
  )
}
