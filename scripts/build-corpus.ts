/**
 * CONSTRUCCIÓN DEL ÍNDICE, FUERA DE LÍNEA
 * ======================================
 *
 *   node scripts/build-corpus.ts            (o: npm run corpus)
 *   node scripts/build-corpus.ts --no-sprites   omite la comprobación de sprites
 *
 * Consulta PokeAPI una sola vez y escribe `public/data/pokedex.v1.json`. La
 * aplicación nunca vuelve a la red para buscar.
 *
 * Por qué así y no pidiendo los datos al abrir la página: para conocer el tipo
 * de los 1351 Pokémon haría falta `/pokemon/{id}` de cada uno, y esas respuestas
 * pesan entre 18 y 417 KB (unos 300 MB en total) porque incluyen movimientos y
 * decenas de sprites. En cambio `/type/{id}` trae la lista de Pokémon de cada
 * tipo, así que 18 peticiones anotan el catálogo completo. Lo mismo con las
 * generaciones (9) y con los nombres en español (1 consulta GraphQL en vez de
 * 1025 peticiones REST).
 *
 * Total: unas 40 peticiones y ~900 KB, contra ~2400 peticiones y ~300 MB.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { API_BASE, SPRITE_ART_BASE, SPRITE_CLASSIC_BASE } from '../src/constants.ts'
import type {
  Corpus,
  CorpusColor,
  CorpusDoc,
  CorpusGeneration,
  CorpusSpecies,
  CorpusType,
} from '../src/lib/corpus.ts'

/* --- Configuración --------------------------------------------------------- */

const GRAPHQL_URL = 'https://beta.pokeapi.co/graphql/v1beta'

/**
 * Cloudflare devuelve 403 al agente de usuario por defecto de varios clientes.
 * Identificarse evita un fallo que además es confuso de diagnosticar.
 */
const USER_AGENT = 'tarea1-buscador/1.0 (proyecto academico de Recuperacion de Informacion)'

/** Ids de idioma en el esquema de PokeAPI. */
const LANG_ES = 7
const LANG_EN = 9

/**
 * Cuántas entradas de Pokédex DISTINTAS se guardan por especie e idioma.
 *
 * PokeAPI publica hasta 64 por especie, una por versión del juego, y casi todas
 * repiten el texto de la anterior. Quedarse solo con la más reciente parece lo
 * natural, pero pierde descripciones clásicas: la entrada actual de Pikachu
 * habla de colas y saludos, así que "ratón amarillo con las mejillas rojas" NO
 * lo encontraba.
 *
 * Dos es donde está el codo de la curva, medido sobre el catálogo completo:
 *
 *   entradas   vocabulario   índice comprimido
 *       1          8 753          146 KB
 *       2         12 323          235 KB     <- elegido
 *       3         14 282          300 KB
 *     todas       19 723          587 KB
 *
 * La segunda entrada aporta un 41 % más de vocabulario y arregla el caso de
 * Pikachu; de la tercera en adelante el vocabulario sigue creciendo pero ya no
 * cambia qué se encuentra, solo cuánto pesa el archivo.
 */
const FLAVOR_PER_SPECIES = 2

/**
 * Solo los 18 tipos reales. Se descartan 19 (stellar), 10001 (unknown) y
 * 10002 (shadow): no tienen ningún Pokémon y `shadow` no tiene nombre en
 * español, así que solo aportarían facetas vacías.
 */
const TYPE_IDS = Array.from({ length: 18 }, (_, i) => i + 1)
const GENERATION_IDS = Array.from({ length: 9 }, (_, i) => i + 1)

/** Cifras esperadas hoy. Si cambian, se avisa pero no se rompe la construcción. */
const EXPECTED = { docs: 1351, species: 1025, typeMemberships: 2116 }

/**
 * PokeAPI no publica nombres de región en español: el `names` de `/region/{id}`
 * solo trae ja, ko, zh, fr, de, it e en. De las nueve regiones, en la
 * localización española oficial solo cambia una —Unova se llama Teselia—, así
 * que se corrige aquí para que "teselia" encuentre a la quinta generación.
 */
const REGION_ES_OVERRIDES: Record<string, string> = { unova: 'Teselia' }

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(HERE, '../public/data/pokedex.v1.json')

/* --- Utilidades de red ----------------------------------------------------- */

const log = (message: string) => process.stdout.write(`${message}\n`)

