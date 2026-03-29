import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [justDrafted, setJustDrafted] = useState<{ symbol: string; team: string } | null>(null)
  const prevPickCount = useRef(draft.picks.length)
  const [countBump, setCountBump] = useState(false)

  const drafted = useMemo(
    () => new Set(draft.picks.map((p) => p.symbol.toUpperCase())),
    [draft.picks],
  )

  useEffect(() => {
    if (draft.picks.length > prevPickCount.current) {
      const latest = draft.picks[draft.picks.length - 1]
      setJustDrafted({ symbol: latest.symbol, team: latest.company_name })
      setCountBump(true)
      const t1 = setTimeout(() => setJustDrafted(null), 3000)
      const t2 = setTimeout(() => setCountBump(false), 500)
      prevPickCount.current = draft.picks.length
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    prevPickCount.current = draft.picks.length
  }, [draft.picks])

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
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Available Stocks
          </h3>
          <span className={`tabular-nums text-xs font-bold transition-transform ${
            countBump ? 'animate-count-bump text-amber-400' : 'text-slate-500'
          }`}>
            {filtered.length} left
          </span>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search ticker or company..."
            className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {justDrafted && (
        <div className="px-3 py-2 bg-red-950/30 border-b border-red-800/30 animate-pick-in">
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded bg-red-900/40 border border-red-700/30 px-2 py-0.5 text-red-400 font-semibold">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Off the board
            </span>
            <span className="font-mono font-bold text-red-300">{justDrafted.symbol}</span>
            <span className="text-slate-500">was just drafted</span>
          </div>
        </div>
      )}

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
                className="shrink-0 ml-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
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
