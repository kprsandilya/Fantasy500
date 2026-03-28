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

export function TickerBar() {
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
          return (
            <div
              key={`${q.symbol}-${i}`}
              className="flex items-center gap-3 px-6 border-r border-slate-800/60 last:border-r-0"
            >
              <span className="font-mono text-xs font-semibold text-slate-100">{q.symbol}</span>
              <span className="font-mono text-xs text-slate-400">
                ${q.price.toFixed(2)}
              </span>
              <span
                className={`font-mono text-xs font-medium ${
                  up ? 'text-emerald-400' : 'text-rose-400'
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
