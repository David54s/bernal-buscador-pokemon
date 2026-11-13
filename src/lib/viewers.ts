/**
 * LOS PERFILES: QUIÉN ESTÁ BUSCANDO
 * =================================
 *
 * Varias personas compartiendo la misma página, cada una con sus valoraciones
 * y, por tanto, con sus recomendaciones. Sin servidor: todo en `localStorage`.
 *
 * Una nota de vocabulario, porque aquí chocan dos sentidos de «perfil»
 * ------------------------------------------------------------------------
 * En `recommend.ts` la palabra *profile* ya está ocupada: `ProfileIndex`,
 * `buildProfile` y `ProfileTerm` son el **vector de Rocchio**, y ése es el
 * término de la bibliografía (Manning, *Introduction to Information Retrieval*,
 * §9.1.1, «user profile»). Renombrarlo para hacer sitio sería alejarse del libro
 * justo en la parte que se sostiene con él.
 *
 * Así que lo de aquí se llama `Viewer` —literalmente, quién está viendo— y en
 * pantalla se llama «Perfil», que es la palabra que el usuario espera. Dicho de
 * una vez:
 *
 *     un perfil de Netflix (Viewer) CONTIENE un perfil de usuario de IR
 *     (los términos que `buildProfile` saca de sus valoraciones)
 *
 * Qué separa un perfil de otro
 * ----------------------------
 *   valoraciones      `ratings.ts`      de aquí salen las recomendaciones
 *   recorrido         `trail.ts`        por dónde ha paseado en el grafo
 *   filtros y vista   `view-prefs.ts`   cómo mira el catálogo
 *
 * El idioma NO: es cómo se lee la página, no quién la usa.
 *
 * El avatar es un número de Pokédex
 * ---------------------------------
 * No una URL ni un emoji. La portada se pinta ANTES de que el corpus haya
 * terminado de cargar, así que no puede depender de `doc.spriteUrl`, que sale
 * del índice; con el número basta para construir la URL del sprite.
 */

import { ACTIVE_VIEWER_STORAGE_KEY, SPRITE_CLASSIC_BASE, VIEWERS_STORAGE_KEY } from '../constants.ts'
import { RATING } from '../constants.ts'
import type { Rating } from '../constants.ts'
import { readLegacyRatings, storeRatings } from './ratings.ts'
import { readLegacyTrail, storeTrail } from './trail.ts'
import { readJson, readKey, writeJson, writeKey } from './storage.ts'

export interface Viewer {
  id: string
  name: string
  /** Número de Pokédex del Pokémon que hace de retrato. */
  avatar: number
}

/** Tope de caracteres de un nombre. Más no cabe bajo una tarjeta. */
export const VIEWER_NAME_MAX = 16

/**
 * Los avatares que se ofrecen al crear un perfil: los nueve iniciales de tipo
 * fuego, agua y planta, uno por generación.
 *
 * Es una rejilla fija a propósito. Lo honesto sería dejar elegir entre los 1 025,
 * pero eso es un buscador dentro del buscador, y no es la función que se pedía.
 */
export const AVATAR_CHOICES: readonly number[] = [1, 4, 7, 25, 133, 143, 150, 384, 448]

/* --- Los perfiles de ejemplo ------------------------------------------------- */

interface SeedViewer {
  name: string
  avatar: number
  liked: readonly number[]
  disliked: readonly number[]
}

/**
 * Tres perfiles con gustos deliberadamente distintos, puestos al primer arranque.
 *
 * Están sembrados y no vacíos porque un perfil sin valoraciones no recomienda
 * nada: con la lista vacía habría que pulsar «me gusta» media docena de veces en
 * cada uno antes de que hubiera algo que comparar, y lo que esta función
 * demuestra es justamente que dos personas distintas ven cosas distintas.
 *
 * Medido sobre el corpus real, las tres listas de veinte recomendaciones son
 * DISJUNTAS: los tres pares comparten cero Pokémon. Lo fija una prueba.
 *
 * Cada uno lleva además un «no me gusta», para que el término negativo de
 * Rocchio (`ROCCHIO_BETA`) tenga algo que restar desde el primer momento. El de
 * Sara es Geodude, que siendo de tierra es inmune al eléctrico.
 */
