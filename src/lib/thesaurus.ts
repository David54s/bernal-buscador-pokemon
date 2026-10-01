/**
 * TESAURO DE LA CONSULTA
 * ======================
 *
 * Unas pocas palabras corrientes que el catálogo escribe de otra forma. Buscar
 * "rata amarilla" debería encontrar a Pikachu, y lo impide un detalle de
 * vocabulario: su categoría es "Pokémon Ratón", y "rata" no aparece en ninguna
 * parte del corpus.
 *
 * Es expansión de consulta con un tesauro manual, una técnica de Recuperación
 * de Información de toda la vida. Y conviene ser claro sobre lo que es: una
 * lista escrita a mano. No se deduce de nada, no se generaliza sola, y cada
 * entrada es una decisión. Por eso está medida y acotada.
 *
 * Por qué no se puede hacer automáticamente
 * -----------------------------------------
 * Se probaron las dos vías obvias y ninguna sirve, con datos:
 *
 *   - **Corrección de erratas.** El motor ya la tiene. Pero "rata" y "ratón"
 *     están a distancia de edición 2, y a esa distancia hay docenas de palabras
 *     más cercanas: pedirle candidatos a "rata" devuelve `bata, data, lata,
 *     mata, nata, pata` ANTES que `raton`. Corregir erratas sirve para quien
 *     escribe mal una palabra, no para quien escribe bien otra palabra.
 *
 *   - **Lematización.** "cabezas"→"cabeza" o "amarilla"→"amarillo" son flexión,
 *     y de eso se encarga `singular.ts` con reglas. Pero "-ón" en "ratón" es un
 *     sufijo DERIVATIVO —forma una palabra nueva— y ningún lematizador lo quita:
 *     ni el de Snowball para español. "rata" y "ratón" son dos palabras, no dos
 *     formas de una.
 *
 * Cuánto hacía falta
 * ------------------
 * Se comprobaron 85 palabras corrientes para describir un animal —en español y
 * en inglés— contra el corpus con las descripciones dentro: **74 ya estaban**.
 * El 87 % no necesita nada. Esta lista cubre el resto, y por eso es corta: si
 * hubiera que escribir cientos de entradas, la solución sería otra.
 *
 * La garantía
 * -----------
 * Igual que con los plurales: solo se consulta cuando la palabra original NO
 * existe en ningún diccionario. Nunca puede desviar una búsqueda que ya
 * funcionaba.
 */

/**
 * Palabra corriente → palabra con la que el catálogo la nombra.
 *
 * Cada entrada está verificada contra el corpus: la clave tiene df 0 y el valor
 * df mayor que 0. Si una regeneración del corpus cambiara eso, la prueba de
 * `smoke-test.ts` lo detecta.
 */
const SINONIMOS: Readonly<Record<string, string>> = {
  // "Pokémon Ratón" es la categoría de Rattata, Raticate, Pikachu y Raichu.
  // Nadie llama "ratón" a Rattata al describirlo.
  rata: 'raton',
  rat: 'mouse',

  // Sinónimos de diccionario que el catálogo simplemente no usa.
  pescado: 'pez',
  culebra: 'serpiente',
  sapo: 'rana',
  vaca: 'toro',
  spider: 'arana',

  // Diminutivos y aumentativos, que son derivación y no flexión: ningún
  // lematizador los resuelve.
  lagarto: 'lagartija',
  oso: 'osito',
}

/** La palabra del catálogo para un término corriente, si la hay. */
export function synonymFor(token: string): string | undefined {
  return SINONIMOS[token]
}

/** Los pares, para poder comprobarlos contra el corpus en las pruebas. */
export function synonymPairs(): [string, string][] {
  return Object.entries(SINONIMOS)
}
