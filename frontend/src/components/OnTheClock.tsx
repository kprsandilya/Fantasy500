import { useEffect, useState } from 'react'
import type { DraftSession, Team } from '../api'
import { oidString } from '../api'

type Props = {
  draft: DraftSession
  teams: Team[]
  isMyTurn: boolean
  timerDuration: number
  onTimerExpired?: () => void
}

function useCountdown(deadline: number | null | undefined) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!deadline) {
      setRemaining(null)
      return
    }

    function tick() {
      const now = Date.now() / 1000
      const left = Math.max(0, deadline! - now)
      setRemaining(Math.ceil(left))
    }

    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [deadline])

  return remaining
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function OnTheClock({ draft, teams, isMyTurn, timerDuration, onTimerExpired }: Props) {
  const remaining = useCountdown(draft.deadline_at)
  const [firedExpiry, setFiredExpiry] = useState(false)

  useEffect(() => {
    if (remaining === 0 && !firedExpiry && onTimerExpired) {
      setFiredExpiry(true)
      onTimerExpired()
    }
    if (remaining && remaining > 0) {
      setFiredExpiry(false)
    }
  }, [remaining, firedExpiry, onTimerExpired])

  if (draft.status === 'completed') {
    return (
      <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-4 py-3 text-center">
        <div className="text-lg font-bold text-emerald-400">Draft Complete</div>
        <div className="text-sm text-emerald-300/70">
          All {draft.picks.length} picks are in. Rosters are set.
        </div>
      </div>
    )
  }

  if (draft.status !== 'in_progress') {
    return (
      <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-4 py-3 text-center">
        <div className="text-sm text-slate-400">Waiting for draft to start...</div>
      </div>
    )
  }

  const clockId = oidString(draft.clock_team_id)
  const clockTeam = teams.find((t) => oidString(t._id) === clockId)
  const totalPicks = draft.picks.length + 1
  const isUrgent = remaining !== null && remaining <= 10 && remaining > 0

  return (
    <div
      className={`rounded-lg px-4 py-3 ${
        isMyTurn
          ? 'bg-amber-900/30 border-2 border-amber-500/60 animate-on-clock'
          : 'bg-slate-800/60 border border-slate-700/50'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              isMyTurn
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-slate-700/60 text-slate-400'
            }`}
          >
            On the clock
          </div>
          <div>
            <span className="font-semibold text-white text-lg">
              {clockTeam?.name ?? 'Unknown'}
            </span>
            {isMyTurn && (
              <span className="ml-2 text-xs text-amber-400 font-medium">(You)</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400">
          {remaining !== null && (
            <div
              className={`font-mono text-base font-bold tabular-nums ${
                isUrgent
                  ? 'text-red-400 animate-pulse'
                  : remaining === 0
                    ? 'text-red-500'
                    : 'text-white'
              }`}
            >
              {remaining === 0 ? 'TIME' : formatTime(remaining)}
            </div>
          )}
          <div>
            <span className="text-slate-500">Round</span>{' '}
            <span className="font-semibold text-slate-300">{draft.current_round}</span>
          </div>
          <div>
            <span className="text-slate-500">Pick</span>{' '}
            <span className="font-semibold text-slate-300">#{totalPicks}</span>
          </div>
          <div>
            <span className="text-slate-500">Direction</span>{' '}
            <span className="font-semibold text-slate-300">
              {draft.direction === 'forward' ? '→' : '←'}
            </span>
          </div>
        </div>
      </div>

      {remaining !== null && timerDuration > 0 && (
        <div className="mt-2 h-1 rounded-full bg-slate-700/50 overflow-hidden">
          <div
            className={`h-full rounded-full ${
              isUrgent ? 'bg-red-500' : 'bg-emerald-500'
            }`}
            style={{
              width: `${Math.max(0, (remaining / timerDuration) * 100)}%`,
              transition: 'width 0.25s linear',
            }}
          />
        </div>
      )}
    </div>
  )
}
