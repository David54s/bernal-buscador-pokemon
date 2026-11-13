import { useCallback, useMemo, useState } from 'react'
import { GENERATION_COLORS, TYPE_COLORS, FALLBACK_TYPE_COLOR } from '../constants.ts'
import type { Rating } from '../constants.ts'
import { edgeLabel, nodeLabel, t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'
import { hasGraphData, NODE, neighbours, nodeKey } from '../lib/graph.ts'
import type { GraphNode } from '../lib/graph.ts'
import type { PokedexIndex } from '../lib/index-types.ts'
import { buildProfileIndex, exploreSuggestions } from '../lib/recommend.ts'
import { readStoredTrail, storeTrail, visit } from '../lib/trail.ts'
import { useViewer } from '../viewers/viewer-context.ts'
import { PokemonRow } from './PokemonRow.tsx'

interface GraphExplorerProps {
  index: PokedexIndex
  lang: Lang
  onToggleType: (typeId: number) => void
  activeTypes: ReadonlySet<number>
  ratings?: ReadonlyMap<number, Rating> | undefined
  onRate?: ((pokeId: number, rating: Rating) => void) | undefined
}

/** Por dónde se empieza si no se ha elegido nada. */
const START_SLUG = 'charmander'

/**
 * El color de la pastilla de un nodo-concepto.
 *
 * Cada clase usa su propia paleta, la misma con la que ya se pintan las
 * etiquetas de las tarjetas, para que un tipo se reconozca como tipo y una
 * generación como generación sin tener que leerlos.
 */
function chipColor(index: PokedexIndex, node: GraphNode): string {
  switch (node.kind) {
    case NODE.TYPE: {
      const type = index.typeById.get(node.typeId)
      return type ? (TYPE_COLORS[type.slug] ?? FALLBACK_TYPE_COLOR) : FALLBACK_TYPE_COLOR
    }
    case NODE.GENERATION:
      return GENERATION_COLORS[node.genId] ?? FALLBACK_TYPE_COLOR
    case NODE.COLOR:
      return COLOR_SWATCH[node.colorId] ?? FALLBACK_TYPE_COLOR
    case NODE.POKEMON:
      return FALLBACK_TYPE_COLOR
  }
}

/**
 * Un color por cada color del catálogo. Índice = id de PokeAPI.
 *
 * No se usan los nombres tal cual —un «blanco» puro sobre fondo claro sería
 * ilegible—: son versiones con contraste suficiente para texto blanco encima.
 */
const COLOR_SWATCH: Record<number, string> = {
  1: '#3a3a3a', // negro
  2: '#2f80ed', // azul
  3: '#8a6240', // marrón
  4: '#7f8c8d', // gris
  5: '#42a85a', // verde
  6: '#d9699b', // rosa
  7: '#8e44ad', // morado
  8: '#d94a3d', // rojo
  9: '#8d9aa5', // blanco
  10: '#c9a227', // amarillo
}

/**
 * Navegación por el grafo de relaciones.
 *
 * Tres piezas: el rastro de por dónde se ha pasado, el nodo en el que se está,
 * y los vecinos agrupados por la relación que lleva hasta ellos.
 *
 * Es recuperación por navegación, no por consulta: no se describe lo que se
 * busca, se parte de algo conocido y se siguen aristas. Por eso vive en su
 * propia vista y no comparte estado con el buscador.
 */
export function GraphExplorer({
  index,
  lang,
  onToggleType,
  activeTypes,
  ratings,
  onRate,
}: GraphExplorerProps) {
  const inicio = useMemo<GraphNode>(() => {
    const doc = index.docs.find((d) => d.slug === START_SLUG) ?? index.docs[0]
    return { kind: NODE.POKEMON, docId: doc?.docId ?? 0 }
  }, [index])

  /** De quién es el recorrido. Cada perfil pasea por su cuenta. */
  const { active } = useViewer()

  const [actual, setActual] = useState<GraphNode>(inicio)
  const inicioDocId = inicio.kind === NODE.POKEMON ? inicio.docId : -1

  /**
   * El recorrido: los Pokémon por los que se ha pasado, en orden y sin perder
   * ninguno. Arranca con lo guardado en visitas anteriores.
   *
   * Es una lista aparte del nodo en el que se está, y no el camino hasta él:
   * un camino no puede repetir nodos, así que al volver sobre uno se recortaba
   * y borraba media exploración. Ver `trail.ts`.
   *
   * Se lee del cajón del perfil activo. No hace falta reaccionar a que cambie:
   * cambiar de perfil remonta `App` entero, y con él esto.
   */
  const [trail, setTrail] = useState<readonly number[]>(() => readStoredTrail(active.id))

  /**
   * Los parecidos salen del recomendador que ya existe, preguntándole como si
   * el Pokémon enfocado tuviera un «me gusta».
   *
   * No toca las valoraciones reales: es una consulta al vuelo, de 0,04 ms. El
   * índice del perfil cuesta 1 ms y se construye una vez por índice, no por
   * salto.
   */
  const profile = useMemo(() => buildProfileIndex(index), [index])


  const ir = useCallback(
    (node: GraphNode) => {
      setActual(node)
      if (node.kind !== NODE.POKEMON) return

      // Solo los Pokémon entran en el recorrido: los conceptos son el cómo se
      // llegó, no el qué se visitó.
      const doc = index.docs[node.docId]
      if (doc === undefined) return
      setTrail((t) => {
        const next = visit(t, doc.pokeId)
        storeTrail(active.id, next)
        return next
      })
    },
    [index, active.id],
  )

  /**
   * Borrar el recorrido.
   *
   * Hace falta precisamente porque ahora se guarda: sin esto, lo explorado una
   * vez se quedaría ahí para siempre. No mueve el nodo en el que se está —se
   * borra el historial, no se navega—, y el actual vuelve a entrar en cuanto se
   * da un paso.
   */
  const limpiar = useCallback(() => {
    setTrail([])
    storeTrail(active.id, [])
  }, [active.id])

  /** Los documentos del recorrido, resueltos para pintarlos. */
  const visitados = useMemo(
    () =>
      trail
        .map((pokeId) => index.byPokeId.get(pokeId))
        .filter((docId): docId is number => docId !== undefined),
    [index, trail],
  )

  /**
   * Los parecidos tienen en cuenta el RECORRIDO, no solo el nodo actual: pasar
   * por varias formas Mega lleva a más Megas. Ver `exploreSuggestions`.
   */
  const similar = useCallback(
    (docId: number): number[] => exploreSuggestions(index, profile, docId, visitados),
    [index, profile, visitados],
  )

  const vecinos = useMemo(() => neighbours(index, actual, similar), [index, actual, similar])

  if (!hasGraphData(index)) {
    return (
      <section className="graph">
        <p className="stats__note">{t(lang, 'graphNoData')}</p>
      </section>
    )
  }

  return (
    <section className="graph">
      <p className="stats__lead">{t(lang, 'graphLead')}</p>

      {/* El RECORRIDO: los Pokémon visitados, en orden y sin perder ninguno.
          Antes aquí había un camino que se recortaba al volver sobre un nodo ya
          visto, y eso borraba media exploración. Ver `trail.ts`. */}
      {visitados.length > 0 && (
        <nav aria-label={t(lang, 'graphTrail')} className="trail">
          <span className="trail__label">
            {t(lang, 'graphTrail')} ({visitados.length})
          </span>
          <ol className="trail__steps">
            {visitados.map((docId, i) => {
              const esActual = actual.kind === NODE.POKEMON && actual.docId === docId
              return (
                <li className="trail__step" key={docId}>
                  {i > 0 && <span className="trail__edge">→</span>}
                  <button
                    aria-current={esActual ? 'true' : undefined}
                    className={`trail__node${esActual ? ' trail__node--current' : ''}`}
                    onClick={() => ir({ kind: NODE.POKEMON, docId })}
                    type="button"
                  >
                    {nodeLabel(index, { kind: NODE.POKEMON, docId }, lang)}
                  </button>
                </li>
              )
            })}
          </ol>
          <button className="trail__clear" onClick={limpiar} type="button">
            {t(lang, 'graphClear')}
          </button>
        </nav>
      )}

      <h2 className="graph__focus">
        <span className="graph__focus-label">{t(lang, 'graphFocus')}</span>{' '}
        {nodeLabel(index, actual, lang)}
      </h2>

      {vecinos.map((grupo) => {
        const titulo =
          grupo.total > grupo.nodes.length
            ? `${edgeLabel(lang, grupo.edge)} · ${grupo.nodes.length} ${t(lang, 'graphOf')} ${grupo.total}`
            : edgeLabel(lang, grupo.edge)

        // Los vecinos que son TIPOS se pintan como pastillas: un tipo no tiene
        // sprite ni número, así que una tarjeta de Pokémon no le sirve.
        const sonConceptos = grupo.nodes.every((n) => n.kind !== NODE.POKEMON)
        if (sonConceptos) {
          return (
            <div className="graph__types" key={grupo.edge}>
              <h3 className="graph__edge">{titulo}</h3>
              <ul className="graph__chips">
                {grupo.nodes.map((n) => (
                  <li key={nodeKey(n)}>
                    <button
                      className="graph__chip"
                      onClick={() => ir(n)}
                      style={{ backgroundColor: chipColor(index, n) }}
                      type="button"
                    >
                      {nodeLabel(index, n, lang)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        }

        const docIds = grupo.nodes.map((n) => (n as { docId: number }).docId)
        return (
          <PokemonRow
            activeTypes={activeTypes}
            group={{ key: { kind: 'all' }, docIds }}
            index={index}
            key={grupo.edge}
            lang={lang}
            onNavigate={(docId) => ir({ kind: NODE.POKEMON, docId })}
            onRate={onRate}
            onSeeRest={() => undefined}
            onToggleType={onToggleType}
            ratings={ratings}
            title={titulo}
          />
        )
      })}

      {vecinos.length === 0 && (
        <p className="stats__note">
          {/* No debería pasar: todo Pokémon tiene al menos un tipo. */}
          {t(lang, 'graphNoData')}
        </p>
      )}

      {/* Volver al punto de partida sin borrar lo andado. */}
      {!(actual.kind === NODE.POKEMON && actual.docId === inicioDocId) && (
        <p className="graph__restart">
          <button className="graph__chip graph__chip--ghost" onClick={() => ir(inicio)} type="button">
            {t(lang, 'graphPick')}: {nodeLabel(index, inicio, lang)}
          </button>
        </p>
      )}
    </section>
  )
}
