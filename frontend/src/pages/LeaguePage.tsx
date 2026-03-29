import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  getDraft,
  getLeague,
  getScores,
  getTeams,
  listJoinRequests,
  oidString,
  type DraftSession,
  type JoinRequest,
  type League,
  type ScoresResponse,
  type Team,
} from '../api'
import { useAuth } from '../AuthContext'
import { LeagueTab, RosterTab, DraftTab, MatchupTab, CommissionerReportTab, SettingsTab } from '../components/league-tabs'

type TabId = 'league' | 'roster' | 'draft' | 'matchup' | 'report' | 'settings'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'league', label: 'League', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { id: 'roster', label: 'Roster', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'draft', label: 'Draft', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { id: 'matchup', label: 'Matchup', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'report', label: 'Report', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
  { id: 'settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
]

export function LeaguePage() {
  const { id } = useParams()
  const { token } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [league, setLeague] = useState<League | null>(null)
  const [draft, setDraft] = useState<DraftSession | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [scores, setScores] = useState<ScoresResponse | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const activeTab = (searchParams.get('tab') as TabId) || 'league'
  const setActiveTab = useCallback(
    (t: TabId) => setSearchParams({ tab: t }, { replace: true }),
    [setSearchParams],
  )

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

  const refresh = useCallback(async () => {
    if (!id) return
    try {
      const [l, d, t, jr, sc] = await Promise.all([
        getLeague(id, token),
        getDraft(id).catch(() => null),
        getTeams(id).catch(() => [] as Team[]),
        listJoinRequests(id, token).catch(() => [] as JoinRequest[]),
        getScores(id).catch(() => null as ScoresResponse | null),
      ])
      setLeague(l)
      setDraft(d)
      setTeams(t)
      setJoinRequests(jr)
      setScores(sc)
    } catch {
      /* ok */
    } finally {
      setLoading(false)
    }
  }, [id, token])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 5000)
    return () => clearInterval(t)
  }, [refresh])

  const patchTeam = useCallback((updated: Team) => {
    setTeams((prev) =>
      prev.map((t) => (oidString(t._id) === oidString(updated._id) ? updated : t)),
    )
  }, [])

  if (!id) return null

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isCommissioner =
    !!walletRef.current && !!league && walletRef.current === league.commissioner_wallet
  const myTeam = teams.find((t) => t.owner_wallet === walletRef.current) ?? null
  const joinedCount = teams.length
  const maxTeams = league?.team_count ?? 0

  const statusColor: Record<string, string> = {
    forming: 'bg-blue-900/40 text-blue-400',
    drafting: 'bg-amber-900/40 text-amber-400',
    active: 'bg-emerald-900/40 text-emerald-400',
    completed: 'bg-slate-800 text-slate-400',
  }

  const pendingCount = joinRequests.filter((r) => r.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* League header */}
      <header className="space-y-3">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
          &larr; All leagues
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{league?.name ?? 'League'}</h1>
            {league && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  statusColor[league.status] ?? 'bg-slate-800 text-slate-500'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {league.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{joinedCount}/{maxTeams} players</span>
            <span>&middot;</span>
            <span>Season {league?.season_year}</span>
          </div>
        </div>
        {isCommissioner && (
          <p className="text-xs text-emerald-600">Commissioner</p>
        )}
      </header>

      {/* Tab bar */}
      <nav className="flex gap-1 border-b border-slate-800 -mb-px overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-emerald-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
            {tab.id === 'draft' && pendingCount > 0 && isCommissioner && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-amber-600 text-[0.6rem] font-bold text-white">
                {pendingCount}
              </span>
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-t" />
            )}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="pt-4">
        {activeTab === 'league' && (
          <LeagueTab league={league} teams={teams} myTeam={myTeam} walletRef={walletRef} scores={scores} />
        )}
        {activeTab === 'roster' && (
          <RosterTab id={id} token={token} teams={teams} myTeam={myTeam} walletRef={walletRef} league={league} patchTeam={patchTeam} />
        )}
        {activeTab === 'draft' && (
          <DraftTab
            id={id}
            token={token}
            league={league}
            draft={draft}
            teams={teams}
            joinRequests={joinRequests}
            isCommissioner={isCommissioner}
            myTeam={myTeam}
            walletRef={walletRef}
            msg={msg}
            setMsg={setMsg}
            refresh={refresh}
            joinedCount={joinedCount}
            maxTeams={maxTeams}
          />
        )}
        {activeTab === 'matchup' && (
          <MatchupTab teams={teams} league={league} myTeam={myTeam} scores={scores} />
        )}
        {activeTab === 'report' && (
          <CommissionerReportTab
            id={id}
            token={token}
            league={league}
            teams={teams}
            scores={scores}
            isCommissioner={isCommissioner}
            walletRef={walletRef}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            id={id}
            token={token}
            league={league}
            setLeague={setLeague}
            isCommissioner={isCommissioner}
            joinedCount={joinedCount}
            maxTeams={maxTeams}
          />
        )}
      </div>

      {msg && <p className="text-sm text-amber-300">{msg}</p>}
    </div>
  )
}
