import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import '@solana/wallet-adapter-react-ui/styles.css'
import { AuthProvider, useAuth } from './AuthContext'
import logoSrc from './assets/logo.png'
import { endpoint, SOLANA_NETWORK } from './config'
import { TickerBar } from './components/TickerBar'
import { HomePage } from './pages/HomePage'
import { LeaguePage } from './pages/LeaguePage'
import { DraftPage } from './pages/DraftPage'
import { useFantasyWs } from './useFantasyWs'
import { getTeams, listLeagues, oidString } from './api'

function useMyRosterSymbols(token: string | null): Set<string> {
  const [symbols, setSymbols] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!token) { setSymbols(new Set()); return }

    let wallet: string | null = null
    try {
      const parts = token.split('.')
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]))
        wallet = payload.wallet ?? null
      }
    } catch { return }
    if (!wallet) return

    const w = wallet
    listLeagues(token).then(async (leagues) => {
      const syms = new Set<string>()
      await Promise.all(leagues.map(async (league) => {
        const lid = oidString(league._id)
        if (!lid) return
        try {
          const teams = await getTeams(lid)
          const myTeam = teams.find(t => t.owner_wallet === w)
          if (myTeam) {
            for (const r of myTeam.roster) syms.add(r.symbol.toUpperCase())
          }
        } catch { /* skip */ }
      }))
      setSymbols(syms)
    }).catch(() => {})
  }, [token])

  return symbols
}

function Shell() {
  const { token, signIn, signOut } = useAuth()
  const { connected } = useFantasyWs(Boolean(token))
  const rosterSymbols = useMyRosterSymbols(token)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 group">
            <img src={logoSrc} alt="Fantasy500" className="h-8 w-8 rounded-lg shadow-md shadow-emerald-900/30" />
            <span className="font-bold tracking-tight text-white group-hover:text-emerald-400 transition-colors">
              Fantasy500
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {token ? (
              <>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-600 animate-pulse'}`} />
                  {connected ? 'Connected' : 'Connecting…'}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => signIn().catch(console.error)}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md shadow-emerald-900/20 transition-all"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>
      <TickerBar rosterSymbols={rosterSymbols.size > 0 ? rosterSymbols : undefined} />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/league/:id" element={<LeaguePage />} />
          <Route path="/league/:id/draft" element={<DraftPage />} />
        </Routes>
      </main>
    </div>
  )
}

function WalletTree() {
  const network = WalletAdapterNetwork.Devnet
  const wallets = useMemo(() => [new PhantomWalletAdapter({ network })], [network])
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent" />
        <div className="relative">
          <WalletTree />
        </div>
        <footer className="text-center text-xs text-slate-700 pb-8 pt-4 space-y-2">
          <img src={logoSrc} alt="" className="mx-auto h-6 w-6 opacity-40" />
          <p className="text-slate-600">Fantasy500 — fantasy sports for the stock market</p>
          <p>Off-chain game logic · {SOLANA_NETWORK} · verifiable buy-ins & commitments</p>
        </footer>
      </div>
    </BrowserRouter>
  )
}
