import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
import { useMemo } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import '@solana/wallet-adapter-react-ui/styles.css'
import { AuthProvider, useAuth } from './AuthContext'
import { endpoint, SOLANA_NETWORK } from './config'
import { HomePage } from './pages/HomePage'
import { LeaguePage } from './pages/LeaguePage'
import { useFantasyWs } from './useFantasyWs'

function Shell() {
  const { token, signIn, signOut } = useAuth()
  const wsPayload = useFantasyWs(Boolean(token))

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="font-semibold tracking-tight text-emerald-400">
            Fantasy500
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {token ? (
              <>
                <span className="text-slate-400 hidden sm:inline">Live</span>
                <span
                  className="truncate max-w-[12rem] text-slate-300"
                  title={wsPayload ?? ''}
                >
                  {wsPayload ? 'WS ●' : 'WS …'}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-md border border-slate-700 px-3 py-1.5 hover:bg-slate-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => signIn().catch(console.error)}
                className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium hover:bg-emerald-500"
              >
                Sign message
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/league/:id" element={<LeaguePage />} />
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
        <footer className="text-center text-xs text-slate-600 pb-6">
          Off-chain game logic · {SOLANA_NETWORK} · verifiable buy-ins & commitments
        </footer>
      </div>
    </BrowserRouter>
  )
}
