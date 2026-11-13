import App from '../App.tsx'
import { ViewerGate } from '../components/ViewerGate.tsx'
import { useViewer } from './viewer-context.ts'

/**
 * EL CASCARÓN: LA PORTADA Y, DETRÁS, EL BUSCADOR
 *
 * Dos decisiones viven aquí, y las dos ahorran código.
 *
 * `key={active.id}` — cambiar de perfil REMONTA el buscador
 * ----------------------------------------------------------
 * `App` guarda en `useState` las valoraciones, los filtros, la agrupación, la
 * consulta y la paginación, y `GraphExplorer` guarda el recorrido. Remontando,
 * todos esos inicializadores vuelven a ejecutarse y releen el almacenamiento del
 * perfil nuevo.
 *
 * La alternativa era un efecto que reiniciara las seis cosas al cambiar de
 * perfil, y acordarse de ampliarlo cada vez que `App` gane estado. Una pieza de
 * estado que se olvidara ahí sería una fuga de datos de una persona a otra, que
 * es justo lo que los perfiles vienen a impedir. El remonte no se puede olvidar.
 *
 * La portada va ENCIMA, no en lugar del buscador
 * ----------------------------------------------
 * `App` se monta detrás mientras se elige, así que `useCorpusIndex` arranca la
 * descarga del corpus DURANTE la elección en vez de después: el tiempo que se
 * tarda en pulsar una tarjeta es tiempo que el corpus ya está viajando.
 *
 * Y `inert` deja todo lo de detrás fuera del tabulador y del árbol de
 * accesibilidad, que es lo que convierte la portada en un diálogo modal de
 * verdad y no en una capa que tapa.
 */
export function ViewerShell() {
  const { active, gateOpen } = useViewer()

  return (
    <>
      <div inert={gateOpen}>
        <App key={active.id} />
      </div>
      {gateOpen && <ViewerGate />}
    </>
  )
}
