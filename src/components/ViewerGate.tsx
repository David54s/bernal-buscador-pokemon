import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../i18n/strings.ts'
import { useLanguage } from '../i18n/language-context.ts'
import { AVATAR_CHOICES, VIEWER_NAME_MAX, avatarUrl } from '../lib/viewers.ts'
import { useViewer } from '../viewers/viewer-context.ts'

/** Qué está haciendo la portada: elegir, gestionar, o creando uno nuevo. */
const MODE = { PICK: 'pick', MANAGE: 'manage', CREATE: 'create' } as const
type Mode = (typeof MODE)[keyof typeof MODE]

/**
 * LA PORTADA: «¿QUIÉN ESTÁ BUSCANDO?»
 *
 * Sale al abrir la página cuando hay más de un perfil, y cuando se pide
 * «gestionar perfiles» desde la cabecera.
 *
 * Es un diálogo MODAL de verdad, no una capa encima
 * ------------------------------------------------
 * Lleva `role="dialog"` con `aria-modal`, el foco va a la primera tarjeta al
 * abrirse, y se cierra con Escape. Lo que de verdad lo hace modal es el `inert`
 * que `ViewerShell` pone en todo lo de detrás: sin él, el tabulador seguiría
 * paseando por un buscador invisible y un lector de pantalla leería las dos
 * cosas a la vez.
 *
 * No se cierra pulsando fuera ni con una X al elegir por primera vez: no hay un
 * «sin perfil» al que volver, así que la única salida es elegir uno. Cuando se
 * ha entrado ya —se abrió desde la cabecera— sí hay un botón de volver.
 */
