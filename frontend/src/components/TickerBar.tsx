import { useEffect, useRef, useState } from 'react'
import { getQuotes, type QuoteItem } from '../api'

const REFRESH_MS = 60_000

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type Props = {
  rosterSymbols?: Set<string>
}

export function TickerBar({ rosterSymbols }: Props) {
  const [quotes, setQuotes] = useState<QuoteItem[]>([])
  const orderRef = useRef<string[] | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        let data = await getQuotes()
        if (!orderRef.current) {
          data = shuffle(data)
          orderRef.current = data.map((q) => q.symbol)
        } else {
          const idx = new Map(orderRef.current.map((s, i) => [s, i]))
          data.sort((a, b) => (idx.get(a.symbol) ?? 999) - (idx.get(b.symbol) ?? 999))
        }
        if (mounted) setQuotes(data)
      } catch {
        /* keep stale data */
      }
    }
    void load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  if (quotes.length === 0) {
    return (
      <div className="overflow-hidden border-b border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-center py-2">
          <span className="text-xs text-slate-600 animate-pulse">Loading market data…</span>
        </div>
      </div>
    )
  }

  const items = [...quotes, ...quotes]

  return (
    <div className="overflow-hidden border-b border-slate-800/80 bg-slate-900/40">
      <div className="animate-ticker-scroll flex w-max whitespace-nowrap py-2">
        {items.map((q, i) => {
          const up = q.change >= 0
          const isMine = rosterSymbols?.has(q.symbol.toUpperCase())
          return (
            <div
              key={`${q.symbol}-${i}`}
              className={`flex items-center gap-3 px-6 border-r border-slate-800/60 last:border-r-0 transition-all ${
                isMine ? 'animate-ticker-mine rounded-md bg-emerald-950/30 border-emerald-800/30 mx-1 px-4 py-0.5' : ''
              }`}
            >
              {isMine && (
                <span className="flex items-center gap-1 text-[0.55rem] font-bold uppercase tracking-wider text-emerald-500/80">
                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </span>
              )}
              <span className={`font-mono text-xs font-semibold ${isMine ? 'text-emerald-300' : 'text-slate-100'}`}>
                {q.symbol}
              </span>
              <span className="font-mono text-xs text-slate-400">
                ${q.price.toFixed(2)}
              </span>
              <span
                className={`font-mono text-xs font-medium ${
                  up ? (isMine ? 'text-emerald-300' : 'text-emerald-400') : 'text-rose-400'
                }`}
              >
                {up ? '+' : ''}{q.change_percent.toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
