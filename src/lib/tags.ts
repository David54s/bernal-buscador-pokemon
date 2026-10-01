/**
 * ETIQUETAS
 * =========
 *
 * Las etiquetas de una tarjeta, como descriptores **sin idioma**: cada una dice
 * qué es y a qué se refiere, y el texto se resuelve al pintar según el idioma
 * activo. Igual que las claves de grupo.
 *
 * Todas salen del índice, así que se pintan en el primer frame. En el buscador
 * anterior los tipos había que pedirlos a la red por cada tarjeta visible, de modo
 * que aparecían con retraso y solo para lo que estaba en pantalla.
 */

import type { PokedexIndex, Tag } from './index-types.ts'

export function tagsFor(index: PokedexIndex, docId: number): Tag[] {
  const doc = index.docs[docId]
  if (doc === undefined) return []

  const tags: Tag[] = doc.typeIds.map((typeId) => ({ kind: 'type', typeId }))
  tags.push({ kind: 'generation', genId: doc.genId })
  // El color va después de la generación y antes de la categoría: es el dato que
  // alguien usa para describir a un Pokémon que no sabe nombrar.
  tags.push({ kind: 'color', colorId: doc.colorId })
  if (doc.genusEs.length > 0 || doc.genusEn.length > 0) tags.push({ kind: 'genus' })
  if (doc.isAltForm) tags.push({ kind: 'altForm' })
  return tags
}
