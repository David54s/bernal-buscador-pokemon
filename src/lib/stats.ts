/**
 * ESTADÍSTICAS DEL CORPUS: LEY DE ZIPF Y LEY DE HEAPS
 * ==================================================
 *
 * Dos regularidades empíricas del lenguaje natural, medidas sobre este corpus en
 * vez de citadas de un libro.
 *
 *   Zipf    la frecuencia de un término es inversamente proporcional a su rango.
 *           El término más común aparece aproximadamente el doble que el segundo,
 *           el triple que el tercero, y así. Formalmente f(r) = C / r^s, con s≈1.
 *
 *   Heaps   el vocabulario crece como una potencia del texto leído: V = K·N^β,
 *           con β entre 0,4 y 0,6. Es decir, crece sin parar pero cada vez más
 *           despacio, porque las palabras nuevas se van agotando.
 *
 * Por qué no viven dentro del índice
 * ----------------------------------
 * Estas dos necesitan la frecuencia de OCURRENCIA —cuántas veces aparece un
 * término— y el índice invertido guarda solo la frecuencia DOCUMENTAL —en cuántos
 * documentos aparece—. No es un descuido: una lista de postings es un conjunto de
 * documentos, y `pushUnique` descarta la repetición a propósito, porque para
 * decidir si un documento es respuesta da igual que la palabra salga una vez o
 * cinco.
 *
 * Así que la frecuencia se recalcula aquí, leyendo el texto otra vez. Cuesta unos
 * 55 ms para todo el corpus, se paga una sola vez al abrir la pestaña, y a cambio
 * el índice no engorda ni la búsqueda se ralentiza. El motor no necesita nada de
 * esto para funcionar: son estadísticas del corpus, no estructuras de búsqueda.
 *
 * Por qué se cuenta por ESPECIE y no por documento
 * ------------------------------------------------
 * Las 326 formas alternas heredan la entrada de Pokédex de su especie. Contando
 * los 1351 documentos, el último 25 % aporta 28 835 tokens y solo 39 términos
 * nuevos: es el mismo texto repetido, y aplana la curva de Heaps dando un β
 * falsamente bajo. El corpus real son las 1025 especies.
 */

import {
  HEAPS_POINTS,
  HEAPS_SEED,
  HEAPS_WARMUP,
  SCOPE,
  ZIPF_AUDIT_HEAD,
} from '../constants.ts'
import type { Scope } from '../constants.ts'
import type { Doc, PokedexIndex } from './index-types.ts'
import { lowerBound, unionSorted } from './postings.ts'
import { STOPWORDS } from './stopwords.ts'
import { tokenize } from './tokenize.ts'

/**
 * Aparece en el 100 % de las categorías, así que se excluye igual que hace el
 * índice. Dejarlo dentro lo pondría en lo alto de Zipf sin decir nada.
 */
const CORPUS_STOPWORD = 'pokemon'

/* --- Tipos ----------------------------------------------------------------- */

/** Un ajuste por mínimos cuadrados en escala logarítmica. */
export interface Fit {
  /** Pendiente de la recta ajustada en log-log. */
  slope: number
  /** Ordenada en el origen, ya devuelta a escala lineal. */
  intercept: number
  /** Bondad del ajuste, de 0 a 1. */
  r2: number
  /** Cuántos puntos entraron en el ajuste. */
  points: number
}

/** Un punto de la curva rango-frecuencia, para dibujar. */
export interface ZipfPoint {
  rank: number
  frequency: number
}

export interface ZipfResult {
  /** Exponente s de f(r) = C / r^s. El ideal teórico es 1. */
  s: number
  /** La constante C. */
  c: number
  r2: number
  /** Términos únicos. */
  vocabulary: number
  /** Ocurrencias totales. */
  tokens: number
  /** Términos que aparecen UNA sola vez. En lenguaje natural rondan la mitad. */
  hapax: number
  /** Los términos más frecuentes, del más al menos. */
  top: { term: string; frequency: number; share: number }[]
  /** La curva, submuestreada para que dibujarla no cueste 12 000 nodos. */
  curve: ZipfPoint[]
}

/** Un punto de la curva de Heaps: cuántos términos distintos tras leer N tokens. */
export interface HeapsPoint {
  tokens: number
  vocabulary: number
}

export interface HeapsResult {
  /** V = K·N^β */
  k: number
  beta: number
  r2: number
  curve: HeapsPoint[]
  /** Tokens y vocabulario al final del corpus. */
  tokens: number
  vocabulary: number
}

