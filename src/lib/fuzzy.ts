/**
 * COINCIDENCIA APROXIMADA
 * =======================
 *
 * Tolerancia a erratas: "charmender" debe encontrar a Charmander.
 *
 * Se corrige la consulta contra el **vocabulario**, no contra los documentos. Es
 * el modelo de los motores reales: primero se busca qué término existente quiso
 * escribir el usuario, y después la consulta corregida vuelve a pasar por el motor
 * normal. Así no hace falta ninguna ruta especial que mapee de corrección a
 * documentos, y la corrección se puede ofrecer como "¿quisiste decir...?".
 *
 * Dos etapas, cada una con un propósito distinto:
 *
 *   1. GENERAR con similitud de trigramas (Jaccard). Barato y orientado a
 *      recuperar candidatos: solo mira términos que comparten al menos un
 *      trigrama, en lugar de los ~3000 del vocabulario.
 *   2. VERIFICAR con distancia de edición de Damerau-Levenshtein acotada. Jaccard
 *      no sabe *dónde* difieren los caracteres, así que por sí solo puntúa
 *      "amander" igual de bien que "charmander" para "charmender".
 *
 * A esta escala la distancia de edición contra todo el vocabulario también
 * funcionaría (~3000 términos por unas 80 operaciones cada uno). El prefiltro de
 * trigramas se elige porque es la respuesta de manual y sale unas diez veces más
 * barato, no porque sea imprescindible.
 */

import { FUZZY_CANDIDATES, FUZZY_MAX_DIST, JACCARD_MIN } from '../constants.ts'
import { grams } from './tokenize.ts'

export interface Suggestion {
  term: string
  distance: number
  similarity: number
}

/**
 * Distancia de Damerau-Levenshtein, abandonando en cuanto se supera `maxDist`.
 *
 * Damerau y no Levenshtein simple porque incluye la **transposición** de dos
 * caracteres adyacentes, que es la errata más común al teclear: "charmnader" está
 * a distancia 1 de "charmander" contándola, y a 2 sin contarla.
 *
 * Tres filas en lugar de la matriz completa (la transposición necesita mirar dos
 * filas atrás), y se abandona si el mínimo de la fila ya excede el tope.
 */
export function damerauLevenshtein(a: string, b: string, maxDist: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1

  let prev2 = new Array<number>(b.length + 1)
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)

  for (let j = 0; j <= b.length; j += 1) prev[j] = j

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    let rowMin = i

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(
        prev[j]! + 1, // borrado
        curr[j - 1]! + 1, // inserción
        prev[j - 1]! + cost, // sustitución
      )
      // Transposición: "ab" <-> "ba" cuesta 1, no 2.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2]! + 1)
      }
      curr[j] = value
      if (value < rowMin) rowMin = value
    }

    // Si toda la fila ya está por encima del tope, ninguna fila posterior mejorará.
    if (rowMin > maxDist) return maxDist + 1

    const recycled = prev2
    prev2 = prev
    prev = curr
    curr = recycled
  }

  return prev[b.length]!
}

/** Similitud de Jaccard entre dos conjuntos de trigramas. */
function jaccard(sharedCount: number, sizeA: number, sizeB: number): number {
  const union = sizeA + sizeB - sharedCount
  return union === 0 ? 0 : sharedCount / union
}

/**
 * La mejor corrección para `token`, o `null` si nada se le parece lo suficiente.
 *
 * `termGrams` mapea trigrama -> índices en `vocab`, así que basta recorrer los
 * trigramas de la consulta para saber qué términos comparten alguno.
 */
export function suggestTerm(
  token: string,
  vocab: readonly string[],
  termGrams: ReadonlyMap<string, number[]>,
): Suggestion | null {
  const queryGrams = grams(token, 3)
  if (queryGrams.length === 0) return null

  // Cuántos trigramas comparte cada término candidato.
  const shared = new Map<number, number>()
  for (const gram of queryGrams) {
    const termIds = termGrams.get(gram)
    if (termIds === undefined) continue
    for (const termId of termIds) shared.set(termId, (shared.get(termId) ?? 0) + 1)
  }
  if (shared.size === 0) return null

  const candidates: { termId: number; similarity: number }[] = []
  for (const [termId, count] of shared) {
    const term = vocab[termId]!
    const similarity = jaccard(count, queryGrams.length, Math.max(term.length - 2, 1))
    if (similarity >= JACCARD_MIN) candidates.push({ termId, similarity })
  }
  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.similarity - a.similarity)
  const shortlist = candidates.slice(0, FUZZY_CANDIDATES)

  // Con palabras cortas se permite una sola edición: dos convertirían "agua" en
  // media lista.
  const maxDist = token.length <= 5 ? 1 : FUZZY_MAX_DIST

  let best: Suggestion | null = null
  for (const candidate of shortlist) {
    const term = vocab[candidate.termId]!
    const distance = damerauLevenshtein(token, term, maxDist)
    if (distance > maxDist) continue

    // Guarda de precisión clásica: o comparten la primera letra, o la corrección
    // es de una sola edición. Sin ella aparecen sugerencias absurdas que
    // técnicamente están dentro del umbral.
    if (term[0] !== token[0] && distance > 1) continue

    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance && candidate.similarity > best.similarity)
    ) {
      best = { term, distance, similarity: candidate.similarity }
    }
  }

  return best
}
