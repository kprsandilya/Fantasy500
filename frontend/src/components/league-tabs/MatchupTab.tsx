import { useMemo, useState } from 'react'
import {
  oidString,
  type League,
  type Team,
  type ScoresResponse,
} from '../../api'

/**
 * Deterministic round-robin matchup schedule.
 * Fixes team[0] (by sorted _id) and rotates the rest each week.
 * Returns null in a pair slot to indicate a bye.
 */
export function generateRoundRobin(
  teams: Team[],
  week: number,
): [Team | null, Team | null][] {
  if (teams.length < 2)
    return teams.length === 1 ? [[teams[0], null]] : []

  const sorted = [...teams].sort((a, b) =>
    (oidString(a._id) ?? '').localeCompare(oidString(b._id) ?? ''),
  )

  const isOdd = sorted.length % 2 !== 0
  const list: (Team | null)[] = isOdd ? [...sorted, null] : [...sorted]
  const n = list.length

  const round = (week - 1) % (n - 1)
  const rest = list.slice(1)
  const rotated: (Team | null)[] = []
  for (let i = 0; i < rest.length; i++) {
    rotated.push(
      rest[((i - round) % rest.length + rest.length) % rest.length],
    )
  }

  const arrangement = [list[0], ...rotated]
  const pairs: [Team | null, Team | null][] = []
  for (let i = 0; i < n / 2; i++) {
    pairs.push([arrangement[i], arrangement[n - 1 - i]])
  }

  return pairs
}

