import { useCallback, useState } from 'react'
import { t } from '../i18n/strings.ts'
import type { Lang } from '../i18n/strings.ts'
import { avatarUrl } from '../lib/viewers.ts'
import { useViewer } from '../viewers/viewer-context.ts'

/**
 * EL PERFIL ACTIVO, EN LA CABECERA
 *
 * Un botón con el retrato y el nombre; al pulsarlo, la lista de perfiles para
 * cambiar sin pasar por la portada, y «gestionar perfiles» al final, que sí la
 * abre.
 *
 * Por qué se cierra como se cierra
 * --------------------------------
 * Escape, y el foco saliendo del contenedor. Lo segundo es lo que hace de
 * «pulsar fuera» sin oyentes en `document`: el `onBlur` burbujea desde el botón
 * que lo tenía, y se comprueba si el foco se fue DENTRO del propio menú
 * —`currentTarget.contains(relatedTarget)`— para no cerrarlo al tabular de una
 * opción a la siguiente.
 *
 * Funciona con teclado y con ratón sin traer ninguna dependencia, que es lo que
 * se busca. Lo que no cubre es pulsar con el ratón en un hueco de la página que
 * no reciba foco; para eso haría falta el oyente global, y no parece que valga
 * la pena por un menú del que se sale eligiendo.
 */
export function ViewerMenu({ lang }: { lang: Lang }) {
  const { viewers, active, choose, openGate } = useViewer()
  const [open, setOpen] = useState(false)

  const onBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }, [])

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') setOpen(false)
  }, [])

  return (
    <div className="viewer-menu" onBlur={onBlur} onKeyDown={onKeyDown}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t(lang, 'viewerSwitch')}
        className="viewer-menu__button"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <img alt="" className="viewer-menu__avatar" src={avatarUrl(active.avatar)} />
        <span className="viewer-menu__name">{active.name}</span>
        <span aria-hidden="true" className="viewer-menu__caret">
          ▾
        </span>
      </button>

      {open && (
        <ul className="viewer-menu__list" role="menu">
          {viewers.map((viewer) => (
            <li key={viewer.id} role="none">
              <button
                aria-current={viewer.id === active.id ? 'true' : undefined}
                className={`viewer-menu__option${viewer.id === active.id ? ' viewer-menu__option--current' : ''}`}
                onClick={() => {
                  choose(viewer.id)
                  setOpen(false)
                }}
                role="menuitem"
                type="button"
              >
                <img alt="" className="viewer-menu__avatar" src={avatarUrl(viewer.avatar)} />
                <span className="viewer-menu__name">{viewer.name}</span>
                {viewer.id === active.id && (
                  <span aria-hidden="true" className="viewer-menu__check">
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}

          <li role="none">
            <button
              className="viewer-menu__option viewer-menu__option--manage"
              onClick={() => {
                setOpen(false)
                openGate()
              }}
              role="menuitem"
              type="button"
            >
              {t(lang, 'viewerManage')}
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
