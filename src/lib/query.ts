/**
 * EL MOTOR DE CONSULTA
 * ====================
 *
 * Responde una consulta **preguntando al índice**, no recorriendo el catálogo.
 * Cada nivel de coincidencia tiene su propia estructura y su propia forma de
 * consultarla:
 *
 *   nivel 0  ID_EXACT     un Map de id de Pokédex a documento
 *   nivel 1  NAME_EXACT   búsqueda binaria en el diccionario de nombres
 *   nivel 2  PREFIX       rango de prefijo: DOS búsquedas binarias, cero comparaciones más
 *   nivel 3  WORD_PREFIX  rango de prefijo en el diccionario de palabras
 *   nivel 4  CONTAINS     n-gramas; exacto si la consulta mide <= 3, con verificación si mide más
 *   nivel 5  FACET        rango de prefijo en el diccionario de tipos/generaciones/géneros
 *   nivel 6  FUZZY        se corrige la consulta y se vuelve a preguntar
 *
 * La medida de que esto no es un barrido está en `stats.docsTouched`: para "char"
 * son unas 60 casillas de 1351.
 *
 * ACUMULADOR. El mejor nivel por documento se resuelve con un `Uint8Array` y la
 * regla "el primero que escribe gana": los niveles se recorren de mejor a peor y
 * solo se escribe en una casilla vacía. Así no hace falta comparar nada ni crear
 * un `Map` en cada pulsación de tecla.
 *
 * NO ES REENTRANTE: reutiliza los búferes del índice. Los reinicia al entrar —así
 * que llamarla dos veces seguidas es inofensivo, que es justo lo que hace
 * StrictMode— y nunca devuelve esos búferes: la respuesta son arrays nuevos.
 */

import { FUZZY_MIN_LEN, REDUCE_MIN_TOKENS } from '../constants.ts'
import { suggestTerm } from './fuzzy.ts'
import { reduceQuery, searchReduced } from './reduce.ts'
import type {
  FacetCounts,
  FacetTermMeta,
  Filters,
  PokedexIndex,
  QueryResult,
  Reduction,
} from './index-types.ts'
import { intersectAll, lowerBound, prefixRange } from './postings.ts'
import { NO_LEVEL, SCORE } from './scoring.ts'
import { grams, normalize, prefixUpperBound, tokenize } from './tokenize.ts'

/** Sin facetas activas. Identidad estable, para no invalidar memos en React. */
export const NO_FILTERS: Filters = { types: new Set(), gens: new Set() }

export interface ParsedQuery {
  raw: string
  /**
   * La consulta entera normalizada, con los espacios borrados: "mr mime" ->
   * "mrmime". Es la forma con la que se comparan los nombres completos, y es lo
   * que hace que escribir "mr mime" alcance el nivel 1 con Mr. Mime.
   */
  flat: string
  /** La consulta partida en palabras: "mr mime" -> ["mr", "mime"]. */
  tokens: string[]
  /** La consulta entera como número de Pokédex, si lo es. */
  numeric: number | null
}

export function parseQuery(raw: string): ParsedQuery {
  const flat = normalize(raw)
  return {
    raw,
    flat,
    tokens: tokenize(raw),
    numeric: /^\d+$/.test(flat) ? Number(flat) : null,
  }
}

/** Estado mutable de una consulta en curso. */
interface Run {
  index: PokedexIndex
  docsTouched: number
  candidatesVerified: number
  facets: FacetTermMeta[]
}

/* --- Escritura en el acumulador -------------------------------------------- */

function write(buffer: Uint8Array, touched: number[], docId: number, level: number): void {
  // El primero que escribe gana: los niveles se recorren de mejor a peor, así que
  // una casilla ya ocupada tiene por definición un nivel mejor o igual.
  if (buffer[docId] === NO_LEVEL) {
    buffer[docId] = level
    touched.push(docId)
  }
}

function writeAll(
  buffer: Uint8Array,
  touched: number[],
  docIds: readonly number[],
  level: number,
): void {
  for (const docId of docIds) write(buffer, touched, docId, level)
}

/* --- Un token contra el índice --------------------------------------------- */

/**
 * Puntúa un solo token, escribiendo en `buffer`. Recorre los niveles de mejor a
 * peor y se apoya en la regla del primero que escribe.
 */
