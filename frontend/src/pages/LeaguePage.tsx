import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getDraft,
  getLeague,
  joinLeague,
  startDraft,
  updateLeague,
  type DraftSession,
  type League,
} from '../api'
import { useAuth } from '../AuthContext'

export function LeaguePage() {
  const { id } = useParams()
  const { token } = useAuth()
  const [league, setLeague] = useState<League | null>(null)
  const [draft, setDraft] = useState<DraftSession | null>(null)
  const [teamName, setTeamName] = useState('My desk')
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const [editName, setEditName] = useState('')
  const [editTeams, setEditTeams] = useState(4)
  const [editBuyIn, setEditBuyIn] = useState<number | ''>('')
  const [editRounds, setEditRounds] = useState(10)
  const [editRoster, setEditRoster] = useState(10)
  const [saving, setSaving] = useState(false)

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

  async function refresh() {
    if (!id) return
    try {
      const [l, d] = await Promise.all([
        getLeague(id, token),
        getDraft(id).catch(() => null),
      ])
      setLeague(l)
      setDraft(d)
    } catch {
      /* ok */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 5000)
    return () => clearInterval(t)
  }, [id, token])

  function openEditor() {
    if (!league) return
    setEditName(league.name)
    setEditTeams(league.team_count)
    setEditBuyIn(
      league.buy_in_lamports ? league.buy_in_lamports / 1_000_000_000 : '',
    )
    setEditRounds(league.settings?.snake_rounds ?? 10)
    setEditRoster(league.settings?.roster_size ?? 10)
    setEditing(true)
    setMsg(null)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!token || !id) return
    setSaving(true)
    setMsg(null)
    try {
      const updated = await updateLeague(token, id, {
        name: editName || undefined,
        team_count: editTeams,
        buy_in_lamports:
          editBuyIn === '' ? undefined : Math.round(Number(editBuyIn) * 1_000_000_000),
        snake_rounds: editRounds,
        roster_size: editRoster,
      })
      setLeague(updated)
      setEditing(false)
      setMsg('Settings saved!')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!id) return null

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isCommissioner =
    !!walletRef.current &&
    !!league &&
    walletRef.current === league.commissioner_wallet

  const statusColor: Record<string, string> = {
    forming: 'bg-blue-900/40 text-blue-400',
    drafting: 'bg-amber-900/40 text-amber-400',
    active: 'bg-emerald-900/40 text-emerald-400',
    completed: 'bg-slate-800 text-slate-400',
  }

  return (
    <div className="space-y-8">
      {/* League header */}
      <header className="space-y-3">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
          &larr; All leagues
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {league?.name ?? 'League'}
            </h1>
            <p className="text-sm text-slate-500 font-mono break-all mt-1">{id}</p>
          </div>
          <div className="flex items-center gap-2">
            {isCommissioner && league?.status === 'forming' && !editing && (
              <button
                type="button"
                onClick={openEditor}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit settings
              </button>
            )}
            {league && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  statusColor[league.status] ?? 'bg-slate-800 text-slate-500'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {league.status}
              </span>
            )}
          </div>
        </div>
        {isCommissioner && (
          <p className="text-xs text-emerald-600">You are the commissioner</p>
        )}
      </header>

      {/* Edit league form */}
      {editing && league && (
        <section className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Edit League Settings</h2>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSave}>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">League name</span>
              <input
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">Teams</span>
              <input
                type="number"
                min={2}
                max={32}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                value={editTeams}
                onChange={(e) => setEditTeams(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">Snake rounds</span>
              <input
                type="number"
                min={1}
                max={30}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                value={editRounds}
                onChange={(e) => setEditRounds(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">Roster size</span>
              <input
                type="number"
                min={1}
                max={30}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                value={editRoster}
                onChange={(e) => setEditRoster(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-slate-400">Buy-in (SOL, leave blank for free)</span>
              <input
                type="number"
                step="0.01"
                min={0}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                value={editBuyIn}
                onChange={(e) =>
                  setEditBuyIn(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </label>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-emerald-600 px-5 py-2 font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* League info */}
      {league && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Teams', value: league.team_count },
            { label: 'Rounds', value: league.settings?.snake_rounds ?? 10 },
            { label: 'Season', value: league.season_year },
            {
              label: 'Buy-in',
              value: league.buy_in_lamports
                ? `${(league.buy_in_lamports / 1_000_000_000).toFixed(2)} SOL`
                : 'Free',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3"
            >
              <div className="text-[0.65rem] uppercase tracking-wider text-slate-500">
                {stat.label}
              </div>
              <div className="text-lg font-semibold text-white mt-0.5">{stat.value}</div>
            </div>
          ))}
        </section>
      )}

      {/* Join / Start draft actions */}
      {token && league?.status === 'forming' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <h2 className="text-lg font-medium text-white">Join this league</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm space-y-1 flex-1 min-w-[12rem]">
              <span className="text-slate-400">Team name</span>
              <input
                className="w-full rounded-md bg-slate-950 border border-slate-800 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-md bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 transition-colors"
              onClick={() =>
                joinLeague(token, id, teamName)
                  .then(() => {
                    setMsg('Joined!')
                    void refresh()
                  })
                  .catch((e) => setMsg(String(e)))
              }
            >
              Join league
            </button>
          </div>
          {isCommissioner && (
            <button
              type="button"
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium hover:bg-amber-500 transition-colors"
              onClick={() =>
                startDraft(token, id)
                  .then(() => void refresh())
                  .catch((e) => setMsg(String(e)))
              }
            >
              Start draft
            </button>
          )}
          {msg && <p className="text-sm text-amber-300">{msg}</p>}
        </section>
      )}

      {/* Draft section */}
      {draft && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-white">Draft</h2>
            <span className="text-xs text-slate-500 capitalize">{draft.status}</span>
          </div>

          {(draft.status === 'in_progress' || draft.status === 'completed') && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                {draft.picks.length} picks made
                {draft.status === 'in_progress' && ` · Round ${draft.current_round}`}
              </p>

              <Link
                to={`/league/${id}/draft`}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {draft.status === 'in_progress' ? 'Enter Draft Room' : 'View Draft Results'}
              </Link>

              {draft.picks.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Latest picks
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {[...draft.picks]
                      .reverse()
                      .slice(0, 12)
                      .map((p) => (
                        <span
                          key={p.overall}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-xs"
                        >
                          <span className="text-slate-500">#{p.overall}</span>
                          <span className="font-mono font-semibold text-emerald-400">
                            {p.symbol}
                          </span>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {msg && !editing && league?.status !== 'forming' && (
        <p className="text-sm text-amber-300">{msg}</p>
      )}
    </div>
  )
}
