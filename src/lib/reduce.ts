/**
 * REDUCCIÓN DE LA CONSULTA
 * ========================
 *
 * Convierte un texto largo —una descripción pegada— en los pocos términos que de
 * verdad sirven para buscar, y recupera con ellos.
 *
 * El problema que resuelve
 * ------------------------
 * El motor empareja una consulta de varias palabras exigiendo que TODAS aparezcan
 * en el mismo documento. Con dos o tres palabras eso es lo correcto; con una frase
 * de veinte es imposible de cumplir, y el resultado es cero. Pegar una descripción
 * es, sin embargo, una forma perfectamente razonable de buscar.
 *
 * El recorrido
 * ------------
 *   1. Partir el texto en palabras.
 *   2. Quitar las palabras funcionales.
 *   3. Quitar las demasiado cortas.
 *   4. Quitar las que no existen en el corpus; si es un plural, probar su
 *      singular antes de rendirse (ver `singular.ts`).
 *      Este paso solo ya descarta entre el 70 y el 85 % de una descripción.
 *   5. Medir lo informativa que es cada superviviente con idf = log(N / df),
 *      donde df —en cuántos documentos aparece— es la longitud de su lista de
 *      postings, que el índice ya tiene calculada.
 *   6. Quedarse con las mejores.
 *
 * Por qué los pasos 2 y 5 son ambos necesarios
 * --------------------------------------------
 * Parecen redundantes —el idf ya debería hundir las palabras vacías— pero no
 * basta. Incluso con las descripciones indexadas quedan 81 palabras funcionales
 * de tres letras o más cuyo idf supera al de "llama", una categoría real:
 * "fueron", "aquellas", "habia", "porque". El idf las premia justamente porque
 * son raras. Ver `stopwords.ts`, que lo documenta con las cifras medidas.
 *
 * Dos índices, no uno
 * -------------------
 * La reducción consulta DOS cosas y las distingue:
 *
 *   identidad     nombre, tipo, generación, región, categoría
 *   descripción   la entrada de Pokédex
 *
 * Que un Pokémon SE LLAME así o SEA de ese tipo es un hecho; que su descripción
 * mencione una palabra es una pista. Por eso la identidad pesa más (ver
 * REDUCE_IDENTITY_BOOST) y por eso el índice de descripción está aparte: la
 * búsqueda normal no lo consulta nunca, así que escribir "cola" sigue sin
 * devolver los 47 Pokémon que mencionan una cola.
 *
 * Recuperación
 * ------------
 * A diferencia del motor principal, que se queda con el MEJOR nivel de cada
 * documento, aquí cuenta la COBERTURA: cuántos de los términos conservados
 * satisface cada documento. Primero eso, y solo después la suma de los pesos.
 *
 * Es la diferencia entre responder a la pregunta y responder a una palabra
 * suelta de la pregunta. Ordenando solo por peso, un documento que coincide con
 * un término rarísimo adelanta a otro que coincide con dos; y el que coincide
 * con dos se parece más a lo que se pedía.
 */

import {
  REDUCE_KEEP,
  REDUCE_MAX_DOCS,
  REDUCE_IDENTITY_BOOST,
  REDUCE_MAX_TOKENS,
  REDUCE_MIN_LEN,
  REDUCE_MIN_TERMS,
  REDUCE_MIN_TOKENS,
} from '../constants.ts'
import type { DropReason, PokedexIndex, ReducedTerm, Reduction } from './index-types.ts'
import { containsSorted, lowerBound, unionSorted } from './postings.ts'
import { genderCandidates, pluralCandidates, singularCandidates } from './singular.ts'
import { STOPWORDS } from './stopwords.ts'
import { synonymFor } from './thesaurus.ts'
import { tokenize } from './tokenize.ts'

/** Cuántas palabras descartadas se guardan de muestra, por motivo. */
const SAMPLE_PER_REASON = 4

/** Los documentos de un término en un diccionario, por búsqueda binaria. */
function lookup(terms: readonly string[], postings: readonly number[][], term: string): number[] {
  const at = lowerBound(terms, term)
  return terms[at] === term ? (postings[at] ?? []) : []
}

/**
 * Los documentos que ese término IDENTIFICA: nombre, tipo, generación, región o
 * categoría.
 *
 * Une los tres diccionarios de identidad porque un mismo término puede vivir en
 * varios: "dragon" es nombre de tipo Y palabra dentro de "dragonite", y cada
 * diccionario guarda su propia lista.
 *
 * La búsqueda es binaria, no lineal: `indexOf` sobre los diccionarios costaría
 * diez veces más y se ejecuta una vez por palabra del texto.
 */
