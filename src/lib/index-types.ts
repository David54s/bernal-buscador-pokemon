/**
 * EL ÍNDICE EN MEMORIA
 * ====================
 *
 * Cada estructura de aquí responde exactamente un nivel de coincidencia. Ésa es
 * la idea central: la consulta no recorre el catálogo, consulta la estructura que
 * corresponde y solo toca los documentos que pueden ser respuesta.
 *
 *   nivel 0  ID_EXACT     byPokeId          un Map
 *   nivel 1  NAME_EXACT   nameTerms         búsqueda binaria
 *   nivel 2  PREFIX       nameTerms         rango de prefijo (dos binarias)
 *   nivel 3  WORD_PREFIX  segTerms          rango de prefijo
 *   nivel 4  CONTAINS     docGrams          n-gramas
 *   nivel 5  FACET        facetTerms        rango de prefijo
 *   nivel 6  FUZZY        termGrams+vocab   corrección contra el vocabulario
 *   nivel 7  REDUCED      textTerms         descripciones, para consultas largas
 */

import type { CorpusColor, CorpusGeneration, CorpusType } from './corpus.ts'

/** Un documento del índice, con todo ya resuelto para pintarlo sin más consultas. */
export interface Doc {
  /** Posición en `docs`, 0..n-1. Es el valor que va en las listas de postings. */
  docId: number
  /** Id de PokeAPI. Disperso: 1..1025 y luego 10001..10277. */
  pokeId: number
  slug: string
  speciesIdx: number
  /** Ids de tipo en orden de slot. Las formas tienen los SUYOS, no los de su especie. */
  typeIds: number[]
  /** Generación, ya propagada desde la especie a las 326 formas alternas. */
  genId: number
  /** Color dominante, 1..10. Lo asigna PokeAPI a la especie. */
  colorId: number
  /** Género en español, con el inglés como respaldo cuando no existe. */
  genusEs: string
  genusEn: string
  /**
   * Entrada de Pokédex, con el inglés como respaldo igual que el género. Cadena
   * vacía si la especie no tiene ninguna. Las formas alternas heredan la de su
   * especie: charizard-mega-x se describe como Charizard.
   */
  descEs: string
  descEn: string
  isAltForm: boolean
  /** "Mega X" para charizard-mega-x; `null` en las especies base. */
  formSuffix: string | null
  /** Nombre para mostrar, ya compuesto: "Charizard (Mega X)". */
  nameEs: string
  nameEn: string
  /** URL del sprite, resuelta en la construcción del corpus. `null` si no hay. */
  spriteUrl: string | null
}

/** De qué campo viene un término de faceta, para saber qué chip sugerir. */
export type FacetTermMeta =
  | { kind: 'type'; typeId: number }
  | { kind: 'generation'; genId: number }
  | { kind: 'region'; genId: number }
  | { kind: 'color'; colorId: number }
  | { kind: 'genus' }

export interface IndexStats {
  buildMs: number
  docs: number
  nameTerms: number
  segTerms: number
  facetTerms: number
  textTerms: number
  vocab: number
  postings: number
  gramKeys: number
}

/**
 * Búferes reutilizados entre pulsaciones para no asignar memoria en cada tecla.
 *
 * OJO: `runQuery` no es reentrante. Los reinicia al entrar (así que ejecutarla
 * dos veces seguidas es inofensivo, que es lo que hace StrictMode) y **nunca**
 * devuelve estos búferes: siempre copia a arrays nuevos.
 */
export interface Scratch {
  /** Respuesta que se va armando: mejor nivel por documento. 255 = sin tocar. */
  best: Uint8Array
  /** Documentos escritos en `best`, para reiniciar solo esos y no los 1351. */
  bestTouched: number[]
  /** Un token a la vez, para poder combinarlos después con AND. */
  token: Uint8Array
  tokenTouched: number[]
  /** Cuántos tokens ha satisfecho cada documento. */
  hits: Uint8Array
  /** Peor nivel entre los tokens satisfechos: limita la calidad global. */
  worst: Uint8Array
  /** Documentos tocados por algún token, para reiniciar `hits` y `worst`. */
  andTouched: number[]
}