/** Lo que dice Zipf sobre la lista de palabras vacías escrita a mano. */
export interface StopwordAudit {
  /** Cuántos términos de la cabeza se han mirado. */
  head: number
  /** Cuántos de ésos están en la lista. */
  inList: number
  /** Los de la cabeza que NO están en la lista, con su frecuencia. */
  missing: { term: string; frequency: number }[]
  /** Palabras de la lista que aparecen en el corpus. */
  listInCorpus: number
  /** Cuántas de ésas quedan FUERA de la cabeza: lo que la frecuencia no alcanza. */
  beyondHead: number
}

export interface CorpusStats {
  scope: Scope
  zipf: ZipfResult
  heaps: HeapsResult
  audit: StopwordAudit
}

/* --- Frecuencias ------------------------------------------------------------ */

/**
 * Los tokens de una especie, según el ámbito.
 *
 * Se lee del índice y no del corpus crudo para usar exactamente el mismo texto y
 * el mismo tokenizador que alimentan los diccionarios: si las cifras no
 * coincidieran con `stats.textTerms`, la medición no estaría describiendo este
 * buscador sino otro.
 */
function docTokens(doc: Doc, scope: Scope): string[] {
  /**
   * Cada texto DISTINTO se cuenta una sola vez.
   *
   * Importa más de lo que parece. El índice guarda el inglés como respaldo
   * cuando falta el español, así que `descEs` y `descEn` son la MISMA cadena en
   * 127 especies; y `nameEs` coincide con `nameEn` en 1004 de las 1025, porque
   * casi ningún Pokémon cambia de nombre al traducirse.
   *
   * Contando las dos copias, esas palabras duplicarían su frecuencia y la ley de
   * Zipf se mediría sobre un corpus que no existe. Medido: inflaba N de 83 740 a
   * 89 100 y desplazaba el exponente.
   */
  const fuentes = new Set<string>()

  if (scope !== SCOPE.IDENTITY) {
    fuentes.add(doc.descEs)
    fuentes.add(doc.descEn)
  }
  if (scope !== SCOPE.DESCRIPTION) {
    fuentes.add(doc.slug)
    fuentes.add(doc.nameEs)
    fuentes.add(doc.nameEn)
    fuentes.add(doc.genusEs)
    fuentes.add(doc.genusEn)
  }

  const out: string[] = []
  for (const texto of fuentes) {
    if (texto.length > 0) out.push(...tokenize(texto))
  }
  return out.filter((t) => t !== CORPUS_STOPWORD)
}

/**
 * Un documento representante por especie, y sus tokens.
 *
 * Se recorre en `canonicalOrder`, que ya pone las especies base por delante de
 * sus formas alternas, y se toma el PRIMER documento de cada especie. Así el
 * representante es la forma base siempre que exista, sin tener que distinguirla
 * por el slug: hay 37 Pokémon canónicos con sufijo —"deoxys-normal",
 * "giratina-altered"— que una regla ingenua tomaría por formas alternas.
 *
 * El resultado tiene una entrada por especie, no por documento. Ver la cabecera:
 * contar los 1351 documentos cuenta el mismo texto varias veces.
 */
function tokensPerSpecies(index: PokedexIndex, scope: Scope): string[][] {
  const vistas = new Set<number>()
  const out: string[][] = []
  for (const docId of index.canonicalOrder) {
    const doc = index.docs[docId]!
    if (vistas.has(doc.speciesIdx)) continue
    vistas.add(doc.speciesIdx)
    out.push(docTokens(doc, scope))
  }
  return out
}