export function termPostings(index: PokedexIndex, term: string): number[] {
  let out: number[] = []
  const dictionaries: [readonly string[], readonly number[][]][] = [
    [index.nameTerms, index.nameTermDocs],
    [index.segTerms, index.segPostings],
    [index.facetTerms, index.facetPostings],
  ]

  for (const [terms, postings] of dictionaries) {
    const list = lookup(terms, postings, term)
    if (list.length > 0) out = out.length === 0 ? [...list] : unionSorted(out, list)
  }
  return out
}

/**
 * Los documentos que ese término DESCRIBE: aparece en su entrada de Pokédex.
 *
 * Deliberadamente aparte de `termPostings`. Son dos preguntas distintas —"¿cómo
 * se llama?" frente a "¿a qué se parece?"— y el resto del motor solo tiene
 * sentido con la primera. Esta función es el único acceso al índice de
 * descripción en todo el proyecto, y solo la llama la consulta reducida.
 */
export function describedPostings(index: PokedexIndex, term: string): number[] {
  return lookup(index.textTerms, index.textPostings, term)
}

/**
 * En cuántos documentos aparece el término, contando las dos vías.
 *
 * Es el `df` con el que se pondera, y tiene que ser la UNIÓN: un documento que
 * se llama "Dragonite" y además menciona dragones en su descripción es un solo
 * documento, no dos. Contarlo dos veces inflaría el df y hundiría el idf de un
 * término que en realidad sigue siendo igual de discriminante.
 */
export function reducedDf(index: PokedexIndex, term: string): number {
  return allPostings(index, term).length
}

/** Los documentos que ese término alcanza por cualquiera de las dos vías. */
function allPostings(index: PokedexIndex, term: string): number[] {
  const identity = termPostings(index, term)
  const described = describedPostings(index, term)
  if (identity.length === 0) return described
  if (described.length === 0) return identity
  return unionSorted(identity, described)
}

/** El df de un término con varias formas: la unión de todas, sin contar dos veces. */
function unionDf(index: PokedexIndex, forms: readonly string[]): number {
  if (forms.length === 1) return reducedDf(index, forms[0]!)
  let out: number[] = []
  for (const form of forms) {
    const lista = allPostings(index, form)
    out = out.length === 0 ? lista : unionSorted(out, lista)
  }
  return out.length
}

/**
 * Reduce un texto a sus términos informativos.
 *
 * Devuelve `null` cuando no hay nada que reducir: el texto es corto —entonces es
 * un nombre, no una descripción— o no sobrevive material suficiente.
 */
