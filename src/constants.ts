/* --- Índice ---------------------------------------------------------------- */

/**
 * El índice pre-construido. Vive en `public/` y no en `src/` a propósito: así
 * llega por `fetch` (en streaming, cacheado por el navegador, reutilizando el
 * estado de carga y reintento que ya existía) en vez de incrustarse en el
 * bundle y parsearse antes del primer pintado.
 *
 * El nombre lleva versión porque `public/` no recibe hash de contenido.
 */
export const CORPUS_URL = '/data/pokedex.v1.json'

/** Se regenera con `npm run corpus`. Solo lo usa el script de construcción. */
export const API_BASE = 'https://pokeapi.co/api/v2'

/* --- Sprites --------------------------------------------------------------- */

/**
 * Los sprites se derivan del id, sin pedir nada a la API. El corpus ya registra
 * qué variante existe para cada Pokémon (campo `a`), así que no hace falta
 * `onError` ni una capa de detalle en el navegador.
 */
export const SPRITE_ART_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'
export const SPRITE_CLASSIC_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

/* --- Paginación y filas ---------------------------------------------------- */

/** Tarjetas por página en la cuadrícula plana (y cuántas añade "Cargar más"). */
export const PAGE_SIZE = 24

/** Tope de tarjetas por fila horizontal; el resto queda tras "ver las N restantes". */
export const ROW_PAGE_SIZE = 20

/** Filas visibles al principio, y cuántas añade "mostrar más grupos". */
export const MAX_ROWS_INITIAL = 6
export const ROWS_STEP = 6

/* --- Búsqueda -------------------------------------------------------------- */

/**
 * A partir de este id, PokeAPI deja de listar especies base y empieza a listar
 * formas alternas (charizard-mega-x, mr-mime-galar, ...). Se usa como criterio
 * de desempate para que las formas no tapen a los Pokémon "de verdad".
 */
export const ALT_FORM_ID_THRESHOLD = 10000

/**
 * Longitud mínima para intentar coincidencia aproximada. Por debajo de 4, una
 * distancia de edición de 1 abarca media lista y el resultado es ruido.
 */
export const FUZZY_MIN_LEN = 4

/** Distancia de edición máxima aceptada. Nunca más de 2. */
export const FUZZY_MAX_DIST = 2

/** Similitud de trigramas mínima para que un término sea candidato a corrección. */
export const JACCARD_MIN = 0.3

/** Cuántos candidatos de corrección se verifican con distancia de edición. */
export const FUZZY_CANDIDATES = 50

/* --- Reducción de la consulta ---------------------------------------------- */

/**
 * A partir de cuántas palabras se intenta reducir.
 *
 * Estuvo en cuatro, con el argumento de que con tres o menos se trata de nombres
 * reales del catálogo —"pikachu rock star", "charizard mega x"— y no hay nada
 * que reducir. El argumento era correcto pero la protección sobraba: la
 * reducción solo se ejecuta cuando la búsqueda normal ha devuelto CERO
 * resultados, y esos nombres devuelven resultados. Nunca llegaban aquí.
 *
 * Lo que sí hacía el umbral era descartar descripciones legítimas de dos
 * palabras, que es como se describe de verdad: "rata amarilla", "tortuga de
 * agua", "dragón de fuego". Baja a dos, que es el mínimo para que haya algo que
 * combinar; con una sola palabra la búsqueda normal ya la ha intentado.
 */
export const REDUCE_MIN_TOKENS = 2

/** Con un solo término la búsqueda normal ya lo cubre; no merece un modo aparte. */
export const REDUCE_MIN_TERMS = 2

/**
 * Cuántos términos se conservan. Los textos de prueba dejan entre dos y tres tras
 * filtrar, así que seis da margen sin empezar a admitir ruido.
 */
export const REDUCE_KEEP = 6

/** Por debajo de tres letras son fragmentos sin valor discriminante. */
export const REDUCE_MIN_LEN = 3

/**
 * Tope de palabras que se procesan de un texto pegado.
 *
 * No es arbitrario: el contador de coincidencias por documento es un
 * `Uint8Array`, que da la vuelta a las 256. Cortar en 200 deja margen y evita que
 * un texto largo produzca resultados sin sentido.
 */
export const REDUCE_MAX_TOKENS = 200

/**
 * Cuánto más pesa un término que coincide por IDENTIDAD —nombre, tipo,
 * generación, categoría— que uno que solo coincide por la entrada de Pokédex.
 *
 * Hace falta porque las dos vías no son igual de fiables. Que un Pokémon SE
 * LLAME así o SEA de ese tipo es un hecho; que su descripción mencione una
 * palabra es una pista. Sin distinguirlas, describir a Pikachu lo dejaba por
 * detrás de Pichu y Pachirisu, que mencionaban "mejillas" de pasada.
 *
 * El valor está medido, no elegido: el efecto satura en 1,5. Con 2 y con 3 el
 * orden de los resultados es exactamente el mismo, así que subirlo más sería un
 * número sin consecuencia.
 */
export const REDUCE_IDENTITY_BOOST = 1.5

/**
 * Tope de documentos que devuelve una consulta reducida.
 *
 * Es el segundo de dos cortes, y el menos importante. El que de verdad recorta
 * es la regla de cobertura de `searchReduced`: si algún documento satisface más
 * de un término, los que satisfacen uno solo se descartan, y eso suele dejar la
 * respuesta en menos de diez.
 *
 * Éste es el seguro para cuando esa regla no puede actuar —ningún documento
 * llega a dos términos— y evita devolver medio catálogo ordenado por un único
 * término común.
 */
export const REDUCE_MAX_DOCS = 40

/* --- Agrupación ------------------------------------------------------------ */

/** Objeto `as const` en vez de `enum`: el proyecto compila con `erasableSyntaxOnly`. */
export const GROUP_BY = {
  NONE: 'none',
  TYPE: 'type',
  GENERATION: 'generation',
  RELEVANCE: 'relevance',
} as const

export type GroupBy = (typeof GROUP_BY)[keyof typeof GROUP_BY]

/* --- Idioma ---------------------------------------------------------------- */

export const LANG_STORAGE_KEY = 'tarea1-buscador:lang'

/* --- Colores --------------------------------------------------------------- */

/** Color de fondo de cada insignia de tipo. Las claves son los slugs de PokeAPI. */
export const TYPE_COLORS: Record<string, string> = {
  normal: '#9fa19f',
  fire: '#e8622a',
  water: '#2f80ed',
  electric: '#f2c53d',
  grass: '#42a85a',
  ice: '#4fc3d4',
  fighting: '#c0392b',
  poison: '#8e44ad',
  ground: '#c9932f',
  flying: '#7b90e6',
  psychic: '#e0568a',
  bug: '#88a824',
  rock: '#a08b46',
  ghost: '#6a5aa8',
  dragon: '#5f43d4',
  dark: '#57504a',
  steel: '#7f8f9e',
  fairy: '#e08bb6',
}

/** Color por defecto para un tipo que no esté en el mapa de arriba. */
export const FALLBACK_TYPE_COLOR = '#6b7280'

/** Un color por generación, para la etiqueta de generación. Índice = id. */
export const GENERATION_COLORS: readonly string[] = [
  '#6b7280', // 0, sin usar
  '#d94a3d', // I    Kanto
  '#d98324', // II   Johto
  '#3f9e5a', // III  Hoenn
  '#2f80c9', // IV   Sinnoh
  '#5a5f8f', // V    Teselia
  '#c2417a', // VI   Kalos
  '#e09020', // VII  Alola
  '#7a4fb5', // VIII Galar
  '#2f9e93', // IX   Paldea
]
