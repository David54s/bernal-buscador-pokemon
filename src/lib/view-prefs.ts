/**
 * CÓMO MIRA EL CATÁLOGO CADA PERFIL
 * =================================
 *
 * Los filtros activos y el criterio de agrupación, guardados por perfil.
 *
 * Antes no se guardaban en absoluto: al recargar se volvía siempre a la
 * agrupación por generación y sin ningún tipo filtrado. Si cada perfil tiene sus
 * gustos, tiene sentido que conserve también su forma de mirar.
 *
 * Qué NO se guarda, y por qué
 * ---------------------------
 * La consulta escrita y la paginación. La consulta es lo que se está haciendo
 * ahora mismo, no una preferencia —reabrir la página con una búsqueda a medias
 * puesta sería desconcertante—, y la paginación se reinicia con cada cambio de
 * filtro por diseño (ver `resetPaging` en `App.tsx`).
 */

import { GROUP_BY, PREFS_STORAGE_KEY } from '../constants.ts'
import type { GroupBy } from '../constants.ts'
import { readJson, viewerKey, writeJson } from './storage.ts'

export interface ViewPrefs {
  /** Ids de tipo filtrados. */
  types: number[]
  /** Ids de generación filtrados. */
  gens: number[]
  groupBy: GroupBy
}

/** Lo que se ve al entrar sin nada guardado: todo el catálogo, por generación. */
export const DEFAULT_PREFS: ViewPrefs = { types: [], gens: [], groupBy: GROUP_BY.GENERATION }

const GROUP_VALUES: readonly GroupBy[] = Object.values(GROUP_BY)

/** Ids válidos de una lista cualquiera: enteros positivos, sin repetir. */
function parseIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const id of value) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) continue
    if (!out.includes(id)) out.push(id)
  }
  return out
}

/**
 * Las preferencias guardadas de un perfil.
 *
 * El `groupBy` se comprueba contra `GROUP_BY` en vez de confiar en la cadena
 * guardada: un valor inventado llegaría hasta `groupResults`, que decide con un
 * `switch`, y dejaría la pantalla sin agrupar sin que nada lo explicara.
 */
export function readStoredPrefs(viewerId: string): ViewPrefs {
  const parsed = readJson(viewerKey(PREFS_STORAGE_KEY, viewerId))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...DEFAULT_PREFS }
  }

  const raw = parsed as Partial<Record<keyof ViewPrefs, unknown>>
  const groupBy = GROUP_VALUES.find((value) => value === raw.groupBy)

  return {
    types: parseIds(raw.types),
    gens: parseIds(raw.gens),
    groupBy: groupBy ?? DEFAULT_PREFS.groupBy,
  }
}

export function storePrefs(viewerId: string, prefs: ViewPrefs): void {
  writeJson(viewerKey(PREFS_STORAGE_KEY, viewerId), prefs)
}
