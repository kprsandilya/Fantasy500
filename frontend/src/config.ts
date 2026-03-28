import { clusterApiUrl } from '@solana/web3.js'

export const SOLANA_NETWORK = 'devnet' as const

export const endpoint =
  import.meta.env.VITE_SOLANA_RPC?.trim() || clusterApiUrl(SOLANA_NETWORK)

export const apiBase = import.meta.env.VITE_API_BASE?.trim() || ''
