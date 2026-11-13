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
import { EDGE, NODE } from '../lib/graph.ts'
import type { EdgeKind, GraphNode } from '../lib/graph.ts'
import { DICTIONARY } from '../lib/stats.ts'
import type { DictionaryId } from '../lib/stats.ts'

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
    like: 'Me gusta',
    dislike: 'No me gusta',
    recommendedTitle: 'Recomendado para ti',
    recommendedEmpty:
      'Valora algún Pokémon con ▲ o ▼ y aquí aparecerán otros parecidos.',

    viewSearch: 'Buscador',
    viewStats: 'Estadísticas',
    viewGraph: 'Explorar',
    graphLead:
      'Parte de un Pokémon y sigue las relaciones. Cada salto abre opciones nuevas, y el rastro recuerda por dónde has pasado.',
    graphTrail: 'Recorrido',
    graphClear: 'Borrar recorrido',
    graphFocus: 'Estás en',
    graphPick: 'Empieza por',
    graphNoData:
      'El corpus cargado no trae los datos de relación. Ejecuta «npm run corpus» para traerlos.',
    graphOf: 'de',
    edgeEvolvesTo: 'Evoluciona a',
    edgeEvolvesFrom: 'Evoluciona de',
    edgeOtherForms: 'Otras formas de éste',
    edgeHasType: 'Es de tipo',
    edgeStrongAgainst: 'Le gana a',
    edgeWeakAgainst: 'Pierde contra',
    edgeNoEffect: 'No afecta a',
    edgeHasGeneration: 'Es de la generación',
    edgeHasColor: 'Es de color',
    edgeMembers: 'Pokémon de este grupo',
    edgeSimilar: 'Parecidos a éste',
    scope: 'Analizar',
    scopeDescription: 'Entradas de Pokédex',
    scopeIdentity: 'Nombres y categorías',
    scopeAll: 'Todo el corpus',
    statsCorpus: 'Corpus',
    statsTokens: 'palabras',
    statsTerms: 'términos distintos',
    statsHapax: 'aparecen una sola vez',
    statsFit: 'Ajuste (R²)',
    statsTerm: 'Término',
    statsFrequency: 'Frecuencia',
    zipfTitle: 'Ley de Zipf',
    zipfLead:
      'La frecuencia de un término es inversamente proporcional a su posición en el ranking: ' +
      'el más común aparece el doble que el segundo y el triple que el tercero. En escala ' +
      'logarítmica eso es una recta.',
    zipfX: 'rango',
    zipfY: 'frecuencia',
    zipfExponent: 'Exponente s',
    zipfTop: 'Los más frecuentes. Si la ley fuera exacta, r × f sería constante.',
    heapsTitle: 'Ley de Heaps',
    heapsLead:
      'El vocabulario crece como una potencia del texto leído: V = K·N^β. Crece sin parar, ' +
      'pero cada vez más despacio, porque las palabras nuevas se agotan.',
    heapsX: 'palabras leídas',
    heapsY: 'vocabulario',
    heapsPredict: 'Con el doble de corpus, la ley predice',
    auditTitle: 'Para qué sirve aquí la ley de Zipf',
    auditLead:
      'La cabeza de la distribución debería ser palabra funcional. Si lo es, respalda con ' +
      'datos la lista de palabras vacías escrita a mano.',
    auditInHead: 'De la cabeza, están en la lista',
    auditBeyond: 'De la lista, fuera de la cabeza',
    auditMissing: 'De la cabeza, no están en la lista',
    explorerTitle: 'El índice invertido',
    explorerLead:
      'Un índice invertido va de término a la lista de documentos que lo contienen. Buscar ' +
      'no recorre el catálogo: va directo a la entrada, y esa entrada ya es la respuesta. ' +
      'Escribe un término para ver la suya.',
    explorerTerm: 'Término',
    explorerEmpty: 'Escribe un término para ver su entrada en el índice.',
    explorerNotFound: 'No hay ninguna entrada para',
    explorerDict: 'Diccionario',
    explorerToken: 'Se consulta con el token',
    explorerIgnored: 'se ignoró',
    explorerWhere: 'Dónde vive, y cuánto costó encontrarlo',
    explorerPosition: 'Posición',
    explorerProbes: 'Comparaciones',
    explorerUnion: 'la unión',
    explorerSpecies: 'Especies distintas',
    explorerNotFoundWhy:
      'no está en ningún diccionario, así que ninguna consulta puede devolverlo.',
    dictNames: 'nombres completos',
    dictWords: 'palabras del nombre',
    dictFacets: 'tipos, categorías y colores',
    dictText: 'entradas de Pokédex',
    reductionNormalizedHint: 'palabra normalizada a su singular',
    reasonStopword: 'palabras vacías',
    reasonCorta: 'demasiado cortas',
    reasonAusente: 'sin coincidencia en el catálogo',
    reasonSobrante: 'menos informativas',
    altForm: 'Forma alterna',
    allResults: 'Resultados',
    language: 'Idioma',

    /* Perfiles: quién está buscando. Ojo con «perfil» aquí: en el código la
       palabra designa el vector de Rocchio (`ProfileIndex`), así que lo de la
       pantalla es un `Viewer`. Ver la cabecera de `lib/viewers.ts`. */
    gateTitle: '¿Quién está buscando?',
    viewerSwitch: 'Cambiar de perfil',
    viewerManage: 'Gestionar perfiles',
    viewerDone: 'Listo',
    viewerBack: 'Volver',
    viewerNew: 'Nuevo perfil',
    viewerNewTitle: 'Crear un perfil',
    viewerName: 'Nombre',
    viewerNamePlaceholder: 'Ana',
    viewerAvatar: 'Retrato',
    viewerCreate: 'Crear',
    viewerCancel: 'Cancelar',
    viewerRename: 'Renombrar',
    viewerRemove: 'Borrar',

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
    like: 'I like it',
    dislike: "I don't like it",
    recommendedTitle: 'Recommended for you',
    recommendedEmpty: 'Rate a Pokémon with ▲ or ▼ and similar ones will show up here.',

    viewSearch: 'Search',
    viewStats: 'Statistics',
    viewGraph: 'Explore',
    graphLead:
      'Start from a Pokémon and follow the relations. Every hop opens new options, and the trail remembers where you have been.',
    graphTrail: 'Trail',
    graphClear: 'Clear trail',
    graphFocus: 'You are at',
    graphPick: 'Start from',
    graphNoData: 'The loaded corpus has no relation data. Run “npm run corpus” to fetch it.',
    graphOf: 'of',
    edgeEvolvesTo: 'Evolves into',
    edgeEvolvesFrom: 'Evolves from',
    edgeOtherForms: 'Other forms of this one',
    edgeHasType: 'Is of type',
    edgeStrongAgainst: 'Is strong against',
    edgeWeakAgainst: 'Is weak against',
    edgeNoEffect: 'Does not affect',
    edgeHasGeneration: 'Is from generation',
    edgeHasColor: 'Is coloured',
    edgeMembers: 'Pokémon in this group',
    edgeSimilar: 'Similar to this one',
    scope: 'Analyse',
    scopeDescription: 'Pokédex entries',
    scopeIdentity: 'Names and categories',
    scopeAll: 'Whole corpus',
    statsCorpus: 'Corpus',
    statsTokens: 'words',
    statsTerms: 'distinct terms',
    statsHapax: 'occur exactly once',
    statsFit: 'Fit (R²)',
    statsTerm: 'Term',
    statsFrequency: 'Frequency',
    zipfTitle: "Zipf's law",
    zipfLead:
      'A term\u2019s frequency is inversely proportional to its rank: the commonest appears ' +
      'twice as often as the second and three times as often as the third. On a logarithmic ' +
      'scale that is a straight line.',
    zipfX: 'rank',
    zipfY: 'frequency',
    zipfExponent: 'Exponent s',
    zipfTop: 'The most frequent. If the law were exact, r × f would be constant.',
    heapsTitle: "Heaps' law",
    heapsLead:
      'Vocabulary grows as a power of the text read: V = K·N^β. It never stops growing, but ' +
      'it slows down, because new words run out.',
    heapsX: 'words read',
    heapsY: 'vocabulary',
    heapsPredict: 'At twice the corpus, the law predicts',
    auditTitle: "What Zipf's law is for here",
    auditLead:
      'The head of the distribution should be function words. If it is, it backs the ' +
      'hand-written stop word list with data.',
    auditInHead: 'Of the head, in the list',
    auditBeyond: 'Of the list, outside the head',
    auditMissing: 'In the head, not in the list',
    explorerTitle: 'The inverted index',
    explorerLead:
      'An inverted index maps a term to the list of documents containing it. Searching does ' +
      'not scan the catalogue: it goes straight to the entry, and that entry is already the ' +
      'answer. Type a term to see its own.',
    explorerTerm: 'Term',
    explorerEmpty: 'Type a term to see its entry in the index.',
    explorerNotFound: 'There is no entry for',
    explorerDict: 'Dictionary',
    explorerToken: 'Queried with the token',
    explorerIgnored: 'ignored',
    explorerWhere: 'Where it lives, and what it cost to find',
    explorerPosition: 'Position',
    explorerProbes: 'Comparisons',
    explorerUnion: 'the union',
    explorerSpecies: 'Distinct species',
    explorerNotFoundWhy:
      'it is in no dictionary, so no query can ever return it.',
    dictNames: 'full names',
    dictWords: 'name words',
    dictFacets: 'types, categories and colours',
    dictText: 'Pokédex entries',
    reductionNormalizedHint: 'word normalised to its singular',
    reasonStopword: 'stop words',
    reasonCorta: 'too short',
    reasonAusente: 'not found in the catalogue',
    reasonSobrante: 'less informative',
    altForm: 'Alternate form',
    allResults: 'Results',
    language: 'Language',

    /* Profiles: who is searching. Careful with "profile" here: in the code the
       word means the Rocchio vector (`ProfileIndex`), so the on-screen thing is
       a `Viewer`. See the header of `lib/viewers.ts`. */
    gateTitle: 'Who is searching?',
    viewerSwitch: 'Switch profile',
    viewerManage: 'Manage profiles',
    viewerDone: 'Done',
    viewerBack: 'Back',
    viewerNew: 'New profile',
    viewerNewTitle: 'Create a profile',
    viewerName: 'Name',
    viewerNamePlaceholder: 'Ana',
    viewerAvatar: 'Portrait',
    viewerCreate: 'Create',
    viewerCancel: 'Cancel',
    viewerRename: 'Rename',
    viewerRemove: 'Delete',

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

