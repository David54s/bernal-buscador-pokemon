/**
 * EL GRAFO DE SEGUIMIENTO
 * =======================
 *
 * (El recorrido —qué Pokémon se han visitado— vive en `trail.ts`: es estado de
 * la exploración, no estructura del grafo.)
 *
 * Recuperación por navegación: en vez de describir lo que se busca, se parte de
 * algo conocido y se siguen relaciones hasta llegar a otra cosa.
 *
 * El grafo es HETEROGÉNEO, y ésa es la decisión de diseño
 * -------------------------------------------------------
 * Hay dos clases de nodo, Pokémon y TIPO, porque un grafo que solo tuviera
 * Pokémon no permitiría el paseo que interesa:
 *
 *     Charmander ──es de tipo──▶ Fuego ──le gana a──▶ Planta ──tiene──▶ Bulbasaur
 *
 * El nodo de en medio es un concepto, no otro Pokémon. Sin él, «le gana a»
 * sería un salto directo a los cuatrocientos y pico Pokémon débiles al fuego:
 * eso no es una arista, es un volcado. Con él, cada paso ofrece un puñado de
 * opciones y el recorrido se puede seguir.
 *
 * De dónde salen las aristas
 * --------------------------
 *   evolución    `index.evolvesFrom` / `evolvesTo`, derivadas del corpus
 *   tipo         `doc.typeIds` y `index.byType`, que ya existían
 *   ventajas     `CorpusType.str` / `wk` / `nil`, rescatadas de unas respuestas
 *                que el constructor del corpus ya descargaba y descartaba
 *
 * Nada de esto consulta el índice invertido: son listas de adyacencia, y la
 * navegación es un problema distinto del de emparejar texto. La búsqueda no se
 * ve afectada en absoluto.
 */

import type { PokedexIndex } from './index-types.ts'

/* --- Nodos ------------------------------------------------------------------ */

export const NODE = {
  POKEMON: 'pokemon',
  TYPE: 'type',
  GENERATION: 'generation',
  COLOR: 'color',
} as const

export type NodeKind = (typeof NODE)[keyof typeof NODE]

/**
 * Un nodo del grafo: un Pokémon concreto, o uno de los tres conceptos por los
 * que se puede pasar para llegar a otros.
 */
export type GraphNode =
  | { kind: 'pokemon'; docId: number }
  | { kind: 'type'; typeId: number }
  | { kind: 'generation'; genId: number }
  | { kind: 'color'; colorId: number }

/**
 * Clave estable para usar un nodo en un `Set`, un `Map` o un `key` de React.
 *
 * Lleva la clase delante porque los identificadores son espacios de numeración
 * distintos: el tipo 5 y el color 5 no tienen nada que ver.
 */
export function nodeKey(node: GraphNode): string {
  switch (node.kind) {
    case NODE.POKEMON:
      return `p${node.docId}`
    case NODE.TYPE:
      return `t${node.typeId}`
    case NODE.GENERATION:
      return `g${node.genId}`
    case NODE.COLOR:
      return `c${node.colorId}`
  }
}

/* --- Aristas ---------------------------------------------------------------- */

/**
 * Las clases de arista. El orden importa: es el de presentación, de la relación
 * más concreta a la más amplia.
 */
export const EDGE = {
  EVOLVES_TO: 'evolucionaA',
  EVOLVES_FROM: 'evolucionaDe',
  OTHER_FORMS: 'otrasFormas',
  HAS_TYPE: 'esDeTipo',
  HAS_GENERATION: 'esDeGeneracion',
  HAS_COLOR: 'esDeColor',
  STRONG_AGAINST: 'leGanaA',
  WEAK_AGAINST: 'pierdeContra',
  NO_EFFECT: 'noAfectaA',
  MEMBERS: 'miembros',
  SIMILAR: 'parecidos',
} as const

export type EdgeKind = (typeof EDGE)[keyof typeof EDGE]

/** Los vecinos alcanzables por una misma arista. */
export interface Neighbourhood {
  edge: EdgeKind
  nodes: GraphNode[]
  /**
   * Cuántos había antes de recortar. Solo difiere de `nodes.length` en
   * «miembros», donde un tipo alcanza más de cien Pokémon.
   */
  total: number
}

/** Cuántos miembros de un tipo se ofrecen. Más no caben en una fila. */
const MAX_MEMBERS = 20

/* --- Recorrido --------------------------------------------------------------- */

/**
 * Una especie, una entrada.
 *
 * Es el mismo criterio que ya aplican la consulta reducida y el recomendador, y
 * por el mismo motivo: Charizard y sus tres formas Mega son el mismo Pokémon, y
 * ofrecerlos como cuatro destinos distintos sería ofrecer uno tres veces.
 */
function collapseSpecies(index: PokedexIndex, docIds: readonly number[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const docId of docIds) {
    const doc = index.docs[docId]
    if (doc === undefined || seen.has(doc.speciesIdx)) continue
    seen.add(doc.speciesIdx)
    out.push(docId)
  }
  return out
}

/** Los tipos a los que apunta un tipo por una de sus tres relaciones. */
function typeEdge(index: PokedexIndex, typeId: number, edge: EdgeKind): GraphNode[] {
  const type = index.typeById.get(typeId)
  if (type === undefined) return []

  const ids =
    edge === EDGE.STRONG_AGAINST
      ? type.str
      : edge === EDGE.WEAK_AGAINST
        ? type.wk
        : type.nil

  return (ids ?? []).map((id) => ({ kind: NODE.TYPE, typeId: id }))
}

