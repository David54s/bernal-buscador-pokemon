/**
 * PRUEBAS DEL MOTOR DE BÚSQUEDA
 * =============================
 *
 *   node --test scripts/smoke-test.ts        (o: npm run smoke)
 *
 * Usa `node:test` y `node:assert`, que vienen dentro de Node: no hay ninguna
 * dependencia de pruebas instalada.
 *
 * Lo importante es que estas pruebas leen el MISMO `public/data/pokedex.v1.json`
 * que carga el navegador e importan los módulos reales de `src/lib`. No prueban
 * una copia ni una reimplementación: prueban el código que se envía.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import type { Corpus } from '../src/lib/corpus.ts'
import { buildIndex } from '../src/lib/index-build.ts'
import type { PokedexIndex } from '../src/lib/index-types.ts'
import { normalize, splitSegments, tokenize, grams, prefixUpperBound } from '../src/lib/tokenize.ts'
import { intersectSorted, lowerBound, unionSorted } from '../src/lib/postings.ts'
import { applyFacets, countFacets, parseQuery, runQuery } from '../src/lib/query.ts'
import { groupResults } from '../src/lib/group.ts'
import { tagsFor } from '../src/lib/tags.ts'
import { damerauLevenshtein } from '../src/lib/fuzzy.ts'
import { describedPostings, reduceQuery, reducedDf, termPostings } from '../src/lib/reduce.ts'
import { singularCandidates } from '../src/lib/singular.ts'
import { STOPWORDS } from '../src/lib/stopwords.ts'
import { synonymPairs } from '../src/lib/thesaurus.ts'
import type { Reduction } from '../src/lib/index-types.ts'
import { groupLabel, tagLabel } from '../src/i18n/strings.ts'
import { readStoredLang, storeLang } from '../src/i18n/lang-storage.ts'
import type { Filters } from '../src/lib/index-types.ts'
import { compareIds, SCORE } from '../src/lib/scoring.ts'
import { ALT_FORM_ID_THRESHOLD, GROUP_BY, REDUCE_MAX_DOCS, TYPE_COLORS } from '../src/constants.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const CORPUS_PATH = resolve(HERE, '../public/data/pokedex.v1.json')

let corpus: Corpus
let index: PokedexIndex

before(() => {
  corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as Corpus
  index = buildIndex(corpus)
})

/** Un generador reproducible: las pruebas no deben cambiar de resultado al repetirse. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

/* ========================================================================== */

describe('primitivos de texto', () => {
  it('normalize lleva a la forma canónica', () => {
    assert.equal(normalize('Mr. Mime'), 'mrmime')
    assert.equal(normalize("Farfetch'd"), 'farfetchd')
    assert.equal(normalize('  CHAR  '), 'char')
    assert.equal(normalize('Código Cero'), 'codigocero')
    assert.equal(normalize('Eléctrico'), 'electrico')
  })

  it('splitSegments parte por guiones', () => {
    assert.deepEqual(splitSegments('mr-mime'), ['mr', 'mime'])
    assert.deepEqual(splitSegments('charizard-mega-x'), ['charizard', 'mega', 'x'])
    assert.deepEqual(splitSegments('pikachu'), ['pikachu'])
  })

  it('tokenize es un refinamiento estricto de normalize', () => {
    // La invariante que garantiza que nada de lo documentado queda contradicho:
    // separar antes de normalizar produce las mismas letras, solo repartidas.
    const random = makeRandom(20260920)
    const sources = [
      'Mr. Mime',
      "Farfetch'd",
      'Código Cero',
      'mr mime',
      'MR-MIME',
      'Charizard (Mega X)',
      '  espacios   raros  ',
      '¿Qué tal?',
      'Type: Null',
      'Pokémon Ratón',
    ]
    for (const doc of index.docs) {
      if (random() < 0.15) sources.push(doc.nameEs, doc.nameEn, doc.slug)
    }
    for (const source of sources) {
      assert.equal(tokenize(source).join(''), normalize(source), `falla con ${JSON.stringify(source)}`)
    }
  })

  it('grams no rellena los bordes', () => {
    assert.deepEqual(grams('char', 3), ['cha', 'har'])
    assert.deepEqual(grams('ab', 3), [])
    assert.deepEqual(grams('char', 2), ['ch', 'ha', 'ar'])
    // Sin repetidos: "aa" aparece dos veces en "aaa" pero es un solo grama.
    assert.deepEqual(grams('aaa', 2), ['aa'])
  })

  it('prefixUpperBound cierra el rango exactamente', () => {
    assert.equal(prefixUpperBound('char'), 'chas')
    assert.equal(prefixUpperBound('z'), '{')
    // Todo lo que empieza por el prefijo cae por debajo de la cota.
    assert.ok('charizard' < prefixUpperBound('char'))
    assert.ok('charzzzzz' < prefixUpperBound('char'))
    assert.ok(!('chas' < prefixUpperBound('char')))
  })
})

/* ========================================================================== */

describe('listas de postings', () => {
  it('unión e intersección mantienen el orden y sin repetidos', () => {
    assert.deepEqual(unionSorted([1, 3, 5], [2, 3, 6]), [1, 2, 3, 5, 6])
    assert.deepEqual(intersectSorted([1, 3, 5], [2, 3, 6]), [3])
    assert.deepEqual(unionSorted([], [2, 4]), [2, 4])
    assert.deepEqual(intersectSorted([], [2, 4]), [])
    assert.deepEqual(intersectSorted([1, 2, 3], [1, 2, 3]), [1, 2, 3])
  })

  it('unión e intersección concuerdan con Set, sobre datos reales', () => {
    const random = makeRandom(7)
    const typeIds = [...index.byType.keys()]
    for (let round = 0; round < 40; round += 1) {
      const a = index.byType.get(typeIds[Math.floor(random() * typeIds.length)]!)!
      const b = index.byType.get(typeIds[Math.floor(random() * typeIds.length)]!)!
      const setUnion = [...new Set([...a, ...b])].sort((x, y) => x - y)
      const setInter = a.filter((x) => b.includes(x))
      assert.deepEqual(unionSorted(a, b), setUnion)
      assert.deepEqual(intersectSorted(a, b), setInter)
    }
  })

  it('lowerBound encuentra la primera posición >= objetivo', () => {
    const sorted = ['ab', 'cd', 'ef']
    assert.equal(lowerBound(sorted, 'ab'), 0)
    assert.equal(lowerBound(sorted, 'b'), 1)
    assert.equal(lowerBound(sorted, 'zz'), 3)
  })
})

/* ========================================================================== */

