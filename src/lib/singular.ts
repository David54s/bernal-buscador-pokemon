/**
 * NORMALIZACIÓN DE LA CONSULTA
 * ============================
 *
 * Lleva una palabra a la forma con la que está escrito el catálogo: del plural
 * al singular y del femenino al masculino. "cabezas" encuentra lo que encuentra
 * "cabeza", y "amarilla" lo que encuentra "amarillo".
 *
 * El problema, medido
 * -------------------
 * El vocabulario del catálogo está escrito como lo escribió quien redactó las
 * entradas de Pokédex; la consulta la escribe una persona, y una persona
 * describe en plural. De catorce plurales españoles corrientes probados contra
 * este corpus, los catorce fallaban contra su singular:
 *
 *   electricos  ratones   llamas    tortugas   semillas   dragones  plantas
 *   fantasmas   hadas     rocas     psiquicos  voladores  cabezas   alas
 *
 * Y no es que el singular no exista: "cabezas" aparece en 5 documentos y
 * "cabeza" en 34, pero son conjuntos distintos y sin esto la consulta solo ve
 * uno de los dos.
 *
 * Por qué no se lematiza el índice
 * --------------------------------
 * Porque el índice está lleno de nombres propios y recortarlos los destroza:
 * medido sobre el vocabulario completo, un reductor de raíces lo encoge un 0,2 %
 * y a cambio fusiona `latias` con `latios` y `shell` con `shellos`. El problema
 * nunca estuvo en el índice.
 *
 * La regla, y por qué es segura
 * -----------------------------
 * Solo se prueba el singular **cuando la palabra original no existe en ningún
 * diccionario**. Si "latias" está en el catálogo, se usa "latias" y aquí no se
 * entra siquiera. Eso hace imposible por construcción que esto estropee un
 * nombre real: solo actúa donde hoy la respuesta es "no hay nada".
 *
 * Las reglas son de sufijo, no un lematizador completo. Cubren la formación
 * regular del plural en español y en inglés, que es lo que aparece en una
 * descripción escrita a mano.
 */

/** Por debajo de esto, quitar un sufijo deja un fragmento sin valor. */
const MIN_SINGULAR_LEN = 3

/**
 * Candidatos a singular de una palabra, del más probable al menos.
 *
 * Devuelve varios porque las reglas se solapan y no se puede saber cuál aplica
 * sin consultar el diccionario: "rocas" sale de "roca" quitando una "s", pero
 * "dragones" sale de "dragon" quitando "es". Quien llama prueba por orden y se
 * queda con el primero que exista.
 */
/**
 * El masculino de un adjetivo femenino: amarilla -> amarillo, morada -> morado.
 *
 * Es la regla MENOS segura de las dos, porque cambiando la última letra se puede
 * llegar a otra palabra distinta —"cuenta" y "cuento", "puerta" y "puerto"— y no
 * a otra forma de la misma. Por eso quien la usa la trata con más cautela que a
 * los plurales: ver `reduce.ts`.
 */
export function genderCandidates(token: string): string[] {
  if (!token.endsWith('a')) return []
  const masculino = `${token.slice(0, -1)}o`
  return masculino.length >= MIN_SINGULAR_LEN ? [masculino] : []
}

/**
 * El singular de un plural, por reglas de sufijo.
 *
 * Es flexión pura: "cabezas" y "cabeza" son la misma palabra, así que unir sus
 * listas nunca mezcla dos conceptos. De ahí que se pueda aplicar con menos
 * reparos que el género.
 */
export function pluralCandidates(token: string): string[] {
  const out: string[] = []
  const add = (candidate: string): void => {
    if (candidate.length >= MIN_SINGULAR_LEN && !out.includes(candidate)) out.push(candidate)
  }

  if (!token.endsWith('s')) return out

  // Inglés: berries -> berry. Va primero porque "-ies" es más específico que "-es".
  if (token.endsWith('ies')) add(`${token.slice(0, -3)}y`)

  // Español: voces -> voz, luces -> luz, raices -> raiz, narices -> nariz.
  // Va antes de "-es", que daría "voce" y no existe.
  if (token.endsWith('ces')) add(`${token.slice(0, -3)}z`)

  // Español: dragones -> dragon, flores -> flor.
  // Inglés: bushes -> bush, boxes -> box.
  if (token.endsWith('es')) add(token.slice(0, -2))

  // El caso general en los dos idiomas: rocas -> roca, wings -> wing.
  add(token.slice(0, -1))

  return out
}

/**
 * Todas las formas a probar cuando la palabra escrita NO existe en el catálogo,
 * de la más probable a la menos.
 *
 * Aquí se mezclan las dos reglas sin reparos: si la palabra no existe, no hay
 * nada que estropear, y encadenarlas cubre "amarillas" -> "amarilla" ->
 * "amarillo".
 */
export function singularCandidates(token: string): string[] {
  const out: string[] = []
  const add = (candidate: string): void => {
    if (!out.includes(candidate)) out.push(candidate)
  }

  for (const candidate of genderCandidates(token)) add(candidate)
  for (const candidate of pluralCandidates(token)) {
    add(candidate)
    for (const masculino of genderCandidates(candidate)) add(masculino)
  }
  return out
}