function scoreToken(
  run: Run,
  token: string,
  numeric: number | null,
  buffer: Uint8Array,
  touched: number[],
): void {
  const index = run.index
  const upper = prefixUpperBound(token)

  /* Nivel 0 — el id de Pokédex. Un solo acceso a un Map. */
  if (numeric !== null) {
    const docId = index.byPokeId.get(numeric)
    if (docId !== undefined) write(buffer, touched, docId, SCORE.ID_EXACT)
  }

  /* Niveles 1 y 2 — nombres completos, del mismo diccionario ordenado.
     Primero la coincidencia exacta y después el rango de prefijo, que la
     contiene: el orden garantiza que el nombre idéntico se queda con el nivel 1. */
  const nameAt = lowerBound(index.nameTerms, token)
  if (index.nameTerms[nameAt] === token) {
    writeAll(buffer, touched, index.nameTermDocs[nameAt]!, SCORE.NAME_EXACT)
  }
  const [nameFrom, nameTo] = prefixRange(index.nameTerms, token, upper)
  for (let i = nameFrom; i < nameTo; i += 1) {
    writeAll(buffer, touched, index.nameTermDocs[i]!, SCORE.PREFIX)
  }

  /* Nivel 3 — alguna palabra del nombre empieza por el token. */
  const [segFrom, segTo] = prefixRange(index.segTerms, token, upper)
  for (let i = segFrom; i < segTo; i += 1) {
    writeAll(buffer, touched, index.segPostings[i]!, SCORE.WORD_PREFIX)
  }

  /* Nivel 4 — la subcadena, vía n-gramas. */
  if (token.length <= 3) {
    // Los gramas se indexaron sin relleno, así que para 1, 2 o 3 caracteres la
    // lista del grama YA es la respuesta exacta: no hay nada que verificar.
    const exact = index.docGrams.get(token)
    if (exact !== undefined) writeAll(buffer, touched, exact, SCORE.CONTAINS)
  } else {
    // Para consultas más largas se intersectan los trigramas. La intersección es
    // condición necesaria pero no suficiente —los trigramas de "char" podrían
    // aparecer desordenados en otro nombre—, así que hay que confirmar.
    const lists: number[][] = []
    let missing = false
    for (const gram of grams(token, 3)) {
      const posting = index.docGrams.get(gram)
      if (posting === undefined) {
        missing = true
        break
      }
      lists.push(posting)
    }
    if (!missing && lists.length > 0) {
      const candidates = intersectAll(lists)
      run.candidatesVerified += candidates.length
      for (const docId of candidates) {
        if (
          index.flat[docId]!.includes(token) ||
          index.flatEs[docId]!.includes(token) ||
          index.flatEn[docId]!.includes(token)
        ) {
          write(buffer, touched, docId, SCORE.CONTAINS)
        }
      }
    }
  }

  /* Nivel 5 — tipos, generaciones, regiones y géneros, en ambos idiomas.
     Por prefijo y no exacto, para que escribir "fue" ya saque los de Fuego. */
  const [facetFrom, facetTo] = prefixRange(index.facetTerms, token, upper)
  for (let i = facetFrom; i < facetTo; i += 1) {
    writeAll(buffer, touched, index.facetPostings[i]!, SCORE.FACET)
    const meta = index.facetMeta[i]
    if (meta !== undefined && meta.kind !== 'genus') run.facets.push(meta)
  }
}

/* --- Consulta completa ----------------------------------------------------- */

function resetBuffer(buffer: Uint8Array, touched: number[]): void {
  for (const docId of touched) buffer[docId] = NO_LEVEL
  touched.length = 0
}

/**
 * Resuelve una consulta. Devuelve los documentos ordenados por relevancia junto a
 * su nivel, sin aplicar todavía ninguna faceta: filtrar es un paso aparte y mucho
 * más barato, para que marcar un chip no obligue a volver a consultar el índice.
 */
