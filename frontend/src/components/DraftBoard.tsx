import { useEffect, useMemo, useRef, useState } from 'react'
import type { DraftPick, DraftSession, Team } from '../api'
import { oidString } from '../api'

type Props = {
  draft: DraftSession
  teams: Team[]
  totalRounds: number
}

function teamIndex(pick0: number, n: number): number {
  const r = Math.floor(pick0 / n) + 1
  const k = pick0 % n
  return r % 2 === 1 ? k : n - 1 - k
}

export function DraftBoard({ draft, teams, totalRounds }: Props) {
  const order = useMemo(
    () => [...teams].sort((a, b) => a.draft_position - b.draft_position),
    [teams],
  )
  const n = order.length

  const pickMap = useMemo(() => {
    const m = new Map<string, DraftPick>()
    for (const p of draft.picks) {
      m.set(`${p.round}-${oidString(p.team_id)}`, p)
    }
    return m
  }, [draft.picks])

  const clockTeamId = oidString(draft.clock_team_id)

  const nextPickSlot = useMemo(() => {
    if (draft.status !== 'in_progress') return null
    const idx = draft.picks.length
    if (idx >= totalRounds * n) return null
    const round = Math.floor(idx / n) + 1
    const tIdx = teamIndex(idx, n)
    const teamId = oidString(order[tIdx]?._id)
    return teamId ? `${round}-${teamId}` : null
  }, [draft, order, n, totalRounds])

  const prevPickCount = useRef(draft.picks.length)
  const [latestKey, setLatestKey] = useState<string | null>(null)

  useEffect(() => {
    if (draft.picks.length > prevPickCount.current) {
      const latest = draft.picks[draft.picks.length - 1]
      const key = `${latest.round}-${oidString(latest.team_id)}`
      setLatestKey(key)
      const t = setTimeout(() => setLatestKey(null), 2000)
      prevPickCount.current = draft.picks.length
      return () => clearTimeout(t)
    }
    prevPickCount.current = draft.picks.length
  }, [draft.picks])

  if (n === 0) return null

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/50 bg-slate-900/60">
      <div
        className="draft-grid p-2"
        style={{ gridTemplateColumns: `3rem repeat(${n}, minmax(5.5rem, 1fr))` }}
      >
        <div className="draft-cell draft-cell-header text-[0.6rem]">RD</div>
        {order.map((t) => {
          const isOnClock = oidString(t._id) === clockTeamId
          return (
            <div
              key={oidString(t._id)}
              className={`draft-cell draft-cell-header text-[0.65rem] transition-colors ${
                isOnClock ? 'text-amber-300 bg-amber-900/20 border-amber-700/30' : ''
              }`}
              title={t.owner_wallet}
            >
              {t.name}
              {isOnClock && (
                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              )}
            </div>
          )
        })}

        {Array.from({ length: totalRounds }, (_, r) => {
          const round = r + 1
          return (
            <div key={round} className="contents">
              <div className="draft-cell draft-cell-round flex items-center justify-center">
                {round}
              </div>
              {order.map((t) => {
                const tid = oidString(t._id)!
                const key = `${round}-${tid}`
                const pick = pickMap.get(key)
                const isOnClock = key === nextPickSlot
                const isLatest = key === latestKey

                if (pick) {
                  return (
                    <div
                      key={key}
                      className={`draft-cell draft-cell-filled animate-pick-in ${isLatest ? 'animate-pick-land ring-1 ring-emerald-400/50' : ''}`}
                    >
                      <div className="font-bold text-[0.75rem] leading-tight">{pick.symbol}</div>
                      <div className="text-[0.55rem] text-emerald-400/70 truncate">
                        {pick.company_name}
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={key}
                    className={`draft-cell ${isOnClock ? 'draft-cell-on-clock' : 'draft-cell-empty'}`}
                  >
                    {isOnClock && (
                      <span className="text-[0.6rem] font-semibold uppercase tracking-wider animate-pulse">
                        Pick
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