/**
 * Qué tan bien se cumple la ley de Zipf, dicho en palabras.
 *
 * Va al `aria-label` de la gráfica: un dibujo que solo existe como dibujo deja
 * fuera a quien no lo ve, y además este texto es el que resume el hallazgo.
 */
export function zipfSummary(lang: Lang, s: number, r2: number): string {
  const bien = s > 0.85 && s < 1.15 && r2 > 0.95
  if (lang === 'es') {
    return bien
      ? `Se cumple: el exponente es ${s.toFixed(2)}, muy cerca del 1 teórico, con un ajuste de ${r2.toFixed(2)}.`
      : `No se cumple: el exponente es ${s.toFixed(2)}, lejos del 1 teórico, y el ajuste es de solo ${r2.toFixed(2)}. Es vocabulario controlado, no lenguaje natural.`
  }
  return bien
    ? `It holds: the exponent is ${s.toFixed(2)}, close to the theoretical 1, fitting at ${r2.toFixed(2)}.`
    : `It does not hold: the exponent is ${s.toFixed(2)}, far from the theoretical 1, fitting at only ${r2.toFixed(2)}. This is controlled vocabulary, not natural language.`
}

/** Lo mismo para Heaps. Un β cercano a 1 significa que casi nada se repite. */
export function heapsSummary(lang: Lang, beta: number, r2: number): string {
  const natural = beta < 0.7
  if (lang === 'es') {
    return natural
      ? `β = ${beta.toFixed(2)}, dentro del rango típico del lenguaje natural, con un ajuste de ${r2.toFixed(3)}.`
      : `β = ${beta.toFixed(2)}, muy alto: el vocabulario crece casi tan rápido como el texto, porque cada nombre propio aparece una vez y no vuelve.`
  }
  return natural
    ? `β = ${beta.toFixed(2)}, within the usual range for natural language, fitting at ${r2.toFixed(3)}.`
    : `β = ${beta.toFixed(2)}, very high: vocabulary grows almost as fast as the text, because each proper noun appears once and never again.`
}

