import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { apiFetch, type League, type Team, oidString } from '../../api'

const EXPLORER = 'https://explorer.solana.com/tx/'
const EXPLORER_ADDR = 'https://explorer.solana.com/address/'
const CLUSTER_PARAM = '?cluster=devnet'

type InstructionDraft = {
  program_id: string
  instruction_name: string
  data_base64: string
}

type ChainConfig = {
  program_id: string
  league_pda: string
}

type TxRecord = {
  label: string
  sig: string
  ts: number
}

export function SolanaTab({
  league,
  teams,
  isCommissioner,
}: {
  league: League | null
  teams: Team[]
  isCommissioner: boolean
}) {
  const { connection } = useConnection()
  const wallet = useWallet()
  const [cfg, setCfg] = useState<ChainConfig | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  /** League PDA already created on-chain for this commissioner + program (seeds are fixed). */
  const [escrowInitialized, setEscrowInitialized] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txLog, setTxLog] = useState<TxRecord[]>([])
  const [payoutWinner, setPayoutWinner] = useState<string>('')

  const adminWallet = league?.commissioner_wallet ?? ''

  useEffect(() => {
    if (!adminWallet) return
    apiFetch<ChainConfig>(`/api/chain/config?admin=${encodeURIComponent(adminWallet)}`)
      .then(setCfg)
      .catch(() => {})
  }, [adminWallet])

  useEffect(() => {
    if (!cfg) return
    let cancelled = false
    const programId = new PublicKey(cfg.program_id)
    const poll = () => {
      const pk = new PublicKey(cfg.league_pda)
      connection
        .getAccountInfo(pk)
        .then((info) => {
          if (cancelled) return
          if (!info) {
            setBalance(null)
            setEscrowInitialized(false)
            return
          }
          setBalance(info.lamports)
          setEscrowInitialized(
            info.owner.equals(programId) && info.data.length > 0,
          )
        })
        .catch(() => {})
    }
    poll()
    const iv = setInterval(poll, 8000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [cfg, connection])

  const addTx = useCallback((label: string, sig: string) => {
    setTxLog((prev) => [{ label, sig, ts: Date.now() }, ...prev])
  }, [])

  const sendIx = useCallback(
    async (
      label: string,
      ix: TransactionInstruction,
    ) => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        setError('Wallet not connected')
        return
      }
      setBusy(label)
      setError(null)
      try {
        const tx = new Transaction().add(ix)
        tx.feePayer = wallet.publicKey
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
        const signed = await wallet.signTransaction(tx)
        const sig = await connection.sendRawTransaction(signed.serialize())
        await connection.confirmTransaction(sig, 'confirmed')
        addTx(label, sig)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    },
    [wallet, connection, addTx],
  )

  const handleInitEscrow = useCallback(async () => {
    if (!cfg || !wallet.publicKey) return
    const buyIn = league?.buy_in_lamports ?? 0
    const maxTeams = league?.team_count ?? 4
    const draft = await apiFetch<InstructionDraft>(
      `/api/chain/ix/init-league?buy_in_lamports=${buyIn}&max_teams=${maxTeams}`,
    )
    const programId = new PublicKey(cfg.program_id)
    const leaguePda = new PublicKey(cfg.league_pda)
    const data = Buffer.from(draft.data_base64, 'base64')

    const ix = new TransactionInstruction({
      programId,
      data,
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: leaguePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    })
    await sendIx('Initialize Escrow', ix)
  }, [cfg, wallet.publicKey, league, sendIx])

  const handleBuyIn = useCallback(async () => {
    if (!cfg || !wallet.publicKey) return
    const draft = await apiFetch<InstructionDraft>('/api/chain/ix/deposit-buy-in')
    const programId = new PublicKey(cfg.program_id)
    const leaguePda = new PublicKey(cfg.league_pda)
    const data = Buffer.from(draft.data_base64, 'base64')

    const ix = new TransactionInstruction({
      programId,
      data,
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: leaguePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    })
    await sendIx('Pay Buy-in', ix)
  }, [cfg, wallet.publicKey, sendIx])

  const handlePayout = useCallback(async () => {
    if (!cfg || !wallet.publicKey || !payoutWinner) return
    if (balance === null || balance === 0) {
      setError('Escrow is empty')
      return
    }
    const rentExempt = await connection.getMinimumBalanceForRentExemption(
      8 + 32 + 8 + 1 + 4 + 1,
    )
    const amount = Math.max(0, balance - rentExempt)
    if (amount <= 0) {
      setError(
        `Nothing to withdraw: the vault must keep ~${(rentExempt / 1e9).toFixed(4)} SOL for rent. ` +
          `Current balance ${(balance / 1e9).toFixed(4)} SOL. Use Pay Buy-in to add escrow, or you already paid out the rest.`,
      )
      return
    }
    const draft = await apiFetch<InstructionDraft>(
      `/api/chain/ix/distribute-payout?amount=${amount}`,
    )
    const programId = new PublicKey(cfg.program_id)
    const leaguePda = new PublicKey(cfg.league_pda)
    let winnerPk: PublicKey
    try {
      winnerPk = new PublicKey(payoutWinner)
    } catch {
      setError('Invalid winner wallet address')
      return
    }
    const data = Buffer.from(draft.data_base64, 'base64')

    const ix = new TransactionInstruction({
      programId,
      data,
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: leaguePda, isSigner: false, isWritable: true },
        { pubkey: winnerPk, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
    })
    await sendIx('Distribute Payout', ix)
  }, [cfg, wallet.publicKey, payoutWinner, balance, connection, sendIx])

  const handleCloseEscrow = useCallback(async () => {
    if (!cfg || !wallet.publicKey) return
    const draft = await apiFetch<InstructionDraft>('/api/chain/ix/close-league')
    const programId = new PublicKey(cfg.program_id)
    const leaguePda = new PublicKey(cfg.league_pda)
    const data = Buffer.from(draft.data_base64, 'base64')
    const ix = new TransactionInstruction({
      programId,
      data,
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: leaguePda, isSigner: false, isWritable: true },
      ],
    })
    await sendIx('Close Escrow', ix)
  }, [cfg, wallet.publicKey, sendIx])

  if (!league) return null

  const buyInSol = league.buy_in_lamports
    ? (league.buy_in_lamports / 1e9).toFixed(4)
    : '0'

  return (
    <div className="space-y-6">
      {/* Vault info */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            Solana Escrow
          </h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoCard label="Program" value={cfg?.program_id ? shortAddr(cfg.program_id) : '…'} />
            <InfoCard label="League PDA" value={cfg?.league_pda ? shortAddr(cfg.league_pda) : '…'} />
            <InfoCard
              label="Vault Balance"
              value={balance !== null ? `${(balance / 1e9).toFixed(4)} SOL` : '…'}
              highlight
            />
            <InfoCard label="Buy-in" value={`${buyInSol} SOL`} />
          </div>

          {cfg?.league_pda && (
            <a
              href={`${EXPLORER_ADDR}${cfg.league_pda}${CLUSTER_PARAM}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2"
            >
              View vault on Solana Explorer
            </a>
          )}
        </div>
      </section>

      {/* Actions */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Actions</h2>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700/40 px-4 py-2 flex items-center justify-between">
              <p className="text-sm text-red-300">{error}</p>
              <button type="button" onClick={() => setError(null)} className="text-xs text-red-400 hover:text-red-200 ml-3">
                Dismiss
              </button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {/* Init Escrow */}
            <ActionBtn
              label="Initialize Escrow"
              desc={
                escrowInitialized
                  ? 'Vault already exists for this commissioner on devnet'
                  : 'Create on-chain vault PDA'
              }
              onClick={handleInitEscrow}
              busy={busy === 'Initialize Escrow'}
              disabled={
                !wallet.publicKey || !isCommissioner || escrowInitialized
              }
              icon="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />

            {/* Pay Buy-in */}
            <ActionBtn
              label="Pay Buy-in"
              desc={`Transfer ${buyInSol} SOL to vault`}
              onClick={handleBuyIn}
              busy={busy === 'Pay Buy-in'}
              disabled={!wallet.publicKey}
              icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
            />

            {/* Payout */}
            <ActionBtn
              label="Distribute Payout"
              desc="Send vault balance to winner"
              onClick={handlePayout}
              busy={busy === 'Distribute Payout'}
              disabled={!wallet.publicKey || !isCommissioner}
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />

            <ActionBtn
              label="Close Escrow"
              desc="Return all vault SOL to you; then you can Initialize again"
              onClick={handleCloseEscrow}
              busy={busy === 'Close Escrow'}
              disabled={
                !wallet.publicKey || !isCommissioner || !escrowInitialized
              }
              icon="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </div>

          {isCommissioner && (
            <div className="flex gap-2 items-end">
              <label className="flex-1 space-y-1">
                <span className="text-xs text-slate-400">Winner wallet (for payout)</span>
                <select
                  className="w-full rounded-lg border border-slate-700/50 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
                  value={payoutWinner}
                  onChange={(e) => setPayoutWinner(e.target.value)}
                >
                  <option value="">Select team…</option>
                  {teams.map((t) => (
                    <option key={oidString(t._id)} value={t.owner_wallet}>
                      {t.name} — {shortAddr(t.owner_wallet)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      </section>

      {/* Transaction log */}
      {txLog.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Transaction Log
            </h2>
          </div>
          <div className="divide-y divide-slate-800/60">
            {txLog.map((tx) => (
              <div key={tx.sig} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">{tx.label}</p>
                  <a
                    href={`${EXPLORER}${tx.sig}${CLUSTER_PARAM}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-violet-400 hover:text-violet-300 font-mono underline underline-offset-2"
                  >
                    {tx.sig.slice(0, 20)}…
                  </a>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 text-[11px] font-semibold">
                  Confirmed
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function InfoCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
      <div className="text-[0.6rem] uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className={`text-sm font-semibold mt-0.5 font-mono ${
          highlight ? 'text-violet-300' : 'text-white'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function ActionBtn({
  label,
  desc,
  onClick,
  busy,
  disabled,
  icon,
}: {
  label: string
  desc: string
  onClick: () => void
  busy: boolean
  disabled: boolean
  icon: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="group rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 text-left hover:border-violet-600/40 hover:bg-slate-800/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <svg
          className="h-4 w-4 text-violet-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span className="text-sm font-semibold text-white">{busy ? 'Signing…' : label}</span>
      </div>
      <p className="text-xs text-slate-500">{desc}</p>
    </button>
  )
}