async function getJson<T>(url: string, attempt = 1): Promise<T> {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json()) as T
  } catch (cause) {
    if (attempt >= 3) throw new Error(`No se pudo obtener ${url}: ${String(cause)}`)
    await new Promise((done) => setTimeout(done, 400 * attempt))
    return getJson<T>(url, attempt + 1)
  }
}

/** Ejecuta `task` sobre `items` con un tope de peticiones simultáneas. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await task(items[index]!, index)
    }
  })

  await Promise.all(workers)
  return out
}

/** ".../pokemon/25/" -> 25 */
function idFromUrl(url: string): number {
  const match = /\/(\d+)\/?$/.exec(url)
  if (!match) throw new Error(`No se pudo extraer el id de ${url}`)
  return Number(match[1])
}

/* --- Formas de las respuestas (solo los campos que se usan) ---------------- */

interface NamedRef { name: string; url: string }
interface ListResponse { count: number; results: NamedRef[] }
interface LocalizedName { name: string; language: { name: string } }
interface TypeResponse {
  id: number
  name: string
  names: LocalizedName[]
  pokemon: { slot: number; pokemon: NamedRef }[]
}
interface GenerationResponse {
  id: number
  names: LocalizedName[]
  main_region: NamedRef
  pokemon_species: NamedRef[]
}
interface RegionResponse { names: LocalizedName[]; name: string }

function pickLang(names: LocalizedName[], lang: string): string | undefined {
  return names.find((entry) => entry.language.name === lang)?.name
}

/* --- Pasos ----------------------------------------------------------------- */

/** Mapea cada Pokémon a su especie por el slug de especie más largo que lo prefija. */
function buildFormToSpecies(
  pokemon: { id: number; slug: string }[],
  species: { id: number; slug: string }[],
): Map<number, number> {
  const exact = new Map(species.map((s) => [s.slug, s.id]))
  // De más largo a más corto, para que "mr-mime-galar" case con "mr-mime" y no
  // con un slug más corto que también lo prefije.
  const byLength = [...species].sort((a, b) => b.slug.length - a.slug.length)

  const out = new Map<number, number>()
  const orphans: string[] = []

  for (const p of pokemon) {
    const direct = exact.get(p.slug)
    if (direct !== undefined) {
      out.set(p.id, direct)
      continue
    }
    const parent = byLength.find((s) => p.slug.startsWith(`${s.slug}-`))
    if (parent) out.set(p.id, parent.id)
    else orphans.push(p.slug)
  }

  if (orphans.length > 0) {
    throw new Error(
      `${orphans.length} Pokémon sin especie: ${orphans.slice(0, 10).join(', ')}. ` +
        'La regla de prefijo dejó de cubrir todos los casos y hay que revisarla.',
    )
  }
  return out
}

interface SpeciesText {
  esName: Map<number, string>
  enName: Map<number, string>
  esGenus: Map<number, string>
  enGenus: Map<number, string>
  esFlavor: Map<number, string>
  enFlavor: Map<number, string>
  /** Los 10 colores del catálogo, con su nombre en los dos idiomas. */
  colors: CorpusColor[]
  /** Color de cada especie. PokeAPI lo tiene para las 1025. */
  colorOf: Map<number, number>
}

/**
 * PokeAPI parte las entradas de Pokédex con saltos de línea y saltos de página
 * —`\n` y `\f`— porque están pensadas para la caja de texto del juego. Para
 * indexarlas da igual, pero el corpus se lee y se revisa a mano.
 */
