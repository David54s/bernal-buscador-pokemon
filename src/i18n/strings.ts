/**
 * TEXTOS E IDIOMA
 * ===============
 *
 * Decisión de diseño que conviene tener clara: **la búsqueda empareja siempre en
 * los dos idiomas**, sin importar el idioma de la interfaz. El conmutador solo
 * cambia lo que se muestra. Buscar "fuego" o "fire" devuelve el mismo conjunto,
 * que es lo que un usuario real espera; obligarle a acertar el idioma sería
 * convertir una preferencia de lectura en un requisito de la consulta.
 *
 * Dónde pesa de verdad el multilenguaje, siendo honestos: de los 1025 nombres de
 * especie solo **21** difieren entre español e inglés (Código Cero, Colmilargo,
 * Ferropalmas...). El vocabulario bilingüe está en otro sitio: los 18 nombres de
 * tipo, que afectan a los 1351 documentos; los ~640 términos de género; los
 * nombres de generación y región; y estos textos de interfaz.
 */

import type { CorpusGeneration, CorpusType } from '../lib/corpus.ts'
import type { Doc, DropReason, GroupKey, PokedexIndex, Tag } from '../lib/index-types.ts'
import { SCORE } from '../lib/scoring.ts'

export type Lang = 'es' | 'en'

/** Objeto `as const`, no `enum`: el proyecto compila con `erasableSyntaxOnly`. */
export const STRINGS = {
  es: {
    title: 'Buscador de Pokémon',
    subtitle: 'Práctica 1 · Recuperación de Información',
    searchLabel: 'Buscar Pokémon',
    searchPlaceholder: 'char, fuego, pikachu, ratón, 25...',
    searchHint: 'Se filtra mientras escribes, en español o en inglés. No hay que pulsar Enter.',
    clearSearch: 'Borrar búsqueda',

    loadingTitle: 'Cargando el índice…',
    loadingBody: 'El catálogo se descarga una sola vez; a partir de ahí buscar no toca la red.',
    errorTitle: 'No se pudo cargar el índice',
    retry: 'Reintentar',

    noResultsTitle: 'Sin resultados',
    clearAll: 'Limpiar todo',

    filters: 'Filtros',
    typesFacet: 'Tipo',
    gensFacet: 'Generación',
    clearFilters: 'Quitar filtros',

    groupBy: 'Agrupar por',
    groupNone: 'Sin agrupar',
    groupType: 'Tipo',
    groupGeneration: 'Generación',
    groupRelevance: 'Relevancia',

    scrollLeft: 'Desplazar a la izquierda',
    scrollRight: 'Desplazar a la derecha',
    loadMore: 'Cargar más',
    moreGroups: 'Mostrar más grupos',

    didYouMean: '¿Quisiste decir',
    approxResults: 'Resultados aproximados',
    reductionDiscarded: 'Descartadas',
    matchedBy: 'Coincide con:',
    reductionNormalizedHint: 'palabra normalizada a su singular',
    reasonStopword: 'palabras vacías',
    reasonCorta: 'demasiado cortas',
    reasonAusente: 'sin coincidencia en el catálogo',
    reasonSobrante: 'menos informativas',
    altForm: 'Forma alterna',
    allResults: 'Resultados',
    language: 'Idioma',

    levels: {
      [SCORE.ID_EXACT]: 'Número de Pokédex',
      [SCORE.NAME_EXACT]: 'Nombre exacto',
      [SCORE.PREFIX]: 'Empieza por la consulta',
      [SCORE.WORD_PREFIX]: 'Una palabra empieza por la consulta',
      [SCORE.CONTAINS]: 'Contiene la consulta',
      [SCORE.FACET]: 'Por tipo, generación o género',
      [SCORE.FUZZY]: 'Aproximados',
      [SCORE.REDUCED]: 'Por su descripción',
    },
  },
  en: {
    title: 'Pokémon search',
    subtitle: 'Assignment 1 · Information Retrieval',
    searchLabel: 'Search Pokémon',
    searchPlaceholder: 'char, fire, pikachu, mouse, 25...',
    searchHint: 'Filters as you type, in English or Spanish. No need to press Enter.',
    clearSearch: 'Clear search',

    loadingTitle: 'Loading the index…',
    loadingBody: 'The catalogue downloads once; after that, searching never touches the network.',
    errorTitle: 'Could not load the index',
    retry: 'Retry',

    noResultsTitle: 'No results',
    clearAll: 'Clear all',

    filters: 'Filters',
    typesFacet: 'Type',
    gensFacet: 'Generation',
    clearFilters: 'Clear filters',

    groupBy: 'Group by',
    groupNone: 'No grouping',
    groupType: 'Type',
    groupGeneration: 'Generation',
    groupRelevance: 'Relevance',

    scrollLeft: 'Scroll left',
    scrollRight: 'Scroll right',
    loadMore: 'Load more',
    moreGroups: 'Show more groups',

    didYouMean: 'Did you mean',
    approxResults: 'Approximate results',
    reductionDiscarded: 'Discarded',
    matchedBy: 'Matched by:',
    reductionNormalizedHint: 'word normalised to its singular',
    reasonStopword: 'stop words',
    reasonCorta: 'too short',
    reasonAusente: 'not found in the catalogue',
    reasonSobrante: 'less informative',
    altForm: 'Alternate form',
    allResults: 'Results',
    language: 'Language',

    levels: {
      [SCORE.ID_EXACT]: 'Pokédex number',
      [SCORE.NAME_EXACT]: 'Exact name',
      [SCORE.PREFIX]: 'Starts with the query',
      [SCORE.WORD_PREFIX]: 'A word starts with the query',
      [SCORE.CONTAINS]: 'Contains the query',
      [SCORE.FACET]: 'By type, generation or category',
      [SCORE.FUZZY]: 'Approximate',
      [SCORE.REDUCED]: 'By description',
    },
  },
} as const

