/**
 * Lectura y escritura del idioma elegido.
 *
 * En su propio módulo, sin React, por dos motivos: son funciones puras que no
 * necesitan nada del árbol de componentes, y así las pruebas pueden importarlas
 * ejecutándose con Node a secas, sin que haga falta instalar dependencias.
 */

import { LANG_STORAGE_KEY } from '../constants.ts'
import type { Lang } from './strings.ts'

/**
 * El idioma inicial: lo que el usuario eligió la última vez y, si no hay nada
 * guardado, lo que pida el navegador.
 *
 * Cada acceso va envuelto porque `localStorage` puede lanzar —ventana privada,
 * datos de sitio bloqueados— y eso no debe impedir que la página arranque.
 */
export function readStoredLang(fallback: Lang = 'es'): Lang {
  try {
    const stored = globalThis.localStorage?.getItem(LANG_STORAGE_KEY)
    if (stored === 'es' || stored === 'en') return stored
  } catch {
    // Sin acceso a almacenamiento: se decide por el navegador.
  }
  try {
    const preferred = (globalThis.navigator?.language ?? '').toLowerCase()
    if (preferred.startsWith('en')) return 'en'
    if (preferred.startsWith('es')) return 'es'
  } catch {
    // Tampoco hay navigator (por ejemplo al ejecutarse en Node).
  }
  return fallback
}

export function storeLang(lang: Lang): void {
  try {
    globalThis.localStorage?.setItem(LANG_STORAGE_KEY, lang)
  } catch {
    // Si no se puede guardar, la elección vale para esta sesión y ya está.
  }
}
