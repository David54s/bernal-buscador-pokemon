/**
 * NÚCLEO DEL BUSCADOR — puerta de entrada
 * =======================================
 *
 * PokeAPI no ofrece búsqueda por subcadena: `GET /api/v2/pokemon/char` responde
 * 404, porque ese endpoint solo acepta el nombre o el id EXACTOS. Tampoco permite
 * filtrar por tipo ni por generación, ni devuelve nombres en español en sus
 * listados. La recuperación, por tanto, hay que implementarla entera, y es lo que
 * hace esta biblioteca.
 *
 * La arquitectura es la clásica de Recuperación de Información —indexar fuera de
 * línea, consultar en línea—:
 *
 *   FUERA DE LÍNEA   scripts/build-corpus.ts  ->  public/data/pokedex.v1.json
 *   EN LÍNEA         buildIndex(corpus)       ->  estructuras en memoria (una vez)
 *                    runQuery(index, ...)     ->  respuesta por consulta al índice
 *
 * Este archivo solo reexporta, para que el sistema completo se pueda leer
 * empezando por aquí. El orden en que conviene leerlo es:
 *
 *   1. tokenize.ts      cómo se convierte el texto en términos y n-gramas
 *   2. postings.ts      búsqueda binaria y mezclas sobre listas de postings
 *   3. scoring.ts       los siete niveles de coincidencia y el desempate
 *   4. index-build.ts   qué estructuras se construyen y por qué cada una
 *   5. query.ts         el recorrido de una consulta por esas estructuras
 *
 * Todo `src/lib` son funciones puras —sin React, sin `fetch`, sin DOM—, así que se
 * pueden ejecutar con `node` directamente. Las pruebas de `scripts/smoke-test.ts`
 * lo aprovechan para probar este mismo código, no una copia.
 */

export { SCORE, NO_LEVEL, WORST_LEVEL, isAltForm, compareIds, compareEntries } from './scoring.ts'
export type { ScoreLevel } from './scoring.ts'

export { normalize, splitSegments, tokenize, grams, prefixUpperBound } from './tokenize.ts'
export {
  lowerBound,
  prefixRange,
  unionSorted,
  intersectSorted,
  unionAll,
  intersectAll,
} from './postings.ts'

export { buildIndex } from './index-build.ts'
export { loadCorpus } from './corpus.ts'