const SEED_VIEWERS: readonly SeedViewer[] = [
  {
    name: 'Ana',
    avatar: 4,
    // Charmander, Flareon, Magmar, Growlithe
    liked: [4, 136, 126, 58],
    disliked: [7], // Squirtle
  },
  {
    name: 'Luis',
    avatar: 7,
    // Squirtle, Lapras, Vaporeon, Psyduck
    liked: [7, 131, 134, 54],
    disliked: [4], // Charmander
  },
  {
    name: 'Sara',
    avatar: 25,
    // Pikachu, Jolteon, Raichu, Electabuzz
    liked: [25, 135, 26, 125],
    disliked: [74], // Geodude
  },
]

/** El nombre del perfil al que se mudan los datos de antes de que hubiera perfiles. */
const MIGRATED_NAME = 'Mis gustos'

/* --- Identidad -------------------------------------------------------------- */

/**
 * Un id para un perfil nuevo.
 *
 * `crypto.randomUUID` cuando existe, y si no una cadena a partir del reloj y del
 * azar. El respaldo hace falta porque `randomUUID` solo está disponible en
 * contextos seguros: sirviendo la página por `http://` desde otra máquina de la
 * red —que es como se enseña una práctica— no existe.
 *
 * Lo único que se le pide es no repetirse, porque el id es lo que separa el
 * cajón de una persona del de otra.
 */
function newId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.()
    if (typeof uuid === 'string') return uuid.slice(0, 8)
  } catch {
    // Contexto no seguro: se usa el respaldo.
  }
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** Un nombre presentable: sin espacios de sobra, no vacío y acotado. */
function cleanName(name: string, fallback: string): string {
  const trimmed = name.trim().replace(/\s+/gu, ' ').slice(0, VIEWER_NAME_MAX)
  return trimmed.length > 0 ? trimmed : fallback
}

/* --- Lectura ---------------------------------------------------------------- */

/**
 * Un perfil válido, o `null`.
 *
 * Se valida campo por campo por lo mismo que en `ratings.ts`: el valor es JSON y
 * puede venir de otra versión del programa, de otra pestaña o editado a mano, y
 * un perfil corrupto no debe llevarse por delante a los demás.
 */
function parseViewer(value: unknown): Viewer | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<Record<keyof Viewer, unknown>>

  if (typeof raw.id !== 'string' || raw.id.length === 0) return null
  if (typeof raw.name !== 'string') return null

  const avatar =
    typeof raw.avatar === 'number' && Number.isInteger(raw.avatar) && raw.avatar > 0
      ? raw.avatar
      : AVATAR_CHOICES[0]!

  return { id: raw.id, name: cleanName(raw.name, 'Perfil'), avatar }
}

/** La lista guardada, sin ids repetidos. Vacía si no hay nada que valga. */
function parseViewers(parsed: unknown): Viewer[] {
  if (!Array.isArray(parsed)) return []
  const out: Viewer[] = []
  const seen = new Set<string>()
  for (const entry of parsed) {
    const viewer = parseViewer(entry)
    if (viewer === null || seen.has(viewer.id)) continue
    seen.add(viewer.id)
    out.push(viewer)
  }
  return out
}

/**
 * Los perfiles y cuál está activo, sembrando en el primer arranque.
 *
 * **La lista nunca vuelve vacía**, y eso es lo que hace de señal de «ya se
 * sembró»: como `removeViewer` se niega a borrar el último, que la clave exista
 * significa que el usuario tiene los perfiles que quiere tener. Sin esa garantía
 * habría que guardar una marca aparte, y borrar los tres de ejemplo los
 * resucitaría en la siguiente recarga.
 */
export function readViewers(): { viewers: Viewer[]; activeId: string } {
  const stored = parseViewers(readJson(VIEWERS_STORAGE_KEY))
  const viewers = stored.length > 0 ? stored : seedViewers()

  const storedActive = readKey(ACTIVE_VIEWER_STORAGE_KEY)
  const active = viewers.find((v) => v.id === storedActive) ?? viewers[0]!

  return { viewers, activeId: active.id }
}

/**
 * Crea los perfiles del primer arranque y les deja sus datos puestos.
 *
 * Antes de los de ejemplo va la **migración**: si en las claves sin sufijo hay
 * valoraciones o recorrido —de cuando la página no tenía perfiles—, se crea «Mis
 * gustos» con ellos y queda primero, así que es el activo por defecto. Es lo que
 * impide que al actualizar la página alguien pierda lo que llevaba valorado.
 *
 * Las claves viejas se leen y se dejan quietas. Borrarlas no ganaría nada y
 * cerraría la puerta a recuperarlas si la migración saliera mal.
 */
