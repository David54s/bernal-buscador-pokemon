/**
 * Tipos compartidos por la interfaz.
 *
 * El modelo de datos del buscador vive en `src/lib/index-types.ts` (el índice) y
 * en `src/lib/corpus.ts` (el formato en disco). Aquí solo queda lo que necesita la
 * capa de React.
 */

/** Estado de la carga del índice que la interfaz necesita distinguir. */
export type LoadState = 'idle' | 'loading' | 'ready' | 'error'
