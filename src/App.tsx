import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Rating } from './constants.ts'
import {
  GROUP_BY,
  MAX_ROWS_INITIAL,
  PAGE_SIZE,
  ROWS_STEP,
  VIEW,
  type GroupBy,
  type View,
} from './constants.ts'
import { DebugPanel } from './components/DebugPanel.tsx'
import { DidYouMean } from './components/DidYouMean.tsx'
import { FacetPanel } from './components/FacetPanel.tsx'
import { ReductionPanel } from './components/ReductionPanel.tsx'
import { GroupBySelect } from './components/GroupBySelect.tsx'
import { LanguageToggle } from './components/LanguageToggle.tsx'
import { ResultsGrid } from './components/ResultsGrid.tsx'
import { StatsPanel } from './components/StatsPanel.tsx'
import { GraphExplorer } from './components/GraphExplorer.tsx'
import { PokemonRow } from './components/PokemonRow.tsx'
import { RowList } from './components/RowList.tsx'
import { SearchBar } from './components/SearchBar.tsx'
import { StatusBanner } from './components/StatusBanner.tsx'
import { ViewerMenu } from './components/ViewerMenu.tsx'
import { useCorpusIndex } from './hooks/useCorpusIndex.ts'
import { useLanguage } from './i18n/language-context.ts'
import { t } from './i18n/strings.ts'
import { groupResults } from './lib/group.ts'
import type { Filters, Group } from './lib/index-types.ts'
import { applyFacets, countFacets, parseQuery, runQuery } from './lib/query.ts'
import { readStoredRatings, storeRatings, toggleRating } from './lib/ratings.ts'
import { buildProfileIndex, recommend } from './lib/recommend.ts'
import { readStoredPrefs, storePrefs } from './lib/view-prefs.ts'
import { useViewer } from './viewers/viewer-context.ts'
import { becauseYouLiked, docName } from './i18n/strings.ts'

/**
 * Conjuntos vacíos a nivel de módulo, no creados en cada render.
 *
 * Con `new Set()` en línea la identidad cambiaría en cada render y eso invalidaría
 * toda la cadena de `useMemo` de abajo, que es justo lo que se quiere evitar.
 */
const NO_TYPES: ReadonlySet<number> = new Set()
const NO_GENS: ReadonlySet<number> = new Set()

/**
 * Los ids guardados, como conjunto; y el conjunto vacío compartido cuando no hay
 * ninguno, para no romper la cadena de `useMemo` con una identidad nueva.
 */
function toSet(ids: readonly number[], empty: ReadonlySet<number>): ReadonlySet<number> {
  return ids.length === 0 ? empty : new Set(ids)
}