export function runQuery(index: PokedexIndex, parsed: ParsedQuery): QueryResult {
  const startedAt = performance.now()
  const scratch = index.scratch
  const run: Run = { index, docsTouched: 0, candidatesVerified: 0, facets: [] }

  // Se reinicia al entrar, no al salir: así dos ejecuciones seguidas con los
  // mismos búferes son inofensivas.
  resetBuffer(scratch.best, scratch.bestTouched)
  resetBuffer(scratch.token, scratch.tokenTouched)

  /* Consulta vacía: el orden canónico ya está calculado, no hay nada que hacer. */
  if (parsed.flat === '') {
    return {
      docIds: [...index.canonicalOrder],
      levels: new Array<number>(index.canonicalOrder.length).fill(SCORE.CONTAINS),
      suggestion: null,
      suggestedFacets: [],
      reduction: null,
      stats: {
        ms: performance.now() - startedAt,
        docsTouched: 0,
        candidatesVerified: 0,
        usedFuzzy: false,
        tokens: [],
      },
    }
  }

  const matched = search(index, parsed, run, scratch)

  /* Nivel 6 — solo si no hubo NADA. Cuatro condiciones, todas obligatorias,
     porque la coincidencia aproximada es la principal fuente de ruido:
     un único token, de al menos 4 caracteres, cero resultados exactos, y
     presentada aparte. Si ya había resultados, corregir solo estorbaría. */
  let suggestion: string | null = null
  let usedFuzzy = false

  if (
    matched.docIds.length === 0 &&
    parsed.tokens.length === 1 &&
    parsed.flat.length >= FUZZY_MIN_LEN
  ) {
    const found = suggestTerm(parsed.flat, index.vocab, index.termGrams)?.term ?? null
    if (found !== null) {
      suggestion = found
      // Se vuelve a preguntar al motor con la consulta corregida y todo lo que
      // aparezca se marca como aproximado.
      resetBuffer(scratch.best, scratch.bestTouched)
      resetBuffer(scratch.token, scratch.tokenTouched)
      const corrected = parseQuery(found)
      const again = search(index, corrected, run, scratch)
      if (again.docIds.length > 0) {
        usedFuzzy = true
        return {
          docIds: again.docIds,
          levels: again.docIds.map(() => SCORE.FUZZY),
          suggestion,
          suggestedFacets: dedupeFacets(run.facets),
          reduction: null,
          stats: {
            ms: performance.now() - startedAt,
            docsTouched: run.docsTouched,
            candidatesVerified: run.candidatesVerified,
            usedFuzzy,
            tokens: parsed.tokens,
          },
        }
      }
    }
  }

  /* Nivel 7 — la consulta era larga y no encontró nada.
     Se activa con las mismas garantías que el nivel 6: solo cuando la búsqueda
     normal dio CERO resultados, de modo que no puede alterar ninguna consulta
     que hoy funcione. Eso importa porque hay nombres reales de cuatro palabras
     —"tauros paldea combat breed"— que deben seguir resolviéndose igual. */
  let reduction: Reduction | null = null

  if (matched.docIds.length === 0 && parsed.tokens.length >= REDUCE_MIN_TOKENS) {
    reduction = reduceQuery(index, parsed.raw)
    if (reduction !== null) {
      const reduced = searchReduced(index, reduction)
      if (reduced.docIds.length > 0) {
        // `matches` solo se conoce tras recuperar, así que se adjunta aquí en vez
        // de mutar la reducción que acaba de devolver `reduceQuery`.
        reduction = { ...reduction, matches: reduced.matches }
        return {
          docIds: reduced.docIds,
          levels: reduced.docIds.map(() => SCORE.REDUCED),
          suggestion: null,
          suggestedFacets: dedupeFacets(run.facets),
          reduction,
          stats: {
            ms: performance.now() - startedAt,
            docsTouched: reduced.docIds.length,
            candidatesVerified: run.candidatesVerified,
            usedFuzzy: false,
            tokens: reduction.kept.map((term) => term.term),
          },
        }
      }
      // Si ni siquiera los términos reducidos recuperan algo, se devuelve la
      // reducción de todos modos: enseñar qué se conservó explica el vacío.
    }
  }

  return {
    docIds: matched.docIds,
    levels: matched.levels,
    suggestion,
    suggestedFacets: dedupeFacets(run.facets),
    reduction,
    stats: {
      ms: performance.now() - startedAt,
      docsTouched: run.docsTouched,
      candidatesVerified: run.candidatesVerified,
      usedFuzzy,
      tokens: parsed.tokens,
    },
  }
}

function dedupeFacets(facets: readonly FacetTermMeta[]): FacetTermMeta[] {
  const seen = new Set<string>()
  const out: FacetTermMeta[] = []
  for (const meta of facets) {
    const key =
      meta.kind === 'type'
        ? `t${meta.typeId}`
        : meta.kind === 'generation'
          ? `g${meta.genId}`
          : meta.kind === 'region'
            ? `r${meta.genId}`
            : meta.kind === 'color'
              ? `c${meta.colorId}`
              : 'genus'
    if (seen.has(key)) continue
    seen.add(key)
    out.push(meta)
  }
  return out
}

/**
 * Las dos rutas de emparejado, combinadas quedándose con el mejor nivel:
 *
 *   A) la consulta entera como un solo término ("mr mime" -> "mrmime"). Es el
 *      comportamiento del buscador original, y hay que conservarlo: es lo que hace
 *      que "mr mime" alcance el nivel 1 con Mr. Mime.
 *   B) los tokens con AND, cuando hay más de uno. Añade dos cosas que la ruta A no
 *      puede dar: independencia del orden ("libre pikachu") y consultas de varias
 *      facetas a la vez ("fuego dragon" = de tipo Fuego Y de tipo Dragón).
 */