function cleanFlavor(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/**
 * Nombres, géneros y entradas de Pokédex de las 1025 especies en UNA petición.
 *
 * Los nombres en inglés hacen falta de verdad: la puntuación real ("Mr. Mime",
 * "Type: Null", "Farfetch'd") no se puede reconstruir desde el slug.
 *
 * Las entradas de Pokédex son la única fuente de vocabulario DESCRIPTIVO del
 * proyecto. Sin ellas el índice solo sabe cómo se LLAMA cada Pokémon y de qué
 * tipo es; con ellas sabe que Hydreigon tiene tres cabezas y que Zubat vive en
 * cuevas, que es lo que una consulta en lenguaje natural pregunta de verdad.
 *
 * Se piden TODAS las versiones ordenadas de la más reciente a la más antigua y
 * se filtran aquí, quedándose con las `FLAVOR_PER_SPECIES` primeras distintas.
 * El filtro no se puede hacer en la consulta: `distinct_on` de Hasura devuelve
 * una sola fila por especie, y no hay forma de pedirle "las dos primeras".
 */
async function fetchSpeciesText(): Promise<SpeciesText> {
  const query = `{
    es: pokemon_v2_pokemonspeciesname(
      where: { language_id: { _eq: ${LANG_ES} } }
      limit: 2000
      order_by: { pokemon_species_id: asc }
    ) { pokemon_species_id name genus }
    en: pokemon_v2_pokemonspeciesname(
      where: { language_id: { _eq: ${LANG_EN} } }
      limit: 2000
      order_by: { pokemon_species_id: asc }
    ) { pokemon_species_id name genus }
    esFlavor: pokemon_v2_pokemonspeciesflavortext(
      where: { language_id: { _eq: ${LANG_ES} } }
      limit: 100000
      order_by: [{ pokemon_species_id: asc }, { version_id: desc }]
    ) { pokemon_species_id flavor_text }
    enFlavor: pokemon_v2_pokemonspeciesflavortext(
      where: { language_id: { _eq: ${LANG_EN} } }
      limit: 100000
      order_by: [{ pokemon_species_id: asc }, { version_id: desc }]
    ) { pokemon_species_id flavor_text }
    colors: pokemon_v2_pokemoncolor(order_by: { id: asc }) {
      id
      name
      pokemon_v2_pokemoncolornames(where: { language_id: { _in: [${LANG_ES}, ${LANG_EN}] } }) {
        language_id
        name
      }
    }
    speciesColor: pokemon_v2_pokemonspecies(order_by: { id: asc }) {
      id
      pokemon_color_id
    }
  }`

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) throw new Error(`GraphQL respondió HTTP ${response.status}`)

  const payload = (await response.json()) as {
    errors?: { message: string }[]
    data?: {
      es: SpeciesTextRow[]
      en: SpeciesTextRow[]
      esFlavor: FlavorRow[]
      enFlavor: FlavorRow[]
      colors: ColorRow[]
      speciesColor: SpeciesColorRow[]
    }
  }
  if (payload.errors?.length) throw new Error(`GraphQL: ${payload.errors[0]!.message}`)
  if (!payload.data) throw new Error('GraphQL no devolvió datos')

  const out: SpeciesText = {
    esName: new Map(),
    enName: new Map(),
    esGenus: new Map(),
    enGenus: new Map(),
    esFlavor: new Map(),
    enFlavor: new Map(),
    colors: [],
    colorOf: new Map(),
  }
  for (const row of payload.data.es) {
    if (row.name) out.esName.set(row.pokemon_species_id, row.name)
    if (row.genus?.trim()) out.esGenus.set(row.pokemon_species_id, row.genus.trim())
  }
  for (const row of payload.data.en) {
    if (row.name) out.enName.set(row.pokemon_species_id, row.name)
    if (row.genus?.trim()) out.enGenus.set(row.pokemon_species_id, row.genus.trim())
  }
  for (const [rows, target] of [
    [payload.data.esFlavor, out.esFlavor],
    [payload.data.enFlavor, out.enFlavor],
  ] as const) {
    // Las filas vienen ordenadas por especie y, dentro de cada una, de la
    // versión más reciente a la más antigua. Se acumulan las primeras
    // FLAVOR_PER_SPECIES DISTINTAS: las repetidas no aportan ni un término.
    const porEspecie = new Map<number, string[]>()
    for (const row of rows) {
      const texto = cleanFlavor(row.flavor_text ?? '')
      if (!texto) continue
      let lista = porEspecie.get(row.pokemon_species_id)
      if (lista === undefined) {
        lista = []
        porEspecie.set(row.pokemon_species_id, lista)
      }
      if (lista.length < FLAVOR_PER_SPECIES && !lista.includes(texto)) lista.push(texto)
    }
    for (const [speciesId, lista] of porEspecie) target.set(speciesId, lista.join(' '))
  }

  for (const row of payload.data.colors) {
    const nombres = new Map(row.pokemon_v2_pokemoncolornames.map((n) => [n.language_id, n.name]))
    const en = nombres.get(LANG_EN)
    const es = nombres.get(LANG_ES)
    if (!en || !es) throw new Error(`El color ${row.name} no trae nombre en ambos idiomas`)
    out.colors.push({ id: row.id, slug: row.name, en, es })
  }
  for (const row of payload.data.speciesColor) {
    if (row.pokemon_color_id !== null) out.colorOf.set(row.id, row.pokemon_color_id)
  }
  return out
}

