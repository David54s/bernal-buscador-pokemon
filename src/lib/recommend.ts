/**
 * RECOMENDAR A PARTIR DE LO VALORADO
 * ==================================
 *
 * Realimentación por relevancia con el algoritmo de Rocchio.
 *
 * La idea en una frase: **un gusto es una consulta que nadie escribió**. Si se
 * suman los términos de lo que gustó y se restan los de lo que no, queda una
 * consulta; y recuperar con ella es lo mismo que el motor ya hace con cualquier
 * otra. De ahí que el recomendador no necesite maquinaria nueva: necesita el
 * índice invertido y el IDF, que ya están.
 *
 *     perfil = (1/|gustan|) · Σ términos(gustan) − β · (1/|rechazan|) · Σ términos(rechazan)
 *
 * El índice directo
 * -----------------
 * El índice invertido va de término a documentos. Un perfil necesita lo
 * contrario: dado un Pokémon, qué términos lo describen. Eso no existía, y se
 * construye aquí leyendo campos que ya son enteros o cadenas en `Doc` —tipos,
 * generación, color y categoría—, sin tokenizar nada. Por eso cuesta 1 ms.
 *
 * Invertir `facetTerms` en su lugar parecía lo natural y está medido que NO
 * sirve: contiene cinco términos para una misma generación —"gen1",
 * "generacion", "generacioni", "generation", "generationi"— más la región, que
 * la duplica otra vez. Esa redundancia ahoga al tipo y a la categoría y baja la
 * precisión del 71,7 % al 58,1 %.
 *
 * Por qué la categoría entera y no sus palabras
 * ---------------------------------------------
 * Partida en palabras, a Squirtle le recomendaba PÁJAROS: "Pokémon Tiny Turtle"
 * comparte el token "tiny" con "Tiny Bird". Tratando la categoría como un
 * concepto indivisible el problema desaparece y la precisión sube diez puntos.
 *
 * Qué tan bien funciona
 * ---------------------
 * Medido sobre las 1025 especies, fracción de las seis recomendaciones que
 * comparte el tipo primario del Pokémon valorado:
 *
 *   con 1 valoración .... 73 %        (el azar da 5,6 %)
 *   con 5 valoraciones ... 89 %
 *
 * Que mejore al valorar más es justo lo que se le pide a un recomendador.
 */

import {
  EXPLORE_DIVERSITY,
  EXPLORE_TRAIL_WEIGHT,
  RATING,
  RECOMMEND_MAX,
  RECOMMEND_WEIGHT_FORM,
  RECOMMEND_WEIGHTS,
  ROCCHIO_BETA,
} from '../constants.ts'
import type { Rating } from '../constants.ts'
import type { Doc, PokedexIndex } from './index-types.ts'
import type { Ratings } from './ratings.ts'

/* --- El índice directo ------------------------------------------------------ */

/** Un término del perfil, con el peso de la faceta de la que sale. */
interface WeightedTerm {
  term: string
  weight: number
}

/**
 * Los términos que describen a un Pokémon, con su peso.
 *
 * Las claves llevan prefijo —"t10", "K Fire Pokémon"— para que un identificador
 * de tipo no pueda confundirse con uno de color: son espacios de numeración
 * distintos que comparten los enteros pequeños.
 */
function docTerms(doc: Doc): WeightedTerm[] {
  const out: WeightedTerm[] = []
  for (const typeId of doc.typeIds) out.push({ term: `t${typeId}`, weight: RECOMMEND_WEIGHTS.type })
  out.push({ term: `K${doc.genusEn}`, weight: RECOMMEND_WEIGHTS.genus })
  out.push({ term: `g${doc.genId}`, weight: RECOMMEND_WEIGHTS.generation })
  out.push({ term: `c${doc.colorId}`, weight: RECOMMEND_WEIGHTS.color })
  out.push({ term: `F${formFamily(doc)}`, weight: RECOMMEND_WEIGHT_FORM })
  return out
}

