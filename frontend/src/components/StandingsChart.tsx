import { useMemo, useState } from 'react'
import { oidString, type ScoresResponse, type Team } from '../api'

const COLORS = [
  '#34d399', '#f472b6', '#60a5fa', '#fbbf24', '#a78bfa',
  '#fb923c', '#2dd4bf', '#f87171', '#818cf8', '#4ade80',
  '#e879f9', '#38bdf8', '#facc15', '#c084fc', '#fb7185',
  '#22d3ee',
]

type Point = { week: number; value: number }
type Series = { teamId: string; name: string; color: string; points: Point[] }

export function StandingsChart({
  teams,
  scores,
  walletRef,
}: {
  teams: Team[]
  scores: ScoresResponse | null
  walletRef: React.RefObject<string | null>
}) {
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null)

  const series = useMemo<Series[]>(() => {
    if (!scores || scores.weeks.length === 0 || teams.length === 0) return []

    const sorted = [...teams].sort((a, b) =>
      (oidString(a._id) ?? '').localeCompare(oidString(b._id) ?? ''),
    )

    return sorted.map((t, i) => {
      const tid = oidString(t._id) ?? ''
      let cumulative = 0
      const pts: Point[] = [{ week: 0, value: 0 }]

      for (let w = 0; w < scores.weeks.length; w++) {
        const board = scores.weeks[w]
        const weekPts =
          board.team_totals.find((tt) => oidString(tt.team_id) === tid)
            ?.points ?? 0
        cumulative += weekPts
        pts.push({ week: w + 1, value: cumulative })
      }

      return {
        teamId: tid,
        name: t.name,
        color: COLORS[i % COLORS.length],
        points: pts,
      }
    })
  }, [teams, scores])

  if (series.length === 0 || !scores || scores.weeks.length === 0) return null

  const totalWeeks = scores.weeks.length
  const allValues = series.flatMap((s) => s.points.map((p) => p.value))
  const minVal = Math.min(0, ...allValues)
  const maxVal = Math.max(0, ...allValues)
  const range = maxVal - minVal || 1

  const W = 600
  const H = 280
  const PAD = { top: 20, right: 20, bottom: 32, left: 52 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const x = (week: number) => PAD.left + (week / totalWeeks) * chartW
  const y = (val: number) => PAD.top + chartH - ((val - minVal) / range) * chartH

  const gridLines = 5
  const gridValues = Array.from({ length: gridLines + 1 }, (_, i) =>
    minVal + (range * i) / gridLines,
  )

  const hoveredData = hoveredWeek !== null
    ? series.map((s) => ({
        name: s.name,
        color: s.color,
        value: s.points.find((p) => p.week === hoveredWeek)?.value ?? 0,
      })).sort((a, b) => b.value - a.value)
    : null

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[400px]"
          onMouseLeave={() => setHoveredWeek(null)}
        >
          {/* Grid lines */}
          {gridValues.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                y1={y(v)}
                x2={W - PAD.right}
                y2={y(v)}
                stroke="rgb(51,65,85)"
                strokeWidth={0.5}
                strokeDasharray={v === 0 ? 'none' : '3,3'}
              />
              <text
                x={PAD.left - 6}
                y={y(v) + 3.5}
                textAnchor="end"
                className="fill-slate-500"
                fontSize={9}
              >
                {v.toFixed(1)}
              </text>
            </g>
          ))}

          {/* X axis labels */}
          {Array.from({ length: totalWeeks + 1 }, (_, i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-slate-500"
              fontSize={9}
            >
              {i === 0 ? '' : `W${i}`}
            </text>
          ))}

          {/* Lines */}
          {series.map((s) => (
            <polyline
              key={s.teamId}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={hoveredWeek !== null ? 0.5 : 0.85}
              points={s.points.map((p) => `${x(p.week)},${y(p.value)}`).join(' ')}
            />
          ))}

          {/* Dots on latest week or hovered week */}
          {series.map((s) => {
            const wk = hoveredWeek ?? totalWeeks
            const pt = s.points.find((p) => p.week === wk)
            if (!pt) return null
            return (
              <circle
                key={s.teamId}
                cx={x(pt.week)}
                cy={y(pt.value)}
                r={3.5}
                fill={s.color}
                stroke="rgb(15,23,42)"
                strokeWidth={1.5}
              />
            )
          })}

          {/* Hover zones per week */}
          {Array.from({ length: totalWeeks + 1 }, (_, i) => (
            <rect
              key={i}
              x={x(i) - chartW / totalWeeks / 2}
              y={PAD.top}
              width={chartW / totalWeeks}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHoveredWeek(i)}
            />
          ))}

          {/* Hover vertical line */}
          {hoveredWeek !== null && (
            <line
              x1={x(hoveredWeek)}
              y1={PAD.top}
              x2={x(hoveredWeek)}
              y2={PAD.top + chartH}
              stroke="rgb(100,116,139)"
              strokeWidth={0.5}
              strokeDasharray="3,3"
            />
          )}
        </svg>
      </div>

      {/* Legend + hover tooltip */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1">
        {(hoveredData ?? series.map((s) => ({
          name: s.name,
          color: s.color,
          value: s.points[s.points.length - 1]?.value ?? 0,
        })).sort((a, b) => b.value - a.value)).map((item) => {
          const isMe = teams.find((t) => t.name === item.name)?.owner_wallet === walletRef.current
          return (
            <div key={item.name} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className={`truncate max-w-[8rem] ${isMe ? 'text-white font-semibold' : 'text-slate-400'}`}>
                {item.name}
              </span>
              <span className="text-slate-500 tabular-nums">
                {item.value >= 0 ? '+' : ''}{item.value.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
