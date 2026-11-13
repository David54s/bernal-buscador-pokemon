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

/* --- Vistas ----------------------------------------------------------------- */

/** Las dos pantallas de la aplicación. Objeto `as const`, no `enum`. */
export const VIEW = {
  SEARCH: 'search',
  STATS: 'stats',
  GRAPH: 'graph',
} as const

export type View = (typeof VIEW)[keyof typeof VIEW]

/* --- Estadísticas del corpus ----------------------------------------------- */

/**
 * Qué parte del corpus se analiza. Objeto `as const` en vez de `enum`: el
 * proyecto compila con `erasableSyntaxOnly`.
 *
 * La separación no es cosmética, es el experimento. Las dos leyes se enuncian
 * sobre lenguaje natural, y el corpus contiene además un vocabulario controlado
 * —nombres propios y categorías— que no lo es. Medirlos por separado permite
 * comprobar la diferencia en vez de darla por supuesta.
 */
export const SCOPE = {
  /** Las entradas de Pokédex: texto corrido escrito por una persona. */
  DESCRIPTION: 'descripcion',
  /** Nombres, categorías y tipos: vocabulario controlado. */
  IDENTITY: 'identidad',
  /** Los dos juntos. */
  ALL: 'todo',
} as const

export type Scope = (typeof SCOPE)[keyof typeof SCOPE]

/**
 * Qué fracción inicial de la curva de Heaps se descarta al ajustar.
 *
 * El arranque es mucho más empinado que el resto —con el corpus vacío, casi toda
 * palabra es nueva— y arrastra la regresión hacia arriba. La ley describe el
 * régimen asintótico, no el transitorio.
 *
 * El valor está medido. Ajustando con el 80 % del corpus y prediciendo el
 * vocabulario total:
 *
 *   ventana    β       predice   real     error
 *     0 %    0,685     13 670   12 322   +10,9 %
 *    10 %    0,523     13 122   12 322    +6,5 %
 *    20 %    0,492     12 822   12 322    +4,1 %
 *
 * A partir del 20 % la mejora se aplana, así que subirlo más solo tiraría datos.
 */
export const HEAPS_WARMUP = 0.2

/** Cuántos puntos se muestrean de la curva de Heaps para dibujarla y ajustarla. */
export const HEAPS_POINTS = 60

/**
 * Semilla del barajado de especies al construir la curva de Heaps.
 *
 * Hay que barajar: el corpus viene en orden de Pokédex, que agrupa a los Pokémon
 * por generación y por familia evolutiva, así que recorrerlo tal cual mediría el
 * orden de publicación de los juegos y no la ley. Y hay que fijar la semilla para
 * que dos ejecuciones den el mismo número, que es lo que permite afirmarlo en una
 * prueba.
 */
export const HEAPS_SEED = 7

/** Cuántos términos de la cabeza de la distribución se auditan contra la lista de vacías. */
export const ZIPF_AUDIT_HEAD = 50

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

/* --- Recomendaciones -------------------------------------------------------- */

export const RATINGS_STORAGE_KEY = 'tarea1-buscador:ratings'

/** Las dos valoraciones. Objeto `as const`, no `enum`. */
export const RATING = {
  LIKE: 1,
  DISLIKE: -1,
} as const

export type Rating = (typeof RATING)[keyof typeof RATING]

/**
 * Cuánto pesa cada faceta al describir un gusto.
 *
 * Los valores están medidos, no elegidos. La métrica es qué fracción de las seis
 * recomendaciones comparte el tipo primario del Pokémon que gustó, evaluada
 * sobre las 1025 especies (el azar da 5,6 %):
 *
 *   espacio de términos                      tipo    categoría
 *   tipo + generación + color + categoría    62,7 %    19,2 %
 *   sin color                                64,0 %    19,8 %
 *   sin generación                           66,9 %    19,5 %
 *   solo tipo + categoría                    71,7 %    19,7 %
 *
 * La generación es un accidente de cuándo salió el juego, no un parecido, y
 * arrastra la recomendación hacia Pokémon que solo comparten época. Pero
 * quitarlas del todo amontona el resultado en una sola categoría, así que se
 * quedan con un cuarto del peso: ahí no mandan y suben la variedad del 70 % al
 * 81 %, mientras la precisión con cinco valoraciones sube del 86 % al 89 %.
 */