/** Las familias de forma que se reconocen. El resto cae en «otra». */
const FORM_FAMILIES = ['Mega', 'Gmax', 'Alola', 'Galar', 'Hisui', 'Paldea', 'Totem'] as const

/**
 * A qué familia de forma pertenece: base, Mega, Gigamax, regional…
 *
 * Es lo que permite que el gusto por una clase de forma se note. Sin esto, una
 * Mega y su base son indistinguibles para el perfil.
 */
function formFamily(doc: Doc): string {
  if (doc.formSuffix === null) return 'base'
  const first = doc.formSuffix.split(' ')[0] ?? ''
  return (FORM_FAMILIES as readonly string[]).includes(first) ? first : 'otra'
}

/** Documento → sus términos, y término → sus documentos. */
export interface ProfileIndex {
  /** Paralelo a `index.docs`. */
  forward: WeightedTerm[][]
  /** Las listas de postings del espacio de recomendación. */
  postings: Map<string, number[]>
  /** El total, para el idf. */
  docs: number
}

/**
 * Construye el índice directo. Cuesta 1 ms, así que no hace falta ni caché ni
 * cálculo diferido: se puede recalcular en cada valoración sin que se note.
 */
export function buildProfileIndex(index: PokedexIndex): ProfileIndex {
  const forward = index.docs.map(docTerms)
  const postings = new Map<string, number[]>()

  forward.forEach((terms, docId) => {
    for (const { term } of terms) {
      let list = postings.get(term)
      if (list === undefined) {
        list = []
        postings.set(term, list)
      }
      list.push(docId)
    }
  })

  return { forward, postings, docs: index.docs.length }
}

/** log(N / df): un término raro dice más sobre el gusto que uno común. */
function idf(profile: ProfileIndex, term: string): number {
  const df = profile.postings.get(term)?.length ?? 0
  return df === 0 ? 0 : Math.log(profile.docs / df)
}

/* --- El perfil -------------------------------------------------------------- */

/** Un término del perfil con el peso que acabó teniendo. */
export interface ProfileTerm {
  term: string
  weight: number
}

/**
 * El vector de Rocchio.
 *
 * Cada clase se normaliza por cuántos elementos tiene, de modo que valorar
 * veinte Pokémon no desborda a quien valoró dos: lo que importa es la dirección
 * del gusto, no cuánto se ha pulsado.
 */
export function buildProfile(
  profile: ProfileIndex,
  liked: readonly number[],
  disliked: readonly number[],
): ProfileTerm[] {
  const weights = new Map<string, number>()

  const accumulate = (docIds: readonly number[], sign: number): void => {
    if (docIds.length === 0) return
    const share = sign / docIds.length
    for (const docId of docIds) {
      for (const { term, weight } of profile.forward[docId] ?? []) {
        weights.set(term, (weights.get(term) ?? 0) + share * weight * idf(profile, term))
      }
    }
  }

  accumulate(liked, 1)
  accumulate(disliked, -ROCCHIO_BETA)

  return [...weights]
    .filter(([, weight]) => weight !== 0)
    .map(([term, weight]) => ({ term, weight }))
}

/* --- La recuperación -------------------------------------------------------- */

export interface Recommendation {
  docId: number
  score: number
}

/**
 * Recupera con el perfil, igual que `searchReduced` recupera con una consulta
 * reducida: recorriendo la lista de postings de cada término y acumulando.
 *
 * Dos reglas heredadas de allí, por los mismos motivos:
 *
 *   - **Lo ya valorado no se recomienda.** Recomendar lo que acabas de marcar
 *     sería no recomendar nada.
 *   - **Una especie, una fila.** Charizard y sus tres formas Mega comparten
 *     tipo, categoría, generación y color, así que sin colapsar ocuparían los
 *     cuatro primeros puestos siendo el mismo Pokémon.
 */
