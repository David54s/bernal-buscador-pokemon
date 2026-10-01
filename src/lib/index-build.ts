/**
 * CONSTRUCCIÓN DEL ÍNDICE EN MEMORIA
 * ==================================
 *
 * Convierte el corpus descargado en las estructuras que responden las consultas.
 * Corre UNA sola vez por pestaña, cuesta unas decenas de milisegundos, y a partir
 * de ahí cada búsqueda es un puñado de lookups.
 *
 * La decisión de fondo: en lugar de un único diccionario de términos, se
 * construye **uno por campo**. Hace falta porque un mismo término puede jugar dos
 * papeles a la vez —`dragon` es el nombre de un tipo *y* una subcadena de
 * dragonite, y con `normal`, `steel` o `fairy` pasa lo mismo—, y una sola tabla
 * con una marca de "clase de término" no puede representar "es las dos cosas".
 * Separados, cada nivel de puntuación consulta su propio diccionario y no hay
 * ambigüedad posible.
 */

import { SPRITE_ART_BASE, SPRITE_CLASSIC_BASE } from '../constants.ts'
import type { Corpus } from './corpus.ts'
import type { Doc, FacetTermMeta, IndexStats, PokedexIndex, Scratch } from './index-types.ts'
import { pushUnique } from './postings.ts'
import { compareIds, isAltForm, NO_LEVEL } from './scoring.ts'
import { grams, normalize, splitSegments, tokenize } from './tokenize.ts'

/** Longitudes de n-grama que se indexan. Ver el comentario de `docGrams`. */
const GRAM_SIZES = [1, 2, 3] as const

/**
 * Palabra que aparece en el 100 % de los géneros ("Pokémon Ratón", "Mouse
 * Pokémon"), así que no distingue nada: es una palabra vacía de este corpus y se
 * excluye del índice de facetas. Indexarla haría que escribir "pokemon" devolviera
 * los 898 documentos con género, que es justo lo contrario de informar.
 */
const GENUS_STOPWORD = 'pokemon'

