import { useMemo } from 'react'
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

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-700/50 bg-slate-800/40">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {myTeam ? myTeam.name : 'My Team'}
        </h3>
        <div className="text-[0.65rem] text-slate-500 mt-0.5">
          {myPicks.length}/{totalRounds} picks
        </div>
      </div>

      <div className="divide-y divide-slate-800/50">
        {myPicks.map((p: DraftPick, i: number) => (
          <div
            key={p.overall}
            className="flex items-center gap-2.5 px-3 py-2 animate-pick-in"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-900/50 text-[0.6rem] font-bold text-emerald-400 shrink-0">
              {p.round}
            </div>
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold text-slate-200">{p.symbol}</div>
              <div className="text-[0.6rem] text-slate-500 truncate">{p.company_name}</div>
            </div>
            <div className="ml-auto text-[0.6rem] text-slate-600 tabular-nums">
              #{p.overall}
            </div>
          </div>
        ))}

        {Array.from({ length: emptySlots }, (_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center gap-2.5 px-3 py-2 opacity-40"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-[0.6rem] text-slate-600 shrink-0">
              {myPicks.length + i + 1}
            </div>
            <div className="text-xs text-slate-600 italic">Empty</div>
          </div>
        ))}
      </div>
    </div>
  )
}
