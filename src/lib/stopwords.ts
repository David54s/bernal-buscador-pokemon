/**
 * PALABRAS VACÍAS
 * ===============
 *
 * Palabras funcionales —artículos, preposiciones, conjunciones, auxiliares— que
 * aparecen en casi cualquier frase y no dicen nada sobre qué se busca.
 *
 * Por qué hace falta una lista además del IDF
 * -------------------------------------------
 * El IDF mide lo informativo que es un término por lo raro que sea en el corpus.
 * La teoría dice que eso basta para hundir las palabras funcionales, porque en
 * un texto cualquiera aparecen por todas partes. La pregunta es si basta AQUÍ.
 *
 * El proyecto tiene la respuesta medida, y cambia según qué se indexe:
 *
 *   término    solo identidad          con las descripciones
 *              (nombres, categorías)   (entradas de Pokédex)
 *   "de"         df 2   idf 6,52         df 1094  idf 0,21
 *   "y"          df 3   idf 6,11         df  657  idf 0,72
 *   "llama"      df 9   idf 5,01         df   21  idf 4,16
 *
 * Indexando solo nombres y categorías, "de" salía del nombre de dos categorías
 * ("Pokémon Lirio DE Mar", "Pokémon Erizo DE Mar") e "y" de tres formas mega.
 * Eran tan raros que el IDF los coronaba: dos preposiciones por delante de una
 * categoría real. Al añadir texto corrido eso se corrige solo y se desploman.
 *
 * La conclusión NO es que la lista sobre. Es que **una colección pequeña miente
 * sobre el IDF**, y aquí se puede medir cuánto miente.
 *
 * Y la lista sigue haciendo falta, ahora por una razón más firme: incluso con el
 * corpus completo quedan **81 palabras funcionales de tres letras o más cuyo IDF
 * supera al de "llama"**, porque en una entrada de Pokédex casi nunca hace falta
 * escribir "fueron", "aquellas", "habia" o "porque".
 *
 *   "fueron"    df  1   idf 7,2        "porque"   df 12   idf 4,7
 *   "eran"      df  5   idf 5,6        "entonces" df  3   idf 6,1
 *
 * Ninguna de ellas cae por la regla de longitud, y el IDF las premia. Solo las
 * detiene el conocimiento lingüístico: "fueron" es un verbo auxiliar, da igual
 * cuántas veces aparezca.
 *
 * Alcance
 * -------
 * Esta lista se aplica SOLO al reducir una consulta larga. El índice no se toca y
 * las rutas de búsqueda normales siguen viendo todas las palabras, así que buscar
 * "charizard mega y" o "lirio de mar" sigue funcionando exactamente igual.
 */

/**
 * Español. Incluye las formas verbales auxiliares más frecuentes (ser, estar,
 * haber, tener) porque una descripción las usa constantemente: "es un Pokémon
 * que tiene una llama".
 */
const ES = `
a al algo algun alguna algunas alguno algunos ante antes aquel aquella aquellas
aquello aquellos aqui asi aun aunque cada casi como con contra cual cuales cuando
cuanto de del demas desde donde dos el ella ellas ello ellos en encima entonces
entre era eran eras eres es esa esas ese eso esos esta estaba estan estar estas
este esto estos fue fuera fueron ha habia han hasta hay he hemos incluso la las
le les lo los mas me mi mientras mis misma mismo mucha mucho muy nada ni no nos
nosotros nuestra nuestro o os otra otras otro otros para pero poco por porque
que quien quienes se segun ser si sido sin sobre son soy su sus tal
tambien tampoco tan tanto te tenemos tener tengo tiene tienen toda todas todo
todos tras tu tus un una unas uno unos usted ustedes va vamos van varias varios
ver vez y ya yo
`

/**
 * Inglés. La búsqueda empareja siempre en los dos idiomas, así que la reducción
 * también tiene que entender descripciones en inglés.
 *
 * Ese bilingüismo obliga a descartar dos candidatas del español: "sea"
 * (subjuntivo de ser) y "solo" son a la vez palabras con contenido en inglés, y
 * "sea" alcanza 17 documentos del corpus —Seel, Dewgong, Lileep...—. Perder eso
 * pesa más que filtrar un subjuntivo poco frecuente, así que se quedan fuera de
 * la lista.
 */
const EN = `
a about above after again against all am an and any are as at be because been
before being below between both but by can cannot could did do does doing down
during each few for from further had has have having he her here hers herself
him himself his how i if in into is it its itself just me more most my myself no
nor not of off on once only or other ought our ours ourselves out over own same
she should so some such than that the their theirs them themselves then there
these they this those through to too under until up very was we were what when
where which while who whom why with would you your yours yourself yourselves
`

/**
 * Palabras que enmarcan una descripción sin describir nada.
 *
 * No son palabras funcionales en el sentido gramatical —"puede", "parece" y
 * "will" son verbos de pleno derecho— pero en una consulta hablan DE la búsqueda
 * en vez de hablar del Pokémon. Quien escribe "un Pokémon de TIPO fuego que
 * PARECE un lagarto" no está pidiendo Pokémon relacionados con tipos ni con
 * parecidos.
 *
 * Que estorban está medido: sin esta lista, "tipo" (idf 5,0) y "parece" (4,7)
 * salían como los DOS términos más informativos de esa consulta, por delante de
 * "llama" y "fuego", y ocupaban dos de los seis huecos disponibles.
 *
 * Dos exclusiones deliberadas, por si se tiene la tentación de añadirlas:
 *
 *   - "gran" NO entra: aquí es categoría de verdad, en "Pokémon Gran Cuello",
 *     "Gran Cuerno" y "Gran Ratón".
 *   - "sea" y "solo" siguen fuera por lo mismo de siempre, y ahora con más
 *     razón: con las descripciones indexadas, "sea" alcanza 38 documentos como
 *     palabra inglesa.
 *
 * Dos que sí entran aun colisionando, porque el sentido dominante es el
 * funcional: "will" es el auxiliar de futuro en 158 descripciones y también la
 * categoría de Cobalion ("Iron Will Pokémon"), y "type" aparece en Type: Null.
 * Ninguna de las dos se pierde de verdad, porque esta lista solo actúa al
 * reducir, y reducir solo ocurre cuando la búsqueda normal no encontró NADA:
 * escribir "type null" o "iron will" sigue resolviéndose por la ruta de siempre.
 */
const DESCRIPTIVAS = `
capaz cualquier dice hace hacen hacer lleva llevan parece parecen posee poseen
puede pueden siempre suele suelen tipo veces pokemon
able also always around away even get gets known like make makes many may might
must one said say says seem seems though type use used uses using will
`

function build(...listas: string[]): ReadonlySet<string> {
  const out = new Set<string>()
  for (const lista of listas) {
    for (const palabra of lista.trim().split(/\s+/)) {
      if (palabra.length > 0) out.add(palabra)
    }
  }
  return out
}

/**
 * Las palabras ya están escritas sin acentos porque se comparan contra tokens que
 * pasaron por `normalize()`, que los elimina: "según" llega como "segun".
 */
export const STOPWORDS: ReadonlySet<string> = build(ES, EN, DESCRIPTIVAS)

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token)
}
