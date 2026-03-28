import bs58 from 'bs58'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { authChallenge, authVerify } from './api'

type AuthState = {
  token: string | null
  signIn: () => Promise<void>
  signOut: () => void
}

const Ctx = createContext<AuthState | undefined>(undefined)

const STORAGE_KEY = 'fantasy500_jwt'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, signMessage } = useWallet()
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  )

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) throw new Error('Wallet not ready')
    const wallet = publicKey.toBase58()
    const { message } = await authChallenge(wallet)
    const sigBytes = await signMessage(new TextEncoder().encode(message))
    const signature = bs58.encode(sigBytes)
    const res = await authVerify({ wallet, message, signature })
    localStorage.setItem(STORAGE_KEY, res.token)
    setToken(res.token)
  }, [publicKey, signMessage])

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setToken(null)
  }, [])

  const value = useMemo(
    () => ({ token, signIn, signOut }),
    [token, signIn, signOut],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}

export function useWalletConnected() {
  const { connected } = useWallet()
  return connected
}