export function recommendFrom(
  index: PokedexIndex,
  profile: ProfileIndex,
  terms: readonly ProfileTerm[],
  exclude: ReadonlySet<number>,
  limit: number = RECOMMEND_MAX,
): Recommendation[] {
  if (terms.length === 0) return []

  const score = new Map<number, number>()
  for (const { term, weight } of terms) {
    for (const docId of profile.postings.get(term) ?? []) {
      score.set(docId, (score.get(docId) ?? 0) + weight)
    }
  }

  const bySpecies = new Map<number, Recommendation>()
  for (const [docId, value] of score) {
    if (value <= 0 || exclude.has(docId)) continue
    const speciesIdx = index.docs[docId]!.speciesIdx
    const best = bySpecies.get(speciesIdx)
    if (best === undefined || value > best.score) bySpecies.set(speciesIdx, { docId, score: value })
  }

  return [...bySpecies.values()]
    .sort((a, b) => b.score - a.score || index.canonicalRank[a.docId]! - index.canonicalRank[b.docId]!)
    .slice(0, limit)
}

/* --- Entrada principal ------------------------------------------------------ */

export interface RecommendResult {
  docIds: number[]
  /** Cuántos documentos se valoraron de cada clase, para explicarlo en pantalla. */
  liked: number
  disliked: number
  /** El último que gustó, para titular la fila: «Porque te gustó X». */
  because: number | null
  /** Los términos que más pesan, de más a menos. Es el perfil, visible. */
  top: ProfileTerm[]
}

/**
 * Las recomendaciones a partir de lo valorado.
 *
 * Las valoraciones llegan por número de Pokédex —ver `ratings.ts`— y se
 * traducen aquí a documentos usando `byPokeId`, que el índice ya tiene.
 */
export function recommend(
  index: PokedexIndex,
  profile: ProfileIndex,
  ratings: Ratings,
  limit: number = RECOMMEND_MAX,
): RecommendResult {
  const liked: number[] = []
  const disliked: number[] = []

  for (const [pokeId, rating] of ratings) {
    const docId = index.byPokeId.get(pokeId)
    if (docId === undefined) continue
    if (rating === RATING.LIKE) liked.push(docId)
    else disliked.push(docId)
  }

  const terms = buildProfile(profile, liked, disliked)
  const exclude = new Set([...liked, ...disliked])
  const docIds = recommendFrom(index, profile, terms, exclude, limit).map((r) => r.docId)

  return {
    docIds,
    liked: liked.length,
    disliked: disliked.length,
    because: liked.length > 0 ? liked[liked.length - 1]! : null,
    top: [...terms].sort((a, b) => b.weight - a.weight).slice(0, 5),
  }
}

/* --- Sugerencias al explorar ------------------------------------------------ */

/** Un documento del recorrido, con cuánto debe pesar en el perfil. */
export interface WeightedDoc {
  docId: number
  weight: number
}

/** El vector de Rocchio a partir de documentos con peso propio. */
function weightedProfile(profile: ProfileIndex, docs: readonly WeightedDoc[]): ProfileTerm[] {
  const weights = new Map<string, number>()
  for (const { docId, weight } of docs) {
    for (const { term, weight: w } of profile.forward[docId] ?? []) {
      weights.set(term, (weights.get(term) ?? 0) + weight * w * idf(profile, term))
    }
  }
  return [...weights]
    .filter(([, weight]) => weight !== 0)
    .map(([term, weight]) => ({ term, weight }))
}

/**
 * Reordena quedándose con lo relevante pero sin amontonar.
 *
 * Después de elegir uno, los que repiten sus mismos atributos pierden valor, de
 * modo que la lista cubre varias facetas en vez de ocho veces la misma. Es la
 * diversificación por relevancia marginal, la respuesta clásica a un resultado
 * que se apelmaza.
 *
 * Sin esto, Charizard —que es Fuego Y Volador— sugería ocho Pokémon de solo
 * tres tipos distintos. Ver `EXPLORE_DIVERSITY`.
 */