/** Cuántas veces aparece cada término en todo el corpus. */
function collectionFrequencies(porEspecie: readonly (readonly string[])[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const tokens of porEspecie) {
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  return freq
}

/* --- Ajuste ----------------------------------------------------------------- */

/**
 * Recta de mínimos cuadrados sobre los logaritmos.
 *
 * Las dos leyes son potencias —f = C·r^-s y V = K·N^β— y una potencia es una
 * recta en escala doblemente logarítmica. Por eso ajustar en log-log es el
 * método estándar: convierte el problema en una regresión lineal.
 */
function logFit(xs: readonly number[], ys: readonly number[]): Fit {
  const n = xs.length
  if (n < 2) return { slope: 0, intercept: 0, r2: 0, points: n }

  const lx = xs.map(Math.log)
  const ly = ys.map(Math.log)
  const mx = lx.reduce((a, b) => a + b, 0) / n
  const my = ly.reduce((a, b) => a + b, 0) / n

  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i += 1) {
    const dx = lx[i]! - mx
    const dy = ly[i]! - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return { slope: 0, intercept: 0, r2: 0, points: n }

  const slope = sxy / sxx
  return {
    slope,
    intercept: Math.exp(my - slope * mx),
    r2: (sxy * sxy) / (sxx * syy),
    points: n,
  }
}

/* --- Zipf ------------------------------------------------------------------- */

/** Cuántos puntos de la curva de Zipf se conservan para dibujarla. */
const ZIPF_CURVE_POINTS = 200

export function zipf(freq: ReadonlyMap<string, number>): ZipfResult {
  const ordered = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  const frequencies = ordered.map(([, f]) => f)
  const tokens = frequencies.reduce((a, b) => a + b, 0)

  const ranks = frequencies.map((_, i) => i + 1)
  const fit = logFit(ranks, frequencies)

  // La curva se submuestrea en escala logarítmica, no lineal: con paso lineal los
  // doscientos puntos caerían casi todos en la cola, que es donde no pasa nada.
  const curve: ZipfPoint[] = []
  const total = frequencies.length
  for (let i = 0; i < ZIPF_CURVE_POINTS; i += 1) {
    const r = Math.round(Math.exp((Math.log(total) * i) / (ZIPF_CURVE_POINTS - 1)))
    const rank = Math.min(Math.max(r, 1), total)
    if (curve.length > 0 && curve[curve.length - 1]!.rank === rank) continue
    curve.push({ rank, frequency: frequencies[rank - 1]! })
  }

  return {
    // La pendiente ajustada es negativa; el exponente de Zipf se enuncia positivo.
    s: -fit.slope,
    c: fit.intercept,
    r2: fit.r2,
    vocabulary: total,
    tokens,
    hapax: frequencies.filter((f) => f === 1).length,
    top: ordered.slice(0, 20).map(([term, frequency]) => ({
      term,
      frequency,
      share: frequency / tokens,
    })),
    curve,
  }
}

/* --- Heaps ------------------------------------------------------------------ */

/**
 * Generador congruencial lineal: barajado reproducible sin dependencias.
 *
 * Hace falta barajar porque el corpus viene en orden de Pokédex, que agrupa por
 * generación y por familia evolutiva; recorrerlo tal cual mediría el orden de
 * publicación de los juegos. Y hace falta que sea reproducible para poder fijar
 * el resultado en una prueba.
 */
function shuffled(n: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i)
  let state = seed
  const next = (): number => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    const tmp = idx[i]!
    idx[i] = idx[j]!
    idx[j] = tmp
  }
  return idx
}

/** La curva: cuántos términos distintos se llevan vistos tras leer N tokens. */
export function heapsCurve(
  porEspecie: readonly (readonly string[])[],
  seed: number = HEAPS_SEED,
): HeapsPoint[] {
  const orden = shuffled(porEspecie.length, seed)
  const vistos = new Set<string>()
  const curve: HeapsPoint[] = []
  const paso = Math.max(1, Math.floor(porEspecie.length / HEAPS_POINTS))

  let tokens = 0
  for (let i = 0; i < orden.length; i += 1) {
    for (const t of porEspecie[orden[i]!]!) {
      tokens += 1
      vistos.add(t)
    }
    if ((i + 1) % paso === 0 || i === orden.length - 1) {
      curve.push({ tokens, vocabulary: vistos.size })
    }
  }
  return curve
}

/**
 * Ajusta V = K·N^β descartando el transitorio inicial.
 *
 * Ver `HEAPS_WARMUP`: ajustar sobre la curva entera sobreestima β y, con él, el
 * vocabulario predicho.
 */
export function heapsFit(curve: readonly HeapsPoint[], warmup: number = HEAPS_WARMUP): Fit {
  if (curve.length === 0) return { slope: 0, intercept: 0, r2: 0, points: 0 }
  const maxTokens = curve[curve.length - 1]!.tokens
  const usable = curve.filter((p) => p.tokens >= maxTokens * warmup && p.tokens > 0)
  return logFit(
    usable.map((p) => p.tokens),
    usable.map((p) => p.vocabulary),
  )
}