interface SpeciesTextRow { pokemon_species_id: number; name: string; genus: string | null }
interface FlavorRow { pokemon_species_id: number; flavor_text: string | null }
interface ColorRow {
  id: number
  name: string
  pokemon_v2_pokemoncolornames: { language_id: number; name: string }[]
}
interface SpeciesColorRow { id: number; pokemon_color_id: number | null }

/**
 * Comprueba qué variante de sprite existe para cada Pokémon.
 *
 * Alrededor de un 3 % de las formas no tiene arte oficial. Resolverlo aquí
 * cuesta medio minuto una sola vez y evita que el navegador tenga que pedir una
 * imagen que no existe y reaccionar al fallo, con el parpadeo correspondiente.
 */
async function resolveSprites(ids: number[]): Promise<Map<number, 0 | 1 | undefined>> {
  const out = new Map<number, 0 | 1 | undefined>()
  let done = 0

  await mapLimit(ids, 40, async (id) => {
    const head = async (url: string) => {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers: { 'User-Agent': USER_AGENT },
        })
        return response.ok
      } catch {
        return false
      }
    }

    if (await head(`${SPRITE_ART_BASE}/${id}.png`)) out.set(id, undefined)
    else if (await head(`${SPRITE_CLASSIC_BASE}/${id}.png`)) out.set(id, 1)
    else out.set(id, 0)

    done += 1
    if (done % 200 === 0) log(`      ${done}/${ids.length} sprites comprobados`)
  })

  return out
}

/* --- Programa principal ---------------------------------------------------- */

