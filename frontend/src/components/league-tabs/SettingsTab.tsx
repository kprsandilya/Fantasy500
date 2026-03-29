import { type FormEvent, useState } from 'react'
import { updateLeague, type League } from '../../api'
import { NumberFieldInt, NumberFieldSol } from '../NumberField'

export function SettingsTab({
  id,
  token,
  league,
  setLeague,
  isCommissioner,
  joinedCount,
  maxTeams,
}: {
  id: string
  token: string | null
  league: League | null
  setLeague: (l: League) => void
  isCommissioner: boolean
  joinedCount: number
  maxTeams: number
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)

  const [editName, setEditName] = useState('')
  const [editTeams, setEditTeams] = useState(4)
  const [editBuyIn, setEditBuyIn] = useState('')
  const [editRounds, setEditRounds] = useState(10)
  const [editRoster, setEditRoster] = useState(10)
  const [editTimer, setEditTimer] = useState(0)

  function openEditor() {
    if (!league) return
    setEditName(league.name)
    setEditTeams(league.team_count)
    setEditBuyIn(league.buy_in_lamports ? String(league.buy_in_lamports / 1e9) : '')
    setEditRounds(league.settings?.snake_rounds ?? 10)
    setEditRoster(league.settings?.roster_size ?? 10)
    setEditTimer(league.settings?.draft_timer_seconds ?? 0)
    setEditing(true)
    setEditMsg(null)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!token || !id) return
    setSaving(true)
    setEditMsg(null)
    try {
      const updated = await updateLeague(token, id, {
        name: editName || undefined,
        team_count: editTeams,
        buy_in_lamports:
          editBuyIn.trim() === '' ? undefined : Math.round(Number(editBuyIn) * 1e9),
        snake_rounds: editRounds,
        roster_size: editRoster,
        draft_timer_seconds: editTimer,
      })
      setLeague(updated)
      setEditing(false)
      setEditMsg('Settings saved!')
    } catch (err) {
      setEditMsg(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!league) return null

  const settings: { label: string; value: string | number }[] = [
    { label: 'League Name', value: league.name },
    { label: 'Status', value: league.status },
    { label: 'Commissioner', value: `${league.commissioner_wallet.slice(0, 6)}...${league.commissioner_wallet.slice(-4)}` },
    { label: 'Team Slots', value: `${joinedCount} / ${maxTeams}` },
    { label: 'Season Year', value: league.season_year },
    { label: 'Buy-in', value: league.buy_in_lamports ? `${(league.buy_in_lamports / 1e9).toFixed(2)} SOL` : 'Free' },
    { label: 'Snake Rounds', value: league.settings?.snake_rounds ?? 10 },
    { label: 'Roster Size', value: league.settings?.roster_size ?? 10 },
    { label: 'Draft Pick Timer', value: league.settings?.draft_timer_seconds ? `${league.settings.draft_timer_seconds}s` : 'Off' },
    { label: 'Waiver Period', value: `${league.settings?.waiver_period_hours ?? 24}h` },
    { label: 'Scoring Anchor', value: league.settings?.scoring_week_anchor ?? 'monday' },
  ]

  return (
    <div className="space-y-6">
      {/* Settings display */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">League Configuration</h2>
          {isCommissioner && league.status === 'forming' && !editing && (
            <button
              type="button"
              onClick={openEditor}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-800/50">
          {settings.map((s) => (
            <div key={s.label} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-slate-400">{s.label}</span>
              <span className="text-sm font-medium text-white">{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Edit form */}
      {editing && (
        <section className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Edit Settings</h2>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Cancel
            </button>
          </div>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSave}>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="block text-xs font-medium text-slate-400">League name</span>
              <div className="rounded-xl border border-slate-700/50 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all focus-within:border-emerald-500/45 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.14)] hover:border-slate-600/60">
                <input
                  className="w-full rounded-xl border-0 bg-transparent px-3 py-2.5 text-sm text-white focus:ring-0 focus:outline-none"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
            </label>
            <NumberFieldInt
              label="Teams"
              value={editTeams}
              onChange={setEditTeams}
              min={2}
              max={32}
              emptyFallback={4}
            />
            <NumberFieldInt
              label="Snake rounds"
              value={editRounds}
              onChange={setEditRounds}
              min={1}
              max={30}
              emptyFallback={10}
            />
            <NumberFieldInt
              label="Roster size"
              value={editRoster}
              onChange={setEditRoster}
              min={1}
              max={30}
              emptyFallback={10}
            />
            <NumberFieldSol label="Buy-in (blank = free)" value={editBuyIn} onChange={setEditBuyIn} placeholder="Free" />
            <NumberFieldInt
              label="Pick timer (seconds, 0 = off)"
              value={editTimer}
              onChange={setEditTimer}
              min={0}
              max={600}
              emptyFallback={0}
            />
            <div className="sm:col-span-2 flex items-center gap-3">
              <button type="submit" disabled={saving} className="rounded-md bg-emerald-600 px-5 py-2 font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors">
                Cancel
              </button>
            </div>
          </form>
          {editMsg && <p className="text-sm text-amber-300">{editMsg}</p>}
        </section>
      )}

      {editMsg && !editing && <p className="text-sm text-emerald-400">{editMsg}</p>}
    </div>
  )
}
