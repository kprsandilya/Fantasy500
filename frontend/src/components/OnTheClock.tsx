import { useEffect, useRef, useState } from 'react'
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

function CircularTimer({ remaining, total }: { remaining: number; total: number }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? Math.max(0, remaining / total) : 0
  const offset = circumference * (1 - progress)

  const isUrgent = remaining <= 10 && remaining > 0
  const isWarning = remaining <= 30 && remaining > 10
  const isDead = remaining === 0

  const strokeColor = isDead
    ? 'text-red-600'
    : isUrgent
      ? 'text-red-500'
      : isWarning
        ? 'text-amber-400'
        : 'text-emerald-400'

  const textColor = isDead
    ? 'text-red-500'
    : isUrgent
      ? 'text-red-400'
      : 'text-white'

  return (
    <div className={`relative w-[4.5rem] h-[4.5rem] shrink-0 ${isUrgent ? 'animate-[urgent-shake_0.3s_ease-in-out_infinite]' : ''}`}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r={radius} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-700/30" />
        <circle
          cx="30" cy="30" r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-all duration-200 ${strokeColor}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono text-base font-bold tabular-nums leading-none ${textColor} ${isUrgent ? 'animate-pulse' : ''}`}>
          {isDead ? '0:00' : formatTime(remaining)}
        </span>
        {!isDead && (
          <span className="text-[0.5rem] text-slate-500 uppercase tracking-wider mt-0.5">left</span>
        )}
      </div>
    </div>
  )
}

export function OnTheClock({ draft, teams, isMyTurn, timerDuration, onTimerExpired }: Props) {
  const remaining = useCountdown(draft.deadline_at)
  const [firedExpiry, setFiredExpiry] = useState(false)
  const prevPickCount = useRef(draft.picks.length)
  const [justPicked, setJustPicked] = useState<{ symbol: string; team: string } | null>(null)

  useEffect(() => {
    if (draft.picks.length > prevPickCount.current) {
      const latest = draft.picks[draft.picks.length - 1]
      const team = teams.find((t) => oidString(t._id) === oidString(latest.team_id))
      setJustPicked({ symbol: latest.symbol, team: team?.name ?? 'Unknown' })
      const t = setTimeout(() => setJustPicked(null), 3000)
      prevPickCount.current = draft.picks.length
      return () => clearTimeout(t)
    }
    prevPickCount.current = draft.picks.length
  }, [draft.picks, teams])

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
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-950/60 via-emerald-900/30 to-emerald-950/60 border border-emerald-600/30 px-6 py-5 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.08),transparent_70%)]" />
        <div className="relative">
          <div className="text-2xl font-black text-emerald-400 tracking-tight">Draft Complete</div>
          <div className="text-sm text-emerald-300/50 mt-1">
            All {draft.picks.length} picks are in &middot; Rosters locked
          </div>
        </div>
      </div>
    )
  }

  if (draft.status !== 'in_progress') {
    return (
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 px-5 py-4 text-center">
        <div className="inline-flex items-center gap-2 text-sm text-slate-400">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
          Waiting for the commissioner to start the draft&hellip;
        </div>
      </div>
    )
  }

  const clockId = oidString(draft.clock_team_id)
  const clockTeam = teams.find((t) => oidString(t._id) === clockId)
  const totalPicks = draft.picks.length + 1
  const isUrgent = remaining !== null && remaining <= 10 && remaining > 0

  if (isMyTurn) {
    return (
      <div className="relative overflow-hidden rounded-xl border-2 border-amber-500/50 animate-glow-amber">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-950/70 via-amber-900/30 to-amber-950/70" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent animate-[gradient-shift_3s_ease_infinite] bg-[length:200%_100%]" />

        <div className="relative px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-[0.65rem] font-black uppercase tracking-widest text-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Your Pick
                </span>
                <span className="text-[0.65rem] text-amber-500/50 tabular-nums">
                  Round {draft.current_round} &middot; Pick #{totalPicks} &middot; {draft.direction === 'forward' ? '→' : '←'}
                </span>
              </div>
              <div className="text-xl font-bold text-white">
                {clockTeam?.name ?? 'Your Team'}
                <span className="text-amber-400/80 ml-2 text-sm font-medium">is on the clock</span>
              </div>
              <p className="text-xs text-amber-300/40 mt-1">
                Select a stock from the pool below
              </p>
            </div>

            {remaining !== null && timerDuration > 0 && (
              <CircularTimer remaining={remaining} total={timerDuration} />
            )}
          </div>

          {remaining !== null && timerDuration > 0 && (
            <div className="mt-3 h-1 rounded-full bg-slate-800/60 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  isUrgent ? 'bg-red-500' : remaining !== null && remaining <= 30 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.max(0, ((remaining ?? 0) / timerDuration) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {justPicked && (
          <div className="relative border-t border-amber-800/30 px-5 py-2 animate-pick-in">
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded bg-emerald-900/40 border border-emerald-700/30 px-2 py-0.5 text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Just picked
              </span>
              <span className="font-mono font-bold text-emerald-300">{justPicked.symbol}</span>
              <span className="text-slate-500">by {justPicked.team}</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`rounded-xl px-5 py-3 border bg-slate-800/40 transition-all duration-300 ${
      justPicked ? 'border-emerald-700/40 ring-1 ring-emerald-500/20' : 'border-slate-700/50'
    }`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-700/50 px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            On the clock
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-white">{clockTeam?.name ?? 'Unknown'}</span>
            <span className="text-[0.65rem] text-slate-500 ml-2 tabular-nums">
              Rd {draft.current_round} &middot; #{totalPicks} &middot; {draft.direction === 'forward' ? '→' : '←'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {justPicked && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs animate-pick-in">
              <span className="text-emerald-500 font-medium">Picked:</span>
              <span className="font-mono font-bold text-emerald-300">{justPicked.symbol}</span>
              <span className="text-slate-600">({justPicked.team})</span>
            </div>
          )}
          {remaining !== null && timerDuration > 0 && (
            <CircularTimer remaining={remaining} total={timerDuration} />
          )}
        </div>
      </div>
    </div>
  )
}
