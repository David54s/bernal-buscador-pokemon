import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  addViewer,
  readViewers,
  removeViewer,
  renameViewer,
  storeActiveId,
  storeViewers,
} from '../lib/viewers.ts'
import { ViewerContext, type ViewerValue } from './viewer-context.ts'

/**
 * Mantiene la lista de perfiles, cuál está activo, y si la portada está puesta.
 *
 * Mismo patrón que `LanguageProvider`: el estado aquí, la persistencia dentro
 * del *setter* —no en un efecto, que ocurriría un render más tarde— y el valor
 * del contexto memorizado.
 *
 * La lista se lee UNA vez, en el inicializador. Si otra pestaña cambiara los
 * perfiles no nos enteraríamos hasta recargar, y eso está bien: dos pestañas de
 * la misma página son la misma persona mirando dos cosas a la vez, no dos
 * personas, y escuchar el evento `storage` para pelearse por quién manda sería
 * complicar la cosa a cambio de nada.
 */
export function ViewerProvider({ children }: { children: ReactNode }) {
  const [{ viewers, activeId }, setState] = useState(() => readViewers())

  /**
   * La portada sale al abrir solo si hay MÁS DE UN perfil.
   *
   * Con uno solo no hay nada que elegir: la pantalla sería un paso intermedio
   * que siempre lleva al mismo sitio. Con los tres de ejemplo sembrados siempre
   * habrá más de uno, así que en la práctica sale, como en Netflix.
   */
  const [gateOpen, setGateOpen] = useState(() => viewers.length > 1)

  /** El activo, con respaldo al primero: un id guardado puede señalar a un perfil borrado. */
  const active = useMemo(
    () => viewers.find((v) => v.id === activeId) ?? viewers[0]!,
    [viewers, activeId],
  )

  /** Elegir un perfil es también cerrar la portada: es a lo que se venía. */
  const choose = useCallback((id: string) => {
    storeActiveId(id)
    setState((prev) => ({ ...prev, activeId: id }))
    setGateOpen(false)
  }, [])

  const openGate = useCallback(() => setGateOpen(true), [])
  const closeGate = useCallback(() => setGateOpen(false), [])

  const add = useCallback((name: string, avatar: number) => {
    setState((prev) => {
      const { viewers: next, created } = addViewer(prev.viewers, name, avatar)
      storeViewers(next)
      storeActiveId(created.id)
      return { viewers: next, activeId: created.id }
    })
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setState((prev) => {
      const next = renameViewer(prev.viewers, id, name)
      storeViewers(next)
      return { ...prev, viewers: next }
    })
  }, [])

  /**
   * Borrar el perfil activo deja activo al primero que quede. `removeViewer` se
   * niega a borrar el último, así que siempre queda alguno.
   */
  const remove = useCallback((id: string) => {
    setState((prev) => {
      const next = removeViewer(prev.viewers, id)
      const nextActiveId = next.some((v) => v.id === prev.activeId) ? prev.activeId : next[0]!.id
      storeViewers(next)
      storeActiveId(nextActiveId)
      return { viewers: next, activeId: nextActiveId }
    })
  }, [])

  const value = useMemo<ViewerValue>(
    () => ({ viewers, active, gateOpen, choose, openGate, closeGate, add, rename, remove }),
    [viewers, active, gateOpen, choose, openGate, closeGate, add, rename, remove],
  )

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
}
