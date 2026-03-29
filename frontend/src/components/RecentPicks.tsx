import type { DraftPick, Team } from '../api'
import { oidString } from '../api'

type Props = {
  picks: DraftPick[]
  teams: Team[]
}

export function RecentPicks({ picks, teams }: Props) {
  const teamMap = new Map(teams.map((t) => [oidString(t._id), t]))
  const recent = [...picks].reverse().slice(0, 8)

  if (recent.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 py-4 text-center text-sm text-slate-600">
        No picks yet
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700/50 bg-slate-800/40 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Recent Picks
        </h3>
        <span className="text-[0.6rem] text-slate-600 tabular-nums">{picks.length} total</span>
      </div>
      <div className="divide-y divide-slate-800/50">
        {recent.map((p, idx) => {
          const team = teamMap.get(oidString(p.team_id))
          const isLatest = idx === 0
          return (
            <div
              key={p.overall}
              className={`flex items-center gap-2.5 px-3 py-2 animate-pick-in transition-colors ${
                isLatest ? 'bg-emerald-950/20' : ''
              }`}
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className={`flex items-center justify-center w-7 h-7 rounded text-[0.65rem] font-bold tabular-nums shrink-0 ${
                isLatest ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-800 text-slate-400'
              }`}>
                #{p.overall}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono text-sm font-semibold ${isLatest ? 'text-emerald-300' : 'text-emerald-400'}`}>
                    {p.symbol}
                  </span>
                  {isLatest && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/20 px-1.5 py-px text-[0.5rem] font-bold uppercase tracking-wider text-emerald-400">
                      <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                      new
                    </span>
                  )}
                  <span className="text-[0.6rem] text-slate-500 truncate">
                    {p.company_name}
                  </span>
                </div>
                <div className="text-[0.6rem] text-slate-600">
                  {team?.name ?? 'Unknown'} &middot; Rd {p.round}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