/** Los miembros de un grupo, colapsados por especie y recortados. */
function members(index: PokedexIndex, docIds: readonly number[]): { nodes: GraphNode[]; total: number } {
  const all = collapseSpecies(index, docIds)
  return {
    nodes: all.slice(0, MAX_MEMBERS).map((docId) => ({ kind: NODE.POKEMON, docId })),
    total: all.length,
  }
}

/**
 * Los vecinos de un nodo, agrupados por la relación que lleva hasta ellos.
 *
 * Los grupos vacíos no se devuelven: un Pokémon que no evoluciona no debe
 * enseñar una fila «evoluciona a» en blanco.
 *
 * El orden va de lo concreto a lo difuso —evolución, tipo, generación, color y
 * al final los parecidos— porque es el orden en que alguien busca por dónde
 * seguir: primero lo que es un hecho sobre este Pokémon, después lo que
 * simplemente se le parece.
 */
export function neighbours(
  index: PokedexIndex,
  node: GraphNode,
  similar?: (docId: number) => number[],
): Neighbourhood[] {
  const out: Neighbourhood[] = []
  const push = (edge: EdgeKind, nodes: GraphNode[], total = nodes.length): void => {
    if (nodes.length > 0) out.push({ edge, nodes, total })
  }

  if (node.kind === NODE.POKEMON) {
    const doc = index.docs[node.docId]
    if (doc === undefined) return out

    /**
     * Las sugerencias van PRIMERO.
     *
     * El orden era el contrario —lo concreto delante, lo difuso al final— y en
     * uso resultó ser al revés de lo útil: estando en Moltres lo primero que se
     * veía era una fila con UNA tarjeta, «otras formas», y las veinte opciones
     * buenas quedaban al fondo, detrás de tipo, generación y color.
     *
     * Además son las únicas que tienen en cuenta el recorrido, así que son las
     * que responden a por dónde va el interés.
     *
     * Quien llama decide cómo calcularlas; el grafo no depende del recomendador,
     * solo lo acepta.
     */
    if (similar !== undefined) {
      push(
        EDGE.SIMILAR,
        similar(node.docId).map((docId) => ({ kind: NODE.POKEMON, docId })),
      )
    }

    /**
     * Evolucionar es una propiedad de la ESPECIE, así que las dos aristas se
     * consultan sobre el documento que la representa.
     *
     * No vale `byPokeId`: ese mapa tiene una entrada por documento, incluidas
     * las 326 formas alternas, así que preguntarle por una forma Mega devuelve
     * esa misma forma. Sin `speciesBase`, Charizard Mega X no tendría ninguna
     * arista de evolución.
     */
    const base = index.speciesBase.get(doc.speciesIdx) ?? node.docId

    push(
      EDGE.EVOLVES_TO,
      (index.evolvesTo.get(base) ?? []).map((docId) => ({ kind: NODE.POKEMON, docId })),
    )

    const parent = index.evolvesFrom.get(base)
    if (parent !== undefined) {
      push(EDGE.EVOLVES_FROM, [{ kind: NODE.POKEMON, docId: parent }])
    }

    /**
     * Las otras formas de la misma especie: Mega, Gigamax, regionales.
     *
     * Tiene arista propia y no sale entre los parecidos a propósito. Allí la
     * especie entera se excluye —si no, estando en Charizard aparecía
     * «Charizard (Mega Y)» como si fuera otro Pokémon—, así que ésta es la vía
     * para llegar a ellas, y además dice lo que son.
     */
    push(
      EDGE.OTHER_FORMS,
      index.docs
        .filter((other) => other.speciesIdx === doc.speciesIdx && other.docId !== node.docId)
        .map((other) => ({ kind: NODE.POKEMON, docId: other.docId })),
    )

    push(
      EDGE.HAS_TYPE,
      doc.typeIds.map((typeId) => ({ kind: NODE.TYPE, typeId })),
    )
    push(EDGE.HAS_GENERATION, [{ kind: NODE.GENERATION, genId: doc.genId }])
    push(EDGE.HAS_COLOR, [{ kind: NODE.COLOR, colorId: doc.colorId }])

    return out
  }

  if (node.kind === NODE.TYPE) {
    push(EDGE.STRONG_AGAINST, typeEdge(index, node.typeId, EDGE.STRONG_AGAINST))
    push(EDGE.WEAK_AGAINST, typeEdge(index, node.typeId, EDGE.WEAK_AGAINST))
    push(EDGE.NO_EFFECT, typeEdge(index, node.typeId, EDGE.NO_EFFECT))

    const m = members(index, index.byType.get(node.typeId) ?? [])
    push(EDGE.MEMBERS, m.nodes, m.total)
    return out
  }

  // Generación y color solo llevan a sus miembros: son etiquetas, no conceptos
  // con relaciones entre sí como las ventajas de tipo.
  const docIds =
    node.kind === NODE.GENERATION
      ? (index.byGen.get(node.genId) ?? [])
      : (index.byColor.get(node.colorId) ?? [])

  const m = members(index, docIds)
  push(EDGE.MEMBERS, m.nodes, m.total)
  return out
}

/* --- Estado del grafo --------------------------------------------------------- */

/** Si el corpus cargado trae o no los datos de relación. */
export function hasGraphData(index: PokedexIndex): boolean {
  return index.evolvesFrom.size > 0 || index.types.some((t) => t.str !== undefined)
}
