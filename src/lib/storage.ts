/**
 * EL ACCESO AL ALMACENAMIENTO
 * ===========================
 *
 * Un único sitio donde se habla con `localStorage`, y la regla de cómo se
 * nombran las claves de cada perfil.
 *
 * Por qué existe
 * --------------
 * Cada acceso tiene que ir envuelto en `try`/`catch`: `localStorage` **lanza**
 * en una ventana privada o con los datos de sitio bloqueados, y eso no debe
 * impedir que la página arranque. Ese envoltorio estaba copiado en tres módulos
 * —idioma, valoraciones, recorrido— y con los perfiles habrían sido seis.
 *
 * Y de paso rompe un ciclo. `ratings.ts` necesita `viewerKey` para saber de qué
 * perfil lee; sembrar un perfil necesita `storeRatings` para dejarle sus
 * valoraciones puestas. Si `viewerKey` viviera en `viewers.ts`, los dos módulos
 * se importarían mutuamente. Viviendo aquí, las dependencias van en una sola
 * dirección.
 */

/** El texto guardado en una clave, o `null` si no hay nada o no se puede leer. */
export function readKey(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    // Sin acceso al almacenamiento: se decide con lo que haya por defecto.
    return null
  }
}

export function writeKey(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // Si no se puede guardar, el valor vale para esta sesión y ya está.
  }
}

export function removeKey(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    // Nada que hacer: si no se puede escribir, tampoco se puede borrar.
  }
}

/**
 * Lo guardado en una clave, interpretado como JSON.
 *
 * Devuelve `null` también cuando el JSON es ilegible, y a propósito no
 * distingue ese caso de «no había nada»: quien llama tiene que validar la
 * forma de todos modos, porque el valor puede venir de otra versión del
 * programa, de otra pestaña o editado a mano.
 */
export function readJson(key: string): unknown {
  const raw = readKey(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeKey(key, JSON.stringify(value))
  } catch {
    // Un valor que no se puede serializar (un ciclo) no debe tirar la página.
  }
}

/* --- Claves por perfil ------------------------------------------------------ */

/**
 * La clave donde un perfil guarda una clase de dato: `tarea1-buscador:ratings:a3f1`.
 *
 * El id va de SUFIJO y no de prefijo para que las claves de un mismo tipo queden
 * juntas al mirar el almacenamiento del navegador, que es cuando esto se mira.
 */
export function viewerKey(base: string, viewerId: string): string {
  return `${base}:${viewerId}`
}
