import { useMemo, useState } from 'react'
import { SCOPE } from '../constants.ts'
import type { Scope } from '../constants.ts'
import { auditSummary, heapsSummary, t, zipfSummary } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'
import type { PokedexIndex } from '../lib/index-types.ts'
import { allCorpusStats, heapsPredict } from '../lib/stats.ts'
import { IndexExplorer } from './IndexExplorer.tsx'
import { LogChart } from './LogChart.tsx'
import type { Point } from './LogChart.tsx'

interface StatsPanelProps {
  index: PokedexIndex
  lang: Lang
}

/**
 * Las dos leyes empíricas del corpus, medidas y dibujadas.
 *
 * El interés no está en que las curvas salgan bonitas, sino en el CONTRASTE
 * entre los dos subcorpus. Zipf y Heaps describen lenguaje natural; las
 * entradas de Pokédex lo son y los nombres propios del catálogo no. Poder
 * cambiar de ámbito y ver cómo se degrada el ajuste es el experimento.
 */
export function StatsPanel({ index, lang }: StatsPanelProps) {
  const [scope, setScope] = useState<Scope>(SCOPE.DESCRIPTION)

  // Los tres ámbitos se calculan de una vez —unos 110 ms— y solo cuando cambia
  // el índice. Así cambiar de ámbito en pantalla no recalcula nada.
  const todos = useMemo(() => allCorpusStats(index), [index])
  const stats = todos[scope]

  const opciones: { value: Scope; label: string }[] = [
    { value: SCOPE.DESCRIPTION, label: t(lang, 'scopeDescription') },
    { value: SCOPE.IDENTITY, label: t(lang, 'scopeIdentity') },
    { value: SCOPE.ALL, label: t(lang, 'scopeAll') },
  ]

  /* --- Zipf: los datos y la recta que predice la ley ----------------------- */

  const zipfPoints: Point[] = stats.zipf.curve.map((p) => ({ x: p.rank, y: p.frequency }))
  const zipfFit: Point[] = [1, stats.zipf.vocabulary].map((rank) => ({
    x: rank,
    y: stats.zipf.c * Math.pow(rank, -stats.zipf.s),
  }))

  /* --- Heaps: la curva, la ley y la extrapolación -------------------------- */

  const heapsPoints: Point[] = stats.heaps.curve.map((p) => ({
    x: p.tokens,
    y: p.vocabulary,
  }))
  const ley = { slope: stats.heaps.beta, intercept: stats.heaps.k }
  const heapsFitPoints: Point[] = stats.heaps.curve.map((p) => ({
    x: p.tokens,
    y: heapsPredict(ley, p.tokens),
  }))
  // Qué vocabulario tendría un corpus del doble de tamaño. Es la lectura útil de
  // la ley: no describe el pasado, predice el crecimiento del índice.
  const doble = stats.heaps.tokens * 2
  const prediccion: Point = { x: doble, y: heapsPredict(ley, doble) }

  return (
    <section className="stats">
      <div className="segmented" role="group" aria-label={t(lang, 'scope')}>
        <span className="segmented__label">{t(lang, 'scope')}</span>
        {opciones.map((o) => (
          <button
            aria-pressed={scope === o.value}
            className={`segmented__option${scope === o.value ? ' segmented__option--active' : ''}`}
            key={o.value}
            onClick={() => setScope(o.value)}
            type="button"
          >
            {o.label}
          </button>
        ))}
      </div>

      <p className="stats__corpus">
        {t(lang, 'statsCorpus')}: <strong>{stats.zipf.tokens.toLocaleString(lang)}</strong>{' '}
        {t(lang, 'statsTokens')} · <strong>{stats.zipf.vocabulary.toLocaleString(lang)}</strong>{' '}
        {t(lang, 'statsTerms')} ·{' '}
        <strong>{((100 * stats.zipf.hapax) / stats.zipf.vocabulary).toFixed(1)}%</strong>{' '}
        {t(lang, 'statsHapax')}
      </p>

      <div className="stats__grid">
        {/* --- Zipf --- */}
        <article className="stats__card">
          <h2 className="stats__title">{t(lang, 'zipfTitle')}</h2>
          <p className="stats__lead">{t(lang, 'zipfLead')}</p>
          <LogChart
            description={zipfSummary(lang, stats.zipf.s, stats.zipf.r2)}
            fit={zipfFit}
            points={zipfPoints}
            xLabel={t(lang, 'zipfX')}
            yLabel={t(lang, 'zipfY')}
          />
          <dl className="stats__figures">
            <div>
              <dt>{t(lang, 'zipfExponent')}</dt>
              <dd>{stats.zipf.s.toFixed(3)}</dd>
            </div>
            <div>
              <dt>{t(lang, 'statsFit')}</dt>
              <dd>{stats.zipf.r2.toFixed(3)}</dd>
            </div>
          </dl>
          <p className="stats__note">{zipfSummary(lang, stats.zipf.s, stats.zipf.r2)}</p>

          <table className="stats__table">
            <caption>{t(lang, 'zipfTop')}</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{t(lang, 'statsTerm')}</th>
                <th scope="col">{t(lang, 'statsFrequency')}</th>
                <th scope="col">r × f</th>
              </tr>
            </thead>
            <tbody>
              {stats.zipf.top.slice(0, 8).map((row, i) => (
                <tr key={row.term}>
                  <td>{i + 1}</td>
                  <td className="stats__term">{row.term}</td>
                  <td>{row.frequency.toLocaleString(lang)}</td>
                  {/* Si Zipf se cumpliera exactamente, esta columna sería constante. */}
                  <td>{((i + 1) * row.frequency).toLocaleString(lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        {/* --- Heaps --- */}
        <article className="stats__card">
          <h2 className="stats__title">{t(lang, 'heapsTitle')}</h2>
          <p className="stats__lead">{t(lang, 'heapsLead')}</p>
          <LogChart
            description={heapsSummary(lang, stats.heaps.beta, stats.heaps.r2)}
            fit={heapsFitPoints}
            highlight={prediccion}
            points={heapsPoints}
            xLabel={t(lang, 'heapsX')}
            yLabel={t(lang, 'heapsY')}
          />
          <dl className="stats__figures">
            <div>
              <dt>β</dt>
              <dd>{stats.heaps.beta.toFixed(3)}</dd>
            </div>
            <div>
              <dt>K</dt>
              <dd>{stats.heaps.k.toFixed(2)}</dd>
            </div>
            <div>
              <dt>{t(lang, 'statsFit')}</dt>
              <dd>{stats.heaps.r2.toFixed(3)}</dd>
            </div>
          </dl>
          <p className="stats__note">{heapsSummary(lang, stats.heaps.beta, stats.heaps.r2)}</p>
          <p className="stats__predict">
            {t(lang, 'heapsPredict')}:{' '}
            <strong>{Math.round(prediccion.y).toLocaleString(lang)}</strong>{' '}
            {t(lang, 'statsTerms')}
          </p>
        </article>

        {/* --- La auditoría: para qué sirve Zipf aquí --- */}
        <article className="stats__card">
          <h2 className="stats__title">{t(lang, 'auditTitle')}</h2>
          <p className="stats__lead">{t(lang, 'auditLead')}</p>
          <dl className="stats__figures">
            <div>
              <dt>{t(lang, 'auditInHead')}</dt>
              <dd>
                {stats.audit.inList}/{stats.audit.head}
              </dd>
            </div>
            <div>
              <dt>{t(lang, 'auditBeyond')}</dt>
              <dd>{stats.audit.beyondHead}</dd>
            </div>
          </dl>
          <p className="stats__note">
            {auditSummary(lang, stats.audit.inList, stats.audit.head, stats.audit.beyondHead)}
          </p>
          {stats.audit.missing.length > 0 && (
            <p className="stats__note">
              {t(lang, 'auditMissing')}:{' '}
              {stats.audit.missing.map((m) => m.term).join(', ')}
            </p>
          )}
        </article>

        {/* --- El índice invertido, tocable --- */}
        <IndexExplorer index={index} lang={lang} />
      </div>
    </section>
  )
}
