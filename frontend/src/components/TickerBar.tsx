import { useEffect, useState } from 'react'
import { getQuotes, type QuoteItem } from '../api'

const REFRESH_MS = 60_000

export function TickerBar() {
  const [quotes, setQuotes] = useState<QuoteItem[]>([])

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const data = await getQuotes()
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
