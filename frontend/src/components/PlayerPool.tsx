import { useMemo, useState } from 'react'
import type { DraftSession } from '../api'
import { companyName } from '../stockNames'

type Props = {
  symbols: string[]
  draft: DraftSession
  isMyTurn: boolean
  onPick: (symbol: string, company: string) => void
  picking: boolean
}

export function PlayerPool({ symbols, draft, isMyTurn, onPick, picking }: Props) {
  const [search, setSearch] = useState('')

  const drafted = useMemo(
    () => new Set(draft.picks.map((p) => p.symbol.toUpperCase())),
    [draft.picks],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    return symbols
      .filter((s) => !drafted.has(s))
      .filter((s) => {
        if (!q) return true
        return s.includes(q) || companyName(s).toUpperCase().includes(q)
      })
  }, [symbols, drafted, search])

  return (
    <div className="flex flex-col rounded-lg border border-slate-700/50 bg-slate-900/60 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-700/50 bg-slate-800/40">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Available Stocks
        </h3>
        <div className="relative">
          <input
            type="text"
            placeholder="Search ticker or company..."
            className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 text-xs">
            {filtered.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[32rem] divide-y divide-slate-800/50">
        {filtered.map((sym) => (
          <div
            key={sym}
            className="group flex items-center justify-between px-3 py-2 hover:bg-slate-800/40 transition-colors"
          >
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold text-slate-200">{sym}</div>
              <div className="text-[0.65rem] text-slate-500 truncate">{companyName(sym)}</div>
            </div>
            {isMyTurn && (
              <button
                type="button"
                disabled={picking}
                className="shrink-0 ml-2 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => onPick(sym, companyName(sym))}
              >
                Draft
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-slate-600">
            No matching stocks
          </div>
        )}
      </div>
    </div>
  )
}