/** Las dos lecturas de la auditoría, que dicen cosas opuestas a propósito. */
export function auditSummary(lang: Lang, inList: number, head: number, beyond: number): string {
  if (lang === 'es') {
    return (
      `${inList} de las ${head} más frecuentes están en la lista, así que la frecuencia la respalda. ` +
      `Pero otras ${beyond} palabras de la lista quedan fuera de esa cabeza: la frecuencia sola nunca la habría construido.`
    )
  }
  return (
    `${inList} of the ${head} most frequent are in the list, so frequency backs it up. ` +
    `But another ${beyond} words from the list fall outside that head: frequency alone would never have built it.`
  )
}

/**
 * El título de la fila de recomendaciones.
 *
 * Nombra al último Pokémon valorado positivamente, que es la convención de los
 * catálogos de vídeo: una recomendación sin motivo visible parece arbitraria.
 */
export function becauseYouLiked(lang: Lang, name: string): string {
  return lang === 'es' ? `Porque te gustó ${name}` : `Because you liked ${name}`
}

/** El nombre de una relación del grafo, ya en el idioma activo. */
export function edgeLabel(lang: Lang, edge: EdgeKind): string {
  switch (edge) {
    case EDGE.EVOLVES_TO:
      return t(lang, 'edgeEvolvesTo')
    case EDGE.EVOLVES_FROM:
      return t(lang, 'edgeEvolvesFrom')
    case EDGE.OTHER_FORMS:
      return t(lang, 'edgeOtherForms')
    case EDGE.HAS_TYPE:
      return t(lang, 'edgeHasType')
    case EDGE.STRONG_AGAINST:
      return t(lang, 'edgeStrongAgainst')
    case EDGE.WEAK_AGAINST:
      return t(lang, 'edgeWeakAgainst')
    case EDGE.NO_EFFECT:
      return t(lang, 'edgeNoEffect')
    case EDGE.HAS_GENERATION:
      return t(lang, 'edgeHasGeneration')
    case EDGE.HAS_COLOR:
      return t(lang, 'edgeHasColor')
    case EDGE.MEMBERS:
      return t(lang, 'edgeMembers')
    case EDGE.SIMILAR:
      return t(lang, 'edgeSimilar')
  }
}

