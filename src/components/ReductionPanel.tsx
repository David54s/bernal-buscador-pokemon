import { dropReasonLabel, reductionSummary, t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'
import type { DropReason, Reduction } from '../lib/index-types.ts'

interface ReductionPanelProps {
  reduction: Reduction
  lang: Lang
}

const ORDEN: DropReason[] = ['stopword', 'ausente', 'corta', 'sobrante']

/**
 * Enseña cómo se redujo un texto largo a sus términos informativos.
 *
 * Es la parte visible de una decisión que de otro modo ocurriría en silencio: de
 * cuántas palabras se pasó a cuántas, cuáles se conservaron con su peso, y cuántas
 * se descartaron por cada motivo. Sin este panel el usuario vería aparecer unos
 * resultados sin entender de dónde salen.
 */
export function ReductionPanel({ reduction, lang }: ReductionPanelProps) {
  const motivos = ORDEN.filter((reason) => reduction.dropped[reason] > 0)

  return (
    <section aria-live="polite" className="reduction">
      <p className="reduction__summary">
        {reductionSummary(lang, reduction.totalTokens, reduction.kept.length)}
      </p>

      <ul className="reduction__terms">
        {reduction.kept.map((term) => (
          <li className="reduction__term" key={term.term}>
            {/* Cuando la palabra se escribió en plural se enseñan las dos formas:
                si no, "cabezas → cabeza" parecería que el buscador ignoró lo que
                se escribió. */}
            <span className="reduction__word">
              {term.from === undefined ? (
                term.term
              ) : (
                <>
                  <span className="reduction__from" title={t(lang, 'reductionNormalizedHint')}>
                    {term.from}
                  </span>
                  {' → '}
                  {term.term}
                </>
              )}
            </span>
            {/* El peso es lo que explica el orden: cuanto más raro es un término
                en el catálogo, más dice sobre lo que se busca. */}
            <span className="reduction__weight" title={`df ${term.df}`}>
              {term.idf.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>

      {motivos.length > 0 && (
        <p className="reduction__dropped">
          {t(lang, 'reductionDiscarded')}:{' '}
          {motivos
            .map((reason) => `${reduction.dropped[reason]} ${dropReasonLabel(lang, reason)}`)
            .join(' · ')}
        </p>
      )}
    </section>
  )
}
