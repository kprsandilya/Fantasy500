import { useMemo, useState } from 'react'
import { oidString, type League, type RosterEntry, type Team } from '../../api'
import { companyName } from '../../stockNames'

export function RosterTab({
  teams,
  myTeam,
  walletRef,
  league,
}: {
  teams: Team[]
  myTeam: Team | null
  walletRef: React.RefObject<string | null>
  league: League | null
}) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const rosterSize = league?.settings?.roster_size ?? 10

  const viewTeam = useMemo(() => {
    if (selectedTeamId) return teams.find((t) => oidString(t._id) === selectedTeamId) ?? myTeam
    return myTeam ?? teams[0] ?? null
  }, [selectedTeamId, myTeam, teams])

  const activeSlots = useMemo(() => {
    if (!viewTeam) return []
    return viewTeam.roster.filter((r) => r.slot !== 'bench')
  }, [viewTeam])

  const benchSlots = useMemo(() => {
    if (!viewTeam) return []
    return viewTeam.roster.filter((r) => r.slot === 'bench')
  }, [viewTeam])

  const allDraftedSymbols = useMemo(() => {
    const set = new Set<string>()
    for (const t of teams) for (const r of t.roster) set.add(r.symbol)
    return set
  }, [teams])

  return (
    <div className="space-y-6">
      {/* Team selector */}
      {teams.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {teams.map((t) => {
            const tid = oidString(t._id)!
            const isMe = t.owner_wallet === walletRef.current
            const isSelected = viewTeam && oidString(viewTeam._id) === tid
            return (
              <button
                key={tid}
                type="button"
                onClick={() => setSelectedTeamId(tid)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${
                  isSelected
                    ? 'bg-emerald-900/40 border-emerald-700/50 text-emerald-300'
                    : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-white hover:border-slate-600'
                }`}
              >
                {t.name}{isMe && ' (You)'}
              </button>
            )
          })}
        </div>
      )}

      {viewTeam ? (
        <>
          {/* Active roster */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Active Roster</h2>
              <span className="text-xs text-slate-500">{activeSlots.length} / {rosterSize}</span>
            </div>
            {activeSlots.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500 text-center">No active companies</p>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {activeSlots.map((r) => (
                  <RosterRow key={r.symbol} entry={r} />
                ))}
              </div>
            )}
          </section>

          {/* Bench */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Bench</h2>
              <span className="text-xs text-slate-500">{benchSlots.length}</span>
            </div>
            {benchSlots.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500 text-center">No bench companies</p>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {benchSlots.map((r) => (
                  <RosterRow key={r.symbol} entry={r} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-slate-500 text-center py-8">No teams available</p>
      )}

      {/* Waiver wire placeholder */}
      <section className="rounded-xl border border-dashed border-slate-700 bg-slate-900/20 p-5">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Waiver Wire</h2>
        <p className="text-xs text-slate-500 mb-4">Available companies not on any roster</p>
        <div className="text-center py-4 text-sm text-slate-600">
          {allDraftedSymbols.size > 0
            ? `${allDraftedSymbols.size} companies currently rostered across all teams`
            : 'Waiver wire will be available after the draft completes'}
        </div>
      </section>
    </div>
  )
}

function RosterRow({ entry }: { entry: RosterEntry }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
          {entry.symbol.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{entry.symbol}</p>
          <p className="text-xs text-slate-500 truncate">{entry.company_name || companyName(entry.symbol)}</p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className={`inline-block rounded px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${
          entry.slot === 'bench'
            ? 'bg-slate-800 text-slate-400'
            : 'bg-emerald-900/40 text-emerald-400'
        }`}>
          {entry.slot}
        </span>
      </div>
    </div>
  )
}
