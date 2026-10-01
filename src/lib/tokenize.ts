/**
 * PRIMITIVOS DE TEXTO
 * ===================
 *
 * Todo lo que convierte texto crudo —un nombre del catálogo o lo que escribe el
 * usuario— en las piezas con las que se construye y se consulta el índice.
 *
 * `normalize` y `splitSegments` son las del buscador original, sin un solo
 * cambio: el resto del sistema se construye encima, no en su lugar.
 */

/**
 * Lleva un texto a su forma canónica para poder compararlo.
 *
 *   "Mr. Mime"   -> "mrmime"
 *   "Farfetch'd" -> "farfetchd"
 *   "  CHAR  "   -> "char"
 *
 * Quitar acentos y signos hace que el usuario no tenga que acertar la puntuación
 * exacta con la que PokeAPI escribe cada nombre.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD') // separa la letra de su acento: "é" pasa a ser "e" + tilde suelta
    .replace(/[^a-z0-9]/g, '') // borra tildes sueltas, guiones, puntos, espacios y apóstrofos
}

/**
 * Parte el nombre por sus guiones y normaliza cada trozo.
 *
 *   "mr-mime" -> ["mr", "mime"]
 *
 * Sirve para el nivel WORD_PREFIX: buscar "mime" debe encontrar "mr-mime" antes
 * que un nombre donde "mime" cae en medio de una palabra.
 */
export function splitSegments(name: string): string[] {
  return name
    .split('-')
    .map(normalize)
    .filter((segment) => segment.length > 0)
}

/**
 * Parte un texto en palabras y normaliza cada una.
 *
 *   "Mr. Mime"     -> ["mr", "mime"]
 *   "Código Cero"  -> ["codigo", "cero"]
 *
 * Hace falta porque `normalize` borra los espacios, así que por sí sola convierte
 * "mr mime" en un único token "mrmime" y no hay forma de exigir que ambas
 * palabras aparezcan. Aquí se separa PRIMERO y se normaliza después.
 *
 * Es un refinamiento estricto, no un reemplazo: se cumple siempre que
 * `tokenize(s).join('') === normalize(s)`, y las pruebas lo verifican. Así nada
 * de lo que el buscador original documentaba queda contradicho.
 */
export function tokenize(raw: string): string[] {
  const out: string[] = []
  // La clase incluye la puntuación tipográfica —guion largo, comillas curvas,
  // puntos suspensivos— porque un texto pegado de un procesador o de la web la
  // trae, y sin ella "fuego—dragon" se convertiría en un solo token "fuegodragon".
  // Añadirlas no rompe la invariante de abajo: `normalize` ya las borraba.
  for (const part of raw.split(/[\s\-_.,;:/\\()[\]{}'"¡!¿?&+*%#@=|~<>«»…“”‘’–—]+/)) {
    const token = normalize(part)
    if (token.length > 0) out.push(token)
  }
  return out
}

/**
 * Los n-gramas de longitud exacta `n`, sin repetir.
 *
 *   grams("charmander", 3) -> ["cha","har","arm","rma","man","and","nde","der"]
 *
 * Deliberadamente SIN relleno en los bordes. Sin relleno se cumple una propiedad
 * que el buscador aprovecha: para una consulta de longitud <= n, la lista de
 * documentos de ese grama es *exactamente* la de los que contienen esa subcadena,
 * sin necesidad de verificar nada. Con relleno esa equivalencia se rompe.
 */
export function grams(text: string, n: number): string[] {
  if (text.length < n) return []
  const seen = new Set<string>()
  for (let i = 0; i + n <= text.length; i += 1) seen.add(text.slice(i, i + n))
  return [...seen]
}

/**
 * La cadena que cierra por arriba el rango de un prefijo.
 *
 *   prefixUpperBound("char") -> "chas"
 *
 * Con ella, un prefijo se resuelve con DOS búsquedas binarias sobre el
 * diccionario ordenado: todo lo que cae entre `lowerBound(p)` y
 * `lowerBound(prefixUpperBound(p))` empieza por `p`, demostrablemente, sin
 * comparar ni una cadena más.
 *
 * Se incrementa el último carácter en lugar de añadir `￿`, que solo funciona
 * por accidente. Todos los términos son `[a-z0-9]`, así que el incremento nunca
 * produce un par de suplentes ni se sale del rango.
 */
export function prefixUpperBound(prefix: string): string {
  if (prefix.length === 0) throw new Error('prefixUpperBound no acepta cadena vacía')
  const last = prefix.charCodeAt(prefix.length - 1)
  return prefix.slice(0, -1) + String.fromCharCode(last + 1)
}
