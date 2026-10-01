import { GROUP_BY, type GroupBy } from '../constants.ts'
import { t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'

interface GroupBySelectProps {
  value: GroupBy
  onChange: (value: GroupBy) => void
  lang: Lang
}

/** Cómo se reparten los resultados en filas. */
export function GroupBySelect({ value, onChange, lang }: GroupBySelectProps) {
  const options: { mode: GroupBy; label: string }[] = [
    { mode: GROUP_BY.NONE, label: t(lang, 'groupNone') },
    { mode: GROUP_BY.TYPE, label: t(lang, 'groupType') },
    { mode: GROUP_BY.GENERATION, label: t(lang, 'groupGeneration') },
    { mode: GROUP_BY.RELEVANCE, label: t(lang, 'groupRelevance') },
  ]

  return (
    <div className="segmented" role="group" aria-label={t(lang, 'groupBy')}>
      <span className="segmented__label">{t(lang, 'groupBy')}</span>
      {options.map((option) => (
        <button
          aria-pressed={value === option.mode}
          className={`segmented__option${value === option.mode ? ' segmented__option--active' : ''}`}
          key={option.mode}
          onClick={() => onChange(option.mode)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