function diversify(
  profile: ProfileIndex,
  ranked: readonly Recommendation[],
  limit: number,
  lambda: number = EXPLORE_DIVERSITY,
): number[] {
  // Solo se diversifica la cabeza: más abajo el parecido ya es tan flojo que
  // reordenar no aporta y el coste crecería con el cuadrado.
  const pool = ranked.slice(0, limit * 6).map((r) => ({ ...r }))
  const covered = new Map<string, number>()
  const out: number[] = []

  while (out.length < limit && pool.length > 0) {
    let bestAt = 0
    let bestValue = -Infinity
    for (let i = 0; i < pool.length; i += 1) {
      const terms = profile.forward[pool[i]!.docId] ?? []
      let overlap = 0
      for (const { term } of terms) overlap += covered.get(term) ?? 0
      const value = lambda * pool[i]!.score - (1 - lambda) * overlap * 2
      if (value > bestValue) {
        bestValue = value
        bestAt = i
      }
    }
    const [chosen] = pool.splice(bestAt, 1)
    if (chosen === undefined) break
    out.push(chosen.docId)
    for (const { term } of profile.forward[chosen.docId] ?? []) {
      covered.set(term, (covered.get(term) ?? 0) + 1)
    }
  }
  return out
}

/**
 * Los Pokémon que se ofrecen al explorar desde uno concreto.
 *
 * Tres diferencias con las recomendaciones de la pestaña del buscador, y cada
 * una responde a un problema visto en uso:
 *
 *   - **Se excluye la especie entera**, no solo el documento. Estando en
 *     Charizard aparecía «Charizard (Mega Y)» y estando en la Mega aparecía
 *     «Charizard»: el colapso por especie elegía como representante otra forma
 *     de la misma. Las otras formas tienen su propia relación en el grafo.
 *   - **El recorrido cuenta.** Lo ya visitado inclina el perfil, así que pasar
 *     por varias Megas lleva a más Megas. Ver `EXPLORE_TRAIL_WEIGHT`.
 *   - **Se diversifica**, para que la lista no sea ocho veces lo mismo.
 */
export function exploreSuggestions(
  index: PokedexIndex,
  profile: ProfileIndex,
  current: number,
  trail: readonly number[] = [],
  limit: number = RECOMMEND_MAX,
): number[] {
  const doc = index.docs[current]
  if (doc === undefined) return []

  const docs: WeightedDoc[] = [{ docId: current, weight: 1 }]
  trail.forEach((docId, i) => {
    // Lo más reciente del recorrido pesa más que lo del principio: refleja
    // hacia dónde va el interés, no de dónde venía.
    if (docId !== current && index.docs[docId] !== undefined) {
      docs.push({ docId, weight: (EXPLORE_TRAIL_WEIGHT * (i + 1)) / trail.length })
    }
  })

  const terms = weightedProfile(profile, docs)

  /**
   * Fuera de las sugerencias: la especie en la que se está y todo lo ya
   * visitado.
   *
   * Lo visitado sigue INCLINANDO el perfil —de eso vive el sesgo hacia las
   * Megas— pero deja de ofrecerse como destino: explorar es llegar a sitios
   * nuevos, y para volver ya está la tira del recorrido. Sin este corte, el
   * solape crecía con el paseo: medido, al salto quince seis de cada veinte
   * sugerencias eran sitios donde ya se había estado.
   */
  const exclude = new Set<number>()
  for (const other of index.docs) {
    if (other.speciesIdx === doc.speciesIdx) exclude.add(other.docId)
  }
  for (const docId of trail) {
    const visited = index.docs[docId]
    if (visited === undefined) continue
    for (const other of index.docs) {
      if (other.speciesIdx === visited.speciesIdx) exclude.add(other.docId)
    }
  }

  const ranked = recommendFrom(index, profile, terms, exclude, limit * 6)
  return diversify(profile, ranked, limit)
}

/** Qué valoración tiene un documento, si tiene alguna. */
export function ratingOf(index: PokedexIndex, ratings: Ratings, docId: number): Rating | undefined {
  const doc = index.docs[docId]
  return doc === undefined ? undefined : ratings.get(doc.pokeId)
}