/** El nombre de un nodo del grafo, sea de la clase que sea. */
export function nodeLabel(index: PokedexIndex, node: GraphNode, lang: Lang): string {
  switch (node.kind) {
    case NODE.POKEMON: {
      const doc = index.docs[node.docId]
      return doc === undefined ? String(node.docId) : docName(doc, lang)
    }
    case NODE.TYPE: {
      const type = index.typeById.get(node.typeId)
      return type === undefined ? String(node.typeId) : typeLabel(type, lang)
    }
    case NODE.GENERATION: {
      const gen = index.generationById.get(node.genId)
      return gen === undefined ? String(node.genId) : generationLabel(gen, lang)
    }
    case NODE.COLOR: {
      const color = index.colorById.get(node.colorId)
      return color === undefined ? String(node.colorId) : lang === 'es' ? color.es : color.en
    }
  }
}

/** Qué guarda cada diccionario, dicho en palabras. */
export function dictionaryLabel(lang: Lang, dictionary: DictionaryId): string {
  switch (dictionary) {
    case DICTIONARY.NAMES:
      return t(lang, 'dictNames')
    case DICTIONARY.WORDS:
      return t(lang, 'dictWords')
    case DICTIONARY.FACETS:
      return t(lang, 'dictFacets')
    case DICTIONARY.TEXT:
      return t(lang, 'dictText')
  }
}

/**
 * La frase que resume por qué esto es un índice y no un filtro.
 *
 * Es la cifra entera del argumento: unas pocas comparaciones bastan para
 * localizar el término, y después solo se miran los documentos que pueden ser
 * respuesta. Un barrido habría leído el catálogo completo.
 */
export function probeSummary(lang: Lang, probes: number, docs: number, df: number): string {
  if (lang === 'es') {
    return (
      `${probes} comparaciones para localizar el término, y después ${df} documentos mirados ` +
      `de ${docs}. Un filtro lineal habría leído los ${docs}.`
    )
  }
  return (
    `${probes} comparisons to locate the term, then ${df} documents looked at out of ${docs}. ` +
    `A linear filter would have read all ${docs}.`
  )
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