/** Cuánto vocabulario predice la ley para un corpus de `tokens` palabras. */
export function heapsPredict(fit: Pick<Fit, 'slope' | 'intercept'>, tokens: number): number {
  return fit.intercept * Math.pow(tokens, fit.slope)
}

export function heaps(porEspecie: readonly (readonly string[])[]): HeapsResult {
  const curve = heapsCurve(porEspecie)
  const fit = heapsFit(curve)
  const last = curve[curve.length - 1]
  return {
    k: fit.intercept,
    beta: fit.slope,
    r2: fit.r2,
    curve,
    tokens: last?.tokens ?? 0,
    vocabulary: last?.vocabulary ?? 0,
  }
}

/* --- La auditoría de palabras vacías ---------------------------------------- */

/**
 * Qué dice la cabeza de la distribución sobre la lista escrita a mano.
 *
 * Las dos cifras que devuelve se leen juntas, y dicen cosas opuestas a propósito:
 *
 *   `inList`      la cabeza es casi toda palabra funcional, lo que respalda la
 *                 lista con datos en vez de con intuición.
 *   `beyondHead`  pero la mayoría de la lista NO está en la cabeza, así que la
 *                 frecuencia por sí sola nunca la habría construido.
 */
export function auditStopwords(
  freq: ReadonlyMap<string, number>,
  head: number = ZIPF_AUDIT_HEAD,
): StopwordAudit {
  const ordered = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  const cabeza = ordered.slice(0, head)
  const enCabeza = new Set(cabeza.map(([t]) => t))

  const listInCorpus = [...STOPWORDS].filter((w) => freq.has(w))

  return {
    head: cabeza.length,
    inList: cabeza.filter(([t]) => STOPWORDS.has(t)).length,
    missing: cabeza
      .filter(([t]) => !STOPWORDS.has(t))
      .map(([term, frequency]) => ({ term, frequency })),
    listInCorpus: listInCorpus.length,
    beyondHead: listInCorpus.filter((w) => !enCabeza.has(w)).length,
  }
}

/* --- Entrada principal ------------------------------------------------------ */

/** Todas las estadísticas de un ámbito. */
export function corpusStats(index: PokedexIndex, scope: Scope): CorpusStats {
  const porEspecie = tokensPerSpecies(index, scope)
  const freq = collectionFrequencies(porEspecie)
  return {
    scope,
    zipf: zipf(freq),
    heaps: heaps(porEspecie),
    audit: auditStopwords(freq),
  }
}

/* --- Caché ------------------------------------------------------------------ */

let cachedIndex: PokedexIndex | null = null
let cachedStats: Record<Scope, CorpusStats> | null = null

/**
 * Los tres ámbitos de una vez, memorizados a nivel de MÓDULO.
 *
 * Se calculan juntos —unos 110 ms— porque el contraste entre ellos es el
 * resultado interesante y la vista los necesita los tres para poder conmutar.
 *
 * El caché vive en el módulo y no en un `useMemo` por dos motivos concretos:
 *
 *   - La pestaña de estadísticas se desmonta al volver al buscador, y un
 *     `useMemo` muere con su componente. Sin esto se pagarían 110 ms cada vez
 *     que se conmuta de vista.
 *   - En desarrollo, el modo estricto de React monta dos veces, así que el
 *     coste se pagaría por duplicado.
 *
 * Es el mismo patrón y el mismo motivo por los que `useCorpusIndex` guarda el
 * índice a nivel de módulo. La clave es la IDENTIDAD del índice, que es
 * inmutable y se construye una vez por pestaña: si un reintento lo reconstruye,
 * el caché se invalida solo.
 */
export function allCorpusStats(index: PokedexIndex): Record<Scope, CorpusStats> {
  if (cachedIndex === index && cachedStats !== null) return cachedStats

  cachedIndex = index
  cachedStats = {
    [SCOPE.DESCRIPTION]: corpusStats(index, SCOPE.DESCRIPTION),
    [SCOPE.IDENTITY]: corpusStats(index, SCOPE.IDENTITY),
    [SCOPE.ALL]: corpusStats(index, SCOPE.ALL),
  }
  return cachedStats
}

/**
 * Comprueba la ley contra sí misma: ajusta con una parte del corpus y predice el
 * vocabulario del total.
 *
 * Es lo que convierte a Heaps en una afirmación falsable en vez de una curva
 * bonita. Si la ley no describiera este corpus, el error sería grande.
 */
