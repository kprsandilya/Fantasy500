import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  autoPick,
  draftPick,
  getDraft,
  getLeague,
  getTeams,
  getUniverse,
  oidString,
  type DraftSession,
  type League,
  type Team,
} from '../api'
import { useAuth } from '../AuthContext'
import { useFantasyWs } from '../useFantasyWs'
import { DraftBoard } from '../components/DraftBoard'
import { OnTheClock } from '../components/OnTheClock'
import { PlayerPool } from '../components/PlayerPool'
import { MyTeam } from '../components/MyTeam'
import { RecentPicks } from '../components/RecentPicks'

type TabId = 'board' | 'players' | 'myteam'

export function DraftPage() {
  const { id } = useParams()
  const { token } = useAuth()
  const { last: wsPayload } = useFantasyWs(Boolean(token))

  const [league, setLeague] = useState<League | null>(null)
  const [draft, setDraft] = useState<DraftSession | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [symbols, setSymbols] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<TabId>('board')

  const walletRef = useRef<string | null>(null)

  useEffect(() => {
    if (!token) return
    try {
      const parts = token.split('.')
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]))
        walletRef.current = payload.wallet ?? null
      }
    } catch {
      walletRef.current = null
    }
  }, [token])

  const fetchAll = useCallback(async () => {
    if (!id) return
    try {
      const [l, d, t, u] = await Promise.all([
        getLeague(id, token),
        getDraft(id).catch(() => null),
        getTeams(id),
        getUniverse(),
      ])
      setLeague(l)
      setDraft(d)
      setTeams(t)
      setSymbols(u.symbols)
    } catch {
      /* polling errors are fine */
    }
  }, [id, token])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (!id) return
    const interval = setInterval(() => void fetchAll(), 4000)
    return () => clearInterval(interval)
  }, [id, fetchAll])

  useEffect(() => {
    if (!wsPayload) return
    try {
      const msg = JSON.parse(wsPayload)
      if (msg.type === 'DraftUpdated' && msg.payload?.session) {
        const s = msg.payload.session as DraftSession
        const sLeague = oidString(s.league_id)
        if (sLeague === id) setDraft(s)
      }
    } catch {
      /* not json */
    }
  }, [wsPayload, id])

  const myTeam = useMemo(() => {
    const w = walletRef.current
    if (!w) return null
    return teams.find((t) => t.owner_wallet === w) ?? null
  }, [teams])

  const isMyTurn = useMemo(() => {
    if (!draft || !myTeam) return false
    const clockId = oidString(draft.clock_team_id)
    return clockId === oidString(myTeam._id)
  }, [draft, myTeam])

  const totalRounds = league?.settings?.snake_rounds ?? 10
  const timerDuration = league?.settings?.draft_timer_seconds ?? 0
  const autoPickingRef = useRef(false)

  const handleTimerExpired = useCallback(async () => {
    if (!id || autoPickingRef.current) return
    autoPickingRef.current = true
    try {
      const updated = await autoPick(id)
      setDraft(updated)
    } catch {
      void fetchAll()
    } finally {
      autoPickingRef.current = false
    }
  }, [id, fetchAll])

  async function handlePick(symbol: string, company: string) {
    if (!token || !id) return
    setPicking(true)
    setError(null)
    try {
      const updated = await draftPick(token, id, symbol, company)
      setDraft(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pick failed')
    } finally {
      setPicking(false)
    }
  }

  if (!league || !draft) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading draft room...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to={`/league/${id}`}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">{league.name}</h1>
            <p className="text-xs text-slate-500">
              Snake Draft &middot; {league.team_count} teams &middot; {totalRounds} rounds
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              draft.status === 'in_progress'
                ? 'bg-emerald-900/40 text-emerald-400'
                : draft.status === 'completed'
                  ? 'bg-blue-900/40 text-blue-400'
                  : 'bg-slate-800 text-slate-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                draft.status === 'in_progress' ? 'bg-emerald-400 animate-pulse' : 'bg-current'
              }`}
            />
            {draft.status === 'in_progress' ? 'Live' : draft.status === 'completed' ? 'Complete' : draft.status}
          </span>
        </div>
      </div>

      {/* On the clock banner */}
      <OnTheClock
        draft={draft}
        teams={teams}
        isMyTurn={isMyTurn}
        timerDuration={timerDuration}
        onTimerExpired={handleTimerExpired}
      />

      {error && (
        <div className="rounded-md bg-red-900/30 border border-red-700/40 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Mobile tabs */}
      <div className="flex gap-1 lg:hidden bg-slate-800/50 p-1 rounded-lg">
        {(['board', 'players', 'myteam'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mobileTab === tab
                ? 'bg-slate-700 text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab === 'board' ? 'Draft Board' : tab === 'players' ? 'Players' : 'My Team'}
          </button>
        ))}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4">
        {/* Left: board + players */}
        <div className="space-y-4 min-w-0">
          <div className={mobileTab === 'board' ? '' : 'hidden lg:block'}>
            <DraftBoard draft={draft} teams={teams} totalRounds={totalRounds} />
          </div>
          <div className={mobileTab === 'players' ? '' : 'hidden lg:block'}>
            <PlayerPool
              symbols={symbols}
              draft={draft}
              isMyTurn={isMyTurn}
              onPick={handlePick}
              picking={picking}
            />
          </div>
        </div>

        {/* Right sidebar */}
        <div className={`space-y-4 ${mobileTab === 'myteam' ? '' : 'hidden lg:block'}`}>
          <MyTeam draft={draft} myTeam={myTeam} totalRounds={totalRounds} />
          <RecentPicks picks={draft.picks} teams={teams} />
        </div>
      </div>
    </div>
  )
}