export function reduceQuery(index: PokedexIndex, raw: string): Reduction | null {
  const all = tokenize(raw)
  if (all.length < REDUCE_MIN_TOKENS) return null

  // El recorte protege el contador de coincidencias por documento, que es un
  // Uint8Array y daría la vuelta a las 256 palabras.
  const tokens = all.slice(0, REDUCE_MAX_TOKENS)

  const dropped: Record<DropReason, number> = {
    stopword: 0,
    corta: 0,
    ausente: 0,
    sobrante: 0,
  }
  const droppedSample: { term: string; reason: DropReason }[] = []
  const sampled: Record<DropReason, number> = { stopword: 0, corta: 0, ausente: 0, sobrante: 0 }

  const drop = (term: string, reason: DropReason): void => {
    dropped[reason] += 1
    if (sampled[reason] < SAMPLE_PER_REASON) {
      sampled[reason] += 1
      droppedSample.push({ term, reason })
    }
  }

  const N = index.docs.length
  const candidates: ReducedTerm[] = []
  const seen = new Set<string>()

  for (const token of tokens) {
    if (seen.has(token)) continue
    seen.add(token)

    if (STOPWORDS.has(token)) {
      drop(token, 'stopword')
      continue
    }
    if (token.length < REDUCE_MIN_LEN) {
      drop(token, 'corta')
      continue
    }

    /**
     * Otras formas de la misma palabra, por orden de confianza:
     *
     *   1. flexión   "cabezas"->"cabeza", "amarilla"->"amarillo"  (`singular.ts`)
     *   2. sinónimo  "rata"->"raton"                              (`thesaurus.ts`)
     *
     * Se usan de dos maneras distintas según exista o no la palabra escrita:
     *
     *   - **No existe** -> se SUSTITUYE por la primera forma que sí exista. Es
     *     lo único que puede salvar la consulta, y no hay nada que perder.
     *
     *   - **Sí existe** -> se AÑADE, y solo si la otra forma está en el
     *     vocabulario del catálogo (nombres, tipos, colores, categorías). El
     *     caso que lo motiva: "morada" aparece en alguna entrada de Pokédex, y
     *     "morado" es además el nombre de un color; quedarse con una sola deja
     *     fuera la mitad de la respuesta. Se exige que la otra forma sea del
     *     catálogo porque ésa es una lista controlada y corta: así "cuenta" no
     *     puede arrastrar a "cuento", que sería otra palabra.
     */
    const alternativas = [...singularCandidates(token)]
    const sinonimo = synonymFor(token)
    if (sinonimo !== undefined) alternativas.push(sinonimo)

    let term = token
    let from: string | undefined
    const forms = [token]
    let df = reducedDf(index, token)

    if (df === 0) {
      for (const candidate of alternativas) {
        if (seen.has(candidate)) continue
        if (reducedDf(index, candidate) === 0) continue
        term = candidate
        from = token
        forms[0] = candidate
        seen.add(candidate)
        break
      }
    } else {
      // El plural y su singular son la MISMA palabra, así que unir sus listas no
      // puede mezclar dos conceptos: "cheeks" con "cheek", "rocas" con "roca".
      for (const candidate of pluralCandidates(token)) {
        if (seen.has(candidate) || forms.includes(candidate)) continue
        if (reducedDf(index, candidate) === 0) continue
        forms.push(candidate)
        seen.add(candidate)
      }
      // El género sí puede llevar a otra palabra —"cuenta" y "cuento"—, así que
      // solo se admite si la otra forma está en el vocabulario del CATÁLOGO, que
      // es una lista controlada y corta: tipos, colores, categorías, nombres.
      for (const candidate of genderCandidates(token)) {
        if (seen.has(candidate) || forms.includes(candidate)) continue
        if (termPostings(index, candidate).length === 0) continue
        forms.push(candidate)
        seen.add(candidate)
      }
    }

    df = unionDf(index, forms)
    if (df === 0) {
      drop(token, 'ausente')
      continue
    }

    // Un término que aparece en TODOS los documentos no distingue ninguno: su
    // idf es exactamente cero. Ocurre de verdad aquí —"generacion" y
    // "generation" están en los 1351—, y sin este corte ocuparían un hueco de
    // los mejores aportando un peso nulo y mostrándose como "0.0".
    //
    // Es la misma noción de palabra vacía que ya aplica el índice al excluir
    // "pokemon" del género, solo que deducida del corpus en lugar de escrita a
    // mano. Por eso se cuenta con el mismo motivo.
    if (df >= N) {
      drop(token, 'stopword')
      continue
    }

    candidates.push({ term, forms, df, idf: Math.log(N / df), ...(from ? { from } : {}) })
  }

  // De más a menos informativo. A igualdad, alfabético para que el orden sea
  // reproducible entre ejecuciones.
  candidates.sort((a, b) => b.idf - a.idf || (a.term < b.term ? -1 : 1))

  const kept = candidates.slice(0, REDUCE_KEEP)
  for (const extra of candidates.slice(REDUCE_KEEP)) drop(extra.term, 'sobrante')

  if (kept.length < REDUCE_MIN_TERMS) return null

  // `matches` lo rellena `searchReduced`, que es quien recorre los documentos.
  return { totalTokens: all.length, kept, dropped, droppedSample, matches: new Map() }
}

/**
 * Recupera con los términos reducidos.
 *
 * Ordena por COBERTURA primero —cuántos de los términos conservados satisface el
 * documento— y solo después por la suma de sus pesos.
 *
 * Ese orden importa, y el corpus da el ejemplo. Para "una tortuga de agua que se
 * esconde en su caparazón" se conservan `caparazon`, `tortuga` y `agua`. Sumando
 * pesos a secas, Pupitar sale SEGUNDO cumpliendo un solo término: le basta que
 * "caparazon" sea raro (idf 7,2) para batir a documentos que cumplen dos
 * términos más comunes. Pero cumplir dos cosas de las que se piden se parece más
 * a lo que se buscaba que cumplir una muy rara, y por eso la cobertura manda.
 *
 * Dentro de cada nivel de cobertura, el peso sigue decidiendo: entre dos
 * documentos que cumplen dos términos, gana el que cumple los más informativos.
 * El empate final se rompe con el orden canónico de siempre.
 */