describe('indexación', () => {
  it('el corpus trae lo que dice traer', () => {
    assert.equal(corpus.version, 1)
    assert.equal(corpus.docs.length, corpus.counts.docs)
    assert.equal(corpus.species.length, corpus.counts.species)
    assert.equal(corpus.types.length, 18, 'solo los 18 tipos reales')
    assert.equal(corpus.generations.length, 9)
  })

  it('cada documento tiene especie y al menos un tipo', () => {
    const validTypes = new Set(corpus.types.map((type) => type.id))
    for (const doc of corpus.docs) {
      assert.ok(corpus.species[doc.s] !== undefined, `${doc.n} sin especie`)
      assert.ok(doc.t.length > 0, `${doc.n} sin tipos`)
      for (const typeId of doc.t) {
        assert.ok(validTypes.has(typeId), `${doc.n} tiene el tipo desconocido ${typeId}`)
      }
    }
  })

  it('las generaciones parten el catálogo sin huecos ni solapes', () => {
    // A nivel de especie: las 9 generaciones suman las 1025.
    const bySpecies = new Map<number, number>()
    for (const species of corpus.species) {
      bySpecies.set(species.gen, (bySpecies.get(species.gen) ?? 0) + 1)
    }
    assert.equal([...bySpecies.values()].reduce((a, b) => a + b, 0), corpus.species.length)
    assert.equal(bySpecies.size, 9)

    // Y a nivel de documento: la generación se propagó también a las 326 formas
    // alternas. Si no, las formas desaparecerían de toda fila de generación.
    const sum = [...index.byGen.values()].reduce((acc, list) => acc + list.length, 0)
    assert.equal(sum, index.docs.length, 'byGen debe cubrir los 1351 documentos')
  })

  it('las membresías de tipo cuadran con el corpus', () => {
    const sum = [...index.byType.values()].reduce((acc, list) => acc + list.length, 0)
    assert.equal(sum, corpus.counts.typeMemberships)
  })

  it('el género en inglés está completo y el español tiene respaldo', () => {
    for (const species of corpus.species) {
      assert.ok(corpus.genus.en[species.gEn] !== undefined, `especie ${species.id} sin género EN`)
    }
    const withEs = corpus.species.filter((species) => species.gEs !== undefined).length
    assert.ok(withEs > 800 && withEs < corpus.species.length, `géneros ES: ${withEs}`)
    // Lo que de verdad importa: ningún documento se queda sin texto de género.
    for (const doc of index.docs) {
      assert.ok(doc.genusEs.length > 0, `${doc.slug} sin género ES ni respaldo`)
      assert.ok(doc.genusEn.length > 0, `${doc.slug} sin género EN`)
    }
  })

  it('la regla de forma alterna concuerda con el umbral de id', () => {
    let suffixedDefaults = 0
    for (const doc of index.docs) {
      const species = corpus.species[doc.speciesIdx]!
      if (!doc.isAltForm && doc.formSuffix !== null) suffixedDefaults += 1
      const byThreshold = doc.pokeId >= ALT_FORM_ID_THRESHOLD
      const byIdentity = doc.pokeId !== species.id
      assert.equal(
        byThreshold,
        byIdentity,
        `${doc.slug}: umbral dice ${byThreshold} pero su especie es ${species.slug}`,
      )
      assert.equal(doc.isAltForm, byThreshold)
      // El sufijo de forma NO equivale a ser forma alterna: 37 Pokémon
      // canónicos tienen slug con sufijo (deoxys-normal, giratina-altered,
      // basculin-red-striped...) porque su especie tiene varias formas y ninguna
      // es "la de sin apellido". Son formas por defecto, con id < 10000, así que
      // se ordenan como especies base y a la vez muestran su sufijo, que informa.
      assert.equal(
        doc.formSuffix !== null,
        doc.slug !== species.slug,
        `${doc.slug}: el sufijo debe depender del slug, no del umbral`,
      )
    }
    assert.ok(suffixedDefaults > 0, 'se esperaban formas por defecto con sufijo')
  })

  it('los diccionarios están estrictamente ordenados', () => {
    for (const [name, terms] of [
      ['nameTerms', index.nameTerms],
      ['segTerms', index.segTerms],
      ['facetTerms', index.facetTerms],
      ['vocab', index.vocab],
    ] as const) {
      for (let i = 1; i < terms.length; i += 1) {
        assert.ok(
          terms[i - 1]! < terms[i]!,
          `${name} no está ordenado en ${i}: ${terms[i - 1]} >= ${terms[i]}`,
        )
      }
    }
  })

  it('las listas de postings están ordenadas, sin repetidos y en rango', () => {
    const total = index.docs.length
    const check = (label: string, lists: Iterable<number[]>) => {
      for (const list of lists) {
        for (let i = 0; i < list.length; i += 1) {
          assert.ok(list[i]! >= 0 && list[i]! < total, `${label}: docId ${list[i]} fuera de rango`)
          if (i > 0) assert.ok(list[i - 1]! < list[i]!, `${label}: no ordenado o repetido`)
        }
      }
    }
    check('nameTermDocs', index.nameTermDocs)
    check('segPostings', index.segPostings)
    check('facetPostings', index.facetPostings)
    check('docGrams', index.docGrams.values())
    check('byType', index.byType.values())
    check('byGen', index.byGen.values())
  })

  it('los diccionarios tienen tantas postings como términos', () => {
    assert.equal(index.nameTerms.length, index.nameTermDocs.length)
    assert.equal(index.segTerms.length, index.segPostings.length)
    assert.equal(index.facetTerms.length, index.facetPostings.length)
    assert.equal(index.facetTerms.length, index.facetMeta.length)
  })

  it('canonicalRank es una permutación y respeta el desempate', () => {
    const total = index.docs.length
    assert.equal(index.canonicalOrder.length, total)
    const seen = new Uint8Array(total)
    for (const docId of index.canonicalOrder) {
      assert.equal(seen[docId], 0, `docId ${docId} repetido en canonicalOrder`)
      seen[docId] = 1
    }
    assert.equal(seen.every((v) => v === 1), true)
    for (const doc of index.docs) {
      assert.equal(index.canonicalOrder[index.canonicalRank[doc.docId]!], doc.docId)
    }
    // Las especies base van todas antes que cualquier forma alterna.
    let lastBase = -1
    let firstAlt = total
    index.canonicalOrder.forEach((docId, rank) => {
      if (index.docs[docId]!.isAltForm) firstAlt = Math.min(firstAlt, rank)
      else lastBase = Math.max(lastBase, rank)
    })
    assert.ok(lastBase < firstAlt, 'una forma alterna se colocó antes de una especie base')
  })

  it('las postings de un término coinciden con la fuerza bruta', () => {
    const random = makeRandom(99)
    for (let round = 0; round < 200; round += 1) {
      const termId = Math.floor(random() * index.segTerms.length)
      const term = index.segTerms[termId]!
      const expected = index.docs
        .filter((doc) => {
          const bag = new Set([
            ...splitSegments(doc.slug),
            ...tokenize(doc.nameEs),
            ...tokenize(doc.nameEn),
          ])
          return bag.has(term)
        })
        .map((doc) => doc.docId)
      assert.deepEqual(index.segPostings[termId], expected, `término "${term}"`)
    }
  })

  it('los n-gramas cortos son exactos, sin verificación', () => {
    // La propiedad que hace que una consulta de 1 a 3 caracteres no necesite
    // confirmarse: la lista del grama ES el conjunto de documentos que lo contienen.
    const random = makeRandom(1234)
    for (let round = 0; round < 60; round += 1) {
      const doc = index.docs[Math.floor(random() * index.docs.length)]!
      const form = index.flat[doc.docId]!
      const size = 1 + Math.floor(random() * 3)
      if (form.length < size) continue
      const start = Math.floor(random() * (form.length - size + 1))
      const gram = form.slice(start, start + size)

      const expected = index.docs
        .filter(
          (other) =>
            index.flat[other.docId]!.includes(gram) ||
            index.flatEs[other.docId]!.includes(gram) ||
            index.flatEn[other.docId]!.includes(gram),
        )
        .map((other) => other.docId)
      assert.deepEqual(index.docGrams.get(gram), expected, `grama "${gram}"`)
    }
  })
})

/* ========================================================================== */

/**
 * ORÁCULO: la misma decisión, calculada a lo bruto.
 *
 * Replica la lógica del buscador original —los cinco niveles, en el mismo orden—
 * recorriendo los 1351 documentos uno a uno. Solo vive aquí, en las pruebas: el
 * código que se envía no lleva ninguna búsqueda lineal.
 *
 * Extendido a los tres nombres de cada documento (slug, español e inglés), porque
 * el buscador nuevo busca en los tres. Si el motor por índice y este recorrido
 * coinciden documento a documento y nivel a nivel, entonces pasar a índice
 * invertido no cambió ni una sola respuesta de los niveles 0 a 4.
 */
function oracleLevels(idx: PokedexIndex, query: string): Map<number, number> {
  const out = new Map<number, number>()
  const isNumeric = /^\d+$/.test(query)

  for (const doc of idx.docs) {
    if (isNumeric && doc.pokeId === Number(query)) {
      out.set(doc.docId, 0)
      continue
    }

    const forms: { flat: string; segments: string[] }[] = [
      { flat: idx.flat[doc.docId]!, segments: splitSegments(doc.slug) },
      { flat: idx.flatEs[doc.docId]!, segments: tokenize(doc.nameEs) },
      { flat: idx.flatEn[doc.docId]!, segments: tokenize(doc.nameEn) },
    ]

    let best = 255
    for (const form of forms) {
      let level = 255
      if (form.flat === query) level = 1
      else if (form.flat.startsWith(query)) level = 2
      else if (form.segments.some((segment) => segment.startsWith(query))) level = 3
      else if (form.flat.includes(query)) level = 4
      if (level < best) best = level
    }
    if (best <= 4) out.set(doc.docId, best)
  }

  return out
}

/** Los niveles 0 a 4 del motor, en la misma forma que devuelve el oráculo. */
function engineLevels(idx: PokedexIndex, query: string): Map<number, number> {
  const result = runQuery(idx, parseQuery(query))
  const out = new Map<number, number>()
  result.docIds.forEach((docId, i) => {
    const level = result.levels[i]!
    if (level <= 4) out.set(docId, level)
  })
  return out
}

function nameOf(idx: PokedexIndex, docId: number): string {
  return idx.docs[docId]!.slug
}