export interface PokedexIndex {
  docs: Doc[]
  types: CorpusType[]
  generations: CorpusGeneration[]
  colors: CorpusColor[]
  typeById: Map<number, CorpusType>
  colorById: Map<number, CorpusColor>
  generationById: Map<number, CorpusGeneration>

  /* Formas normalizadas, paralelas a `docs`, para verificar coincidencias. */
  flat: string[]
  flatEs: string[]
  flatEn: string[]

  /* Niveles 1 y 2: nombres completos. Ordenado por unidad de código. */
  nameTerms: string[]
  nameTermDocs: number[][]

  /* Nivel 3: términos de palabra. */
  segTerms: string[]
  segPostings: number[][]

  /* Nivel 4: n-gramas de longitud 1, 2 y 3 sobre los tres nombres. */
  docGrams: Map<string, number[]>

  /* Nivel 5: tipos, generaciones, regiones y géneros, en ambos idiomas. */
  facetTerms: string[]
  facetPostings: number[][]
  facetMeta: FacetTermMeta[]

  /* Nivel 6: trigrama -> índices en `vocab`, para corregir la consulta. */
  termGrams: Map<string, number[]>
  /** Todo el vocabulario buscable, ordenado. Es contra esto que se corrigen erratas. */
  vocab: string[]

  /**
   * ÍNDICE DE DESCRIPCIÓN — nivel 7, y solo nivel 7.
   *
   * Las palabras de las entradas de Pokédex: "tres cabezas", "vive en cuevas",
   * "mejillas". Es el único vocabulario del proyecto que describe a un Pokémon
   * en vez de identificarlo, y por eso vive aparte.
   *
   * Que esté SEPARADO es una decisión, no una casualidad. Los otros
   * diccionarios responden "¿cómo se llama?" y "¿de qué tipo es?", preguntas con
   * una respuesta exacta. Éste responde "¿a qué se parece?", que es difusa.
   * Mezclarlos haría que buscar "cola" devolviera 47 Pokémon en vez de ninguno,
   * y la búsqueda por nombre dejaría de ser precisa.
   *
   * De ahí que NO entre en `vocab`, ni en `docGrams`, ni en `termGrams`: la
   * búsqueda normal y la corrección de erratas no lo ven. El único código que lo
   * consulta es `termPostings` en `reduce.ts`.
   */
  textTerms: string[]
  textPostings: number[][]

  /* Nivel 0 y filtrado. */
  byPokeId: Map<number, number>
  byType: Map<number, number[]>
  byGen: Map<number, number[]>

  /**
   * Los documentos ya ordenados con el criterio de siempre (especies base antes
   * que formas alternas, y luego por número de Pokédex). `canonicalRank` invierte
   * ese orden para que desempatar sea una resta de enteros.
   */
  canonicalOrder: number[]
  canonicalRank: Int32Array

  scratch: Scratch
  stats: IndexStats
}

/** Facetas activas. Vacío significa "sin filtrar por esta faceta". */
export interface Filters {
  types: ReadonlySet<number>
  gens: ReadonlySet<number>
}

/** Conteos por faceta. Indexados por id, así que la posición 0 no se usa. */
export interface FacetCounts {
  types: Int32Array
  gens: Int32Array
  total: number
}

export interface QueryStats {
  ms: number
  /**
   * Cuántos documentos se han mirado. Es la cifra que demuestra que no hay
   * barrido lineal: para "char" son ~60 de 1351.
   */
  docsTouched: number
  /** Candidatos de n-gramas que hubo que confirmar con `includes`. */
  candidatesVerified: number
  usedFuzzy: boolean
  tokens: string[]
}