export function searchReduced(
  index: PokedexIndex,
  reduction: Reduction,
): { docIds: number[]; weights: number[]; matches: Map<number, string[]> } {
  const score = new Map<number, number>()
  const matches = new Map<number, string[]>()

  const credit = (docId: number, weight: number, term: string): void => {
    score.set(docId, (score.get(docId) ?? 0) + weight)
    const hit = matches.get(docId)
    if (hit === undefined) matches.set(docId, [term])
    else hit.push(term)
  }

  for (const { term, forms, idf } of reduction.kept) {
    let identity: number[] = []
    let described: number[] = []
    for (const form of forms) {
      const i = termPostings(index, form)
      if (i.length > 0) identity = identity.length === 0 ? i : unionSorted(identity, i)
      const d = describedPostings(index, form)
      if (d.length > 0) described = described.length === 0 ? d : unionSorted(described, d)
    }

    for (const docId of identity) credit(docId, idf * REDUCE_IDENTITY_BOOST, term)
    // Un documento que coincide por las dos vías cuenta UNA vez, con el peso de
    // identidad, que es el mayor. Si no, la cobertura diría 3/2.
    for (const docId of described) {
      if (!containsSorted(identity, docId)) credit(docId, idf, term)
    }
  }

  const coverage = (docId: number): number => matches.get(docId)?.length ?? 0

  const ordered = [...score.keys()].sort(
    (a, b) =>
      coverage(b) - coverage(a) ||
      score.get(b)! - score.get(a)! ||
      index.canonicalRank[a]! - index.canonicalRank[b]!,
  )

  /**
   * Si algún documento satisface MÁS DE UN término, los que satisfacen uno solo
   * sobran: no son respuestas peores, son otra pregunta.
   *
   * "una tortuga de agua que se esconde en su caparazón" recupera 40 documentos,
   * pero 30 de ellos solo comparten "agua" con el texto. Decir que hay cuarenta
   * resultados describe mal lo que se encontró: hay unos pocos que encajan y una
   * cola de Pokémon acuáticos cualesquiera.
   *
   * El corte es condicional a propósito. Cuando NINGÚN documento llega a dos
   * —porque el texto solo tenía un término útil, o porque los términos no
   * conviven en ningún Pokémon— se devuelven igualmente los de cobertura uno: en
   * ese caso son lo mejor que hay, y dejar la pantalla vacía sería peor.
   */
  const best = ordered.length > 0 ? coverage(ordered[0]!) : 0
  const floor = best >= 2 ? 2 : 1

  /**
   * Una especie, una fila.
   *
   * Describir identifica a una ESPECIE, no a una forma concreta, y las 326
   * formas alternas heredan la entrada de Pokédex de la suya. Sin colapsar,
   * "ratón con las mejillas rojas" gasta cuatro de los cinco primeros puestos en
   * Raichu, Raichu de Alola, Raichu Mega X y Raichu Mega Y, que son el mismo
   * Pokémon descrito con el mismo texto.
   *
   * Se colapsa DESPUÉS de ordenar, así que el representante que sobrevive es el
   * mejor de su especie; y como `canonicalRank` ya pone las formas base por
   * delante, entre iguales gana la forma base.
   *
   * Solo en esta ruta: la búsqueda normal sí tiene que distinguir las formas,
   * porque ahí "charizard mega x" es una consulta legítima.
   */
  const seenSpecies = new Set<number>()
  const docIds: number[] = []
  for (const docId of ordered) {
    if (coverage(docId) < floor) continue
    const speciesIdx = index.docs[docId]!.speciesIdx
    if (seenSpecies.has(speciesIdx)) continue
    seenSpecies.add(speciesIdx)
    docIds.push(docId)
    if (docIds.length === REDUCE_MAX_DOCS) break
  }

  // Las listas de los documentos que no entran sobran: ocupan memoria y la UI
  // nunca va a preguntar por ellas.
  const kept = new Set(docIds)
  for (const docId of matches.keys()) {
    if (!kept.has(docId)) matches.delete(docId)
  }

  return { docIds, weights: docIds.map((docId) => score.get(docId)!), matches }
}
