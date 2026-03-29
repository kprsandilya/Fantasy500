import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createLeague,
  getQuotes,
  leagueIdString,
  listLeagues,
  type League,
  type QuoteItem,
} from '../api'
import { NumberFieldInt, NumberFieldSol } from '../components/NumberField'
import { useAuth } from '../AuthContext'
import logoSrc from '../assets/logo.png'

const STATUS_STYLE: Record<string, string> = {
  forming: 'bg-blue-500/15 text-blue-400 ring-blue-500/30',
  drafting: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  completed: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
}

function MiniTicker({ q }: { q: QuoteItem }) {
  const up = q.change >= 0
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/60 bg-slate-900/60 px-3 py-2 backdrop-blur-sm">
      <span className="font-mono text-xs font-bold text-white">{q.symbol}</span>
      <div className="text-right">
        <div className="font-mono text-xs text-slate-300">${q.price.toFixed(2)}</div>
        <div className={`font-mono text-[10px] font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
          {up ? '▲' : '▼'} {Math.abs(q.change_percent).toFixed(2)}%
        </div>
      </div>
    </div>
  )
}

function FloatingTickers() {
  const [quotes, setQuotes] = useState<QuoteItem[]>([])

  useEffect(() => {
    getQuotes().then(setQuotes).catch(() => {})
  }, [])

  const selected = useMemo(() => {
    if (quotes.length === 0) return []
    const sorted = [...quotes].sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
    return sorted.slice(0, 8)
  }, [quotes])

  if (selected.length === 0) return null

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
      <div className="absolute -left-4 top-8 w-36 opacity-[0.35] blur-[0.5px] animate-float-slow">
        <MiniTicker q={selected[0]} />
      </div>
      <div className="absolute -right-2 top-4 w-36 opacity-[0.3] blur-[0.5px] animate-float-slow-reverse">
        <MiniTicker q={selected[1]} />
      </div>
      <div className="absolute left-2 bottom-12 w-36 opacity-[0.25] blur-[0.5px] animate-float-slow-reverse">
        <MiniTicker q={selected[2]} />
      </div>
      <div className="absolute right-4 bottom-16 w-36 opacity-[0.3] blur-[0.5px] animate-float-slow">
        <MiniTicker q={selected[3]} />
      </div>
      {selected[4] && (
        <div className="absolute left-1/4 top-2 w-36 opacity-[0.2] blur-[0.5px] animate-float-slow hidden lg:block">
          <MiniTicker q={selected[4]} />
        </div>
      )}
      {selected[5] && (
        <div className="absolute right-1/4 bottom-6 w-36 opacity-[0.2] blur-[0.5px] animate-float-slow-reverse hidden lg:block">
          <MiniTicker q={selected[5]} />
        </div>
      )}
    </div>
  )
}

const STEPS = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    title: 'Create a league',
    desc: 'Invite friends, set team count & optional SOL buy-in.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
    title: 'Snake draft stocks',
    desc: 'Pick from the full S&P 500 in a live snake draft.',
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.52.587 6.023 6.023 0 0 1-2.52-.587" />
      </svg>
    ),
    title: 'Win with price moves',
    desc: 'Weekly % gains on your roster = points. Top scorer wins the pot.',
  },
]

export function HomePage() {
  const { token } = useAuth()
  const [leagues, setLeagues] = useState<League[]>([])
  const [name, setName] = useState('Wall Street West')
  const [teams, setTeams] = useState(4)
  const [buyIn, setBuyIn] = useState('')
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
          buyIn.trim() === ''
            ? undefined
            : Math.round(Number(buyIn) * 1_000_000_000),
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
    <div className="space-y-16">
      {/* ── Hero ── */}
      <section className="relative text-center pt-6 pb-2">
        <FloatingTickers />

        <div className="relative z-10 space-y-5">
          <img
            src={logoSrc}
            alt="Fantasy500"
            className="mx-auto h-24 w-24 drop-shadow-[0_0_20px_rgba(16,185,129,0.25)]"
          />
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-xs font-medium text-emerald-400 tracking-wide uppercase shadow-[0_0_15px_rgba(16,185,129,0.08)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live S&P 500 Fantasy
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
            Draft stocks.
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent">
              Beat your friends.
            </span>
          </h1>

          <p className="text-slate-400 max-w-md mx-auto text-base leading-relaxed">
            Fantasy meets the stock market. Draft from the S&P 500,
            score weekly price moves, and compete for on-chain prizes.
          </p>

          <div className="pt-1 flex flex-col items-center gap-3">
            <WalletMultiButton className="!bg-emerald-600 hover:!bg-emerald-500 !rounded-xl !px-8 !py-3 !font-semibold !text-sm !shadow-lg !shadow-emerald-900/30 !transition-all hover:!shadow-emerald-900/50 hover:!scale-[1.02]" />
            {!token && (
              <p className="text-xs text-slate-500">Connect a Solana wallet to get started</p>
            )}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="group relative rounded-2xl border border-slate-800/80 bg-slate-900/30 p-5 hover:border-slate-700/80 hover:bg-slate-900/50 transition-all duration-300"
            >
              <div className="absolute -top-3 -left-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow-md shadow-emerald-900/40">
                {i + 1}
              </div>
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/80 text-emerald-400 group-hover:bg-emerald-900/40 transition-colors">
                {step.icon}
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">{step.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Leagues ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">Your Leagues</h2>
            {leagues.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-800 px-1.5 text-[11px] font-semibold text-slate-400">
                {leagues.length}
              </span>
            )}
          </div>
          {token && !showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 shadow-md shadow-emerald-900/20 hover:shadow-emerald-900/40 transition-all hover:scale-[1.02]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New League
            </button>
          )}
        </div>

        {/* Create league form */}
        {token && showForm && (
          <div className="rounded-2xl border border-emerald-700/30 bg-gradient-to-b from-emerald-950/20 to-transparent p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Create a league</h3>
              <button
                type="button"
                onClick={() => { setShowForm(false); setErr(null) }}
                className="rounded-lg px-2.5 py-1 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-all"
              >
                Cancel
              </button>
            </div>
            <form className="grid gap-3 sm:grid-cols-3" onSubmit={onCreate}>
              <label className="space-y-1.5 text-sm sm:col-span-1">
                <span className="block text-xs font-medium text-slate-400">League name</span>
                <div className="rounded-xl border border-slate-700/50 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all focus-within:border-emerald-500/45 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.14)] hover:border-slate-600/60">
                  <input
                    className="w-full rounded-xl border-0 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:ring-0 focus:outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Wall Street West"
                  />
                </div>
              </label>
              <NumberFieldInt
                label="Teams"
                value={teams}
                onChange={setTeams}
                min={2}
                max={32}
                emptyFallback={4}
              />
              <NumberFieldSol label="Buy-in" value={buyIn} onChange={setBuyIn} placeholder="Free" />
              {err && <p className="text-sm text-red-400 sm:col-span-3">{err}</p>}
              <div className="sm:col-span-3 pt-1">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 shadow-md shadow-emerald-900/20 transition-all disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create league'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* League cards */}
        {leagues.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800/80 py-14 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800/40 ring-1 ring-slate-700/40">
              <svg className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">No leagues yet</p>
            <p className="text-xs text-slate-600 mt-1">
              {token ? 'Create your first league above' : 'Connect your wallet to create one'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {leagues.map((l) => {
              const id = leagueIdString(l)
              const isBuyIn = !!l.buy_in_lamports
              return (
                <Link
                  key={id ?? l.name}
                  to={id ? `/league/${id}` : '#'}
                  className="group relative rounded-2xl border border-slate-800 bg-slate-900/40 p-5 hover:border-emerald-800/50 hover:bg-slate-900/60 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                          {l.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-slate-500">{l.team_count} teams</span>
                          <span className="h-1 w-1 rounded-full bg-slate-700" />
                          <span className="text-xs text-slate-500">{l.season_year}</span>
                          {isBuyIn && (
                            <>
                              <span className="h-1 w-1 rounded-full bg-slate-700" />
                              <span className="text-xs font-medium text-emerald-500/80">
                                {(l.buy_in_lamports! / 1_000_000_000).toFixed(2)} SOL
                              </span>
                            </>
                          )}
                        </div>
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
                    <div className="mt-4 flex items-center text-xs font-medium text-slate-500 group-hover:text-emerald-400/80 transition-colors">
                      <span>Open league</span>
                      <svg className="ml-1 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                      </svg>
                    </div>
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
