import { useCallback, useEffect, useState } from 'react'
import { loadCorpus } from '../lib/corpus.ts'
import { buildIndex } from '../lib/index-build.ts'
import type { PokedexIndex } from '../lib/index-types.ts'
import type { LoadState } from '../types.ts'

/**
 * El índice construido, guardado a nivel de módulo.
 *
 * Construirlo cuesta unos 30 ms y el resultado es inmutable, así que no tiene
 * sentido repetirlo. Esto además hace que en desarrollo, donde StrictMode monta y
 * desmonta cada componente dos veces, se construya exactamente una vez.
 */
let cached: PokedexIndex | null = null

interface CorpusIndexResult {
  index: PokedexIndex | null
  state: LoadState
  error: string | null
  retry: () => void
}

/** Descarga el índice una sola vez y lo deja listo para consultar. */
export function useCorpusIndex(): CorpusIndexResult {
  const [index, setIndex] = useState<PokedexIndex | null>(cached)
  const [state, setState] = useState<LoadState>(cached === null ? 'loading' : 'ready')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // El estado de "cargando" se pone en el evento que provoca el cambio, no dentro
  // del efecto: así no se encadena un render de más.
  const retry = useCallback(() => {
    setState('loading')
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    if (cached !== null) return
    let cancelled = false

    loadCorpus()
      .then((corpus) => {
        if (cancelled) return
        cached = buildIndex(corpus)
        setIndex(cached)
        setState('ready')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'No se pudo cargar el índice')
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  return { index, state, error, retry }
}
