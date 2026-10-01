/**
 * CORPUS: el formato del índice construido fuera de línea.
 * =======================================================
 *
 * `scripts/build-corpus.ts` consulta PokeAPI una sola vez y escribe
 * `public/data/pokedex.v1.json` con esta forma. La aplicación solo lee ese
 * archivo: buscar no toca la red nunca.
 *
 * Es la arquitectura clásica de Recuperación de Información —indexar fuera de
 * línea, consultar en línea— y además hace que el buscador funcione sin
 * conexión y que las pruebas lean exactamente los mismos bytes que el navegador.
 *
 * Las claves son cortas a propósito: este archivo es un formato de transporte
 * que se repite 1351 veces, no código que se lea a diario.
 */

import { CORPUS_URL } from '../constants.ts'

/** Un tipo de Pokémon. Solo los 18 reales; `stellar`/`unknown`/`shadow` se descartan. */
export interface CorpusType {
  /** Id de PokeAPI, 1..18. */
  id: number
  /** Slug inglés, ej. "fire". Es la clave de `TYPE_COLORS`. */
  slug: string
  en: string
  es: string
  /** Nombre en es-419 cuando difiere de `es`: lucha→Pelea, bicho→Insecto. */
  alt?: string
}

/**
 * Un color de Pokémon. Son 10 y PokeAPI los asigna a las 1025 especies.
 *
 * Es la única faceta puramente VISUAL del catálogo, y describe lo que alguien
 * ve antes de saber nada más: "el ratón amarillo", "la rata morada". Sin esto,
 * el color no está en ninguna parte del corpus —ni en las categorías ni en las
 * entradas de Pokédex— y una consulta por color no puede encontrar nada.
 */
export interface CorpusColor {
  /** 1..10 */
  id: number
  /** Slug inglés, ej. "yellow". */
  slug: string
  en: string
  es: string
}

/** Una generación. Las 9 particionan exactamente las 1025 especies. */
export interface CorpusGeneration {
  /** 1..9 */
  id: number
  en: string
  es: string
  regionEn: string
  /** Ojo: Unova se llama Teselia en español. */
  regionEs: string
}

/**
 * Una especie (1025). Aquí viven los datos que las 326 formas alternas
 * HEREDAN, para no repetir nombre y género 1351 veces.
 */
export interface CorpusSpecies {
  /** Número de Pokédex, 1..1025. */
  id: number
  slug: string
  /** Nombre inglés con su puntuación real: "Mr. Mime". No se deriva del slug. */
  en: string
  /** Nombre español SOLO cuando difiere del inglés (21 de 1025). */
  es?: string
  /** Índice en `genus.en`. Siempre presente. */
  gEn: number
  /** Índice en `genus.es`. Ausente en 127 especies → se usa `gEn`. */
  gEs?: number
  /** 1..9 */
  gen: number
  /** Índice del color en `colors`, 1..10. */
  c: number
  /**
   * Entrada de Pokédex en inglés. Es la descripción de la especie, no su
   * identidad: "It has a preference for hot things." Alimenta el índice de
   * descripción, que solo consulta la consulta reducida.
   *
   * Se guarda la MÁS RECIENTE de las ~64 versiones que publica PokeAPI.
   */
  dEn?: string
  /**
   * Lo mismo en español. Ausente en 127 especies (de la 899 en adelante) porque
   * PokeAPI aún no las ha traducido → se usa `dEn`, igual que con el género.
   */
  dEs?: string
}

/** Un documento buscable (1351). El docId es su posición en `docs`, no se guarda. */
export interface CorpusDoc {
  /** Id de PokeAPI. >= 10000 significa forma alterna. */
  i: number
  /** Slug completo, ej. "charizard-mega-x". */
  n: string
  /** Índice en `species`. */
  s: number
  /** Ids de tipo en orden de slot, ej. [10, 3]. */
  t: number[]
  /**
   * Variante de sprite disponible, resuelta en la construcción:
   * ausente = arte oficial · 1 = solo sprite clásico · 0 = sin imagen.
   * Se resuelve fuera de línea para no necesitar `onError` en el navegador.
   */
  a?: 0 | 1
}

export interface Corpus {
  version: 1
  /** ISO. Va en el reporte. */
  builtAt: string
  counts: { docs: number; species: number; typeMemberships: number }
  types: CorpusType[]
  generations: CorpusGeneration[]
  /**
   * Diccionario de géneros internado: ~653 términos en vez de 1025 cadenas
   * repetidas ("Pokémon Semilla" lo comparten bulbasaur, ivysaur y venusaur).
   * Es la técnica de diccionario de términos, y deja el género como entero.
   */
  genus: { es: string[]; en: string[] }
  colors: CorpusColor[]
  species: CorpusSpecies[]
  docs: CorpusDoc[]
}

/** Falla ruidosamente: un corpus a medias es peor que ninguno. */
function assertShape(data: unknown): Corpus {
  const c = data as Corpus
  if (c?.version !== 1) throw new Error('El corpus no tiene version 1')
  for (const key of ['types', 'generations', 'species', 'docs'] as const) {
    if (!Array.isArray(c[key])) throw new Error(`El corpus no trae "${key}"`)
  }
  if (c.docs.length !== c.counts.docs) {
    throw new Error(`El corpus dice ${c.counts.docs} documentos pero trae ${c.docs.length}`)
  }
  return c
}

/**
 * Promesa a nivel de módulo: en desarrollo StrictMode monta dos veces, y sin
 * esto se dispararían dos peticiones idénticas (era un fallo real del código
 * anterior). Así el corpus se descarga exactamente una vez por pestaña.
 */
let pending: Promise<Corpus> | null = null

export function loadCorpus(): Promise<Corpus> {
  pending ??= fetch(CORPUS_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`No se pudo cargar el índice (HTTP ${response.status})`)
      }
      return response.json()
    })
    .then(assertShape)
    .catch((cause: unknown) => {
      // Si falla, la siguiente llamada debe poder reintentar de verdad.
      pending = null
      throw cause
    })

  return pending
}