/**
 * El orden prometido: primero por nivel y, a igualdad de nivel, especies base
 * antes que formas alternas y luego por número de Pokédex ascendente.
 */
function assertOrderedWithinLevels(docIds: readonly number[], levels: readonly number[]): void {
  for (let i = 1; i < docIds.length; i += 1) {
    const prevLevel = levels[i - 1]!
    const level = levels[i]!
    assert.ok(prevLevel <= level, `nivel ${prevLevel} después de ${level} en la posición ${i}`)
    if (prevLevel !== level) continue
    const a = index.docs[docIds[i - 1]!]!
    const b = index.docs[docIds[i]!]!
    assert.ok(
      compareIds(a.pokeId, b.pokeId) < 0,
      `dentro del nivel ${level}, ${a.slug} no debería ir antes de ${b.slug}`,
    )
  }
}

describe('búsqueda a partir del índice', () => {
  it('ORÁCULO: el índice da exactamente lo mismo que la fuerza bruta', () => {
    const random = makeRandom(31337)
    const queries: string[] = []

    // Todos los nombres completos, ya normalizados (así son un solo token y la
    // comparación con el oráculo es directa).
    for (const doc of index.docs) {
      queries.push(index.flat[doc.docId]!)
      const es = index.flatEs[doc.docId]!
      if (es !== index.flat[doc.docId]) queries.push(es)
    }

    // Subcadenas al azar de nombres reales, de 1 a 6 caracteres. Cubren los
    // niveles 2, 3 y 4, y en particular las de 1 y 2 caracteres, que son las que
    // un índice de solo trigramas no podría responder.
    for (let round = 0; round < 400; round += 1) {
      const doc = index.docs[Math.floor(random() * index.docs.length)]!
      const form = index.flat[doc.docId]!
      const size = 1 + Math.floor(random() * 6)
      if (form.length < size) continue
      const start = Math.floor(random() * (form.length - size + 1))
      queries.push(form.slice(start, start + size))
    }

    // Números: ids que existen, ids que no, y números que además son subcadena.
    queries.push('25', '1', '1025', '10034', '9999', '2', '150', '386')

    // Consultas que no deben encontrar nada.
    queries.push('zzzz', 'qqqq', 'xyzzy')

    const unique = [...new Set(queries)]
    assert.ok(unique.length > 1300, `pocas consultas: ${unique.length}`)

    for (const query of unique) {
      const expected = oracleLevels(index, query)
      const actual = engineLevels(index, query)

      assert.equal(
        actual.size,
        expected.size,
        `"${query}": el motor da ${actual.size} y la fuerza bruta ${expected.size}` +
          ` (sobran: ${[...actual.keys()].filter((d) => !expected.has(d)).slice(0, 4).map((d) => nameOf(index, d)).join(', ')}` +
          ` | faltan: ${[...expected.keys()].filter((d) => !actual.has(d)).slice(0, 4).map((d) => nameOf(index, d)).join(', ')})`,
      )
      for (const [docId, level] of expected) {
        assert.equal(
          actual.get(docId),
          level,
          `"${query}" en ${nameOf(index, docId)}: nivel ${actual.get(docId)} en vez de ${level}`,
        )
      }
    }
  })

  it('NO HAY BARRIDO: solo se tocan los documentos que pueden ser respuesta', () => {
    const forChar = runQuery(index, parseQuery('char'))
    assert.ok(
      forChar.stats.docsTouched < 200,
      `"char" tocó ${forChar.stats.docsTouched} de ${index.docs.length}`,
    )

    const forPikachu = runQuery(index, parseQuery('pikachu'))
    assert.ok(
      forPikachu.stats.docsTouched < 60,
      `"pikachu" tocó ${forPikachu.stats.docsTouched}`,
    )

    // La consulta vacía no toca ninguna: devuelve el orden ya calculado.
    const empty = runQuery(index, parseQuery(''))
    assert.equal(empty.stats.docsTouched, 0)
    assert.equal(empty.docIds.length, index.docs.length)
  })

  it('los casos del reporte siguen dando lo mismo', () => {
    const byId = (pokeId: number) => index.byPokeId.get(pokeId)!

    // `25` -> pikachu por id, nivel 0.
    const n25 = runQuery(index, parseQuery('25'))
    assert.equal(n25.docIds[0], byId(25))
    assert.equal(n25.levels[0], SCORE.ID_EXACT)

    // `pikachu` -> nombre exacto, nivel 1.
    const pikachu = runQuery(index, parseQuery('pikachu'))
    assert.equal(pikachu.docIds[0], byId(25))
    assert.equal(pikachu.levels[0], SCORE.NAME_EXACT)

    // `char` -> charmander(4), charmeleon(5), charizard(6) en ese orden, nivel 2,
    // y las formas alternas después de todas las especies base.
    const char = runQuery(index, parseQuery('char'))
    assert.deepEqual(char.docIds.slice(0, 3), [byId(4), byId(5), byId(6)])
    assert.equal(char.levels[0], SCORE.PREFIX)
    // El desempate base-antes-que-forma opera DENTRO de cada nivel, no de forma
    // global: charizard-mega-x (nivel 2, empieza por "char") va legítimamente
    // antes que chimchar (nivel 4, solo lo contiene). Lo que debe cumplirse es
    // que a igualdad de nivel, y solo entonces, las especies base vayan primero.
    assertOrderedWithinLevels(char.docIds, char.levels)

    // `charm` -> charmander y charmeleon por nombre.
    //
    // CAMBIO DE COMPORTAMIENTO respecto al buscador anterior, y es deliberado:
    // antes esta consulta daba exactamente 2 resultados, y ahora da 4, porque el
    // género también es buscable y Darumaka es "Zen Charm Pokémon". Los dos
    // nuevos entran en el nivel 5, por debajo de toda coincidencia de nombre, así
    // que la cabeza de la lista no cambia. Lo que se comprueba es justo eso.
    const charm = runQuery(index, parseQuery('charm'))
    assert.deepEqual(charm.docIds.slice(0, 2), [byId(4), byId(5)])
    assert.deepEqual(charm.levels.slice(0, 2), [SCORE.PREFIX, SCORE.PREFIX])
    for (let i = 2; i < charm.levels.length; i += 1) {
      assert.ok(charm.levels[i]! >= SCORE.FACET, 'los extras deben quedar en nivel 5 o peor')
    }

    // `mime` -> mime-jr antes que mr-mime: el nombre completo empieza por la
    // consulta (nivel 2) frente a empezar solo una de sus palabras (nivel 3).
    const mime = runQuery(index, parseQuery('mime'))
    assert.equal(mime.docIds[0], byId(439), 'mime-jr debería ir primero')
    assert.equal(mime.levels[0], SCORE.PREFIX)
    const mrMimeAt = mime.docIds.indexOf(byId(122))
    assert.ok(mrMimeAt > 0)
    assert.equal(mime.levels[mrMimeAt], SCORE.WORD_PREFIX)

    // `char` alcanza a chimchar por subcadena, nivel 4.
    const chimcharAt = char.docIds.indexOf(byId(390))
    assert.ok(chimcharAt > 0, 'chimchar debería aparecer')
    assert.equal(char.levels[chimcharAt], SCORE.CONTAINS)

    // `2` se busca a la vez como id y como texto: ivysaur(2) y porygon2(233).
    const two = runQuery(index, parseQuery('2'))
    assert.equal(two.docIds[0], byId(2))
    assert.equal(two.levels[0], SCORE.ID_EXACT)
    assert.ok(two.docIds.includes(byId(233)), 'porygon2 debería aparecer')

    // `zzzz` no encuentra nada.
    assert.equal(runQuery(index, parseQuery('zzzz')).docIds.length, 0)
  })

  it('REGRESIÓN de los n-gramas: dos caracteres siguen encontrando subcadenas', () => {
    // Con un índice de solo trigramas esto devolvería vacío, y hoy funciona.
    const ch = runQuery(index, parseQuery('ch'))
    const pikachuAt = ch.docIds.indexOf(index.byPokeId.get(25)!)
    assert.ok(pikachuAt !== -1, '"ch" debería alcanzar a pikachu')
    assert.equal(ch.levels[pikachuAt], SCORE.CONTAINS)

    // Y una sola letra también.
    const x = runQuery(index, parseQuery('x'))
    assert.ok(x.docIds.length > 0, '"x" debería encontrar algo')
  })

  it('varias palabras se combinan con AND', () => {
    const byId = (pokeId: number) => index.byPokeId.get(pokeId)!

    // "mr mime" mantiene el nivel 1 gracias a la ruta de consulta entera.
    const mrMime = runQuery(index, parseQuery('mr mime'))
    assert.equal(mrMime.docIds[0], byId(122))
    assert.equal(mrMime.levels[0], SCORE.NAME_EXACT)
    assert.ok(mrMime.docIds.includes(byId(10168)), 'mr-mime-galar debería aparecer')
    // Y no arrastra a mr-rime, que comparte "mr" pero no "mime".
    assert.ok(!mrMime.docIds.includes(byId(866)), 'mr-rime no debería aparecer')

    // Orden invertido: solo la ruta AND puede resolverlo.
    const reversed = runQuery(index, parseQuery('libre pikachu'))
    assert.ok(reversed.docIds.includes(byId(10084)), 'pikachu-libre debería aparecer')
  })
})

