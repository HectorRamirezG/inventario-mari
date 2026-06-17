import { useMemo } from "react"

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  stroke?: string
  fill?: string
  strokeWidth?: number
  className?: string
  showDot?: boolean
}

/**
 * Mini gráfica SVG (sin librerías) para KPI cards y resúmenes.
 * Datos crudos -> línea suavizada + área degradada.
 * Si todos los valores son iguales, dibuja línea recta al centro.
 */
export default function Sparkline({
  data,
  width = 80,
  height = 28,
  stroke = "currentColor",
  fill,
  strokeWidth = 1.5,
  className,
  showDot = true,
}: SparklineProps) {
  const { path, areaPath, lastX, lastY, valid } = useMemo(() => {
    const pts = (data || []).filter((n) => Number.isFinite(n))
    if (pts.length < 2) {
      return { path: "", areaPath: "", lastX: 0, lastY: 0, valid: false }
    }
    const min = Math.min(...pts)
    const max = Math.max(...pts)
    const range = max - min || 1
    const stepX = width / (pts.length - 1)
    const padY = strokeWidth + 1

    const coords = pts.map((v, i) => {
      const x = i * stepX
      const y = height - padY - ((v - min) / range) * (height - padY * 2)
      return [x, y] as const
    })

    // Path con curvas Bezier suaves (Catmull-Rom -> Bezier simplificado)
    let d = `M ${coords[0][0]} ${coords[0][1]}`
    for (let i = 1; i < coords.length; i++) {
      const [x1, y1] = coords[i - 1]
      const [x2, y2] = coords[i]
      const cx = (x1 + x2) / 2
      d += ` Q ${cx} ${y1}, ${cx} ${(y1 + y2) / 2} T ${x2} ${y2}`
    }

    const area = `${d} L ${coords[coords.length - 1][0]} ${height} L 0 ${height} Z`
    return {
      path: d,
      areaPath: area,
      lastX: coords[coords.length - 1][0],
      lastY: coords[coords.length - 1][1],
      valid: true,
    }
  }, [data, width, height, strokeWidth])

  if (!valid) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        style={{ width, height }}
        aria-hidden
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={stroke}
          strokeOpacity={0.25}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    )
  }

  const gradientId = `spark-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width, height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill || stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={fill || stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && (
        <circle
          cx={lastX}
          cy={lastY}
          r={strokeWidth + 0.6}
          fill={stroke}
        />
      )}
    </svg>
  )
}
