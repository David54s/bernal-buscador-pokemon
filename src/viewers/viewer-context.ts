/**
 * El contexto del perfil activo y su hook.
 *
 * Separado del componente proveedor por lo mismo que el del idioma: así este
 * archivo no tiene JSX y no mezcla exportaciones de componentes con las de
 * utilidades. La persistencia vive aparte, en `lib/viewers.ts`, sin React.
 */

import { createContext, useContext } from 'react'
import type { Viewer } from '../lib/viewers.ts'

export interface ViewerValue {
  viewers: readonly Viewer[]
  /** El perfil que está usando la página. Nunca es nulo: la lista nunca está vacía. */
  active: Viewer
  /** Si la portada «¿Quién está buscando?» está puesta. */
  gateOpen: boolean
  choose: (id: string) => void
  openGate: () => void
  closeGate: () => void
  /** Crea un perfil y lo deja activo, que es lo que se espera al crearlo. */
  add: (name: string, avatar: number) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
}

/**
 * El valor por defecto no se usa nunca en la práctica —todo el árbol va dentro
 * del proveedor—, pero tiene que ser un `Viewer` completo para que el tipo no
 * obligue a comprobar nulos en cada componente.
 */
export const ViewerContext = createContext<ViewerValue>({
  viewers: [],
  active: { id: '', name: '', avatar: 1 },
  gateOpen: false,
  choose: () => {},
  openGate: () => {},
  closeGate: () => {},
  add: () => {},
  rename: () => {},
  remove: () => {},
})

export function useViewer(): ViewerValue {
  return useContext(ViewerContext)
}