/* ========================================================================== */

describe('filtrado facetado', () => {
  const asFilters = (types: number[], gens: number[]): Filters => ({
    types: new Set(types),
    gens: new Set(gens),
  })

  it('filtrar por un tipo deja solo documentos de ese tipo', () => {
    const fire = index.types.find((type) => type.slug === 'fire')!
    const all = runQuery(index, parseQuery(''))
    const filtered = applyFacets(index, all, asFilters([fire.id], []))

    assert.equal(filtered.docIds.length, index.byType.get(fire.id)!.length)
    for (const docId of filtered.docIds) {
      assert.ok(index.docs[docId]!.typeIds.includes(fire.id))
    }
  })

  it('OR dentro de una faceta: coincide con la unión de sus postings', () => {
    const fire = index.types.find((type) => type.slug === 'fire')!
    const water = index.types.find((type) => type.slug === 'water')!
    const all = runQuery(index, parseQuery(''))
    const filtered = applyFacets(index, all, asFilters([fire.id, water.id], []))

    const expected = unionSorted(index.byType.get(fire.id)!, index.byType.get(water.id)!)
    assert.equal(filtered.docIds.length, expected.length)
    assert.deepEqual([...filtered.docIds].sort((a, b) => a - b), expected)
  })

  it('AND entre facetas: coincide con la intersección de sus postings', () => {
    const fire = index.types.find((type) => type.slug === 'fire')!
    const all = runQuery(index, parseQuery(''))
    const filtered = applyFacets(index, all, asFilters([fire.id], [1]))

    const expected = intersectSorted(index.byType.get(fire.id)!, index.byGen.get(1)!)
    assert.deepEqual([...filtered.docIds].sort((a, b) => a - b), expected)
    assert.ok(expected.length > 0, 'debería haber Pokémon de fuego en la primera generación')
  })

  it('CONTEOS: una faceta no se filtra a sí misma', () => {
    // La prueba que separa un facetado de verdad de unos filtros cualesquiera.
    // Con Fuego marcado, el chip de Agua debe seguir mostrando cuántos saldrían
    // si ADEMÁS marcas Agua. El error clásico deja ese número en 0.
    const fire = index.types.find((type) => type.slug === 'fire')!
    const water = index.types.find((type) => type.slug === 'water')!
    const all = runQuery(index, parseQuery(''))
    const counts = countFacets(index, all.docIds, asFilters([fire.id], []))

    assert.ok(
      counts.types[water.id]! > 0,
      'con Fuego marcado, Agua debe seguir contando (la faceta no se filtra a sí misma)',
    )
    assert.equal(counts.types[water.id], index.byType.get(water.id)!.length)
    // El total sí refleja el filtro aplicado.
    assert.equal(counts.total, index.byType.get(fire.id)!.length)
  })

  it('los conteos cruzados aplican la OTRA faceta', () => {
    const fire = index.types.find((type) => type.slug === 'fire')!
    const all = runQuery(index, parseQuery(''))
    const counts = countFacets(index, all.docIds, asFilters([fire.id], []))

    // Los conteos de generación sí llevan aplicado el filtro de tipo.
    const fireInGen1 = intersectSorted(index.byType.get(fire.id)!, index.byGen.get(1)!).length
    assert.equal(counts.gens[1], fireInGen1)
  })

  it('los conteos cuadran con el resultado real de marcar el chip', () => {
    const all = runQuery(index, parseQuery('a'))
    const counts = countFacets(index, all.docIds, asFilters([], []))
    for (const type of index.types) {
      const filtered = applyFacets(index, all, asFilters([type.id], []))
      assert.equal(
        counts.types[type.id],
        filtered.docIds.length,
        `el conteo de ${type.es} no coincide con filtrar por él`,
      )
    }
  })

  it('filtrar no vuelve a consultar el índice', () => {
    // `applyFacets` recibe el resultado ya emparejado: si hiciera otra consulta
    // necesitaría la consulta, y no la recibe. Es una garantía estructural.
    const matched = runQuery(index, parseQuery('char'))
    const before = matched.stats.docsTouched
    applyFacets(index, matched, asFilters([10], []))
    assert.equal(matched.stats.docsTouched, before)
  })
})

/* ========================================================================== */

describe('agrupación', () => {
  it('por generación es una partición', () => {
    const all = runQuery(index, parseQuery(''))
    const groups = groupResults(index, all.docIds, all.levels, GROUP_BY.GENERATION)

    assert.equal(groups.length, 9)
    const sum = groups.reduce((acc, group) => acc + group.docIds.length, 0)
    assert.equal(sum, all.docIds.length, 'las generaciones deben sumar el total')

    const seen = new Set<number>()
    for (const group of groups) {
      for (const docId of group.docIds) {
        assert.ok(!seen.has(docId), `${index.docs[docId]!.slug} aparece en dos generaciones`)
        seen.add(docId)
      }
    }
    // Y en orden de generación.
    const ids = groups.map((group) => (group.key.kind === 'generation' ? group.key.genId : -1))
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b))
  })

  it('por tipo solapa: un Pokémon de dos tipos sale en dos filas', () => {
    const all = runQuery(index, parseQuery(''))
    const groups = groupResults(index, all.docIds, all.levels, GROUP_BY.TYPE)

    const sum = groups.reduce((acc, group) => acc + group.docIds.length, 0)
    assert.ok(sum > all.docIds.length, 'con dobles tipos la suma debe exceder el total')
    assert.equal(sum, index.docs.reduce((acc, doc) => acc + doc.typeIds.length, 0))

    // Un caso concreto: charizard-mega-x es Fuego y Dragón, así que está en ambas.
    const mega = index.byPokeId.get(10034)!
    const withMega = groups.filter((group) => group.docIds.includes(mega))
    assert.equal(withMega.length, 2, 'charizard-mega-x debería estar en dos filas')
  })

  it('por relevancia produce un grupo por nivel presente, en orden', () => {
    const result = runQuery(index, parseQuery('char'))
    const groups = groupResults(index, result.docIds, result.levels, GROUP_BY.RELEVANCE)

    const levels = groups.map((group) => (group.key.kind === 'relevance' ? group.key.level : -1))
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b))
    assert.deepEqual(levels, [...new Set(result.levels)].sort((a, b) => a - b))

    const sum = groups.reduce((acc, group) => acc + group.docIds.length, 0)
    assert.equal(sum, result.docIds.length)
  })

  it('sin agrupar devuelve un solo grupo con todo', () => {
    const result = runQuery(index, parseQuery('char'))
    const groups = groupResults(index, result.docIds, result.levels, GROUP_BY.NONE)
    assert.equal(groups.length, 1)
    assert.deepEqual(groups[0]!.docIds, result.docIds)
  })

  it('las claves de grupo no llevan idioma', () => {
    // Si llevaran el texto ya traducido, cambiar de idioma obligaría a recalcular
    // toda la agrupación sin que se mueva ni un documento.
    const all = runQuery(index, parseQuery(''))
    for (const mode of [GROUP_BY.TYPE, GROUP_BY.GENERATION, GROUP_BY.RELEVANCE] as const) {
      for (const group of groupResults(index, all.docIds, all.levels, mode)) {
        // `kind` es el discriminante de la unión, no una etiqueta. Lo que no debe
        // haber es ningún OTRO texto: solo identificadores numéricos.
        for (const [field, value] of Object.entries(group.key)) {
          if (field === 'kind') continue
          assert.equal(
            typeof value,
            'number',
            `la clave de ${mode} lleva texto en "${field}": ${String(value)}`,
          )
        }
      }
    }
  })

  it('agrupar conserva el orden de relevancia dentro de cada fila', () => {
    const result = runQuery(index, parseQuery('char'))
    const position = new Map(result.docIds.map((docId, i) => [docId, i]))
    for (const group of groupResults(index, result.docIds, result.levels, GROUP_BY.TYPE)) {
      const positions = group.docIds.map((docId) => position.get(docId)!)
      assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
    }
  })
})

