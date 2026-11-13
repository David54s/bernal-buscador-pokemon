/**
 * Lectura y escritura del idioma elegido.
 *
 * En su propio módulo, sin React, por dos motivos: son funciones puras que no
 * necesitan nada del árbol de componentes, y así las pruebas pueden importarlas
 * ejecutándose con Node a secas, sin que haga falta instalar dependencias.
 */

import { LANG_STORAGE_KEY } from '../constants.ts'
import { readKey, writeKey } from '../lib/storage.ts'
import type { Lang } from './strings.ts'

/**
 * El idioma inicial: lo que el usuario eligió la última vez y, si no hay nada
 * guardado, lo que pida el navegador.
 *
 * El acceso al almacenamiento va por `storage.ts`, que es quien envuelve el
 * `localStorage` que puede lanzar —ventana privada, datos de sitio bloqueados—.
 *
 * El idioma es lo ÚNICO que no se guarda por perfil: es cómo se lee la página,
 * no quién la usa. Dos personas compartiendo un portátil comparten el idioma.
 */
export function readStoredLang(fallback: Lang = 'es'): Lang {
  const stored = readKey(LANG_STORAGE_KEY)
  if (stored === 'es' || stored === 'en') return stored

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
  writeKey(LANG_STORAGE_KEY, lang)
}
