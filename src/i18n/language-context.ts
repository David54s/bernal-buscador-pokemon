/**
 * El contexto del idioma y su hook.
 *
 * Separado del componente proveedor a propósito: así este archivo no tiene JSX y
 * no mezcla exportaciones de componentes con las de utilidades. La persistencia
 * vive aparte, en `lang-storage.ts`, que no depende de React.
 */

import { createContext, useContext } from 'react'
import type { Lang } from './strings.ts'

export interface LanguageValue {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const LanguageContext = createContext<LanguageValue>({
  lang: 'es',
  setLang: () => {},
})

export function useLanguage(): LanguageValue {
  return useContext(LanguageContext)
}