/* ========================================================================== */

describe('etiquetas', () => {
  it('una forma alterna trae todas sus etiquetas', () => {
    const docId = index.byPokeId.get(10034)! // charizard-mega-x
    const doc = index.docs[docId]!
    const tags = tagsFor(index, docId)

    const kinds = tags.map((tag) => tag.kind)
    assert.ok(kinds.includes('type'))
    assert.ok(kinds.includes('generation'))
    assert.ok(kinds.includes('genus'))
    assert.ok(kinds.includes('altForm'), 'debería marcarse como forma alterna')

    const typeLabels = tags
      .filter((tag) => tag.kind === 'type')
      .map((tag) => tagLabel(index, doc, tag, 'es'))
    // Mega Charizard X es Fuego/Dragón, no Fuego/Volador: las formas tienen sus
    // propios tipos y el índice los toma de `/type`, no de la especie.
    assert.deepEqual(typeLabels, ['Fuego', 'Dragón'])
    assert.equal(tagLabel(index, doc, { kind: 'generation', genId: doc.genId }, 'es'), 'Generación I')
  })

  it('una especie base no se marca como forma alterna', () => {
    const tags = tagsFor(index, index.byPokeId.get(25)!)
    assert.ok(!tags.some((tag) => tag.kind === 'altForm'))
  })

  it('TODAS las etiquetas tienen texto, en los 1351 y en los dos idiomas', () => {
    // Es lo que demuestra que el respaldo al género inglés cubre las 127 especies
    // sin género en español.
    for (const doc of index.docs) {
      const tags = tagsFor(index, doc.docId)
      assert.ok(tags.length > 0, `${doc.slug} sin etiquetas`)
      for (const lang of ['es', 'en'] as const) {
        for (const tag of tags) {
          const label = tagLabel(index, doc, tag, lang)
          assert.ok(label.length > 0, `${doc.slug}: etiqueta ${tag.kind} vacía en ${lang}`)
          assert.ok(!label.startsWith('undefined'), `${doc.slug}: etiqueta sin resolver`)
        }
      }
    }
  })

  it('cada tipo tiene color definido', () => {
    for (const type of index.types) {
      assert.ok(
        TYPE_COLORS[type.slug] !== undefined,
        `el tipo ${type.slug} no tiene color y saldría gris`,
      )
    }
  })

  it('los encabezados de fila se resuelven en ambos idiomas', () => {
    const all = runQuery(index, parseQuery(''))
    for (const mode of [GROUP_BY.TYPE, GROUP_BY.GENERATION, GROUP_BY.RELEVANCE] as const) {
      for (const group of groupResults(index, all.docIds, all.levels, mode)) {
        for (const lang of ['es', 'en'] as const) {
          const label = groupLabel(index, group.key, lang)
          assert.ok(label.length > 0 && !label.startsWith('undefined'), `fila sin texto en ${lang}`)
        }
      }
    }
  })
})

/* ========================================================================== */

describe('multilenguaje', () => {
  it('solo se guarda el nombre español cuando aporta algo', () => {
    const divergent = corpus.species.filter((species) => species.es !== undefined)
    // De 1025 nombres, difieren 21: los Paradoja y Código Cero.
    assert.ok(divergent.length > 15 && divergent.length < 40, `difieren ${divergent.length}`)
    for (const species of divergent) {
      assert.notEqual(species.es, species.en, `${species.slug} guarda un ES idéntico al EN`)
    }
  })

  it('un nombre que solo existe en español se encuentra igual', () => {
    const typeNull = index.docs.find((doc) => doc.slug === 'type-null')!
    // "Código Cero" en español, "Type: Null" en inglés. Ambos deben llevar al mismo.
    for (const query of ['codigo cero', 'Código Cero', 'codigocero', 'type null', 'typenull']) {
      const result = runQuery(index, parseQuery(query))
      assert.ok(
        result.docIds.includes(typeNull.docId),
        `"${query}" no encontró a type-null`,
      )
    }
  })

  it('cada tipo se encuentra por su nombre en cualquiera de los dos idiomas', () => {
    // La prueba de fondo: buscar es independiente del idioma, mostrar no.
    for (const type of index.types) {
      const members = index.byType.get(type.id)!
      for (const name of [type.es, type.en]) {
        const result = new Set(runQuery(index, parseQuery(name)).docIds)
        for (const docId of members) {
          assert.ok(
            result.has(docId),
            `"${name}" no alcanzó a ${index.docs[docId]!.slug} (tipo ${type.slug})`,
          )
        }
      }
    }
  })

  it('el español de América también encuentra', () => {
    // "Lucha" en es y "Pelea" en es-419; "Bicho" e "Insecto".
    for (const [term, slug] of [
      ['pelea', 'fighting'],
      ['lucha', 'fighting'],
      ['insecto', 'bug'],
      ['bicho', 'bug'],
    ] as const) {
      const type = index.types.find((candidate) => candidate.slug === slug)!
      const result = new Set(runQuery(index, parseQuery(term)).docIds)
      const members = index.byType.get(type.id)!
      assert.ok(members.every((docId) => result.has(docId)), `"${term}" no cubrió ${slug}`)
    }
  })

  it('se puede buscar por género en ambos idiomas', () => {
    const pikachu = index.byPokeId.get(25)!
    assert.ok(runQuery(index, parseQuery('ratón')).docIds.includes(pikachu), 'ratón → Pikachu')
    assert.ok(runQuery(index, parseQuery('mouse')).docIds.includes(pikachu), 'mouse → Pikachu')
  })

  it('las regiones se buscan por su nombre localizado', () => {
    const gen5 = index.byGen.get(5)!
    // PokeAPI no trae regiones en español; Teselia se corrige en la construcción.
    const teselia = new Set(runQuery(index, parseQuery('teselia')).docIds)
    assert.ok(gen5.every((docId) => teselia.has(docId)), 'teselia debería dar la generación V')
    const unova = new Set(runQuery(index, parseQuery('unova')).docIds)
    assert.ok(gen5.every((docId) => unova.has(docId)), 'unova debería dar la generación V')
  })

  it('el idioma elegido se recuerda', () => {
    const store = new Map<string, string>()
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
      configurable: true,
    })
    try {
      storeLang('en')
      assert.equal(readStoredLang(), 'en')
      storeLang('es')
      assert.equal(readStoredLang(), 'es')
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(globalThis, 'localStorage')
      } else {
        Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true })
      }
    }
  })
})

/* ========================================================================== */

describe('coincidencia aproximada', () => {
  it('corrige una errata y lo dice', () => {
    const result = runQuery(index, parseQuery('charmender'))
    assert.equal(result.suggestion, 'charmander')
    assert.ok(result.stats.usedFuzzy)
    assert.ok(result.docIds.includes(index.byPokeId.get(4)!))
    // Y se marca como aproximado, no como coincidencia exacta.
    assert.ok(result.levels.every((level) => level === SCORE.FUZZY))
  })

  it('cuenta las transposiciones como una sola edición', () => {
    // Damerau y no Levenshtein simple: "charmnader" está a distancia 1.
    assert.equal(damerauLevenshtein('charmnader', 'charmander', 2), 1)
    assert.equal(damerauLevenshtein('charmander', 'charmander', 2), 0)
    assert.ok(damerauLevenshtein('zzzzzzzz', 'charmander', 2) > 2)
  })

  it('no se activa si ya había resultados', () => {
    const result = runQuery(index, parseQuery('char'))
    assert.equal(result.suggestion, null)
    assert.equal(result.stats.usedFuzzy, false)
  })

  it('no se activa con consultas demasiado cortas', () => {
    for (const query of ['zz', 'qx', 'abc']) {
      const result = runQuery(index, parseQuery(query))
      if (result.docIds.length === 0) {
        assert.equal(result.suggestion, null, `"${query}" no debería sugerir nada`)
      }
    }
  })

  it('sigue sin inventar resultados cuando no hay nada parecido', () => {
    const result = runQuery(index, parseQuery('zzzzzzzz'))
    assert.equal(result.docIds.length, 0)
    assert.equal(result.stats.usedFuzzy, false)
  })
})

/* ========================================================================== */

