import type { IndexStats, QueryStats } from '../lib/index-types.ts'

interface DebugPanelProps {
  index: IndexStats
  query: QueryStats
  results: number
}

/**
 * Las cifras del motor, solo en desarrollo.
 *
 * La que importa es `docsTouched`: enseña cuántos documentos ha mirado la consulta
 * de los 1351 que hay. Es la forma más directa de ver que el buscador consulta el
 * índice en lugar de recorrer el catálogo.
 */
export function DebugPanel({ index, query, results }: DebugPanelProps) {
  const rows: [string, string][] = [
    ['índice construido en', `${index.buildMs.toFixed(1)} ms`],
    ['documentos', String(index.docs)],
    ['nombres / palabras / facetas', `${index.nameTerms} / ${index.segTerms} / ${index.facetTerms}`],
    ['vocabulario', String(index.vocab)],
    ['n-gramas distintos', String(index.gramKeys)],
    ['postings', String(index.postings)],
    ['—', '—'],
    ['consulta', `${query.ms.toFixed(3)} ms`],
    ['documentos mirados', `${query.docsTouched} de ${index.docs}`],
    ['candidatos verificados', String(query.candidatesVerified)],
    ['tokens', query.tokens.length === 0 ? '(ninguno)' : query.tokens.join(' + ')],
    ['aproximado', query.usedFuzzy ? 'sí' : 'no'],
    ['resultados', String(results)],
  ]

  return (
    <details className="debug">
      <summary className="debug__summary">
        motor · {query.docsTouched} de {index.docs} documentos mirados · {query.ms.toFixed(3)} ms
      </summary>
      <dl className="debug__list">
        {rows.map(([label, value], i) => (
          <div className="debug__row" key={`${label}-${i}`}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