async function main(): Promise<void> {
  const started = Date.now()
  const checkSprites = !process.argv.includes('--no-sprites')

  log('Construyendo el índice desde PokeAPI\n')

  // 1 y 2: los dos catálogos, en paralelo.
  log('  [1/6] catálogo de Pokémon y de especies')
  const [pokemonList, speciesList] = await Promise.all([
    getJson<ListResponse>(`${API_BASE}/pokemon?limit=100000&offset=0`),
    getJson<ListResponse>(`${API_BASE}/pokemon-species?limit=100000&offset=0`),
  ])

  const pokemon = pokemonList.results.map((row) => ({
    id: idFromUrl(row.url),
    slug: row.name,
  }))
  const speciesBasics = speciesList.results.map((row) => ({
    id: idFromUrl(row.url),
    slug: row.name,
  }))
  log(`        ${pokemon.length} Pokémon · ${speciesBasics.length} especies`)

  // 3: forma -> especie, sin peticiones extra.
  log('  [2/6] mapeo forma → especie')
  const formToSpecies = buildFormToSpecies(pokemon, speciesBasics)
  const altForms = pokemon.filter((p) => p.id >= 10000).length
  log(`        ${altForms} formas alternas resueltas por prefijo`)

  // 4: tipos. 18 peticiones que anotan los 1351.
  log('  [3/6] tipos y sus miembros (18 peticiones)')
  const typeResponses = await mapLimit(TYPE_IDS, 6, (id) =>
    getJson<TypeResponse>(`${API_BASE}/type/${id}`),
  )

  const types: CorpusType[] = []
  const typesByPokemon = new Map<number, { slot: number; typeId: number }[]>()
  let memberships = 0

  for (const raw of typeResponses) {
    const es = pickLang(raw.names, 'es')
    const alt = pickLang(raw.names, 'es-419')
    if (!es) throw new Error(`El tipo ${raw.name} no trae nombre en español`)

    types.push({
      id: raw.id,
      slug: raw.name,
      en: pickLang(raw.names, 'en') ?? raw.name,
      es,
      ...(alt && alt !== es ? { alt } : {}),
    })

    for (const entry of raw.pokemon) {
      const pokeId = idFromUrl(entry.pokemon.url)
      const list = typesByPokemon.get(pokeId) ?? []
      list.push({ slot: entry.slot, typeId: raw.id })
      typesByPokemon.set(pokeId, list)
      memberships += 1
    }
  }
  log(`        ${types.length} tipos · ${memberships} membresías · ${typesByPokemon.size} Pokémon cubiertos`)

  // 5: generaciones y sus regiones.
  log('  [4/6] generaciones y regiones (18 peticiones)')
  const generationResponses = await mapLimit(GENERATION_IDS, 6, (id) =>
    getJson<GenerationResponse>(`${API_BASE}/generation/${id}`),
  )
  const regionResponses = await mapLimit(generationResponses, 6, (generation) =>
    getJson<RegionResponse>(generation.main_region.url),
  )

  const generations: CorpusGeneration[] = generationResponses.map((raw, index) => {
    const region = regionResponses[index]!
    const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
    return {
      id: raw.id,
      en: pickLang(raw.names, 'en') ?? `Generation ${raw.id}`,
      es: pickLang(raw.names, 'es') ?? `Generación ${raw.id}`,
      regionEn: pickLang(region.names, 'en') ?? capitalize(region.name),
      regionEs:
        REGION_ES_OVERRIDES[region.name] ??
        pickLang(region.names, 'es') ??
        capitalize(region.name),
    }
  })

  const generationOfSpecies = new Map<number, number>()
  for (const raw of generationResponses) {
    for (const ref of raw.pokemon_species) {
      generationOfSpecies.set(idFromUrl(ref.url), raw.id)
    }
  }
  log(`        ${generations.length} generaciones · ${generationOfSpecies.size} especies asignadas`)

  // 6: nombres, géneros y entradas de Pokédex en ambos idiomas, en una consulta.
  log('  [5/6] nombres, géneros y descripciones ES/EN (1 consulta GraphQL)')
  const text = await fetchSpeciesText()
  log(
    `        ${text.esName.size} nombres ES · ${text.enName.size} EN · ` +
      `${text.esGenus.size} géneros ES · ${text.enGenus.size} EN`,
  )
  log(`        ${text.esFlavor.size} descripciones ES · ${text.enFlavor.size} EN`)

  // 7: variante de sprite disponible.
  let spriteVariants = new Map<number, 0 | 1 | undefined>()
  if (checkSprites) {
    log(`  [6/6] comprobando ${pokemon.length} sprites (concurrencia 40)`)
    spriteVariants = await resolveSprites(pokemon.map((p) => p.id))
    const classic = [...spriteVariants.values()].filter((v) => v === 1).length
    const none = [...spriteVariants.values()].filter((v) => v === 0).length
    log(`        arte oficial: ${pokemon.length - classic - none} · clásico: ${classic} · sin imagen: ${none}`)
  } else {
    log('  [6/6] sprites omitidos (--no-sprites)')
  }

  /* --- Armado del corpus -------------------------------------------------- */

  // Diccionario de géneros internado: "Pokémon Semilla" lo comparten varias
  // especies, así que se guarda una vez y se referencia por índice.
  const genusEs: string[] = []
  const genusEn: string[] = []
  const genusEsIndex = new Map<string, number>()
  const genusEnIndex = new Map<string, number>()

  const intern = (value: string, list: string[], index: Map<string, number>): number => {
    const existing = index.get(value)
    if (existing !== undefined) return existing
    const next = list.length
    list.push(value)
    index.set(value, next)
    return next
  }

  const species: CorpusSpecies[] = []
  const speciesPosition = new Map<number, number>()
  const missingGenusEs: number[] = []
  const missingFlavorEs: number[] = []

  for (const basic of speciesBasics) {
    const en = text.enName.get(basic.id)
    const gen = generationOfSpecies.get(basic.id)
    const enGenus = text.enGenus.get(basic.id)

    if (!en) throw new Error(`La especie ${basic.slug} (${basic.id}) no trae nombre en inglés`)
    if (!gen) throw new Error(`La especie ${basic.slug} (${basic.id}) no tiene generación`)
    if (!enGenus) throw new Error(`La especie ${basic.slug} (${basic.id}) no trae género en inglés`)

    const es = text.esName.get(basic.id)
    const esGenus = text.esGenus.get(basic.id)
    if (!esGenus) missingGenusEs.push(basic.id)

    const color = text.colorOf.get(basic.id)
    if (!color) throw new Error(`La especie ${basic.slug} (${basic.id}) no trae color`)

    const enFlavor = text.enFlavor.get(basic.id)
    const esFlavor = text.esFlavor.get(basic.id)
    if (!esFlavor && enFlavor) missingFlavorEs.push(basic.id)

    speciesPosition.set(basic.id, species.length)
    species.push({
      id: basic.id,
      slug: basic.slug,
      en,
      // Solo se guarda el nombre español cuando aporta algo: de 1025, difieren 21.
      ...(es && es !== en ? { es } : {}),
      gEn: intern(enGenus, genusEn, genusEnIndex),
      ...(esGenus ? { gEs: intern(esGenus, genusEs, genusEsIndex) } : {}),
      gen,
      c: color,
      // Las descripciones NO se internan: a diferencia de los géneros —"Pokémon
      // Semilla" lo comparten tres especies— cada entrada de Pokédex es única,
      // así que un diccionario solo añadiría una indirección y 1025 enteros.
      ...(enFlavor ? { dEn: enFlavor } : {}),
      ...(esFlavor ? { dEs: esFlavor } : {}),
    })
  }

  const docs: CorpusDoc[] = pokemon.map((p) => {
    const speciesId = formToSpecies.get(p.id)!
    const position = speciesPosition.get(speciesId)
    if (position === undefined) {
      throw new Error(`${p.slug} apunta a la especie ${speciesId}, que no está en el catálogo`)
    }

    const slots = typesByPokemon.get(p.id)
    if (!slots || slots.length === 0) throw new Error(`${p.slug} no tiene ningún tipo`)

    const variant = spriteVariants.get(p.id)

    return {
      i: p.id,
      n: p.slug,
      s: position,
      t: slots.sort((a, b) => a.slot - b.slot).map((entry) => entry.typeId),
      ...(variant !== undefined ? { a: variant } : {}),
    }
  })

  /* --- Comprobaciones ----------------------------------------------------- */

  // Se verifican invariantes, no números mágicos: si PokeAPI añade Pokémon la
  // construcción debe seguir funcionando. Las cifras esperadas solo se avisan.
  const genTotals = new Map<number, number>()
  for (const entry of species) genTotals.set(entry.gen, (genTotals.get(entry.gen) ?? 0) + 1)
  const partition = [...genTotals.values()].reduce((a, b) => a + b, 0)
  if (partition !== species.length) {
    throw new Error(`Las generaciones suman ${partition} pero hay ${species.length} especies`)
  }
  for (const doc of docs) {
    for (const typeId of doc.t) {
      if (!types.some((t) => t.id === typeId)) {
        throw new Error(`${doc.n} referencia el tipo ${typeId}, que no está en la tabla`)
      }
    }
  }

  const warn = (message: string) => process.stderr.write(`  AVISO: ${message}\n`)
  if (docs.length !== EXPECTED.docs) warn(`se esperaban ${EXPECTED.docs} documentos y hay ${docs.length}`)
  if (species.length !== EXPECTED.species) warn(`se esperaban ${EXPECTED.species} especies y hay ${species.length}`)
  if (memberships !== EXPECTED.typeMemberships) warn(`se esperaban ${EXPECTED.typeMemberships} membresías y hay ${memberships}`)

  /* --- Escritura ---------------------------------------------------------- */

  const corpus: Corpus = {
    version: 1,
    builtAt: new Date().toISOString().slice(0, 10),
    counts: { docs: docs.length, species: species.length, typeMemberships: memberships },
    types,
    generations,
    genus: { es: genusEs, en: genusEn },
    colors: text.colors,
    species,
    docs,
  }

  await mkdir(dirname(OUT_PATH), { recursive: true })
  const json = JSON.stringify(corpus)
  await writeFile(OUT_PATH, json, 'utf8')

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  log('')
  log(`  Escrito public/data/pokedex.v1.json — ${(json.length / 1024).toFixed(0)} KB en ${seconds} s`)
  log(`  ${docs.length} documentos · ${species.length} especies · ${types.length} tipos · ${generations.length} generaciones`)
  log(`  géneros internados: ${genusEs.length} ES · ${genusEn.length} EN`)
  log(`  especies sin género en español: ${missingGenusEs.length} (usan el inglés)`)
  log(`  especies sin descripción en español: ${missingFlavorEs.length} (usan la inglesa)`)
  log(`  colores: ${text.colors.length}`)
}

main().catch((cause: unknown) => {
  process.stderr.write(`\nFalló la construcción del índice:\n  ${String(cause)}\n`)
  process.exitCode = 1
})
