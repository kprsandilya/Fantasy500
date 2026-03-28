import { useMemo, useState } from 'react'
import { oidString, type League, type Team } from '../../api'

export function MatchupTab({
  teams,
  league,
  myTeam,
}: {
  teams: Team[]
  league: League | null
  myTeam: Team | null
}) {
  const [currentWeek, setCurrentWeek] = useState(1)
  const totalWeeks = league?.settings?.snake_rounds ?? 10

  const matchups = useMemo(() => {
    const pairs: [Team, Team][] = []
    const shuffled = [...teams]
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      pairs.push([shuffled[i], shuffled[i + 1]])
    }
    if (shuffled.length % 2 !== 0 && shuffled.length > 0) {
      pairs.push([shuffled[shuffled.length - 1], shuffled[shuffled.length - 1]])
    }
    return pairs
  }, [teams])

  return (
    <div className="space-y-6">
      {/* Week navigator */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setCurrentWeek((w) => Math.max(1, w - 1))}
          disabled={currentWeek <= 1}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-30 disabled:hover:text-slate-400"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <p className="text-lg font-bold text-white">Week {currentWeek}</p>
          <p className="text-xs text-slate-500">of {totalWeeks}</p>
        </div>
        <button
          type="button"
          onClick={() => setCurrentWeek((w) => Math.min(totalWeeks, w + 1))}
          disabled={currentWeek >= totalWeeks}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-30 disabled:hover:text-slate-400"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Matchup cards */}
      {matchups.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-slate-500">Matchups will be generated after the draft completes</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matchups.map(([teamA, teamB], idx) => (
            <MatchupCard key={idx} teamA={teamA} teamB={teamB} myTeam={myTeam} />
          ))}
        </div>
      )}
    </div>
  )
}

function MatchupCard({ teamA, teamB, myTeam }: { teamA: Team; teamB: Team; myTeam: Team | null }) {
  const isMyMatchup =
    (myTeam && oidString(myTeam._id) === oidString(teamA._id)) ||
    (myTeam && oidString(myTeam._id) === oidString(teamB._id))

  const activeA = teamA.roster.filter((r) => r.slot !== 'bench')
  const benchA = teamA.roster.filter((r) => r.slot === 'bench')
  const activeB = teamB.roster.filter((r) => r.slot !== 'bench')
  const benchB = teamB.roster.filter((r) => r.slot === 'bench')

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isMyMatchup ? 'border-emerald-800/50 bg-emerald-950/10' : 'border-slate-800 bg-slate-900/40'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/50">
        <span className="text-sm font-semibold text-white">{teamA.name}</span>
        <span className="text-xs font-bold text-slate-600 uppercase">vs</span>
        <span className="text-sm font-semibold text-white">{teamB.name}</span>
      </div>

      {/* Active companies side-by-side */}
      <div className="grid grid-cols-2 divide-x divide-slate-800/50">
        <div className="p-4 space-y-1.5">
          <p className="text-[0.6rem] uppercase tracking-wider text-slate-500 mb-2">Active</p>
          {activeA.length > 0 ? activeA.map((r) => (
            <div key={r.symbol} className="flex items-center justify-between text-xs">
              <span className="font-mono text-emerald-400">{r.symbol}</span>
              <span className="text-slate-500">{r.slot}</span>
            </div>
          )) : (
            <p className="text-xs text-slate-600">No active roster</p>
          )}
        </div>
        <div className="p-4 space-y-1.5">
          <p className="text-[0.6rem] uppercase tracking-wider text-slate-500 mb-2">Active</p>
          {activeB.length > 0 ? activeB.map((r) => (
            <div key={r.symbol} className="flex items-center justify-between text-xs">
              <span className="font-mono text-emerald-400">{r.symbol}</span>
              <span className="text-slate-500">{r.slot}</span>
            </div>
          )) : (
            <p className="text-xs text-slate-600">No active roster</p>
          )}
        </div>
      </div>

      {/* Bench */}
      {(benchA.length > 0 || benchB.length > 0) && (
        <div className="grid grid-cols-2 divide-x divide-slate-800/50 border-t border-slate-800/50 bg-slate-950/30">
          <div className="px-4 py-2">
            <p className="text-[0.6rem] uppercase tracking-wider text-slate-600 mb-1">Bench</p>
            <div className="flex flex-wrap gap-1">
              {benchA.map((r) => (
                <span key={r.symbol} className="text-[0.65rem] font-mono text-slate-500">{r.symbol}</span>
              ))}
              {benchA.length === 0 && <span className="text-[0.65rem] text-slate-700">&mdash;</span>}
            </div>
          </div>
          <div className="px-4 py-2">
            <p className="text-[0.6rem] uppercase tracking-wider text-slate-600 mb-1">Bench</p>
            <div className="flex flex-wrap gap-1">
              {benchB.map((r) => (
                <span key={r.symbol} className="text-[0.65rem] font-mono text-slate-500">{r.symbol}</span>
              ))}
              {benchB.length === 0 && <span className="text-[0.65rem] text-slate-700">&mdash;</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