/** Por qué se descartó una palabra al reducir la consulta. */
export type DropReason =
  /** Palabra funcional: artículo, preposición, conjunción, auxiliar. */
  | 'stopword'
  /** Demasiado corta para discriminar. */
  | 'corta'
  /** No existe en el corpus, así que no puede coincidir con nada. */
  | 'ausente'
  /** Válida, pero menos informativa que las que se conservaron. */
  | 'sobrante'

/** Un término conservado, con lo informativo que resultó ser. */
export interface ReducedTerm {
  /** La forma que se muestra: la que se escribió, o aquella a la que se llevó. */
  term: string
  /**
   * TODAS las formas cuyas listas se unen para este término.
   *
   * Casi siempre es una sola. Son varias cuando la palabra escrita existe pero
   * otra forma suya TAMBIÉN está en el vocabulario del catálogo: "morada"
   * aparece en alguna entrada de Pokédex, y "morado" es además el nombre de un
   * color. Buscar solo una de las dos deja fuera la mitad de la respuesta.
   */
  forms: string[]
  /** En cuántos documentos aparece, uniendo todas sus formas. */
  df: number
  /** log(N / df). Cuanto más alto, más discrimina. */
  idf: number
  /**
   * La palabra tal y como se escribió, cuando `term` es otra: "cabezas" para el
   * término "cabeza", "rata" para "raton". Ausente si no se tocó.
   */
  from?: string
}

/**
 * El resultado de reducir un texto largo a sus términos informativos.
 *
 * Lleva también lo descartado y su motivo, porque enseñar QUÉ se tiró y POR QUÉ
 * es la mitad del valor: es lo que hace visible una decisión que de otro modo
 * ocurriría en silencio.
 */
export interface Reduction {
  /** Palabras que traía el texto, antes de filtrar nada. */
  totalTokens: number
  /** Los términos conservados, del más informativo al menos. */
  kept: ReducedTerm[]
  /** Cuántas palabras se descartaron por cada motivo. */
  dropped: Record<DropReason, number>
  /** Unas pocas descartadas de cada tipo, para poder mostrarlas. */
  droppedSample: { term: string; reason: DropReason }[]
  /**
   * Qué términos satisface cada documento recuperado: `docId -> términos`.
   *
   * Es lo que permite que la tarjeta diga «coincide con: cabeza» en vez de
   * aparecer sin explicación. Un buscador que no puede justificar un resultado
   * obliga a confiar en él a ciegas.
   *
   * Es un `Map` y no un array paralelo a `docIds` a propósito: `applyFacets`
   * reconstruye `docIds` al filtrar por tipo o generación, y un array paralelo
   * se desalinearía en silencio. La clave es el docId, así que sobrevive tanto
   * al filtrado como a la agrupación.
   */
  matches: ReadonlyMap<number, readonly string[]>
}

export interface QueryResult {
  /** Documentos que coinciden, ya ordenados por relevancia. */
  docIds: number[]
  /** Nivel de cada documento, en paralelo a `docIds`. */
  levels: number[]
  /** Corrección propuesta cuando no hubo ninguna coincidencia exacta. */
  suggestion: string | null
  /** Facetas que la consulta ha tocado, para ofrecerlas como chips. */
  suggestedFacets: FacetTermMeta[]
  /** Presente solo cuando la consulta era larga y hubo que reducirla. */
  reduction: Reduction | null
  stats: QueryStats
}

/** Clave de grupo sin idioma: la etiqueta se resuelve al pintar. */
export type GroupKey =
  | { kind: 'all' }
  | { kind: 'type'; typeId: number }
  | { kind: 'generation'; genId: number }
  | { kind: 'relevance'; level: number }

export interface Group {
  key: GroupKey
  docIds: number[]
}

/** Etiqueta de una tarjeta. Sin idioma, igual que las claves de grupo. */
export type Tag =
  | { kind: 'type'; typeId: number }
  | { kind: 'generation'; genId: number }
  | { kind: 'color'; colorId: number }
  | { kind: 'genus' }
  | { kind: 'altForm' }
