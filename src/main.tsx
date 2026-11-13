import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from './i18n/LanguageProvider.tsx'
import { ViewerProvider } from './viewers/ViewerProvider.tsx'
import { ViewerShell } from './viewers/ViewerShell.tsx'
import './styles/index.css'

/**
 * El idioma envuelve a los perfiles y no al contrario, porque es lo más externo
 * de los dos: el idioma es de la máquina y se comparte, los perfiles son de cada
 * persona. Y la portada necesita los textos para titularse.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ViewerProvider>
        <ViewerShell />
      </ViewerProvider>
    </LanguageProvider>
  </StrictMode>,
)