function search(
  index: PokedexIndex,
  parsed: ParsedQuery,
  run: Run,
  scratch: PokedexIndex['scratch'],
): { docIds: number[]; levels: number[] } {
  /* Ruta A */
  if (parsed.flat.length > 0) {
    scoreToken(run, parsed.flat, parsed.numeric, scratch.best, scratch.bestTouched)
  }

  /* Ruta B */
  if (parsed.tokens.length > 1) {
    for (const docId of scratch.andTouched) {
      scratch.hits[docId] = 0
      scratch.worst[docId] = 0
    }
    scratch.andTouched.length = 0

    for (const token of parsed.tokens) {
      resetBuffer(scratch.token, scratch.tokenTouched)
      scoreToken(run, token, null, scratch.token, scratch.tokenTouched)

      for (const docId of scratch.tokenTouched) {
        if (scratch.hits[docId] === 0) scratch.andTouched.push(docId)
        scratch.hits[docId]! += 1
        const level = scratch.token[docId]!
        // El peor nivel entre los tokens satisfechos: la calidad global de la
        // coincidencia la limita la palabra que peor encaja.
        if (level > scratch.worst[docId]!) scratch.worst[docId] = level
      }
    }
    resetBuffer(scratch.token, scratch.tokenTouched)

    for (const docId of scratch.andTouched) {
      if (scratch.hits[docId] === parsed.tokens.length) {
        write(scratch.best, scratch.bestTouched, docId, scratch.worst[docId]!)
      }
    }
  }

  run.docsTouched = scratch.bestTouched.length

  /* Orden: por nivel y, a igualdad, por el orden canónico ya precomputado, que
     deja las especies base antes que las formas alternas y luego ordena por
     número de Pokédex. Desempatar es restar dos enteros. */
  const docIds = [...scratch.bestTouched]
  docIds.sort(
    (a, b) =>
      scratch.best[a]! - scratch.best[b]! || index.canonicalRank[a]! - index.canonicalRank[b]!,
  )

  // Se copia el nivel a un array nuevo: el búfer nunca sale de aquí.
  return { docIds, levels: docIds.map((docId) => scratch.best[docId]!) }
}

/* --- Filtrado por facetas -------------------------------------------------- */

/**
 * Aplica las facetas al resultado ya emparejado.
 *
 * Es un predicado sobre un conjunto pequeño, no una nueva consulta al índice: OR
 * dentro de una faceta y AND entre facetas salen directamente de la forma de la
 * condición. Por eso marcar un chip no vuelve a tocar el índice invertido.
 */
export function applyFacets(
  index: PokedexIndex,
  result: QueryResult,
  filters: Filters,
): { docIds: number[]; levels: number[] } {
  if (filters.types.size === 0 && filters.gens.size === 0) {
    return { docIds: result.docIds, levels: result.levels }
  }

  const docIds: number[] = []
  const levels: number[] = []

  for (let i = 0; i < result.docIds.length; i += 1) {
    const docId = result.docIds[i]!
    const doc = index.docs[docId]!
    if (filters.types.size > 0 && !doc.typeIds.some((id) => filters.types.has(id))) continue
    if (filters.gens.size > 0 && !filters.gens.has(doc.genId)) continue
    docIds.push(docId)
    levels.push(result.levels[i]!)
  }

  return { docIds, levels }
}

/**
 * Conteos para los chips.
 *
 * La regla que distingue un facetado de verdad de unos filtros cualesquiera: los
 * conteos de una faceta se calculan aplicando **las demás** facetas, pero no la
 * propia. La consecuencia práctica es que con Fuego marcado el chip de Agua sigue
 * mostrando un número —cuántos saldrían si además marcas Agua— en lugar de 0.
 *
 * Una pasada sobre los documentos ya emparejados y dos arrays de tamaño fijo: sin
 * asignaciones por pulsación de tecla.
 */
export function countFacets(
  index: PokedexIndex,
  docIds: readonly number[],
  filters: Filters,
): FacetCounts {
  const types = new Int32Array(index.types.length + 2)
  const gens = new Int32Array(index.generations.length + 2)
  let total = 0

  for (const docId of docIds) {
    const doc = index.docs[docId]!
    const passesTypes = filters.types.size === 0 || doc.typeIds.some((id) => filters.types.has(id))
    const passesGens = filters.gens.size === 0 || filters.gens.has(doc.genId)

    // Para contar TIPOS se aplica el filtro de generación, no el de tipo.
    if (passesGens) {
      for (const typeId of doc.typeIds) types[typeId]! += 1
    }
    // Y al contrario para las generaciones.
    if (passesTypes) gens[doc.genId]! += 1

    if (passesTypes && passesGens) total += 1
  }

  return { types, gens, total }
}