export type StringKey = keyof (typeof STRINGS)['es']

export function t(lang: Lang, key: Exclude<StringKey, 'levels'>): string {
  return STRINGS[lang][key]
}

/* --- Resolución de etiquetas ----------------------------------------------- */

export function docName(doc: Doc, lang: Lang): string {
  return lang === 'es' ? doc.nameEs : doc.nameEn
}

export function typeLabel(type: CorpusType, lang: Lang): string {
  return lang === 'es' ? type.es : type.en
}

export function generationLabel(generation: CorpusGeneration, lang: Lang): string {
  return lang === 'es' ? generation.es : generation.en
}

export function regionLabel(generation: CorpusGeneration, lang: Lang): string {
  return lang === 'es' ? generation.regionEs : generation.regionEn
}

export function genusLabel(doc: Doc, lang: Lang): string {
  return lang === 'es' ? doc.genusEs : doc.genusEn
}

export function levelLabel(level: number, lang: Lang): string {
  const levels = STRINGS[lang].levels as Record<number, string | undefined>
  return levels[level] ?? String(level)
}

/** El texto de una etiqueta de tarjeta, ya en el idioma activo. */
export function tagLabel(index: PokedexIndex, doc: Doc, tag: Tag, lang: Lang): string {
  switch (tag.kind) {
    case 'type': {
      const type = index.typeById.get(tag.typeId)
      return type ? typeLabel(type, lang) : String(tag.typeId)
    }
    case 'generation': {
      const generation = index.generationById.get(tag.genId)
      return generation ? generationLabel(generation, lang) : String(tag.genId)
    }
    case 'color': {
      const color = index.colorById.get(tag.colorId)
      return color ? (lang === 'es' ? color.es : color.en) : String(tag.colorId)
    }
    case 'genus':
      return genusLabel(doc, lang)
    case 'altForm':
      return t(lang, 'altForm')
  }
}

/**
 * El resumen de una reducción: «De 22 palabras se conservaron 3».
 *
 * Es una función y no una clave suelta porque lleva números interpolados, igual
 * que `tagLabel` o `groupLabel` reciben datos y devuelven texto ya resuelto.
 */
export function reductionSummary(lang: Lang, total: number, kept: number): string {
  return lang === 'es'
    ? `De ${total} palabras se conservaron ${kept}`
    : `${kept} terms kept out of ${total} words`
}

/** La etiqueta de «por qué está aquí este resultado», ya en el idioma activo. */
export function matchedBy(lang: Lang): string {
  return t(lang, 'matchedBy')
}

/** El motivo por el que se descartó una palabra, ya en el idioma activo. */
export function dropReasonLabel(lang: Lang, reason: DropReason): string {
  switch (reason) {
    case 'stopword':
      return t(lang, 'reasonStopword')
    case 'corta':
      return t(lang, 'reasonCorta')
    case 'ausente':
      return t(lang, 'reasonAusente')
    case 'sobrante':
      return t(lang, 'reasonSobrante')
  }
}

/** El encabezado de una fila, ya en el idioma activo. */
export function groupLabel(index: PokedexIndex, key: GroupKey, lang: Lang): string {
  switch (key.kind) {
    case 'all':
      return t(lang, 'allResults')
    case 'type': {
      const type = index.typeById.get(key.typeId)
      return type ? typeLabel(type, lang) : String(key.typeId)
    }
    case 'generation': {
      const generation = index.generationById.get(key.genId)
      if (!generation) return String(key.genId)
      return `${generationLabel(generation, lang)} · ${regionLabel(generation, lang)}`
    }
    case 'relevance':
      return levelLabel(key.level, lang)
  }
}