export function heapsSelfCheck(
  porEspecie: readonly (readonly string[])[],
  fraction = 0.8,
): { predicted: number; actual: number; error: number } {
  const curve = heapsCurve(porEspecie)
  const actual = curve[curve.length - 1]!
  const corte = Math.max(2, Math.floor(curve.length * fraction))
  const fit = heapsFit(curve.slice(0, corte))
  const predicted = heapsPredict(fit, actual.tokens)
  return {
    predicted,
    actual: actual.vocabulary,
    error: (predicted - actual.vocabulary) / actual.vocabulary,
  }
}

/* --- El índice invertido, explicado ----------------------------------------- */

/** Los cuatro diccionarios invertidos, nombrados por su campo en el índice. */
export const DICTIONARY = {
  NAMES: 'nameTerms',
  WORDS: 'segTerms',
  FACETS: 'facetTerms',
  TEXT: 'textTerms',
} as const

export type DictionaryId = (typeof DICTIONARY)[keyof typeof DICTIONARY]

/** La entrada de un término en UN diccionario. */
export interface PostingsEntry {
  dictionary: DictionaryId
  /** Cuántos términos tiene ese diccionario: el espacio en el que se buscó. */
  size: number
  /** La posición exacta donde vive, la que devuelve `lowerBound`. */
  at: number
  /**
   * Comparaciones que hizo la búsqueda binaria: ceil(log2(size)).
   *
   * Es la cifra que demuestra que no hay barrido. Encontrar un término entre
   * 12 322 cuesta catorce comparaciones, y con un millón costaría veinte.
   */
  probes: number
  /** La lista de postings tal cual está en el índice: docIds ascendentes. */
  docIds: readonly number[]
}

export interface TermExplanation {
  /** El token normalizado con el que de verdad se consulta. */
  token: string
  /** Los demás tokens, si se escribió más de una palabra. */
  ignored: string[]
  /** Una entrada por cada diccionario donde vive. Vacío si no vive en ninguno. */
  entries: PostingsEntry[]
  /** La unión de todas las listas: lo que el término alcanza de verdad. */
  union: number[]
  df: number
  idf: number
  /** Especies distintas de la unión. Menor que `df` por las formas alternas. */
  species: number
}

/**
 * Qué hay dentro del índice para un término.
 *
 * Un índice invertido y un filtro sobre un array dan el mismo resultado; lo que
 * los distingue es CUÁNTO tocan para darlo. Esto enseña exactamente eso: en qué
 * diccionario vive el término, cuántas comparaciones costó encontrarlo, y la
 * lista de documentos que ya es la respuesta.
 *
 * Que un término pueda vivir en VARIOS diccionarios con una lista distinta en
 * cada uno es lo que ningún filtro puede imitar: "pikachu" es un nombre
 * completo (un documento) y además una palabra dentro de los nombres de sus
 * formas alternas (diecisiete).
 */
export function explainTerm(index: PokedexIndex, raw: string): TermExplanation | null {
  const tokens = tokenize(raw)
  const token = tokens[0]
  if (token === undefined) return null

  const dicts: [DictionaryId, readonly string[], readonly number[][]][] = [
    [DICTIONARY.NAMES, index.nameTerms, index.nameTermDocs],
    [DICTIONARY.WORDS, index.segTerms, index.segPostings],
    [DICTIONARY.FACETS, index.facetTerms, index.facetPostings],
    [DICTIONARY.TEXT, index.textTerms, index.textPostings],
  ]

  const entries: PostingsEntry[] = []
  let union: number[] = []

  for (const [dictionary, terms, postings] of dicts) {
    const at = lowerBound(terms, token)
    if (terms[at] !== token) continue
    const docIds = postings[at] ?? []
    entries.push({
      dictionary,
      size: terms.length,
      at,
      probes: Math.ceil(Math.log2(Math.max(terms.length, 2))),
      docIds,
    })
    union = union.length === 0 ? [...docIds] : unionSorted(union, docIds)
  }

  const species = new Set(union.map((docId) => index.docs[docId]!.speciesIdx)).size

  return {
    token,
    ignored: tokens.slice(1),
    entries,
    union,
    df: union.length,
    idf: union.length === 0 ? 0 : Math.log(index.docs.length / union.length),
    species,
  }
}

/** Los tokens por especie, expuesto para las pruebas y para la autocomprobación. */
export function speciesTokenLists(index: PokedexIndex, scope: Scope): string[][] {
  return tokensPerSpecies(index, scope)
}