export function ViewerGate() {
  const { lang } = useLanguage()
  const { viewers, active, choose, closeGate, add, rename, remove } = useViewer()

  const [mode, setMode] = useState<Mode>(MODE.PICK)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(AVATAR_CHOICES[0]!)
  const [editing, setEditing] = useState<string | null>(null)

  const first = useRef<HTMLButtonElement>(null)

  /**
   * El foco entra en el diálogo al abrirse y VUELVE de donde vino al cerrarse.
   *
   * Lo primero, porque sin ello el teclado se queda donde estaba —en la página
   * de detrás, ya inerte— y no hay forma de avanzar.
   *
   * Lo segundo, porque al cerrar desaparecen todos los botones de aquí y el foco
   * caería al `body`: quien abrió la portada desde «gestionar perfiles» tendría
   * que volver a tabular la cabecera entera. Abriéndose al cargar la página el
   * elemento previo es el propio `body`, y devolverle el foco no hace nada, que
   * es lo correcto en ese caso.
   */
  useEffect(() => {
    const previo = document.activeElement
    first.current?.focus()
    return () => {
      if (previo instanceof HTMLElement) previo.focus()
    }
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (mode !== MODE.PICK) {
        setMode(MODE.PICK)
        setEditing(null)
      } else {
        closeGate()
      }
    },
    [mode, closeGate],
  )

  const submitNew = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      add(name, avatar)
      setName('')
      setAvatar(AVATAR_CHOICES[0]!)
      setMode(MODE.PICK)
    },
    [add, name, avatar],
  )

  return (
    // El `onKeyDown` va en el contenedor y no en `document`: el foco está dentro
    // por el efecto de arriba, así que el evento burbujea hasta aquí sin que
    // haga falta un oyente global que luego hay que acordarse de quitar.
    <div
      aria-labelledby="gate-title"
      aria-modal="true"
      className="gate"
      onKeyDown={onKeyDown}
      role="dialog"
    >
      <div className="gate__panel">
        <h2 className="gate__title" id="gate-title">
          {mode === MODE.CREATE ? t(lang, 'viewerNewTitle') : t(lang, 'gateTitle')}
        </h2>

        {mode === MODE.CREATE ? (
          <form className="gate__form" onSubmit={submitNew}>
            <label className="gate__field">
              <span className="gate__field-label">{t(lang, 'viewerName')}</span>
              <input
                autoFocus
                className="gate__input"
                maxLength={VIEWER_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                placeholder={t(lang, 'viewerNamePlaceholder')}
                value={name}
              />
            </label>

            <fieldset className="gate__field">
              <legend className="gate__field-label">{t(lang, 'viewerAvatar')}</legend>
              <ul className="gate__avatars">
                {AVATAR_CHOICES.map((pokeId) => (
                  <li key={pokeId}>
                    <button
                      aria-label={`#${pokeId}`}
                      aria-pressed={avatar === pokeId}
                      className={`gate__avatar-option${avatar === pokeId ? ' gate__avatar-option--on' : ''}`}
                      onClick={() => setAvatar(pokeId)}
                      type="button"
                    >
                      <img alt="" className="gate__avatar-img" src={avatarUrl(pokeId)} />
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>

            <div className="gate__actions">
              <button className="gate__button gate__button--primary" type="submit">
                {t(lang, 'viewerCreate')}
              </button>
              <button
                className="gate__button"
                onClick={() => setMode(MODE.PICK)}
                type="button"
              >
                {t(lang, 'viewerCancel')}
              </button>
            </div>
          </form>
        ) : (
          <>
            <ul className="gate__list">
              {viewers.map((viewer, i) => (
                <li className="gate__item" key={viewer.id}>
                  {editing === viewer.id ? (
                    // Renombrar en el sitio, sin pantalla aparte: el nombre se
                    // confirma con Enter o al salir del campo.
                    <input
                      aria-label={t(lang, 'viewerRename')}
                      autoFocus
                      className="gate__rename"
                      defaultValue={viewer.name}
                      maxLength={VIEWER_NAME_MAX}
                      onBlur={(e) => {
                        rename(viewer.id, e.target.value)
                        setEditing(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                      }}
                    />
                  ) : (
                    <button
                      aria-current={viewer.id === active.id ? 'true' : undefined}
                      className={`gate__card${viewer.id === active.id ? ' gate__card--current' : ''}`}
                      onClick={() =>
                        mode === MODE.MANAGE ? setEditing(viewer.id) : choose(viewer.id)
                      }
                      ref={i === 0 ? first : undefined}
                      type="button"
                    >
                      <img
                        alt=""
                        className="gate__avatar"
                        loading="lazy"
                        src={avatarUrl(viewer.avatar)}
                      />
                      <span className="gate__name">{viewer.name}</span>
                      {mode === MODE.MANAGE && (
                        <span className="gate__hint">{t(lang, 'viewerRename')}</span>
                      )}
                    </button>
                  )}

                  {/* El borrar solo aparece gestionando, y no si es el único que
                      queda: la lista no puede vaciarse (ver `removeViewer`). */}
                  {mode === MODE.MANAGE && viewers.length > 1 && editing !== viewer.id && (
                    <button
                      className="gate__remove"
                      onClick={() => remove(viewer.id)}
                      type="button"
                    >
                      {t(lang, 'viewerRemove')}
                    </button>
                  )}
                </li>
              ))}

              <li className="gate__item">
                <button
                  className="gate__card gate__card--new"
                  onClick={() => setMode(MODE.CREATE)}
                  type="button"
                >
                  <span aria-hidden="true" className="gate__plus">
                    +
                  </span>
                  <span className="gate__name">{t(lang, 'viewerNew')}</span>
                </button>
              </li>
            </ul>

            <div className="gate__actions">
              <button
                aria-pressed={mode === MODE.MANAGE}
                className="gate__button"
                onClick={() => {
                  setMode(mode === MODE.MANAGE ? MODE.PICK : MODE.MANAGE)
                  setEditing(null)
                }}
                type="button"
              >
                {mode === MODE.MANAGE ? t(lang, 'viewerDone') : t(lang, 'viewerManage')}
              </button>
              <button className="gate__button" onClick={closeGate} type="button">
                {t(lang, 'viewerBack')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