function toggle(set: ReadonlySet<number>, value: number): ReadonlySet<number> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export default function App() {
  const { index, state, error, retry } = useCorpusIndex()
  const { lang, setLang } = useLanguage()

  /**
   * El perfil activo. Todo lo que se guarda abajo lleva su id.
   *
   * No hace falta reaccionar a que cambie: `ViewerShell` monta este componente
   * con `key={active.id}`, así que cambiar de perfil lo remonta y cada
   * inicializador de abajo vuelve a leer, del cajón del perfil nuevo.
   */
  const { active } = useViewer()

  /** Los filtros y la agrupación con los que este perfil dejó la pantalla. */
  const stored = useMemo(() => readStoredPrefs(active.id), [active.id])

  const [query, setQuery] = useState('')
  const [selTypes, setSelTypes] = useState<ReadonlySet<number>>(() =>
    toSet(stored.types, NO_TYPES),
  )
  const [selGens, setSelGens] = useState<ReadonlySet<number>>(() => toSet(stored.gens, NO_GENS))
  const [groupBy, setGroupBy] = useState<GroupBy>(stored.groupBy)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [visibleRows, setVisibleRows] = useState(MAX_ROWS_INITIAL)
  /**
   * Qué pantalla se está viendo. Es lo único que el buscador y las estadísticas
   * comparten: cada una mantiene su propio estado, y cambiar de vista no
   * desmonta la otra, así que al volver siguen la consulta y los filtros.
   */
  const [view, setView] = useState<View>(VIEW.SEARCH)
  /** Lo que ESTE perfil valoró en visitas anteriores. */
  const [ratings, setRatings] = useState(() => readStoredRatings(active.id))

  /**
   * Los filtros se guardan en un efecto y no en los manejadores.
   *
   * Son cinco los que tocan estos tres estados —`handleToggleType`,
   * `handleToggleGen`, `handleClearFilters`, `handleGroupBy` y `handleSeeRest`—,
   * así que persistir en cada uno serían cinco sitios de los que olvidar uno, y
   * el olvido no daría error: simplemente no se guardaría a veces. Aquí es un
   * sitio y no se puede esquivar.
   *
   * La primera pasada reescribe lo mismo que acabó de leerse. Es un no-op de
   * microsegundos y evita tener que distinguir el montaje del resto.
   */
  useEffect(() => {
    storePrefs(active.id, { types: [...selTypes], gens: [...selGens], groupBy })
  }, [active.id, selTypes, selGens, groupBy])

  const filters = useMemo<Filters>(() => ({ types: selTypes, gens: selGens }), [selTypes, selGens])

  /* --- La cadena de cálculo ------------------------------------------------
   *
   * El corte está en `matched`: es el ÚNICO paso que consulta el índice
   * invertido, y no depende de las facetas. Por eso marcar un chip solo vuelve a
   * correr el filtro y el conteo, ambos lineales en el número de resultados, y
   * nunca la consulta. Tampoco depende de `lang`: cambiar de idioma repinta, pero
   * no recalcula nada.
   */
  const parsed = useMemo(() => parseQuery(query), [query])

  const matched = useMemo(
    () => (index === null ? null : runQuery(index, parsed)),
    [index, parsed],
  )

  const facetCounts = useMemo(
    () => (index === null || matched === null ? null : countFacets(index, matched.docIds, filters)),
    [index, matched, filters],
  )

  const filtered = useMemo(
    () => (index === null || matched === null ? null : applyFacets(index, matched, filters)),
    [index, matched, filters],
  )

  /**
   * El índice directo del recomendador: documento → términos que lo describen.
   *
   * Aparte de la cadena de arriba porque no depende de la consulta: solo del
   * índice. Cuesta 1 ms, y recomendar sobre él 0,03 ms, así que valorar algo
   * recalcula la fila sin que se note.
   */
  const profile = useMemo(() => (index === null ? null : buildProfileIndex(index)), [index])

  const recommended = useMemo(
    () => (index === null || profile === null ? null : recommend(index, profile, ratings)),
    [index, profile, ratings],
  )

  const groups = useMemo(
    () =>
      index === null || filtered === null
        ? []
        : groupResults(index, filtered.docIds, filtered.levels, groupBy),
    [index, filtered, groupBy],
  )

  /* --- Manejadores --------------------------------------------------------- */

  // La paginación se reinicia aquí, en el evento, y no en un efecto: así ocurre en
  // el mismo render en vez de provocar uno más.
  const resetPaging = useCallback(() => {
    setVisibleCount(PAGE_SIZE)
    setVisibleRows(MAX_ROWS_INITIAL)
  }, [])

  const handleQuery = useCallback(
    (next: string) => {
      setQuery(next)
      resetPaging()
    },
    [resetPaging],
  )

  const handleToggleType = useCallback(
    (typeId: number) => {
      setSelTypes((prev) => toggle(prev, typeId))
      resetPaging()
    },
    [resetPaging],
  )

  const handleToggleGen = useCallback(
    (genId: number) => {
      setSelGens((prev) => toggle(prev, genId))
      resetPaging()
    },
    [resetPaging],
  )

  const handleClearFilters = useCallback(() => {
    setSelTypes(NO_TYPES)
    setSelGens(NO_GENS)
    resetPaging()
  }, [resetPaging])

  const handleGroupBy = useCallback(
    (next: GroupBy) => {
      setGroupBy(next)
      resetPaging()
    },
    [resetPaging],
  )

  const handleClearAll = useCallback(() => {
    setQuery('')
    setSelTypes(NO_TYPES)
    setSelGens(NO_GENS)
    resetPaging()
  }, [resetPaging])

  /** "Ver el resto" de una fila: fija esa faceta y pasa a la cuadrícula plana. */
  const handleRate = useCallback(
    (pokeId: number, rating: Rating) => {
      setRatings((current) => {
        const next = toggleRating(current, pokeId, rating)
        storeRatings(active.id, next)
        return next
      })
    },
    [active.id],
  )

  const handleSeeRest = useCallback(
    (group: Group) => {
      if (group.key.kind === 'type') setSelTypes(new Set([group.key.typeId]))
      else if (group.key.kind === 'generation') setSelGens(new Set([group.key.genId]))
      setGroupBy(GROUP_BY.NONE)
      resetPaging()
    },
    [resetPaging],
  )

  /* --- Render -------------------------------------------------------------- */

  const header = (
    <header className="app__header">
      <div className="app__heading">
        <h1 className="app__title">{t(lang, 'title')}</h1>
        <div className="app__chrome">
          <ViewerMenu lang={lang} />
          <LanguageToggle lang={lang} onChange={setLang} />
        </div>
      </div>
      <p className="app__subtitle">
        {t(lang, 'subtitle')} ·{' '}
        <a href="https://pokeapi.co" rel="noreferrer" target="_blank">
          PokeAPI
        </a>
      </p>

      <div className="segmented segmented--views" role="group" aria-label={t(lang, 'viewSearch')}>
        {[
          { value: VIEW.SEARCH, label: t(lang, 'viewSearch') },
          { value: VIEW.STATS, label: t(lang, 'viewStats') },
          { value: VIEW.GRAPH, label: t(lang, 'viewGraph') },
        ].map((o) => (
          <button
            aria-pressed={view === o.value}
            className={`segmented__option${view === o.value ? ' segmented__option--active' : ''}`}
            key={o.value}
            onClick={() => setView(o.value)}
            type="button"
          >
            {o.label}
          </button>
        ))}
      </div>
    </header>
  )

  if (state === 'loading' || index === null) {
    return (
      <div className="app">
        {header}
        {state === 'error' ? (
          <StatusBanner
            actionLabel={t(lang, 'retry')}
            message={error ?? t(lang, 'errorTitle')}
            onAction={retry}
            title={t(lang, 'errorTitle')}
          />
        ) : (
          <StatusBanner message={t(lang, 'loadingBody')} title={t(lang, 'loadingTitle')} />
        )}
      </div>
    )
  }

  const results = filtered?.docIds ?? []
  const visible = results.slice(0, visibleCount)
  const remaining = results.length - visible.length
  const showSuggestion = matched?.suggestion != null && matched.stats.usedFuzzy

  if (view === VIEW.GRAPH) {
    return (
      <div className="app">
        {header}
        <GraphExplorer
          activeTypes={selTypes}
          index={index}
          lang={lang}
          onRate={handleRate}
          onToggleType={handleToggleType}
          ratings={ratings}
        />
      </div>
    )
  }

  if (view === VIEW.STATS) {
    return (
      <div className="app">
        {header}
        <StatsPanel index={index} lang={lang} />
      </div>
    )
  }

  return (
    <div className="app">
      {header}

      <SearchBar lang={lang} onChange={handleQuery} value={query} />

      {facetCounts && (
        <FacetPanel
          counts={facetCounts}
          index={index}
          lang={lang}
          onClear={handleClearFilters}
          onToggleGen={handleToggleGen}
          onToggleType={handleToggleType}
          selectedGens={selGens}
          selectedTypes={selTypes}
        />
      )}

      <div className="controls">
        <GroupBySelect lang={lang} onChange={handleGroupBy} value={groupBy} />
        <p aria-live="polite" className="counter">
          {results.length === 0
            ? t(lang, 'noResultsTitle')
            : `${results.length} / ${index.docs.length}`}
        </p>
      </div>

      {showSuggestion && matched?.suggestion && (
        <DidYouMean
          lang={lang}
          onAccept={handleQuery}
          query={query}
          suggestion={matched.suggestion}
        />
      )}

      {/* Solo aparece cuando la consulta era un texto largo: el motor lo redujo
          a sus términos informativos y conviene enseñar con cuáles se buscó. */}
      {matched?.reduction && <ReductionPanel lang={lang} reduction={matched.reduction} />}

      {/* La fila de recomendaciones va AQUÍ, antes del ternario de resultados, y
          no dentro de los grupos: así sobrevive al caso de «sin resultados»,
          que es justo cuando una recomendación vale más. */}
      {recommended && recommended.docIds.length > 0 && (
        <PokemonRow
          activeTypes={selTypes}
          group={{ key: { kind: 'all' }, docIds: recommended.docIds }}
          index={index}
          lang={lang}
          onRate={handleRate}
          onSeeRest={() => undefined}
          onToggleType={handleToggleType}
          ratings={ratings}
          title={
            recommended.because === null
              ? t(lang, 'recommendedTitle')
              : becauseYouLiked(lang, docName(index.docs[recommended.because]!, lang))
          }
        />
      )}

      {import.meta.env.DEV && matched && (
        <DebugPanel index={index.stats} query={matched.stats} results={results.length} />
      )}

      {results.length === 0 ? (
        <StatusBanner
          actionLabel={t(lang, 'clearAll')}
          message={
            lang === 'es'
              ? `Nada coincide con «${query}» y los filtros activos.`
              : `Nothing matches “${query}” with the active filters.`
          }
          onAction={handleClearAll}
          title={t(lang, 'noResultsTitle')}
        />
      ) : groupBy === GROUP_BY.NONE ? (
        <>
          <ResultsGrid
            activeTypes={selTypes}
            docIds={visible}
            index={index}
            lang={lang}
            matches={matched?.reduction?.matches ?? null}
            onRate={handleRate}
            onToggleType={handleToggleType}
            ratings={ratings}
          />
          {remaining > 0 && (
            <button
              className="load-more"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              type="button"
            >
              {t(lang, 'loadMore')} ({remaining})
            </button>
          )}
        </>
      ) : (
        <RowList
          activeTypes={selTypes}
          groups={groups}
          index={index}
          lang={lang}
          matches={matched?.reduction?.matches ?? null}
          onRate={handleRate}
          onSeeRest={handleSeeRest}
          ratings={ratings}
          onShowMoreRows={() => setVisibleRows((rows) => rows + ROWS_STEP)}
          onToggleType={handleToggleType}
          visibleRows={visibleRows}
        />
      )}
    </div>
  )
}
