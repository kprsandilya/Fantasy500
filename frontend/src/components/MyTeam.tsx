import { useEffect, useMemo, useRef, useState } from 'react'
import type { DraftPick, DraftSession, Team } from '../api'
import { oidString } from '../api'

type Props = {
  draft: DraftSession
  myTeam: Team | null
  totalRounds: number
}

export function MyTeam({ draft, myTeam, totalRounds }: Props) {
  const myPicks = useMemo(() => {
    if (!myTeam) return []
    const tid = oidString(myTeam._id)
    return draft.picks.filter((p) => oidString(p.team_id) === tid)
  }, [draft.picks, myTeam])

  const emptySlots = totalRounds - myPicks.length
  const prevCount = useRef(myPicks.length)
  const [latestIdx, setLatestIdx] = useState<number | null>(null)

  useEffect(() => {
    if (myPicks.length > prevCount.current) {
      setLatestIdx(myPicks.length - 1)
      const t = setTimeout(() => setLatestIdx(null), 2500)
      prevCount.current = myPicks.length
      return () => clearTimeout(t)
    }
    prevCount.current = myPicks.length
  }, [myPicks.length])

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-700/50 bg-slate-800/40 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {myTeam ? myTeam.name : 'My Team'}
          </h3>
          <div className="text-[0.6rem] text-slate-500 mt-0.5 tabular-nums">
            {myPicks.length}/{totalRounds} picks
          </div>
        </div>
        {myPicks.length > 0 && (
          <div className="flex -space-x-1">
            {myPicks.slice(-3).map((p) => (
              <div
                key={p.overall}
                className="w-5 h-5 rounded-full bg-emerald-900/60 border border-emerald-700/40 flex items-center justify-center text-[0.45rem] font-bold text-emerald-400"
              >
                {p.symbol.slice(0, 2)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="divide-y divide-slate-800/50">
        {myPicks.map((p: DraftPick, i: number) => {
          const isLatest = i === latestIdx
          return (
            <div
              key={p.overall}
              className={`flex items-center gap-2.5 px-3 py-2 animate-pick-in transition-colors ${
                isLatest ? 'bg-emerald-950/30' : ''
              }`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[0.6rem] font-bold shrink-0 ${
                isLatest ? 'bg-emerald-600 text-white' : 'bg-emerald-900/50 text-emerald-400'
              }`}>
                {p.round}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm font-semibold text-slate-200">{p.symbol}</span>
                  {isLatest && (
                    <span className="text-[0.5rem] font-bold uppercase tracking-wider text-emerald-400 animate-pulse">new</span>
                  )}
                </div>
                <div className="text-[0.6rem] text-slate-500 truncate">{p.company_name}</div>
              </div>
              <div className="text-[0.6rem] text-slate-600 tabular-nums">
                #{p.overall}
              </div>
            </div>
          )
        })}

        {Array.from({ length: emptySlots }, (_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center gap-2.5 px-3 py-2 opacity-30"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 border border-dashed border-slate-700 text-[0.6rem] text-slate-600 shrink-0">
              {myPicks.length + i + 1}
            </div>
            <div className="text-xs text-slate-600 italic">—</div>
          </div>
        ))}
      </div>
    </div>
  )
}