export function MatchupTab({
  teams,
  league,
  myTeam,
  scores,
}: {
  teams: Team[]
  league: League | null
  myTeam: Team | null
  scores: ScoresResponse | null
}) {
  const totalWeeks = league?.settings?.snake_rounds ?? 10

  const currentWeekNum = useMemo(() => {
    if (!scores || scores.weeks.length === 0) return 1
    const idx = scores.weeks.findIndex(
      (w) => w.week_start === scores.current_week_start,
    )
    if (idx >= 0) return idx + 1
    return Math.min(scores.weeks.length + 1, totalWeeks)
  }, [scores, totalWeeks])

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const displayWeek = selectedWeek ?? currentWeekNum

  const allMatchups = useMemo(
    () => generateRoundRobin(teams, displayWeek),
    [teams, displayWeek],
  )

  const myMatchup = useMemo<[Team | null, Team | null] | null>(() => {
    if (!myTeam) return null
    const found = allMatchups.find(
      ([a, b]) =>
        (a && oidString(a._id) === oidString(myTeam._id)) ||
        (b && oidString(b._id) === oidString(myTeam._id)),
    )
    if (!found) return null
    const [a, b] = found
    if (b && oidString(b._id) === oidString(myTeam._id))
      return [b, a]
    return [a, b]
  }, [allMatchups, myTeam])

  const weekScoreboard = useMemo(() => {
    if (!scores || displayWeek < 1 || displayWeek > scores.weeks.length)
      return null
    return scores.weeks[displayWeek - 1]
  }, [scores, displayWeek])

  const weekPlayerScores = useMemo(() => {
    if (!scores || !weekScoreboard) return []
    return scores.player_scores.filter(
      (ps) => ps.week_start === weekScoreboard.week_start,
    )
  }, [scores, weekScoreboard])

  if (!myTeam) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-slate-500">
          You don&rsquo;t have a team in this league
        </p>
      </div>
    )
  }

  if (teams.length < 2) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-slate-500">
          Not enough teams for matchups yet
        </p>
      </div>
    )
  }

  const [teamA, teamB] = myMatchup ?? [myTeam, null]
  const isBye = teamB === null

  const getTeamTotal = (team: Team): number | null => {
    if (!weekScoreboard) return null
    const tid = oidString(team._id)
    const entry = weekScoreboard.team_totals.find(
      (t) => oidString(t.team_id) === tid,
    )
    return entry?.points ?? null
  }

  const getStockScores = (team: Team): Map<string, number> => {
    const map = new Map<string, number>()
    const tid = oidString(team._id)
    for (const ps of weekPlayerScores) {
      if (oidString(ps.team_id) === tid) {
        map.set(ps.symbol, ps.points)
      }
    }
    return map
  }

  const scoreA = teamA ? getTeamTotal(teamA) : null
  const scoreB = teamB ? getTeamTotal(teamB) : null
  const stockScoresA = teamA ? getStockScores(teamA) : new Map<string, number>()
  const stockScoresB = teamB ? getStockScores(teamB) : new Map<string, number>()

  const activeA = teamA?.roster.filter((r) => r.slot !== 'bench') ?? []
  const activeB = teamB?.roster.filter((r) => r.slot !== 'bench') ?? []

  const isPast =
    weekScoreboard !== null &&
    scores !== null &&
    weekScoreboard.week_start < scores.current_week_start
  const aWins = isPast && scoreA !== null && scoreB !== null && scoreA > scoreB
  const bWins = isPast && scoreA !== null && scoreB !== null && scoreB > scoreA

  const weekLabel =
    displayWeek === currentWeekNum
      ? 'Current'
      : displayWeek < currentWeekNum
        ? 'Completed'
        : 'Upcoming'

  return (
    <div className="space-y-6">
      {/* Week navigator */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setSelectedWeek(Math.max(1, displayWeek - 1))}
          disabled={displayWeek <= 1}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-30 disabled:hover:text-slate-400"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="text-center">
          <p className="text-lg font-bold text-white">Week {displayWeek}</p>
          <p className="text-xs text-slate-500">
            {weekLabel} &middot; {displayWeek} of {totalWeeks}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedWeek(Math.min(totalWeeks, displayWeek + 1))}
          disabled={displayWeek >= totalWeeks}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-30 disabled:hover:text-slate-400"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Matchup card */}
      <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/10 overflow-hidden">
        {/* Score header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/50">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {teamA?.name ?? ''}
            </p>
            <p className="text-[0.6rem] text-emerald-500 font-semibold">You</p>
          </div>

          <div className="flex items-center gap-3 shrink-0 px-3">
            <span
              className={`text-xl font-bold tabular-nums ${
                aWins
                  ? 'text-emerald-400'
                  : bWins
                    ? 'text-red-400'
                    : 'text-white'
              }`}
            >
              {scoreA !== null ? scoreA.toFixed(2) : '\u2014'}
            </span>
            {!isBye ? (
              <>
                <span className="text-xs font-bold text-slate-600 uppercase">
                  vs
                </span>
                <span
                  className={`text-xl font-bold tabular-nums ${
                    bWins
                      ? 'text-emerald-400'
                      : aWins
                        ? 'text-red-400'
                        : 'text-white'
                  }`}
                >
                  {scoreB !== null ? scoreB.toFixed(2) : '\u2014'}
                </span>
              </>
            ) : (
              <span className="text-xs font-semibold text-amber-500/70 uppercase tracking-wider">
                Bye Week
              </span>
            )}
          </div>

          {!isBye ? (
            <div className="flex-1 min-w-0 text-right">
              <p className="text-sm font-semibold text-white truncate">
                {teamB?.name ?? ''}
              </p>
            </div>
          ) : (
            <div className="flex-1" />
          )}
        </div>

        {/* Per-stock scores */}
        {isBye ? (
          <div className="p-4 space-y-1.5">
            <p className="text-[0.6rem] uppercase tracking-wider text-slate-500 mb-2">
              Active Roster
            </p>
            {activeA.length > 0 ? (
              activeA.map((r) => (
                <div
                  key={r.symbol}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="font-mono text-emerald-400">{r.symbol}</span>
                  <span className="text-slate-400 tabular-nums">
                    {stockScoresA.has(r.symbol)
                      ? stockScoresA.get(r.symbol)!.toFixed(2)
                      : '\u2014'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-600">No active roster</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-slate-800/50">
            <div className="p-4 space-y-1.5">
              <p className="text-[0.6rem] uppercase tracking-wider text-slate-500 mb-2">
                Active
              </p>
              {activeA.length > 0 ? (
                activeA.map((r) => (
                  <div
                    key={r.symbol}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-emerald-400">
                      {r.symbol}
                    </span>
                    <span className="text-slate-400 tabular-nums">
                      {stockScoresA.has(r.symbol)
                        ? stockScoresA.get(r.symbol)!.toFixed(2)
                        : '\u2014'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-600">No active roster</p>
              )}
            </div>
            <div className="p-4 space-y-1.5">
              <p className="text-[0.6rem] uppercase tracking-wider text-slate-500 mb-2">
                Active
              </p>
              {activeB.length > 0 ? (
                activeB.map((r) => (
                  <div
                    key={r.symbol}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-emerald-400">
                      {r.symbol}
                    </span>
                    <span className="text-slate-400 tabular-nums">
                      {stockScoresB.has(r.symbol)
                        ? stockScoresB.get(r.symbol)!.toFixed(2)
                        : '\u2014'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-600">No active roster</p>
              )}
            </div>
          </div>
        )}

        {/* Winner banner for completed weeks */}
        {isPast && (aWins || bWins) && (
          <div className="px-5 py-2 border-t border-slate-800/50 bg-slate-950/40 text-center">
            <span className="text-xs font-semibold text-emerald-400">
              {aWins ? teamA?.name : teamB?.name} wins this week
            </span>
          </div>
        )}
        {isPast && !aWins && !bWins && !isBye && scoreA !== null && (
          <div className="px-5 py-2 border-t border-slate-800/50 bg-slate-950/40 text-center">
            <span className="text-xs font-semibold text-slate-500">Tie</span>
          </div>
        )}
      </div>
    </div>
  )
}
