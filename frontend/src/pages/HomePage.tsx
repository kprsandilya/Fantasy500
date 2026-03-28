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

export function HomePage() {
  const { token } = useAuth()
  const [leagues, setLeagues] = useState<League[]>([])
  const [name, setName] = useState('Wall Street West')
  const [teams, setTeams] = useState(4)
  const [buyIn, setBuyIn] = useState<number | ''>('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    listLeagues(token)
      .then(setLeagues)
      .catch(() => setLeagues([]))
  }, [token])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!token) return
    setErr(null)
    try {
      const l = await createLeague(token, {
        name,
        team_count: teams,
        buy_in_lamports:
          buyIn === '' ? undefined : Math.round(Number(buyIn) * 1_000_000_000),
      })
      setLeagues((prev) => [l, ...prev])
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'failed')
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-sm uppercase tracking-widest text-emerald-400/90">
          Fortune 500 fantasy
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold text-white">
          Draft blue chips. Score weekly price moves.
        </h1>
        <p className="text-slate-400 max-w-2xl">
          Leagues, snake drafts, waivers, and weekly scoring run on a fast Rust API with
          MongoDB. Buy-ins, pick commitments, and payouts are designed to anchor on Solana
          while gameplay stays off-chain.
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-white">Wallet</h2>
          <WalletMultiButton className="!bg-emerald-600 hover:!bg-emerald-500 !rounded-lg" />
        </div>
        <p className="text-sm text-slate-400">
          Connect a wallet, then sign the login message to obtain an API session.
        </p>
      </section>

      {token && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <h2 className="text-lg font-medium text-white">Create league</h2>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={onCreate}>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">Name</span>
              <input
                className="w-full rounded-md bg-slate-950 border border-slate-800 px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-400">Teams</span>
              <input
                type="number"
                min={2}
                max={32}
                className="w-full rounded-md bg-slate-950 border border-slate-800 px-3 py-2"
                value={teams}
                onChange={(e) => setTeams(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-slate-400">Buy-in (SOL, optional — on-chain later)</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-md bg-slate-950 border border-slate-800 px-3 py-2"
                value={buyIn}
                onChange={(e) =>
                  setBuyIn(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </label>
            {err && <p className="text-sm text-red-400 sm:col-span-2">{err}</p>}
            <button
              type="submit"
              className="sm:col-span-2 rounded-md bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500"
            >
              Create
            </button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-white">Leagues</h2>
        <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/30">
          {leagues.length === 0 && (
            <li className="px-4 py-6 text-slate-500 text-sm">No leagues yet.</li>
          )}
          {leagues.map((l) => (
            <li
              key={leagueIdString(l) ?? l.name}
              className="px-4 py-3 flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-medium text-white">{l.name}</div>
                <div className="text-xs text-slate-500">
                  {l.status} · {l.team_count} teams · {l.season_year}
                </div>
              </div>
              {leagueIdString(l) && (
                <Link
                  className="text-sm text-emerald-400 hover:underline"
                  to={`/league/${leagueIdString(l)}`}
                >
                  Open
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