describe('reducción de la consulta', () => {
  /** El texto de referencia: una descripción de Charmander. */
  const DESCRIPCION =
    'Es un Pokémon de tipo fuego que parece un lagarto pequeño y tiene una llama ' +
    'encendida en la punta de la cola.'

  const terminos = (r: Reduction) => r.kept.map((k) => k.term)

  it('un texto largo se reduce a unos pocos términos', () => {
    const reduccion = reduceQuery(index, DESCRIPCION)
    assert.ok(reduccion !== null, 'debería reducir un texto de 22 palabras')
    assert.equal(reduccion.totalTokens, 22)
    assert.ok(
      reduccion.kept.length >= 2 && reduccion.kept.length <= 6,
      `conservó ${reduccion.kept.length} términos`,
    )
    assert.deepEqual(terminos(reduccion), [
      // "lagarto" no está en el catálogo —la categoría de Charmander es
      // "Lagartija"— y lo resuelve el tesauro. Ver `thesaurus.ts`.
      'lagartija',
      'punta',
      'pequeno',
      'llama',
      'cola',
      'fuego',
    ])
  })

  it('PALABRAS VACÍAS: el IDF depende del corpus, y aquí se puede medir cuánto', () => {
    // Sobre el índice de IDENTIDAD solo —nombres, tipos, categorías— "de" sale
    // en 2 documentos ("Pokémon Lirio de Mar", "Pokémon Erizo de Mar") y "y" en
    // 3 (las formas mega-y). Con esas cifras su idf encabezaría la reducción.
    const N = index.docs.length
    const idf = (df: number) => Math.log(N / df)

    for (const funcional of ['de', 'y']) {
      const soloIdentidad = termPostings(index, funcional).length
      assert.ok(soloIdentidad > 0 && soloIdentidad < 10, `"${funcional}" es rarísimo por nombre`)
      assert.ok(idf(soloIdentidad) > 5, `"${funcional}" tendría un idf altísimo sin descripciones`)

      // Con el índice de descripción dentro, la estadística se corrige sola:
      // "de" pasa de 2 documentos a más de mil, y su idf se desploma.
      const conDescripciones = reducedDf(index, funcional)
      assert.ok(conDescripciones > 300, `"${funcional}" aparece en ${conDescripciones} documentos`)
      assert.ok(
        idf(conDescripciones) < idf(reducedDf(index, 'llama')),
        `con texto corrido, "${funcional}" ya NO debería superar a "llama"`,
      )
    }

    // La lectura no es "la lista sobra", sino que una colección pequeña miente
    // sobre el idf: sin texto corrido, dos preposiciones parecían los términos
    // más informativos del catálogo.
    const reduccion = reduceQuery(index, DESCRIPCION)!
    assert.ok(!terminos(reduccion).includes('de'), '"de" no debería conservarse')
    assert.ok(!terminos(reduccion).includes('y'), '"y" no debería conservarse')
    assert.ok(reduccion.dropped.stopword > 0)
  })

  it('la lista hace trabajo que el IDF NO puede hacer, ni con el corpus completo', () => {
    // Éste es el argumento de verdad, y sobrevive a las descripciones.
    //
    // Hay palabras funcionales que siguen siendo raras aunque el corpus tenga
    // texto corrido, porque en una entrada de Pokédex casi nunca hace falta
    // escribir "fueron" o "porque". Su idf sigue POR ENCIMA del de "llama", que
    // es una categoría real y útil, así que ordenar solo por idf las pondría
    // primero. Tienen tres letras o más, de modo que la regla de longitud
    // tampoco las alcanza: solo las detiene la lista.
    //
    // Medido sobre este corpus, son 81 las que cumplen las dos condiciones.
    const N = index.docs.length
    const idfLlama = Math.log(N / reducedDf(index, 'llama'))

    for (const funcional of ['fueron', 'eran', 'habia', 'porque', 'entonces']) {
      const df = reducedDf(index, funcional)
      assert.ok(df > 0, `"${funcional}" debería existir en el corpus`)
      assert.ok(funcional.length >= 3, 'la regla de longitud no debe alcanzarla')
      assert.ok(
        Math.log(N / df) > idfLlama,
        `"${funcional}" (idf ${Math.log(N / df).toFixed(2)}) debería superar a "llama" ` +
          `(${idfLlama.toFixed(2)}): si no, esta prueba ya no demuestra nada`,
      )
      assert.ok(STOPWORDS.has(funcional), `"${funcional}" debería estar en la lista`)
    }

    const reduccion = reduceQuery(index, 'Un Pokemon con dos cabezas del tipo siniestro que sale del agua')!
    assert.deepEqual(terminos(reduccion), ['sale', 'cabezas', 'siniestro', 'agua'])
  })

  it('un término que aparece en TODOS los documentos se descarta', () => {
    // "generacion" está en los 1351, así que su idf es exactamente cero: no
    // distingue nada. Sin este corte ocuparía un hueco aportando peso nulo.
    assert.equal(termPostings(index, 'generacion').length, index.docs.length)
    const reduccion = reduceQuery(index, 'Un Pokemon fantasma de tipo siniestro de la generacion octava')!
    assert.deepEqual(terminos(reduccion), ['fantasma', 'siniestro'])
    assert.ok(!terminos(reduccion).includes('generacion'))

    // Y si al descartarlo no queda material suficiente, la reducción se abstiene
    // en vez de buscar con un solo término.
    assert.equal(
      reduceQuery(index, 'Un Pokemon cualquiera de esa generacion y de la otra'),
      null,
    )
    for (const termino of reduccion.kept) {
      assert.ok(termino.idf > 0, `"${termino.term}" tiene idf 0 y no debería conservarse`)
      assert.ok(termino.df < index.docs.length)
    }
  })

  it('las palabras que no existen en el corpus se descartan', () => {
    const reduccion = reduceQuery(index, DESCRIPCION)!
    assert.ok(reduccion.dropped.ausente > 0)
    // "lagarto" no está en el corpus: la categoría de Charmander es "Lagartija".
    assert.ok(!terminos(reduccion).includes('lagarto'))
    for (const { term, reason } of reduccion.droppedSample) {
      if (reason === 'ausente') {
        assert.equal(reducedDf(index, term), 0, `"${term}" sí existía`)
      }
    }
  })

  it('los términos salen ordenados por informatividad', () => {
    const reduccion = reduceQuery(index, DESCRIPCION)!
    for (let i = 1; i < reduccion.kept.length; i += 1) {
      assert.ok(
        reduccion.kept[i - 1]!.idf >= reduccion.kept[i]!.idf,
        'la lista debe ir de más a menos informativo',
      )
    }
    // Y el idf debe cuadrar con el df que declara.
    for (const { term, df, idf } of reduccion.kept) {
      assert.equal(df, reducedDf(index, term), `df de "${term}"`)
      assert.ok(Math.abs(idf - Math.log(index.docs.length / df)) < 1e-9)
    }
  })

  it('df es la unión de los diccionarios, no la de uno solo', () => {
    // "normal" vive en segTerms (1 doc) y en facetTerms (160): la unión es 161.
    const union = termPostings(index, 'normal').length
    const enFacetas = index.facetPostings[lowerBound(index.facetTerms, 'normal')]!.length
    assert.ok(union >= enFacetas, 'la unión no puede ser menor que una de sus partes')
    assert.ok(union > enFacetas, '"normal" debería aparecer en más de un diccionario')
  })

  it('las descripciones recuperan los Pokémon esperados', () => {
    const casos: [string, number[]][] = [
      [DESCRIPCION, [5, 6]], // Charmeleon y Charizard
      ['Un raton electrico amarillo con las mejillas rojas que lanza rayos', [25]], // Pikachu
      ['Una tortuga de agua que se esconde en su caparazon', [8]], // Wartortle
    ]
    for (const [texto, esperados] of casos) {
      const resultado = runQuery(index, parseQuery(texto))
      assert.ok(resultado.reduction !== null, `"${texto.slice(0, 30)}" debería reducirse`)
      const cabeza = resultado.docIds.slice(0, 5).map((d) => index.docs[d]!.pokeId)
      for (const pokeId of esperados) {
        assert.ok(
          cabeza.includes(pokeId),
          `esperaba ${pokeId} entre los primeros: ${cabeza.join(', ')}`,
        )
      }
      assert.ok(resultado.levels.every((l) => l === SCORE.REDUCED))
    }
  })

  it('NO DEGRADA: las consultas que ya funcionaban dan exactamente lo mismo', () => {
    // La reducción solo se activa cuando la búsqueda normal da cero, así que no
    // puede tocar nada de esto. Incluye nombres reales de cuatro palabras.
    const casos: [string, number][] = [
      ['tauros paldea combat breed', 10250],
      ['pikachu rock star', 10080],
      ['charizard mega x', 10034],
      ['mr mime galar', 10168],
      ['mr mime', 122],
      ['char', 4],
      ['pikachu', 25],
    ]
    for (const [consulta, primero] of casos) {
      const resultado = runQuery(index, parseQuery(consulta))
      assert.equal(
        index.docs[resultado.docIds[0]!]!.pokeId,
        primero,
        `"${consulta}" debería seguir empezando por ${primero}`,
      )
      assert.equal(resultado.reduction, null, `"${consulta}" no debería reducirse`)
      assert.ok(resultado.levels[0]! <= SCORE.FACET, 'no debería caer en el nivel reducido')
    }
  })

  it('no se activa cuando no hay nada que combinar', () => {
    // Con una sola palabra la búsqueda normal ya la ha intentado, y reducir no
    // puede aportar nada nuevo.
    for (const corta of ['char', 'pikachu', 'fuego']) {
      assert.equal(reduceQuery(index, corta), null, `"${corta}" no debería reducirse`)
    }

    // Y aunque el umbral permita dos palabras, siguen haciendo falta DOS
    // términos con sustancia: los nombres reales de dos palabras no se tocan.
    assert.equal(reduceQuery(index, 'mr mime'), null, '"mr" es demasiado corta')

    // La garantía de fondo, que no depende del umbral: reducir solo se ejecuta
    // cuando la búsqueda normal devolvió CERO, y estos nombres devuelven algo.
    for (const nombre of ['mr mime', 'charizard mega x', 'pikachu rock star']) {
      const resultado = runQuery(index, parseQuery(nombre))
      assert.ok(resultado.docIds.length > 0, `"${nombre}" debe resolverse por la ruta normal`)
      assert.equal(resultado.reduction, null, `"${nombre}" no debería pasar por la reducción`)
    }
  })

  it('reducir a nada NO devuelve el catálogo entero', () => {
    // El peligro concreto: una consulta que se queda vacía caería en la rama de
    // "consulta vacía" del motor, que devuelve los 1351 documentos.
    const sinSustancia = 'y de la que el los las un una con por para sin sobre'
    assert.equal(reduceQuery(index, sinSustancia), null)
    const resultado = runQuery(index, parseQuery(sinSustancia))
    assert.notEqual(
      resultado.docIds.length,
      index.docs.length,
      'una consulta sin sustancia no puede devolver el catálogo completo',
    )
  })

  it('un texto larguísimo no desborda el contador de coincidencias', () => {
    // `scratch.hits` es un Uint8Array: da la vuelta a las 256.
    const larguisimo = 'Charmander es un Pokemon de tipo fuego con una llama. '.repeat(40)
    const tokens = tokenize(larguisimo).length
    assert.ok(tokens > 256, `la prueba necesita más de 256 tokens, tiene ${tokens}`)
    const resultado = runQuery(index, parseQuery(larguisimo))
    assert.ok(resultado.reduction !== null, 'debería reducirse')
    assert.ok(resultado.docIds.length > 0, 'debería recuperar algo')
    assert.ok(
      resultado.docIds.length < index.docs.length,
      'no debería devolver el catálogo entero',
    )
  })

  it('la puntuación tipográfica de un texto pegado no fusiona palabras', () => {
    // Un texto copiado de un procesador trae guiones largos y comillas curvas.
    assert.deepEqual(tokenize('fuego—dragon'), ['fuego', 'dragon'])
    assert.deepEqual(tokenize('agua+planta'), ['agua', 'planta'])
    assert.deepEqual(tokenize('fire—breathing dragon'), ['fire', 'breathing', 'dragon'])
    assert.deepEqual(tokenize('«Charmander»'), ['charmander'])
    // Y la invariante del tokenizador sigue en pie pese a ampliar los separadores.
    for (const texto of ['fuego—dragon', '«Charmander» …', 'agua+planta & fuego']) {
      assert.equal(tokenize(texto).join(''), normalize(texto))
    }
  })

  it('la reducción explica qué descartó y por qué', () => {
    const reduccion = reduceQuery(index, DESCRIPCION)!
    const total =
      reduccion.dropped.stopword +
      reduccion.dropped.corta +
      reduccion.dropped.ausente +
      reduccion.dropped.sobrante
    assert.ok(total > 0, 'debería haber descartado algo')
    assert.ok(reduccion.droppedSample.length > 0, 'debería traer una muestra')
    for (const { term, reason } of reduccion.droppedSample) {
      assert.ok(term.length > 0)
      assert.ok(['stopword', 'corta', 'ausente', 'sobrante'].includes(reason))
    }
  })

  it('la cola débil se recorta: una consulta reducida no devuelve medio catálogo', () => {
    // "agua" está en 193 documentos, así que sin tope esta descripción devolvería
    // 194 de los que solo dos tienen peso apreciable.
    const resultado = runQuery(index, parseQuery('Una tortuga de agua que se esconde en su caparazon'))
    assert.ok(resultado.docIds.length <= REDUCE_MAX_DOCS, `devolvió ${resultado.docIds.length}`)
    // Y lo relevante sigue en cabeza.
    assert.equal(index.docs[resultado.docIds[0]!]!.slug, 'wartortle')
  })

  it('funciona igual en inglés', () => {
    const reduccion = reduceQuery(index, 'A large dragon that breathes fire and flies')
    assert.ok(reduccion !== null)
    assert.ok(terminos(reduccion).includes('dragon'))
    assert.ok(terminos(reduccion).includes('fire'))
    assert.ok(!terminos(reduccion).includes('that'), '"that" es palabra vacía')
    assert.ok(!terminos(reduccion).includes('and'), '"and" es palabra vacía')
  })

  /* --- El índice de descripción ------------------------------------------- */

  it('SEPARACIÓN: la búsqueda normal no ve el índice de descripción', () => {
    // Es la garantía que permite añadir 12 000 términos sin tocar nada más.
    // "mejillas" aparece en decenas de entradas de Pokédex y en NINGÚN nombre ni
    // categoría, así que escribirlo a secas no debe devolver nada.
    //
    // (Cuidado al elegir el ejemplo: "caparazon" NO sirve, porque es la
    //  categoría de Pupitar y por tanto sí identifica a un Pokémon.)
    assert.ok(describedPostings(index, 'mejillas').length > 10, 'debería describir a varios')
    assert.equal(termPostings(index, 'mejillas').length, 0, 'no identifica a ninguno')
    assert.equal(runQuery(index, parseQuery('mejillas')).docIds.length, 0)

    // Y el vocabulario de corrección de erratas tampoco lo ve: si lo viera,
    // un nombre mal escrito podría "corregirse" a una palabra de descripción.
    assert.ok(!index.vocab.includes('mejillas'))
    assert.equal(index.stats.vocab, 2971, 'el vocabulario de identidad solo crece con los colores')
  })

  it('el índice de IDENTIDAD es idéntico con descripciones o sin ellas', () => {
    // Las cifras de los cuatro diccionarios de identidad. Si alguna cambia, es
    // que las descripciones se han colado donde no debían, y el oráculo —que
    // compara los niveles 0 a 4 contra fuerza bruta— dejaría de ser válido.
    assert.equal(index.stats.nameTerms, 1373)
    assert.equal(index.stats.segTerms, 1216)
    // 1384 antes de los colores; cada uno aporta su slug y sus dos nombres.
    assert.equal(index.stats.facetTerms, 1400)
    assert.ok(index.stats.textTerms > 10000, 'y el de descripción es el grande')
  })

  it('COBERTURA: cumplir dos términos gana a cumplir uno muy raro', () => {
    // El defecto que esto corrige, con el caso que lo destapó: "caparazon" es
    // raro, así que sumando pesos a secas Pupitar salía SEGUNDO cumpliendo un
    // solo término, por delante de Squirtle y Blastoise, que cumplen tres.
    const texto = 'una tortuga de agua que se esconde en su caparazon'
    const resultado = runQuery(index, parseQuery(texto))
    const reduccion = resultado.reduction!
    const cobertura = (docId: number) => reduccion.matches.get(docId)?.length ?? 0

    for (let i = 1; i < resultado.docIds.length; i += 1) {
      assert.ok(
        cobertura(resultado.docIds[i - 1]!) >= cobertura(resultado.docIds[i]!),
        'la cobertura no puede subir al bajar en la lista',
      )
    }
    const nombres = resultado.docIds.map((docId) => index.docs[docId]!.slug)
    assert.ok(nombres.includes('squirtle'), 'Squirtle cumple tres de los cuatro términos')
    assert.ok(
      !nombres.includes('pupitar'),
      'Pupitar solo cumple "caparazon": con cobertura, ya no entra',
    )
  })

  it('cada resultado sabe por qué está ahí', () => {
    // Sin esto la tarjeta aparece sin explicación, que fue justo la queja.
    const resultado = runQuery(index, parseQuery('un perro que tiene tres cabezas'))
    const reduccion = resultado.reduction!
    const conservados = new Set(terminos(reduccion))

    assert.ok(resultado.docIds.length > 0)
    for (const docId of resultado.docIds) {
      const porQue = reduccion.matches.get(docId)
      assert.ok(porQue !== undefined && porQue.length > 0, `${docId} no explica su presencia`)
      for (const termino of porQue) {
        assert.ok(conservados.has(termino), `"${termino}" no es un término conservado`)
      }
    }
  })

  it('una especie no ocupa varias filas', () => {
    // Las 326 formas alternas heredan la entrada de su especie, así que sin
    // colapsar "mejillas rojas" gastaba cuatro de los cinco primeros puestos en
    // Raichu, Raichu de Alola, Raichu Mega X y Raichu Mega Y.
    const resultado = runQuery(
      index,
      parseQuery('un raton electrico amarillo con las mejillas rojas que lanza rayos'),
    )
    const especies = resultado.docIds.map((docId) => index.docs[docId]!.speciesIdx)
    assert.equal(new Set(especies).size, especies.length, 'hay dos formas de la misma especie')
    assert.equal(index.docs[resultado.docIds[0]!]!.slug, 'pikachu')
  })

  it('IDENTIDAD pesa más que DESCRIPCIÓN', () => {
    // Que un Pokémon SE LLAME "raton" en su categoría vale más que mencionar la
    // palabra de pasada en su entrada de Pokédex. Sin esta distinción, describir
    // a Pikachu lo dejaba por detrás de Pokémon que solo lo mencionaban.
    const resultado = runQuery(index, parseQuery('un raton electrico que lanza rayos'))
    const reduccion = resultado.reduction!

    const porIdentidad = (docId: number) =>
      (reduccion.matches.get(docId) ?? []).some((t) => termPostings(index, t).includes(docId))

    const primero = resultado.docIds[0]!
    assert.ok(porIdentidad(primero), 'el primero debe coincidir por identidad, no solo por texto')
  })

  /* --- Plurales ------------------------------------------------------------ */

  it('PLURALES: se normaliza el plural, nunca un nombre real', () => {
    // La regla solo actúa cuando la palabra NO existe en ningún diccionario, así
    // que no puede estropear un nombre propio que acabe en "s".
    const conPlural = reduceQuery(index, 'un pokemon con dos voces y muchas raices')!
    const normalizados = conPlural.kept.filter((k) => k.from !== undefined)
    assert.ok(normalizados.length > 0, 'alguna debería normalizarse')
    for (const { term, from } of normalizados) {
      assert.ok(reducedDf(index, term) > 0, `"${term}" debe existir`)
      assert.equal(reducedDf(index, from!), 0, `"${from}" NO debía existir, o no había que tocarla`)
    }

    // La garantía al revés: los nombres reales acabados en "s" se buscan tal cual.
    for (const nombre of ['latias', 'latios', 'zapdos', 'abomasnow']) {
      assert.ok(reducedDf(index, nombre) > 0, `"${nombre}" existe en el catálogo`)
      const r = reduceQuery(index, `quiero encontrar al pokemon llamado ${nombre} ahora mismo`)
      const encontrado = r?.kept.find((k) => k.term === nombre)
      if (encontrado !== undefined) {
        assert.equal(encontrado.from, undefined, `"${nombre}" no debía reescribirse`)
      }
    }
  })

  it('los plurales corrientes encuentran su singular', () => {
    // Las reglas de sufijo, uno por regla: -ces→z, -es→∅, -s→∅, -ies→y.
    for (const [plural, singular] of [
      ['voces', 'voz'],
      ['dragones', 'dragon'],
      ['perros', 'perro'],
    ] as const) {
      assert.equal(reducedDf(index, plural), 0, `"${plural}" no debería existir tal cual`)
      assert.ok(reducedDf(index, singular) > 0, `"${singular}" sí debería existir`)
      assert.ok(
        singularCandidates(plural).includes(singular),
        `"${plural}" debería proponer "${singular}"`,
      )
    }
  })

  /* --- Color --------------------------------------------------------------- */

  it('el color es una faceta buscable en los dos idiomas', () => {
    // El color no aparece en ninguna categoría ni en ninguna entrada de Pokédex:
    // sin traerlo de PokeAPI, "amarillo" no encuentra absolutamente nada.
    assert.equal(index.colors.length, 10)
    for (const color of index.colors) {
      assert.ok(color.es.length > 0 && color.en.length > 0, `${color.slug} sin nombre`)
    }

    const amarillo = index.colors.find((c) => c.slug === 'yellow')!
    assert.equal(amarillo.es, 'Amarillo')

    // Y Pikachu es amarillo, por la ruta normal y en ambos idiomas.
    const pikachu = index.docs.find((d) => d.slug === 'pikachu')!
    assert.equal(index.colorById.get(pikachu.colorId)!.slug, 'yellow')
    for (const consulta of ['amarillo', 'yellow']) {
      assert.ok(
        runQuery(index, parseQuery(consulta)).docIds.includes(pikachu.docId),
        `"${consulta}" debería alcanzar a Pikachu`,
      )
    }
  })

  it('«rata amarilla» encuentra a Pikachu y «rata morada» a Rattata', () => {
    // Las dos consultas que motivaron este trabajo. Cada una necesita TRES
    // cosas a la vez: el umbral de dos palabras, el color como faceta, y llevar
    // "rata" a "raton" y "amarilla" a "amarillo".
    const casos = [
      ['rata amarilla', 'pikachu'],
      ['rata morada', 'rattata'],
      ['lagarto de fuego', 'charmander'],
    ] as const

    for (const [consulta, esperado] of casos) {
      const resultado = runQuery(index, parseQuery(consulta))
      assert.ok(resultado.reduction !== null, `"${consulta}" debería reducirse`)
      assert.ok(resultado.docIds.length > 0, `"${consulta}" no devolvió nada`)
      assert.equal(
        index.docs[resultado.docIds[0]!]!.slug,
        esperado,
        `"${consulta}" debería encabezarla ${esperado}`,
      )
    }
  })

  /* --- Tesauro ------------------------------------------------------------- */

  it('TESAURO: cada par sigue haciendo falta y sigue funcionando', () => {
    // La lista está escrita a mano, así que tiene que justificarse sola contra
    // el corpus: si una regeneración trajera "rata" en alguna descripción, esta
    // entrada sobraría y conviene enterarse.
    for (const [coloquial, catalogo] of synonymPairs()) {
      assert.equal(reducedDf(index, coloquial), 0, `"${coloquial}" ya existe: la entrada sobra`)
      assert.ok(reducedDf(index, catalogo) > 0, `"${catalogo}" no existe: la entrada no sirve`)
    }
  })

  it('el tesauro NO desvía una palabra que el catálogo conoce', () => {
    // La garantía de siempre: solo actúa cuando la palabra escrita no existe.
    // "raton" existe, así que nunca se sustituye por nada.
    const reduccion = reduceQuery(index, 'un raton de color amarillo')!
    const raton = reduccion.kept.find((k) => k.term === 'raton')
    assert.ok(raton !== undefined, '"raton" debería conservarse tal cual')
    assert.equal(raton.from, undefined, '"raton" no debía reescribirse')
  })

  /* --- Unión de formas ----------------------------------------------------- */

  it('une las formas de una palabra en vez de elegir una', () => {
    // "morada" existe en alguna entrada de Pokédex Y "morado" es el nombre de un
    // color. Quedarse con una sola deja fuera la mitad de la respuesta.
    const reduccion = reduceQuery(index, 'una serpiente morada')!
    const morada = reduccion.kept.find((k) => k.forms.includes('morada'))!
    assert.ok(morada.forms.includes('morado'), 'debería unir el masculino')
    assert.ok(
      morada.df > reducedDf(index, 'morada'),
      'la unión tiene que alcanzar más documentos que una sola forma',
    )

    // El df declarado es la unión, sin contar dos veces los documentos que
    // coinciden por las dos formas.
    for (const termino of reduccion.kept) {
      assert.ok(termino.df >= reducedDf(index, termino.term), 'el df no puede encoger')
      assert.ok(termino.forms.length >= 1 && termino.forms.includes(termino.term))
    }
  })
})
