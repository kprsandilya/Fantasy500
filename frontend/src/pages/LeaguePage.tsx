import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  draftPick,
  getDraft,
  joinLeague,
  startDraft,
} from '../api'
import { useAuth } from '../AuthContext'

export function LeaguePage() {
  const { id } = useParams()
  const { token } = useAuth()
  const [teamName, setTeamName] = useState('My desk')
  const [symbol, setSymbol] = useState('AAPL')
  const [company, setCompany] = useState('Apple Inc.')
  const [draft, setDraft] = useState<{
    status: string
    picks: { symbol: string; overall: number; team_id: string }[]
    clock_team_id?: string
  } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function refresh() {
    if (!id) return
    try {
      const d = await getDraft(id)
      setDraft(d)
    } catch {
      setDraft(null)
    }
  }

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 5000)
    return () => clearInterval(t)
  }, [id])

  if (!id) return null

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm text-slate-500">League</p>
        <h1 className="text-2xl font-semibold text-white font-mono break-all">{id}</h1>
      </header>

      {token && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
          <h2 className="text-lg font-medium text-white">Join</h2>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-md bg-slate-950 border border-slate-800 px-3 py-2"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <button
              type="button"
              className="rounded-md bg-slate-800 px-3 py-2"
              onClick={() =>
                joinLeague(token, id, teamName)
                  .then(() => setMsg('Joined'))
                  .catch((e) => setMsg(String(e)))
              }
            >
              Join league
            </button>
            <button
              type="button"
              className="rounded-md bg-emerald-700 px-3 py-2"
              onClick={() =>
                startDraft(token, id)
                  .then(() => refresh())
                  .catch((e) => setMsg(String(e)))
              }
            >
              Start draft (commissioner)
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-white">Draft</h2>
          <span className="text-xs text-slate-500">{draft?.status}</span>
        </div>
        {draft && (
          <div className="text-sm text-slate-300 space-y-2">
            <div>Picks: {draft.picks.length}</div>
            <ul className="text-xs font-mono space-y-1 max-h-48 overflow-auto">
              {draft.picks.map((p) => (
                <li key={p.overall}>
                  #{p.overall} {p.symbol}
                </li>
              ))}
            </ul>
          </div>
        )}
        {token && (
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm space-y-1">
              <span className="text-slate-400">Symbol</span>
              <input
                className="block rounded-md bg-slate-950 border border-slate-800 px-3 py-2"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            </label>
            <label className="text-sm space-y-1">
              <span className="text-slate-400">Company</span>
              <input
                className="block rounded-md bg-slate-950 border border-slate-800 px-3 py-2"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-md bg-emerald-600 px-3 py-2"
              onClick={() =>
                draftPick(token, id, symbol, company)
                  .then(() => refresh())
                  .catch((e) => setMsg(String(e)))
              }
            >
              Submit pick
            </button>
          </div>
        )}
        {msg && <p className="text-sm text-amber-300">{msg}</p>}
      </section>
    </div>
  )
}