function seedViewers(): Viewer[] {
  const viewers: Viewer[] = []

  const legacyRatings = readLegacyRatings()
  const legacyTrail = readLegacyTrail()
  if (legacyRatings.size > 0 || legacyTrail.length > 0) {
    const mine: Viewer = { id: newId(), name: MIGRATED_NAME, avatar: AVATAR_CHOICES[0]! }
    storeRatings(mine.id, legacyRatings)
    storeTrail(mine.id, legacyTrail)
    viewers.push(mine)
  }

  for (const seed of SEED_VIEWERS) {
    const viewer: Viewer = { id: newId(), name: seed.name, avatar: seed.avatar }
    const ratings = new Map<number, Rating>()
    for (const pokeId of seed.liked) ratings.set(pokeId, RATING.LIKE)
    for (const pokeId of seed.disliked) ratings.set(pokeId, RATING.DISLIKE)
    storeRatings(viewer.id, ratings)
    viewers.push(viewer)
  }

  storeViewers(viewers)
  storeActiveId(viewers[0]!.id)
  return viewers
}

/* --- Escritura -------------------------------------------------------------- */

export function storeViewers(viewers: readonly Viewer[]): void {
  writeJson(VIEWERS_STORAGE_KEY, viewers)
}

export function storeActiveId(id: string): void {
  writeKey(ACTIVE_VIEWER_STORAGE_KEY, id)
}

/* --- Altas, cambios y bajas -------------------------------------------------- */

/**
 * Añade un perfil al final y devuelve la lista nueva junto con el que se creó,
 * porque quien llama necesita el id para activarlo.
 *
 * Los nombres repetidos se permiten. Lo que separa a dos perfiles es el id, no el
 * nombre, así que dos «Ana» conviven sin pisarse los datos —y prohibirlo sería
 * una regla que el usuario no entendería al teclear el nombre de su hermana—.
 */
export function addViewer(
  viewers: readonly Viewer[],
  name: string,
  avatar: number,
): { viewers: Viewer[]; created: Viewer } {
  const created: Viewer = {
    id: newId(),
    name: cleanName(name, `Perfil ${viewers.length + 1}`),
    avatar: AVATAR_CHOICES.includes(avatar) ? avatar : AVATAR_CHOICES[0]!,
  }
  return { viewers: [...viewers, created], created }
}

export function renameViewer(viewers: readonly Viewer[], id: string, name: string): Viewer[] {
  return viewers.map((v) => (v.id === id ? { ...v, name: cleanName(name, v.name) } : v))
}

/**
 * Quita un perfil, **salvo si es el último**.
 *
 * No es una comodidad: la lista no vacía es lo que distingue «el usuario ya
 * eligió sus perfiles» de «aún no se ha sembrado» (ver `readViewers`). Si se
 * pudiera quedar vacía, al recargar volverían Ana, Luis y Sara.
 *
 * Los datos del perfil borrado se quedan huérfanos en el almacenamiento. Es a
 * propósito: borrarlos requeriría `removeItem` sobre tres claves y no devuelve
 * nada —son unos cientos de bytes—, mientras que dejarlos permite recuperar un
 * borrado por error volviendo a crear el perfil... que no, que tendría otro id.
 * La razón de verdad es más simple: nada lee una clave cuyo perfil no existe.
 */
export function removeViewer(viewers: readonly Viewer[], id: string): Viewer[] {
  if (viewers.length <= 1) return [...viewers]
  const next = viewers.filter((v) => v.id !== id)
  return next.length > 0 ? next : [...viewers]
}

/* --- Presentación ----------------------------------------------------------- */

/**
 * La URL del retrato de un perfil.
 *
 * Usa el sprite clásico y no la ilustración oficial: a 64 píxeles la ilustración
 * se descargaría entera —cientos de kilobytes por tarjeta— para enseñarse del
 * tamaño de una uña. Es la misma fuente que ya usa `index-build.ts`.
 */
export function avatarUrl(pokeId: number): string {
  return `${SPRITE_CLASSIC_BASE}/${pokeId}.png`
}
