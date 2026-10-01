/**
 * ESCALA DE PUNTUACIÓN Y DESEMPATE
 * ================================
 *
 * En su propio módulo, sin dependencias más que una constante, para que tanto la
 * construcción del índice como el motor de consulta puedan usarlo sin que se
 * formen importaciones circulares.
 */

import { ALT_FORM_ID_THRESHOLD } from '../constants.ts'

/**
 * Nivel de coincidencia. Cuanto MENOR es el número, mejor es el resultado y más
 * arriba aparece.
 *
 * Los niveles 0 a 4 son los del buscador original, con el mismo significado y el
 * mismo comportamiento: las pruebas los comparan contra una implementación de
 * fuerza bruta para garantizar que el cambio a índice invertido no alteró ni uno.
 * Los niveles 5 y 6 son nuevos y se añaden al final, nunca en medio.
 */
export const SCORE = {
  /** La consulta es un número y coincide con el id de Pokédex. `25` -> pikachu */
  ID_EXACT: 0,
  /** El nombre completo es idéntico a la consulta. `pikachu` -> pikachu */
  NAME_EXACT: 1,
  /** El nombre EMPIEZA por la consulta. `char` -> charmander */
  PREFIX: 2,
  /** Alguna palabra del nombre empieza por la consulta. `mime` -> mr-mime */
  WORD_PREFIX: 3,
  /** La consulta aparece en cualquier posición. `char` -> chimchar */
  CONTAINS: 4,
  /** Coincide con un tipo, generación, región o género. `fuego` -> los de fuego */
  FACET: 5,
  /** Coincidencia aproximada, tras corregir la consulta. `charmender` -> charmander */
  FUZZY: 6,
  /**
   * Procede de una consulta reducida: el usuario pegó un texto largo y el
   * documento encaja con los términos informativos que quedaron. Va al final
   * porque es la coincidencia más indirecta de todas.
   */
  REDUCED: 7,
} as const

export type ScoreLevel = (typeof SCORE)[keyof typeof SCORE]

/** El nivel peor que existe, usado como tope al recorrer. */
export const WORST_LEVEL: number = SCORE.REDUCED

/**
 * Marca de "documento sin tocar" en el acumulador.
 *
 * Es 255 y no `Infinity` porque el acumulador es un `Uint8Array`: reiniciar mil
 * trescientas casillas de un tipado es inmediato, y así no se asigna memoria en
 * cada pulsación de tecla.
 */
export const NO_LEVEL = 255

/** ¿Es una forma alterna (mega, regional, gigamax) en vez de una especie base? */
export function isAltForm(id: number): boolean {
  return id >= ALT_FORM_ID_THRESHOLD
}

/**
 * Desempate entre dos Pokémon con la misma puntuación:
 *   1. Primero las especies base, después las formas alternas.
 *   2. Y dentro de cada grupo, por número de Pokédex ascendente.
 *
 * Gracias a esto "char" devuelve charmander(4), charmeleon(5), charizard(6)...
 * en orden de Pokédex, y no charizard-mega-x colándose en tercer lugar.
 *
 * El índice aplica esta regla UNA sola vez, al construirse, y guarda el resultado
 * en `canonicalRank`. A partir de ahí, desempatar es restar dos enteros.
 */
export function compareIds(a: number, b: number): number {
  const altDiff = Number(isAltForm(a)) - Number(isAltForm(b))
  if (altDiff !== 0) return altDiff
  return a - b
}

/** La misma regla, sobre objetos con `id`. Se conserva por continuidad de nombre. */
export function compareEntries(a: { id: number }, b: { id: number }): number {
  return compareIds(a.id, b.id)
}
