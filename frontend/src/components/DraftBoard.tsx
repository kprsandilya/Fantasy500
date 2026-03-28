import { useMemo } from 'react'
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

  if (n === 0) return null

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/50 bg-slate-900/60">
      <div
        className="draft-grid p-2"
        style={{ gridTemplateColumns: `3rem repeat(${n}, minmax(5.5rem, 1fr))` }}
      >
        <div className="draft-cell draft-cell-header text-[0.6rem]">RD</div>
        {order.map((t) => (
          <div
            key={oidString(t._id)}
            className={`draft-cell draft-cell-header text-[0.65rem] ${
              oidString(t._id) === clockTeamId ? 'text-amber-300' : ''
            }`}
            title={t.owner_wallet}
          >
            {t.name}
          </div>
        ))}

        {Array.from({ length: totalRounds }, (_, r) => {
          const round = r + 1
          const isReverse = round % 2 === 0
          const teamOrder = isReverse ? [...order].reverse() : order

          return (
            <div key={round} className="contents">
              <div className="draft-cell draft-cell-round flex items-center justify-center">
                {round}
              </div>
              {teamOrder.map((t) => {
                const tid = oidString(t._id)!
                const key = `${round}-${tid}`
                const pick = pickMap.get(key)
                const isOnClock = key === nextPickSlot

                if (pick) {
                  return (
                    <div key={key} className="draft-cell draft-cell-filled animate-pick-in">
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
                      <span className="text-[0.6rem] font-semibold uppercase tracking-wider">
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
