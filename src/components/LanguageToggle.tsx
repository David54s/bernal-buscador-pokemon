import { t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'

interface LanguageToggleProps {
  lang: Lang
  onChange: (lang: Lang) => void
}

/**
 * El conmutador de idioma.
 *
 * Solo cambia lo que se MUESTRA: la búsqueda empareja siempre en los dos idiomas,
 * así que "fuego" y "fire" devuelven lo mismo con cualquiera de los dos activo.
 */
export function LanguageToggle({ lang, onChange }: LanguageToggleProps) {
  return (
    <div aria-label={t(lang, 'language')} className="lang-toggle" role="group">
      {(['es', 'en'] as const).map((option) => (
        <button
          aria-pressed={lang === option}
          className={`lang-toggle__option${lang === option ? ' lang-toggle__option--active' : ''}`}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
