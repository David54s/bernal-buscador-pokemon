/**
 * LISTAS DE POSTINGS
 * ==================
 *
 * Las operaciones de manual sobre un índice invertido. Todas las listas de este
 * módulo son arrays de enteros **ordenados de menor a mayor y sin repetidos**;
 * esa invariante es lo que permite unir e intersectar en tiempo lineal con dos
 * punteros, sin tablas hash intermedias.
 *
 * Se usan arrays ordenados y no `Set` justamente por esto: un `Set` obliga a
 * recorrer e insertar, mientras que dos listas ordenadas se recorren una sola vez
 * en paralelo. Es además la representación que usan los motores de verdad.
 */

/**
 * Primer índice cuyo valor es >= `target`, o `sorted.length` si no hay ninguno.
 *
 * Compara con `<`, es decir en orden de unidad de código UTF-16. Los diccionarios
 * se ordenan con `.sort()` por ese mismo criterio: mezclarlo con `localeCompare`
 * rompería todas las búsquedas en silencio.
 */
export function lowerBound(sorted: readonly string[], target: string): number {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (sorted[mid]! < target) low = mid + 1
    else high = mid
  }
  return low
}

/**
 * Si una lista de postings contiene un documento, por búsqueda binaria.
 *
 * Las listas están ordenadas por construcción —lo garantiza `seal()`— así que no
 * hace falta recorrerlas. Importa porque se pregunta una vez por documento y por
 * término: con `includes` sería cuadrático en las listas largas.
 */
export function containsSorted(sorted: readonly number[], value: number): boolean {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (sorted[mid]! < value) low = mid + 1
    else high = mid
  }
  return sorted[low] === value
}

/**
 * El rango `[inicio, fin)` de los términos que empiezan por `prefix`.
 *
 * Dos búsquedas binarias y ni una comparación de cadenas más: como el
 * diccionario está ordenado, todo lo que cae entre ambas cotas empieza por el
 * prefijo por construcción.
 */
export function prefixRange(
  sorted: readonly string[],
  prefix: string,
  upperBound: string,
): [number, number] {
  const start = lowerBound(sorted, prefix)
  if (start >= sorted.length) return [start, start]
  return [start, lowerBound(sorted, upperBound)]
}

/** Unión de dos listas ordenadas, en una pasada. */
export function unionSorted(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const left = a[i]!
    const right = b[j]!
    if (left === right) {
      out.push(left)
      i += 1
      j += 1
    } else if (left < right) {
      out.push(left)
      i += 1
    } else {
      out.push(right)
      j += 1
    }
  }
  while (i < a.length) out.push(a[i++]!)
  while (j < b.length) out.push(b[j++]!)
  return out
}

/** Intersección de dos listas ordenadas, en una pasada. */
export function intersectSorted(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const left = a[i]!
    const right = b[j]!
    if (left === right) {
      out.push(left)
      i += 1
      j += 1
    } else if (left < right) i += 1
    else j += 1
  }
  return out
}

/** Unión de varias listas. Vacío si no hay ninguna. */
export function unionAll(lists: readonly (readonly number[])[]): number[] {
  if (lists.length === 0) return []
  return lists.reduce<number[]>((acc, list) => unionSorted(acc, list), [])
}

/**
 * Intersección de varias listas, de la más corta a la más larga.
 *
 * Empezar por la más corta es la heurística clásica: el resultado nunca puede ser
 * mayor que la lista más pequeña, así que reducir pronto ahorra comparaciones. Y
 * en cuanto el acumulado queda vacío se puede abandonar.
 */
export function intersectAll(lists: readonly (readonly number[])[]): number[] {
  if (lists.length === 0) return []
  const ordered = [...lists].sort((a, b) => a.length - b.length)
  let acc = ordered[0] as readonly number[]
  for (let i = 1; i < ordered.length && acc.length > 0; i += 1) {
    acc = intersectSorted(acc, ordered[i]!)
  }
  return [...acc]
}

/**
 * Inserta `docId` al final de una lista que se está construyendo en orden
 * ascendente, evitando duplicados consecutivos.
 *
 * Durante la construcción del índice los documentos se recorren en orden, así que
 * basta comparar con el último: no hace falta ordenar ni deduplicar después.
 */
export function pushUnique(list: number[], docId: number): void {
  if (list.length === 0 || list[list.length - 1] !== docId) list.push(docId)
}
