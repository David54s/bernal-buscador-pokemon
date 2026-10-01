/**
 * AGRUPACIÓN DE RESULTADOS
 * ========================
 *
 * Reparte los resultados en grupos, que la interfaz pinta como filas horizontales.
 *
 * Las claves de grupo **no llevan idioma**: son `{kind, id}` y la etiqueta se
 * resuelve al pintar. Si llevaran el texto ya traducido, cambiar de idioma
 * obligaría a recalcular toda la agrupación, cuando en realidad no cambia ni un
 * documento de sitio.
 */

import { GROUP_BY, type GroupBy } from '../constants.ts'
import type { Group, PokedexIndex } from './index-types.ts'

export function groupResults(
  index: PokedexIndex,
  docIds: readonly number[],
  levels: readonly number[],
  groupBy: GroupBy,
): Group[] {
  if (docIds.length === 0) return []

  switch (groupBy) {
    case GROUP_BY.NONE:
      return [{ key: { kind: 'all' }, docIds: [...docIds] }]

    case GROUP_BY.TYPE: {
      // Un Pokémon de dos tipos aparece en AMBAS filas, igual que Netflix coloca
      // una película en varios géneros. Por eso la suma de los grupos es mayor
      // que el número de resultados, y eso es lo correcto.
      const buckets = new Map<number, number[]>()
      for (const docId of docIds) {
        for (const typeId of index.docs[docId]!.typeIds) {
          const list = buckets.get(typeId)
          if (list === undefined) buckets.set(typeId, [docId])
          else list.push(docId)
        }
      }
      // Las filas más grandes primero: es lo que hace que la primera pantalla
      // diga algo. A igualdad, por id de tipo para que el orden sea estable.
      return [...buckets.entries()]
        .sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
        .map(([typeId, list]) => ({ key: { kind: 'type' as const, typeId }, docIds: list }))
    }

    case GROUP_BY.GENERATION: {
      // Partición exacta: cada documento cae en una sola generación, así que la
      // suma de los grupos es el total de resultados.
      const buckets = new Map<number, number[]>()
      for (const docId of docIds) {
        const genId = index.docs[docId]!.genId
        const list = buckets.get(genId)
        if (list === undefined) buckets.set(genId, [docId])
        else list.push(docId)
      }
      // En orden de generación, que es el que se espera leer.
      return [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([genId, list]) => ({ key: { kind: 'generation' as const, genId }, docIds: list }))
    }

    case GROUP_BY.RELEVANCE: {
      // Una fila por nivel de coincidencia: deja a la vista cómo puntúa el motor,
      // que es justo lo que interesa poder explicar de la práctica.
      const buckets = new Map<number, number[]>()
      docIds.forEach((docId, i) => {
        const level = levels[i]!
        const list = buckets.get(level)
        if (list === undefined) buckets.set(level, [docId])
        else list.push(docId)
      })
      return [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([level, list]) => ({ key: { kind: 'relevance' as const, level }, docIds: list }))
    }
  }
}
