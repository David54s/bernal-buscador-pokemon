import { useMemo, useState } from 'react'
import { dictionaryLabel, docName, probeSummary, t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'
import type { PokedexIndex } from '../lib/index-types.ts'
import { explainTerm } from '../lib/stats.ts'

interface IndexExplorerProps {
  index: PokedexIndex
  lang: Lang
}

/** Cuántos documentos de la lista se enseñan antes de resumir el resto. */
const MAX_DOCS = 24

/**
 * Términos elegidos porque cada uno enseña un caso distinto, y sin ellos nadie
 * los descubre: uno que vive en tres diccionarios, uno de faceta más
 * descripción, uno que solo describe, y uno que no existe.
 */
const EXAMPLES = ['pikachu', 'agua', 'mejillas', 'charmender'] as const

/**
 * El índice invertido, tocable.
 *
 * Un índice invertido es una tabla que va de TÉRMINO a la lista de DOCUMENTOS
 * que lo contienen, y la gracia es que buscar no recorre el catálogo: se va
 * directo a la entrada del término, y esa entrada ya es la respuesta.
 *
 * Eso es fácil de afirmar y difícil de creer sin verlo, porque desde fuera un
 * buscador rápido y un `filter` sobre un array se parecen. Lo que los distingue
 * es CUÁNTO tocan, y es justo lo que esta vista enseña.
 */
export function IndexExplorer({ index, lang }: IndexExplorerProps) {
  const [raw, setRaw] = useState('pikachu')
  const entry = useMemo(() => explainTerm(index, raw), [index, raw])
  const n = index.docs.length

  return (
    <article className="stats__card stats__card--wide">
      <h2 className="stats__title">{t(lang, 'explorerTitle')}</h2>
      <p className="stats__lead">{t(lang, 'explorerLead')}</p>

      <div className="explorer__field">
        <label className="explorer__label" htmlFor="explorer-input">
          {t(lang, 'explorerTerm')}
        </label>
        <input
          className="explorer__input"
          id="explorer-input"
          onChange={(e) => setRaw(e.target.value)}
          spellCheck={false}
          type="text"
          value={raw}
        />
        <div className="explorer__examples">
          {EXAMPLES.map((ex) => (
            <button
              className="explorer__example"
              key={ex}
              onClick={() => setRaw(ex)}
              type="button"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {entry === null ? (
        <p className="stats__note">{t(lang, 'explorerEmpty')}</p>
      ) : (
        <>
          <p className="stats__note">
            {t(lang, 'explorerToken')}: <code>{entry.token}</code>
            {entry.ignored.length > 0 && (
              <>
                {' · '}
                {t(lang, 'explorerIgnored')}: <code>{entry.ignored.join(' ')}</code>
              </>
            )}
          </p>

          {entry.entries.length === 0 ? (
            <p className="stats__note">
              {t(lang, 'explorerNotFound')} — {t(lang, 'explorerNotFoundWhy')}
            </p>
          ) : (
            <>
              {/* Una fila por diccionario. Que un término viva en varios, con una
                  lista DISTINTA en cada uno, es lo que ningún filtro imita. */}
              <table className="stats__table explorer__table">
                <caption>{t(lang, 'explorerWhere')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t(lang, 'explorerDict')}</th>
                    <th scope="col">{t(lang, 'explorerPosition')}</th>
                    <th scope="col">{t(lang, 'explorerProbes')}</th>
                    <th scope="col">df</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.entries.map((e) => (
                    <tr key={e.dictionary}>
                      <td className="stats__term">{dictionaryLabel(lang, e.dictionary)}</td>
                      <td>
                        {e.at.toLocaleString(lang)} / {e.size.toLocaleString(lang)}
                      </td>
                      <td>{e.probes}</td>
                      <td>{e.docIds.length.toLocaleString(lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="stats__predict">
                {probeSummary(lang, entry.entries[entry.entries.length - 1]!.probes, n, entry.df)}
              </p>

              <dl className="stats__figures">
                <div>
                  <dt>df ({t(lang, 'explorerUnion')})</dt>
                  <dd>{entry.df}</dd>
                </div>
                <div>
                  <dt>idf = log(N/df)</dt>
                  <dd>{entry.idf.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>{t(lang, 'explorerSpecies')}</dt>
                  <dd>{entry.species}</dd>
                </div>
              </dl>

              {/* La lista de postings en crudo: enteros ordenados, que es como el
                  motor la recorre para unir e intersectar con dos punteros. */}
              <p className="explorer__postings">
                {entry.union.slice(0, MAX_DOCS).join(', ')}
                {entry.union.length > MAX_DOCS && ` … (+${entry.union.length - MAX_DOCS})`}
              </p>

              <ul className="explorer__docs">
                {entry.union.slice(0, MAX_DOCS).map((docId) => (
                  <li className="explorer__doc" key={docId}>
                    {docName(index.docs[docId]!, lang)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </article>
  )
}
