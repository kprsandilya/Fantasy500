import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { type FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createLeague,
  leagueIdString,
  listLeagues,
  type League,
} from '../api'
import { useAuth } from '../AuthContext'

const STATUS_STYLE: Record<string, string> = {
  forming: 'bg-blue-500/15 text-blue-400 ring-blue-500/30',
  drafting: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  completed: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
}

export function HomePage() {
  const { token } = useAuth()
  const [leagues, setLeagues] = useState<League[]>([])
  const [name, setName] = useState('Wall Street West')
  const [teams, setTeams] = useState(4)
  const [buyIn, setBuyIn] = useState<number | ''>('')
  const [err, setErr] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    listLeagues(token)
      .then(setLeagues)
      .catch(() => setLeagues([]))
  }, [token])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setErr(null)
    setCreating(true)
    try {
      const l = await createLeague(token, {
        name,
        team_count: teams,
        buy_in_lamports:
          buyIn === '' ? undefined : Math.round(Number(buyIn) * 1_000_000_000),
      })
      setLeagues((prev) => [l, ...prev])
      setShowForm(false)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'failed')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="text-center pt-4 space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-950/30 px-4 py-1.5 text-xs font-medium text-emerald-400 tracking-wide uppercase">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          S&P 500 Fantasy League
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
          Draft blue chips.{' '}
          <span className="text-emerald-400">Score weekly moves.</span>
        </h1>
        <p className="text-slate-400 max-w-lg mx-auto text-sm leading-relaxed">
          Build your dream portfolio in a fantasy league format. Snake drafts,
          waivers, and weekly scoring — powered by live S&P 500 data.
        </p>

        {/* Stat pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {[
            { label: 'Stocks', value: '500+' },
            { label: 'Live Prices', value: 'Real-time' },
            { label: 'Buy-ins', value: 'On-chain' },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-1.5"
            >
              <span className="text-xs font-semibold text-white">{s.value}</span>
              <span className="text-[11px] text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Wallet connect */}
        <div className="pt-2 flex flex-col items-center gap-2">
          <WalletMultiButton className="!bg-emerald-600 hover:!bg-emerald-500 !rounded-xl !px-6 !py-2.5 !font-medium !text-sm" />
          {!token && (
            <p className="text-xs text-slate-500">Connect a Solana wallet to get started</p>
          )}
        </div>
      </section>

      {/* Leagues list */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Leagues</h2>
          {token && !showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New League
            </button>
          )}
        </div>

        {/* Create league form */}
        {token && showForm && (
          <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-white">Create a league</h3>
              <button
                type="button"
                onClick={() => { setShowForm(false); setErr(null) }}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
            <form className="grid gap-3 sm:grid-cols-3" onSubmit={onCreate}>
              <label className="space-y-1.5 text-sm">
                <span className="text-slate-400 text-xs font-medium">League name</span>
                <input
                  className="w-full rounded-lg bg-slate-950 border border-slate-700/60 px-3 py-2 text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40 focus:outline-none transition-colors"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Wall Street West"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-slate-400 text-xs font-medium">Teams</span>
                <input
                  type="number"
                  min={2}
                  max={32}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700/60 px-3 py-2 text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40 focus:outline-none transition-colors"
                  value={teams}
                  onChange={(e) => setTeams(Number(e.target.value))}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-slate-400 text-xs font-medium">Buy-in (SOL)</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700/60 px-3 py-2 text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40 focus:outline-none transition-colors"
                  value={buyIn}
                  placeholder="Free"
                  onChange={(e) =>
                    setBuyIn(e.target.value === '' ? '' : Number(e.target.value))
                  }
                />
              </label>
              {err && <p className="text-sm text-red-400 sm:col-span-3">{err}</p>}
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create league'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* League cards */}
        {leagues.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/60">
              <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">No leagues yet</p>
            <p className="text-xs text-slate-600 mt-1">Create one to get started</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {leagues.map((l) => {
              const id = leagueIdString(l)
              return (
                <Link
                  key={id ?? l.name}
                  to={id ? `/league/${id}` : '#'}
                  className="group rounded-2xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 hover:bg-slate-900/60 transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                        {l.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {l.team_count} teams · {l.season_year}
                        {l.buy_in_lamports
                          ? ` · ${(l.buy_in_lamports / 1_000_000_000).toFixed(2)} SOL`
                          : ' · Free'}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                        STATUS_STYLE[l.status] ?? STATUS_STYLE.completed
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {l.status}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center text-xs text-slate-500 group-hover:text-slate-400 transition-colors">
                    <span>Open league</span>
                    <svg className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
