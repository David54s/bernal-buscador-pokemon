import type { ReactNode } from 'react'

/**
 * Una gráfica en escala logarítmica, dibujada a mano con SVG.
 *
 * Sin librería de gráficas a propósito: el proyecto depende solo de React y
 * React-DOM, y una curva con dos series y unos ejes no justifica traer cien
 * kilobytes de dependencia.
 *
 * Escala logarítmica en los dos ejes porque las dos leyes que dibuja son
 * potencias, y una potencia es una RECTA en log-log. Esa es justamente la
 * comprobación visual que interesa: si los puntos se alinean, la ley se cumple.
 *
 * El SVG usa `currentColor` y las variables de color del tema, de modo que
 * funciona igual en claro y en oscuro sin duplicar nada.
 */

/** Un punto en coordenadas del mundo, antes de escalar. */
export interface Point {
  x: number
  y: number
}

interface LogChartProps {
  /** Los datos medidos. */
  points: readonly Point[]
  /** La recta ajustada por la ley, si se quiere superponer. */
  fit?: readonly Point[]
  /** Un punto destacado, como la predicción de Heaps. */
  highlight?: Point | undefined
  xLabel: string
  yLabel: string
  /** Descripción en palabras para quien no ve el dibujo. */
  description: string
  children?: ReactNode
}

/** Área de dibujo en unidades del viewBox. El SVG escala solo al ancho real. */
const W = 320
const H = 200
const PAD = { top: 10, right: 10, bottom: 26, left: 38 }

/** Potencias de diez entre dos valores, para las marcas de los ejes. */
function decades(min: number, max: number): number[] {
  const out: number[] = []
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e += 1) {
    const v = Math.pow(10, e)
    if (v >= min && v <= max) out.push(v)
  }
  return out
}

/** "1000" -> "1k", para que las marcas no se pisen. */
function short(v: number): string {
  if (v >= 1_000_000) return `${v / 1_000_000}M`
  if (v >= 1000) return `${v / 1000}k`
  return String(v)
}

export function LogChart({
  points,
  fit,
  highlight,
  xLabel,
  yLabel,
  description,
  children,
}: LogChartProps) {
  const todos = [...points, ...(fit ?? []), ...(highlight ? [highlight] : [])].filter(
    (p) => p.x > 0 && p.y > 0,
  )
  if (todos.length === 0) return null

  const xs = todos.map((p) => p.x)
  const ys = todos.map((p) => p.y)
  const x0 = Math.log10(Math.min(...xs))
  const x1 = Math.log10(Math.max(...xs))
  const y0 = Math.log10(Math.min(...ys))
  const y1 = Math.log10(Math.max(...ys))

  const ancho = W - PAD.left - PAD.right
  const alto = H - PAD.top - PAD.bottom

  const sx = (v: number): number =>
    PAD.left + (x1 === x0 ? ancho / 2 : ((Math.log10(v) - x0) / (x1 - x0)) * ancho)
  // El eje Y crece hacia arriba y el del SVG hacia abajo: de ahí la resta.
  const sy = (v: number): number =>
    PAD.top + alto - (y1 === y0 ? alto / 2 : ((Math.log10(v) - y0) / (y1 - y0)) * alto)

  const ruta = (ps: readonly Point[]): string =>
    ps
      .filter((p) => p.x > 0 && p.y > 0)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
      .join(' ')

  return (
    <figure className="chart">
      <svg
        aria-label={description}
        className="chart__svg"
        role="img"
        viewBox={`0 0 ${W} ${H}`}
      >
        {/* Rejilla: una línea por potencia de diez, que es lo que separa las
            marcas en una escala logarítmica. */}
        <g className="chart__grid">
          {decades(Math.pow(10, x0), Math.pow(10, x1)).map((v) => (
            <line key={`x${v}`} x1={sx(v)} x2={sx(v)} y1={PAD.top} y2={PAD.top + alto} />
          ))}
          {decades(Math.pow(10, y0), Math.pow(10, y1)).map((v) => (
            <line key={`y${v}`} x1={PAD.left} x2={PAD.left + ancho} y1={sy(v)} y2={sy(v)} />
          ))}
        </g>

        <g className="chart__axis">
          <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + alto} />
          <line
            x1={PAD.left}
            x2={PAD.left + ancho}
            y1={PAD.top + alto}
            y2={PAD.top + alto}
          />
        </g>

        <g className="chart__ticks">
          {decades(Math.pow(10, x0), Math.pow(10, x1)).map((v) => (
            <text key={`tx${v}`} textAnchor="middle" x={sx(v)} y={H - 14}>
              {short(v)}
            </text>
          ))}
          {decades(Math.pow(10, y0), Math.pow(10, y1)).map((v) => (
            <text key={`ty${v}`} textAnchor="end" x={PAD.left - 4} y={sy(v) + 3}>
              {short(v)}
            </text>
          ))}
        </g>

        {/* La recta de la ley va DEBAJO de los datos: lo que se juzga es si los
            datos la siguen, así que no debe taparlos. */}
        {fit && <path className="chart__fit" d={ruta(fit)} />}
        <path className="chart__data" d={ruta(points)} />

        {highlight && (
          <circle className="chart__highlight" cx={sx(highlight.x)} cy={sy(highlight.y)} r={3.5} />
        )}

        <text className="chart__label" textAnchor="end" x={W - PAD.right} y={H - 2}>
          {xLabel}
        </text>
        <text className="chart__label" textAnchor="start" x={2} y={PAD.top - 2}>
          {yLabel}
        </text>
      </svg>
      {children && <figcaption className="chart__caption">{children}</figcaption>}
    </figure>
  )
}
