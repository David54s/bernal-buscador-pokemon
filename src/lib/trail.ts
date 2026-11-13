/**
 * EL RECORRIDO: QUÉ POKÉMON SE HAN VISITADO
 * =========================================
 *
 * Una lista de los Pokémon por los que se ha pasado al explorar el grafo, en
 * orden, que **nunca pierde nada** y sobrevive a recargar la página.
 *
 * Por qué existe este módulo
 * --------------------------
 * La primera versión guardaba un CAMINO: la ruta desde el punto de partida
 * hasta donde estás. Un camino, por definición, no puede pasar dos veces por el
 * mismo sitio, así que al volver sobre un nodo ya visitado se recortaba hasta
 * él. Parecía correcto y en la práctica borraba media exploración: medido sobre
 * un paseo de 25 saltos, la vista conservaba 14 nodos y **perdía 12**.
 *
 *   longitud del camino tras cada salto
 *   2 3 4 5 6 7 →4← 5 6 7 →2← 3 4 5 6 7 8 7 8 9 10 11 12 13 14
 *
 * Esos desplomes son el usuario volviendo a un tipo por el que ya había pasado
 * —y los tipos son justamente los nodos por los que más se pasa—. De ahí la
 * impresión de que el recorrido no se guardaba: no se guardaba.
 *
 * Qué guarda, y qué no
 * --------------------
 * Solo **Pokémon**. Los tipos, generaciones y colores son el CÓMO se llegó, no
 * el QUÉ se visitó, y además se repiten tanto que llenarían la lista.
 *
 * Cada Pokémon aparece **una vez**, en el orden en que se vio por primera vez.
 * Volver a pasar por uno no lo duplica: la lista sigue siendo el recorrido, y
 * se lee sin ruido.
 *
 * Se guarda por número de Pokédex y no por docId, por lo mismo que las
 * valoraciones: el docId es una posición en el corpus y cambiaría al
 * regenerarlo.
 */

import { TRAIL_MAX, TRAIL_STORAGE_KEY } from '../constants.ts'

/** Números de Pokédex, del primero visitado al último. */
export type Trail = readonly number[]

/**
 * Añade un Pokémon al recorrido.
 *
 * Si ya estaba, la lista no cambia: el orden es el de la primera visita, y
 * reordenarla al volver haría que el recorrido se reescribiera a espaldas del
 * usuario, que es la queja que este módulo viene a resolver.
 *
 * Al llegar al tope se descarta lo más antiguo. Es una pérdida, pero acotada y
 * predecible, a diferencia de la de antes.
 */
export function visit(trail: Trail, pokeId: number): number[] {
  if (trail.includes(pokeId)) return [...trail]
  const next = [...trail, pokeId]
  return next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next
}

/** Lo visitado en sesiones anteriores. */
export function readStoredTrail(): number[] {
  try {
    const raw = globalThis.localStorage?.getItem(TRAIL_STORAGE_KEY)
    if (raw == null) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // Se valida entrada por entrada: el valor puede venir de otra versión del
    // programa, de otra pestaña o editado a mano, y una entrada mala no debe
    // tirar las demás.
    const out: number[] = []
    for (const value of parsed) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) continue
      if (!out.includes(value)) out.push(value)
    }
    return out.slice(0, TRAIL_MAX)
  } catch {
    // Sin acceso al almacenamiento, o JSON ilegible: se empieza de cero.
    return []
  }
}

export function storeTrail(trail: Trail): void {
  try {
    globalThis.localStorage?.setItem(TRAIL_STORAGE_KEY, JSON.stringify([...trail]))
  } catch {
    // Si no se puede guardar, el recorrido vale para esta sesión y ya está.
  }
}
