/**
 * LAS VALORACIONES, GUARDADAS
 * ===========================
 *
 * Qué Pokémon gustaron y cuáles no, entre visitas, **de cada perfil**.
 *
 * En su propio módulo y sin React, por lo mismo que `lang-storage.ts`: son
 * funciones puras que no necesitan nada del árbol de componentes, y así las
 * pruebas pueden importarlas ejecutándose con Node a secas.
 *
 * Se guarda por NÚMERO DE POKÉDEX
 * -------------------------------
 * No por `docId`, que es la posición del documento en el corpus. Esa posición
 * cambiaría al regenerar el índice —si PokeAPI añade un Pokémon, todo lo que
 * venga después se desplaza— y las valoraciones guardadas pasarían a señalar a
 * otros Pokémon sin que nadie se entere. El número de Pokédex no se mueve.
 *
 * Y una clave por perfil
 * ----------------------
 * El id del perfil es el PRIMER argumento y no tiene valor por defecto, a
 * propósito. Con un valor por defecto, olvidarlo en un punto de llamada
 * compilaría y escribiría las valoraciones de una persona en el cajón de otra,
 * que es exactamente el fallo que los perfiles vienen a evitar. Sin él, el
 * compilador obliga a decir de quién son los datos.
 */

import { RATING, RATINGS_STORAGE_KEY } from '../constants.ts'
import type { Rating } from '../constants.ts'
import { readJson, viewerKey, writeJson } from './storage.ts'

/** Número de Pokédex -> valoración. */
export type Ratings = ReadonlyMap<number, Rating>

/** Una valoración válida, o `null` si el dato está corrupto. */
function parseRating(value: unknown): Rating | null {
  if (value === RATING.LIKE) return RATING.LIKE
  if (value === RATING.DISLIKE) return RATING.DISLIKE
  return null
}

/**
 * Lo valorado en visitas anteriores, **en el orden en que se valoró**.
 *
 * Se guarda como una LISTA de pares y no como un objeto, y eso importa: en
 * JavaScript las claves enteras de un objeto se recorren siempre en orden
 * ascendente, da igual en qué orden se insertaran. Guardando un objeto, al
 * recargar la página «Porque te gustó X» pasaría a nombrar al Pokémon con el
 * número más alto en vez de al último valorado. Una lista conserva el orden.
 *
 * Valida entrada por entrada en vez de confiar en lo que haya guardado. Aquí
 * hace falta más cuidado que con el idioma, porque el valor es JSON y no una
 * cadena suelta: puede venir de una versión anterior del programa, de otra
 * pestaña, o editado a mano. Lo que no se reconoce se descarta en silencio, y
 * una entrada mala no tira las demás.
 */
export function readStoredRatings(viewerId: string): Map<number, Rating> {
  return parseRatings(readJson(viewerKey(RATINGS_STORAGE_KEY, viewerId)))
}

/**
 * Las valoraciones guardadas en la clave SIN sufijo de perfil.
 *
 * Es de donde salen los datos de quien usara la página antes de que hubiera
 * perfiles. Lo usa `viewers.ts` al migrar, y nada más.
 */
export function readLegacyRatings(): Map<number, Rating> {
  return parseRatings(readJson(RATINGS_STORAGE_KEY))
}

function parseRatings(parsed: unknown): Map<number, Rating> {
  const out = new Map<number, Rating>()
  if (!Array.isArray(parsed)) return out

  for (const entry of parsed) {
    if (!Array.isArray(entry) || entry.length !== 2) continue
    const pokeId = entry[0]
    if (typeof pokeId !== 'number' || !Number.isInteger(pokeId) || pokeId <= 0) continue
    const rating = parseRating(entry[1])
    if (rating !== null) out.set(pokeId, rating)
  }
  return out
}

export function storeRatings(viewerId: string, ratings: Ratings): void {
  writeJson(viewerKey(RATINGS_STORAGE_KEY, viewerId), [...ratings])
}

/**
 * Aplica una valoración, con la regla de los botones de este tipo: volver a
 * pulsar el que ya está activo lo desactiva.
 *
 * Devuelve un mapa nuevo en vez de mutar el que recibe, porque React decide si
 * tiene que repintar comparando identidades.
 */
export function toggleRating(
  ratings: Ratings,
  pokeId: number,
  rating: Rating,
): Map<number, Rating> {
  const next = new Map(ratings)
  if (next.get(pokeId) === rating) next.delete(pokeId)
  else next.set(pokeId, rating)
  return next
}