/** "mega-x" -> "Mega X" */
function prettifySuffix(suffix: string): string {
  return suffix
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Un diccionario ordenado con su lista de postings en paralelo. */
interface Dictionary {
  terms: string[]
  postings: number[][]
}

/**
 * Cierra un diccionario: extrae las claves, las ordena y deja las postings en
 * paralelo, ordenadas y sin repetidos.
 *
 * Los términos se ordenan con `.sort()`, es decir por unidad de código UTF-16,
 * porque es el mismo criterio con el que compara `lowerBound`. Usar
 * `localeCompare` aquí rompería todas las búsquedas binarias sin dar ningún error.
 *
 * Las postings se ordenan aquí de forma incondicional, y no se confía en el orden
 * en que se insertaron. Para los nombres y los n-gramas bastaría con el orden de
 * inserción, porque se recorre el catálogo una vez de principio a fin; pero un
 * término de faceta recibe documentos de VARIAS procedencias —"generacion" los
 * recibe de las nueve generaciones, una tras otra— y cada bloque es ascendente
 * pero arranca por debajo del anterior. Normalizar aquí elimina esa clase de
 * error entera en vez de depender de un razonamiento frágil en cada llamada.
 */
function seal(map: Map<string, number[]>): Dictionary {
  const terms = [...map.keys()].sort()
  const postings = terms.map((term) => {
    const list = map.get(term)!
    list.sort((a, b) => a - b)
    return list.filter((docId, i) => i === 0 || list[i - 1] !== docId)
  })
  return { terms, postings }
}

function add(map: Map<string, number[]>, term: string, docId: number): void {
  let list = map.get(term)
  if (list === undefined) {
    list = []
    map.set(term, list)
  }
  // Los documentos se recorren en orden ascendente, así que basta mirar el último
  // para mantener la lista ordenada y sin repetidos.
  pushUnique(list, docId)
}

export function buildIndex(corpus: Corpus): PokedexIndex {
  const startedAt = performance.now()

  /* --- 1. Documentos, con todo resuelto ----------------------------------- */

  const docs: Doc[] = corpus.docs.map((raw, docId) => {
    const species = corpus.species[raw.s]
    if (species === undefined) {
      throw new Error(`${raw.n} apunta a la especie ${raw.s}, que no existe en el corpus`)
    }

    // El género en español falta en 127 especies (las de la 899 en adelante);
    // en esos casos se usa el inglés, que sí está completo.
    const genusEn = corpus.genus.en[species.gEn] ?? ''
    const genusEs = species.gEs !== undefined ? (corpus.genus.es[species.gEs] ?? genusEn) : genusEn

    // Las descripciones faltan en las mismas 127 especies, y por el mismo motivo:
    // PokeAPI aún no las ha traducido. Se aplica el mismo respaldo.
    const descEn = species.dEn ?? ''
    const descEs = species.dEs ?? descEn

    // El sufijo de forma se deriva del slug, comparándolo con el de su especie:
    // "charizard-mega-x" menos "charizard-" da "mega-x".
    const formSuffix =
      raw.n === species.slug ? null : prettifySuffix(raw.n.slice(species.slug.length + 1))

    const baseEs = species.es ?? species.en
    const baseEn = species.en

    const spriteUrl =
      raw.a === 0
        ? null
        : raw.a === 1
          ? `${SPRITE_CLASSIC_BASE}/${raw.i}.png`
          : `${SPRITE_ART_BASE}/${raw.i}.png`

    return {
      docId,
      pokeId: raw.i,
      slug: raw.n,
      speciesIdx: raw.s,
      typeIds: raw.t,
      genId: species.gen,
      colorId: species.c,
      genusEs,
      genusEn,
      descEs,
      descEn,
      isAltForm: isAltForm(raw.i),
      formSuffix,
      nameEs: formSuffix ? `${baseEs} (${formSuffix})` : baseEs,
      nameEn: formSuffix ? `${baseEn} (${formSuffix})` : baseEn,
      spriteUrl,
    }
  })

  const total = docs.length

  /* --- 2. Formas normalizadas, para verificar coincidencias --------------- */

  const flat = new Array<string>(total)
  const flatEs = new Array<string>(total)
  const flatEn = new Array<string>(total)

  for (const doc of docs) {
    flat[doc.docId] = normalize(doc.slug)
    flatEs[doc.docId] = normalize(doc.nameEs)
    flatEn[doc.docId] = normalize(doc.nameEn)
  }

  /* --- 3. Niveles 1 y 2: nombres completos -------------------------------- */

  const nameMap = new Map<string, number[]>()
  for (const doc of docs) {
    add(nameMap, flat[doc.docId]!, doc.docId)
    add(nameMap, flatEs[doc.docId]!, doc.docId)
    add(nameMap, flatEn[doc.docId]!, doc.docId)
  }
  const names = seal(nameMap)

  /* --- 4. Nivel 3: términos de palabra ------------------------------------ */

  const segMap = new Map<string, number[]>()
  for (const doc of docs) {
    for (const segment of splitSegments(doc.slug)) add(segMap, segment, doc.docId)
    for (const token of tokenize(doc.nameEs)) add(segMap, token, doc.docId)
    for (const token of tokenize(doc.nameEn)) add(segMap, token, doc.docId)
  }
  const segments = seal(segMap)

  /* --- 5. Nivel 4: n-gramas ----------------------------------------------- */

  /**
   * Se indexan n-gramas de longitud 1, 2 **y** 3, no solo trigramas. Con solo
   * trigramas, una consulta de dos letras no tendría ninguna entrada que
   * consultar, y hoy escribir "ch" encuentra a pikachu por subcadena: sería una
   * regresión. Con las tres longitudes:
   *
   *   - consulta de 1 a 3 caracteres -> la lista del grama es ya la respuesta
   *     EXACTA, porque los gramas se extraen sin relleno en los bordes;
   *   - consulta más larga           -> se intersectan sus trigramas y después se
   *     confirma con `includes`, porque la intersección es condición necesaria
   *     pero no suficiente (los trigramas de "char" pueden aparecer desordenados).
   */
  const docGrams = new Map<string, number[]>()
  for (const doc of docs) {
    const forms = new Set([flat[doc.docId]!, flatEs[doc.docId]!, flatEn[doc.docId]!])
    const seen = new Set<string>()
    for (const form of forms) {
      for (const size of GRAM_SIZES) {
        for (const gram of grams(form, size)) seen.add(gram)
      }
    }
    for (const gram of seen) add(docGrams, gram, doc.docId)
  }

  /* --- 6. Filtrado: facetas como índices invertidos ----------------------- */

  const byType = new Map<number, number[]>()
  const byGen = new Map<number, number[]>()
  const byPokeId = new Map<number, number>()

  for (const doc of docs) {
    byPokeId.set(doc.pokeId, doc.docId)
    for (const typeId of doc.typeIds) {
      let list = byType.get(typeId)
      if (list === undefined) {
        list = []
        byType.set(typeId, list)
      }
      pushUnique(list, doc.docId)
    }
    let genList = byGen.get(doc.genId)
    if (genList === undefined) {
      genList = []
      byGen.set(doc.genId, genList)
    }
    pushUnique(genList, doc.docId)
  }

  /* --- 7. Nivel 5: términos de faceta ------------------------------------- */

  // Un término de faceta puede venir de varios sitios, así que se acumulan las
  // procedencias y se queda la primera: basta para sugerir un chip.
  const facetMap = new Map<string, number[]>()
  const facetOrigin = new Map<string, FacetTermMeta>()

  const addFacet = (rawTerm: string, docIds: readonly number[], origin: FacetTermMeta): void => {
    for (const token of tokenize(rawTerm)) {
      for (const docId of docIds) add(facetMap, token, docId)
      if (!facetOrigin.has(token)) facetOrigin.set(token, origin)
    }
  }

  for (const type of corpus.types) {
    const members = byType.get(type.id) ?? []
    const origin: FacetTermMeta = { kind: 'type', typeId: type.id }
    addFacet(type.slug, members, origin)
    addFacet(type.en, members, origin)
    addFacet(type.es, members, origin)
    // es-419 difiere en dos tipos (Pelea, Insecto). Indexarlo también es gratis y
    // evita que alguien que usa el español de América no encuentre nada.
    if (type.alt) addFacet(type.alt, members, origin)
  }

  for (const generation of corpus.generations) {
    const members = byGen.get(generation.id) ?? []
    const origin: FacetTermMeta = { kind: 'generation', genId: generation.id }
    // El nombre completo normalizado ("generacioni") y la palabra sola
    // ("generacion", que alcanza las nueve). Los numerales romanos sueltos no se
    // indexan: "i" sería prefijo de "ii", "iii", "iv" e "ix" y solo daría ruido.
    addFacet(normalize(generation.es), members, origin)
    addFacet(normalize(generation.en), members, origin)
    addFacet(generation.es.split(/\s+/)[0] ?? '', members, origin)
    addFacet(generation.en.split(/\s+/)[0] ?? '', members, origin)
    addFacet(`gen${generation.id}`, members, origin)
    addFacet(generation.regionEs, members, { kind: 'region', genId: generation.id })
    addFacet(generation.regionEn, members, { kind: 'region', genId: generation.id })
  }

  // Colores: 10 términos por idioma, y uno por Pokémon. Es poco vocabulario pero
  // de los más usados al describir — "el ratón amarillo", "la rata morada"— y no
  // aparece en ningún otro sitio del corpus.
  const byColor = new Map<number, number[]>()
  for (const doc of docs) {
    let lista = byColor.get(doc.colorId)
    if (lista === undefined) {
      lista = []
      byColor.set(doc.colorId, lista)
    }
    lista.push(doc.docId)
  }
  for (const color of corpus.colors) {
    const members = byColor.get(color.id) ?? []
    const origin: FacetTermMeta = { kind: 'color', colorId: color.id }
    addFacet(color.slug, members, origin)
    addFacet(color.en, members, origin)
    addFacet(color.es, members, origin)
  }

  // Géneros: 643 términos en español y 715 en inglés. Es el grueso del
  // vocabulario bilingüe, y lo que hace que "semilla" o "ratón" encuentren algo.
  const genusOrigin: FacetTermMeta = { kind: 'genus' }
  for (const doc of docs) {
    for (const source of [doc.genusEs, doc.genusEn]) {
      for (const token of tokenize(source)) {
        if (token === GENUS_STOPWORD) continue
        add(facetMap, token, doc.docId)
        if (!facetOrigin.has(token)) facetOrigin.set(token, genusOrigin)
      }
    }
  }

  const facets = seal(facetMap)
  const facetMeta = facets.terms.map((term) => facetOrigin.get(term) ?? genusOrigin)

  /* --- 7b. Nivel 7: el índice de descripción ------------------------------ */

  /**
   * Las entradas de Pokédex, indexadas igual que todo lo demás —tokenizar y
   * acumular postings— pero en un diccionario propio.
   *
   * Es el único vocabulario que describe en vez de nombrar, y es también el más
   * grande con diferencia: unos 8700 términos frente a los 2959 de los otros
   * tres juntos. Mantenerlo aparte permite que una consulta descriptiva lo use
   * sin que una búsqueda por nombre se llene de coincidencias casuales.
   *
   * `GENUS_STOPWORD` se excluye por el mismo motivo que en los géneros, y aquí
   * pesa aún más: "pokémon" aparece en 581 de las 1025 descripciones.
   */
  const textMap = new Map<string, number[]>()
  for (const doc of docs) {
    for (const source of [doc.descEs, doc.descEn]) {
      for (const token of tokenize(source)) {
        if (token === GENUS_STOPWORD) continue
        add(textMap, token, doc.docId)
      }
    }
  }
  const texts = seal(textMap)

  /* --- 8. Nivel 6: vocabulario para corregir erratas ---------------------- */

  /**
   * El vocabulario es la unión de todo lo buscable. La corrección ortográfica se
   * hace contra ÉL y no contra los documentos: así "charmender" se corrige a
   * "charmander" —un término que existe— y después la consulta corregida vuelve a
   * pasar por el motor normal. Es el modelo que usan los motores reales, y evita
   * tener que mapear a mano de término corregido a documentos.
   */
  const vocabSet = new Set<string>([...names.terms, ...segments.terms, ...facets.terms])
  const vocab = [...vocabSet].sort()

  const termGrams = new Map<string, number[]>()
  vocab.forEach((term, termId) => {
    for (const gram of grams(term, 3)) {
      let list = termGrams.get(gram)
      if (list === undefined) {
        list = []
        termGrams.set(gram, list)
      }
      pushUnique(list, termId)
    }
  })

  /* --- 9. Orden canónico -------------------------------------------------- */

  const canonicalOrder = docs
    .map((doc) => doc.docId)
    .sort((a, b) => compareIds(docs[a]!.pokeId, docs[b]!.pokeId))

  const canonicalRank = new Int32Array(total)
  canonicalOrder.forEach((docId, rank) => {
    canonicalRank[docId] = rank
  })

  /* --- 10. Búferes de trabajo y estadísticas ------------------------------ */

  const scratch: Scratch = {
    best: new Uint8Array(total).fill(NO_LEVEL),
    bestTouched: [],
    token: new Uint8Array(total).fill(NO_LEVEL),
    tokenTouched: [],
    hits: new Uint8Array(total),
    worst: new Uint8Array(total),
    andTouched: [],
  }

  const countPostings = (lists: readonly number[][]): number =>
    lists.reduce((sum, list) => sum + list.length, 0)

  const stats: IndexStats = {
    buildMs: performance.now() - startedAt,
    docs: total,
    nameTerms: names.terms.length,
    segTerms: segments.terms.length,
    facetTerms: facets.terms.length,
    textTerms: texts.terms.length,
    vocab: vocab.length,
    postings:
      countPostings(names.postings) +
      countPostings(segments.postings) +
      countPostings(facets.postings) +
      countPostings(texts.postings) +
      countPostings([...docGrams.values()]),
    gramKeys: docGrams.size,
  }

  return {
    docs,
    types: corpus.types,
    generations: corpus.generations,
    colors: corpus.colors,
    typeById: new Map(corpus.types.map((type) => [type.id, type])),
    colorById: new Map(corpus.colors.map((color) => [color.id, color])),
    generationById: new Map(corpus.generations.map((gen) => [gen.id, gen])),
    flat,
    flatEs,
    flatEn,
    nameTerms: names.terms,
    nameTermDocs: names.postings,
    segTerms: segments.terms,
    segPostings: segments.postings,
    docGrams,
    facetTerms: facets.terms,
    facetPostings: facets.postings,
    facetMeta,
    termGrams,
    vocab,
    textTerms: texts.terms,
    textPostings: texts.postings,
    byPokeId,
    byType,
    byGen,
    canonicalOrder,
    canonicalRank,
    scratch,
    stats,
  }
}
