import { useMemo } from 'react'
import { oidString, type League, type Team } from '../../api'

export function LeagueTab({
  league,
  teams,
  myTeam,
  walletRef,
}: {
  league: League | null
  teams: Team[]
  myTeam: Team | null
  walletRef: React.RefObject<string | null>
}) {
  const sorted = useMemo(
    () => [...teams].sort((a, b) => b.roster.length - a.roster.length),
    [teams],
  )

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      {league && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Players', value: `${teams.length}/${league.team_count}` },
            { label: 'Buy-in', value: league.buy_in_lamports ? `${(league.buy_in_lamports / 1e9).toFixed(2)} SOL` : 'Free' },
            { label: 'Rounds', value: league.settings?.snake_rounds ?? 10 },
            { label: 'Roster Size', value: league.settings?.roster_size ?? 10 },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div className="text-[0.65rem] uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className="text-lg font-semibold text-white mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Leaderboard</h2>
        </div>
        {sorted.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500 text-center">No teams yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left px-5 py-2 font-medium">#</th>
                <th className="text-left px-5 py-2 font-medium">Team</th>
                <th className="text-left px-5 py-2 font-medium">Owner</th>
                <th className="text-right px-5 py-2 font-medium">Picks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {sorted.map((t, i) => {
                const isMe = t.owner_wallet === walletRef.current
                return (
                  <tr key={oidString(t._id) ?? i} className={isMe ? 'bg-emerald-950/20' : ''}>
                    <td className="px-5 py-2.5 text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-5 py-2.5 font-medium text-white">
                      {t.name}
                      {isMe && <span className="ml-1.5 text-[0.6rem] text-emerald-500 font-semibold">(You)</span>}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 font-mono text-xs truncate max-w-[10rem]">
                      {t.owner_wallet.slice(0, 4)}...{t.owner_wallet.slice(-4)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-300">{t.roster.length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* All players grid */}
      {teams.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">All Teams</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-800/50">
            {teams.map((t) => {
              const isMe = t.owner_wallet === walletRef.current
              return (
                <div key={oidString(t._id)} className={`px-4 py-3 ${isMe ? 'bg-emerald-950/20' : 'bg-slate-900/60'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">{t.name}</span>
                    <span className="text-xs text-slate-500">Pos #{t.draft_position}</span>
                  </div>
                  {t.roster.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {t.roster.slice(0, 6).map((r) => (
                        <span key={r.symbol} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-emerald-400">
                          {r.symbol}
                        </span>
                      ))}
                      {t.roster.length > 6 && (
                        <span className="text-xs text-slate-500">+{t.roster.length - 6} more</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600">No picks yet</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