export const RECOMMEND_WEIGHTS = {
  type: 1,
  genus: 1,
  generation: 0.25,
  color: 0.25,
} as const

/**
 * Cuánto resta lo rechazado frente a lo que gustó, la β de Rocchio.
 *
 * Por debajo de 1 a propósito: la literatura es consistente en que la
 * realimentación negativa es menos fiable que la positiva —saber qué NO quieres
 * acota mucho menos que saber qué sí—, así que pesa la mitad.
 */
export const ROCCHIO_BETA = 0.5

/** Cuántas recomendaciones se calculan. La fila enseña las que quepan. */
export const RECOMMEND_MAX = 20

/**
 * Cuánto pesa la FORMA —base, Mega, Gigamax, regional— al describir un gusto.
 *
 * Sin este término, una forma Mega y su base tienen un perfil casi idéntico
 * —`t10 t3 KFlame g1 c8` frente a `t10 t16 KFlame g1 c8`— y nada puede sesgar la
 * exploración hacia las Megas aunque se visiten una tras otra.
 *
 * Medido: tras pasar por tres formas Mega, de ocho sugerencias eran Mega
 * **cero** sin este término y **cinco** con él.
 */
export const RECOMMEND_WEIGHT_FORM = 1

/**
 * Cuánto pesa el recorrido ya andado frente al Pokémon en el que se está.
 *
 * Medio: el nodo actual manda, pero lo visitado inclina las sugerencias. Es lo
 * que hace que explorar Megas lleve a más Megas.
 */
export const EXPLORE_TRAIL_WEIGHT = 0.5

/**
 * Cuánto pesa la relevancia frente a la variedad al elegir las sugerencias.
 *
 * Con 1 se ordena solo por parecido y la lista se amontona: para Charizard
 * —Fuego y Volador— salían ocho Pokémon de solo **3 tipos distintos**. Bajarlo
 * reparte, pero demasiado lo descarrila.
 *
 *   λ     tipos distintos   primeros resultados
 *   1,0         3           Moltres, Charmeleon, Flareon, Infernape
 *   0,8         5           Moltres, Charmeleon, Infernape, Flareon, Oricorio
 *   0,6         7           Moltres, Infernape, Oricorio, Clefable (Mega), … Krabby
 *   0,5         8           Moltres, Infernape, Tornadus, Groudon, … Vivillon
 *
 * En 0,8 se gana variedad sin perder a los que de verdad se parecen; por debajo
 * empiezan a colarse Pokémon que no vienen a cuento.
 */
export const EXPLORE_DIVERSITY = 0.8

/**
 * Las descripciones NO entran en el perfil, y conviene dejar escrito por qué,
 * porque la tentación de añadirlas es grande: son 12 322 términos frente a 752.
 *
 * Medido: incluirlas al mismo peso hunde la precisión de tipo del 61 % al 44 %.
 * Es el reverso del hallazgo de las leyes del corpus —el texto corrido cumple
 * Zipf y el vocabulario controlado no—: para describir el lenguaje manda el
 * texto, y para recomendar mandan los metadatos.
 */

/* --- Recorrido del grafo ---------------------------------------------------- */

export const TRAIL_STORAGE_KEY = 'tarea1-buscador:trail'

/**
 * Cuántos Pokémon guarda el recorrido antes de descartar los más antiguos.
 *
 * Cuarenta caben de sobra en una tira que se desplaza y cubren una exploración
 * larga: en un paseo medido de 25 saltos se visitaron 18 Pokémon distintos.
 */
export const TRAIL_MAX = 40

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
