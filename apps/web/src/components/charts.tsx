// Small custom SVG charts — no chart library (CONTRACT.md).
// Narrow screens: the SVG keeps a 520px floor and scrolls inside its card
// instead of crushing 12px labels to ~6px at 390px.
export function BarChart({ data, height = 180 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const w = 560
  const bw = w / data.length
  return (
    <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full min-w-[520px]" role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 30)
        return (
          <g key={d.label}>
            <rect x={i * bw + 8} y={height - 24 - h} width={bw - 16} height={h} rx={4} fill="#D97706" />
            <text x={i * bw + bw / 2} y={height - 8} textAnchor="middle" fontSize="12" fill="#64748b">{d.label}</text>
            <text x={i * bw + bw / 2} y={height - 30 - h} textAnchor="middle" fontSize="12" fill="#070D1A">{d.value}</text>
          </g>
        )
      })}
    </svg>
    </div>
  )
}

export function LineChart({ data, height = 180 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const w = 560
  const pts = data.map((d, i) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * (w - 20) + 10
    const y = height - 30 - (d.value / max) * (height - 50)
    return { x, y, label: d.label, value: d.value }
  })
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  return (
    <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full min-w-[520px]" role="img" aria-label="Line chart">
      <path d={path} fill="none" stroke="#D97706" strokeWidth="2.5" />
      {pts.map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="4" fill="#070D1A" />
          <text x={p.x} y={height - 8} textAnchor="middle" fontSize="12" fill="#64748b">{p.label}</text>
          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="12" fill="#070D1A">{p.value}</text>
        </g>
      ))}
    </svg>
    </div>
  )
}
