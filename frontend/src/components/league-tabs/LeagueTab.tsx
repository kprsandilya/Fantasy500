import { useMemo, useState } from 'react'
import { oidString, type DraftSession, type League, type Team, type ScoresResponse } from '../../api'
import { generateRoundRobin } from './MatchupTab'
import { StandingsChart } from '../StandingsChart'
import { WeeklyCard } from '../WeeklyCard'

type Standing = {
  team: Team
  wins: number
  /** Average season % for starters: (current / entry − 1) × 100 */
  seasonPct: number
}

type ActivityEvent = {
  type: 'draft' | 'waiver'
  teamName: string
  ownerWallet: string
  symbol: string
  companyName: string
  detail: string
  timestamp: string
}

export function LeagueTab({
  league,
  teams,
  myTeam,
  walletRef,
  scores,
  draft,
}: {
  league: League | null
  teams: Team[]
  myTeam: Team | null
  walletRef: React.RefObject<string | null>
  scores: ScoresResponse | null
  draft: DraftSession | null
}) {
  const standings = useMemo<Standing[]>(() => {
    const stats = new Map<string, { wins: number }>()
    for (const t of teams) {
      stats.set(oidString(t._id) ?? '', { wins: 0 })
    }

    if (scores && scores.weeks.length > 0) {
      const completedWeeks = scores.weeks.filter(
        (w) => w.week_start < scores.current_week_start,
      )

      for (let weekIdx = 0; weekIdx < completedWeeks.length; weekIdx++) {
        const board = completedWeeks[weekIdx]
        const weekNum = weekIdx + 1
        const matchups = generateRoundRobin(teams, weekNum)

        for (const [teamA, teamB] of matchups) {
          if (!teamA) continue
          const tidA = oidString(teamA._id) ?? ''
          const sA = stats.get(tidA)

          if (!teamB) {
            if (sA) sA.wins += 1
            continue
          }

          const tidB = oidString(teamB._id) ?? ''
          const sB = stats.get(tidB)

          const ptsA =
            board.team_totals.find((t) => oidString(t.team_id) === tidA)
              ?.points ?? 0
          const ptsB =
            board.team_totals.find((t) => oidString(t.team_id) === tidB)
              ?.points ?? 0

          if (ptsA > ptsB) {
            if (sA) sA.wins += 1
          } else if (ptsB > ptsA) {
            if (sB) sB.wins += 1
          }
        }
      }
    }

    const pctMap = scores?.team_season_pct ?? {}

    return [...teams]
      .map((t) => {
        const tid = oidString(t._id) ?? ''
        const s = stats.get(tid) ?? { wins: 0 }
        const seasonPct = pctMap[tid] ?? 0
        return { team: t, wins: s.wins, seasonPct }
      })
      .sort(
        (a, b) =>
          b.wins - a.wins || b.seasonPct - a.seasonPct,
      )
  }, [teams, scores])

  const activity = useMemo<ActivityEvent[]>(() => {
    const events: ActivityEvent[] = []
    const teamMap = new Map(teams.map((t) => [oidString(t._id) ?? '', t]))

    if (draft?.picks) {
      for (const pick of draft.picks) {
        const team = teamMap.get(oidString(pick.team_id) ?? '')
        if (!team) continue
        const rosterEntry = team.roster.find((r) => r.symbol === pick.symbol)
        events.push({
          type: 'draft',
          teamName: team.name,
          ownerWallet: team.owner_wallet,
          symbol: pick.symbol,
          companyName: pick.company_name,
          detail: `Round ${pick.round}, Pick ${pick.overall}`,
          timestamp: rosterEntry?.acquired_at ?? '',
        })
      }
    }

    for (const t of teams) {
      for (const r of t.roster) {
        if (r.source === 'waiver') {
          events.push({
            type: 'waiver',
            teamName: t.name,
            ownerWallet: t.owner_wallet,
            symbol: r.symbol,
            companyName: r.company_name,
            detail: 'Waiver pickup',
            timestamp: r.acquired_at,
          })
        }
      }
    }

    events.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0
      if (!a.timestamp) return 1
      if (!b.timestamp) return -1
      return b.timestamp.localeCompare(a.timestamp)
    })

    return events
  }, [teams, draft])

  const [showAllActivity, setShowAllActivity] = useState(false)
  const visibleActivity = showAllActivity ? activity : activity.slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      {league && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'Players',
              value: `${teams.length}/${league.team_count}`,
            },
            {
              label: 'Buy-in',
              value: league.buy_in_lamports
                ? `${(league.buy_in_lamports / 1e9).toFixed(2)} SOL`
                : 'Free',
            },
            { label: 'Weeks', value: league.settings?.snake_rounds ?? 10 },
            {
              label: 'Starters',
              value: league.settings?.roster_size ?? 8,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <div className="text-[0.65rem] uppercase tracking-wider text-slate-500">
                {s.label}
              </div>
              <div className="text-lg font-semibold text-white mt-0.5">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            Leaderboard
          </h2>
        </div>
        {standings.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500 text-center">
            No teams yet
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left px-5 py-2 font-medium">#</th>
                <th className="text-left px-5 py-2 font-medium">Team</th>
                <th className="text-left px-5 py-2 font-medium">Owner</th>
                <th className="text-right px-5 py-2 font-medium">W</th>
                <th className="text-right px-5 py-2 font-medium" title="Avg % gain on starters vs acquisition price">
                  Season %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {standings.map((row, i) => {
                const isMe = row.team.owner_wallet === walletRef.current
                return (
                  <tr
                    key={oidString(row.team._id) ?? i}
                    className={isMe ? 'bg-emerald-950/20' : ''}
                  >
                    <td className="px-5 py-2.5 text-slate-500 tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-5 py-2.5 font-medium text-white">
                      {row.team.name}
                      {isMe && (
                        <span className="ml-1.5 text-[0.6rem] text-emerald-500 font-semibold">
                          (You)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 font-mono text-xs truncate max-w-[10rem]">
                      {row.team.owner_wallet.slice(0, 4)}...
                      {row.team.owner_wallet.slice(-4)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-300">
                      {row.wins}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-slate-300">
                      {row.seasonPct >= 0 ? '+' : ''}
                      {row.seasonPct.toFixed(2)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Standings trend chart */}
      {scores && scores.weeks.length > 0 && teams.length > 1 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Season Trend
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Cumulative points per team by week</p>
          </div>
          <div className="p-4">
            <StandingsChart teams={teams} scores={scores} walletRef={walletRef} />
          </div>
        </section>
      )}

      {/* Weekly Shareable Card */}
      {myTeam && scores && league?.status === 'active' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Weekly Card
            </h2>
            <span className="text-[0.6rem] text-slate-500">Share your performance</span>
          </div>
          <div className="p-5">
            <WeeklyCard team={myTeam} scores={scores} />
          </div>
        </section>
      )}

      {/* All players grid */}
      {teams.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              All Teams
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-800/50">
            {teams.map((t) => {
              const isMe = t.owner_wallet === walletRef.current
              return (
                <div
                  key={oidString(t._id)}
                  className={`px-4 py-3 ${isMe ? 'bg-emerald-950/20' : 'bg-slate-900/60'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">
                      {t.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      Pos #{t.draft_position}
                    </span>
                  </div>
                  {t.roster.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {t.roster.slice(0, 6).map((r) => (
                        <span
                          key={r.symbol}
                          className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-emerald-400"
                        >
                          {r.symbol}
                        </span>
                      ))}
                      {t.roster.length > 6 && (
                        <span className="text-xs text-slate-500">
                          +{t.roster.length - 6} more
                        </span>
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

      {/* Activity feed */}
      {activity.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              League Activity
            </h2>
          </div>
          <div className="divide-y divide-slate-800/50">
            {visibleActivity.map((ev, i) => {
              const isMe = ev.ownerWallet === walletRef.current
              return (
                <div key={`${ev.symbol}-${ev.timestamp}-${i}`} className="flex items-start gap-3 px-5 py-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    ev.type === 'draft'
                      ? 'bg-amber-900/40 text-amber-400'
                      : 'bg-blue-900/40 text-blue-400'
                  }`}>
                    {ev.type === 'draft' ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-300">
                      <span className={`font-medium ${isMe ? 'text-emerald-400' : 'text-white'}`}>
                        {ev.teamName}
                      </span>
                      {' '}
                      {ev.type === 'draft' ? 'drafted' : 'picked up'}
                      {' '}
                      <span className="font-mono font-semibold text-emerald-400">{ev.symbol}</span>
                      {' '}
                      <span className="text-slate-500">({ev.companyName})</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {ev.detail}
                      {ev.timestamp && (
                        <>
                          {' · '}
                          {new Date(ev.timestamp).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
          {activity.length > 10 && (
            <div className="px-5 py-2.5 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAllActivity((v) => !v)}
                className="text-xs font-medium text-slate-400 hover:text-emerald-400 transition-colors"
              >
                {showAllActivity ? 'Show less' : `Show all ${activity.length} events`}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
