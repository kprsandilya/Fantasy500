import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getUniverse,
  oidString,
  setLineup,
  submitWaiver,
  type League,
  type RosterEntry,
  type Team,
} from '../../api'
import { companyName } from '../../stockNames'

export function RosterTab({
  id,
  token,
  teams,
  myTeam,
  walletRef,
  league,
  patchTeam,
}: {
  id: string
  token: string | null
  teams: Team[]
  myTeam: Team | null
  walletRef: React.RefObject<string | null>
  league: League | null
  patchTeam: (t: Team) => void
}) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [universe, setUniverse] = useState<string[]>([])
  const [swapSource, setSwapSource] = useState<{ symbol: string; from: 'active' | 'bench' } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waiverSearch, setWaiverSearch] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null)

  const rosterSize = league?.settings?.roster_size ?? 8
  const isMyRoster = useMemo(() => {
    if (!myTeam) return false
    if (selectedTeamId) return oidString(myTeam._id) === selectedTeamId
    return true
  }, [myTeam, selectedTeamId])

  const viewTeam = useMemo(() => {
    if (selectedTeamId) return teams.find((t) => oidString(t._id) === selectedTeamId) ?? myTeam
    return myTeam ?? teams[0] ?? null
  }, [selectedTeamId, myTeam, teams])

  const starters = useMemo(() => {
    if (!viewTeam) return []
    return viewTeam.roster.filter((r) => r.slot === 'starter')
  }, [viewTeam])

  const bench = useMemo(() => {
    if (!viewTeam) return []
    return viewTeam.roster.filter((r) => r.slot !== 'starter')
  }, [viewTeam])

  const emptyStarterSlots = Math.max(0, rosterSize - starters.length)

  useEffect(() => {
    getUniverse()
      .then((u) => setUniverse(u.symbols))
      .catch(() => {})
  }, [])

  const allRosteredSymbols = useMemo(() => {
    const set = new Set<string>()
    for (const t of teams) for (const r of t.roster) set.add(r.symbol.toUpperCase())
    return set
  }, [teams])

  const waiverPool = useMemo(() => {
    return universe
      .filter((s) => !allRosteredSymbols.has(s.toUpperCase()))
      .map((s) => ({ symbol: s, name: companyName(s) }))
  }, [universe, allRosteredSymbols])

  const filteredWaivers = useMemo(() => {
    if (!waiverSearch) return waiverPool
    const q = waiverSearch.toLowerCase()
    return waiverPool.filter(
      (w) => w.symbol.toLowerCase().includes(q) || w.name.toLowerCase().includes(q),
    )
  }, [waiverPool, waiverSearch])

  const handleSwap = useCallback(
    async (targetSymbol: string, targetFrom: 'active' | 'bench') => {
      if (!swapSource || !token || !id) return
      if (swapSource.symbol === targetSymbol) {
        setSwapSource(null)
        return
      }

      const currentStarters = new Set(starters.map((s) => s.symbol))

      if (swapSource.from === 'bench' && targetFrom === 'active') {
        currentStarters.delete(targetSymbol)
        currentStarters.add(swapSource.symbol)
      } else if (swapSource.from === 'active' && targetFrom === 'bench') {
        currentStarters.delete(swapSource.symbol)
        currentStarters.add(targetSymbol)
      } else {
        setSwapSource(null)
        return
      }

      setSaving(true)
      setError(null)
      try {
        const updated = await setLineup(token, id, [...currentStarters])
        patchTeam(updated)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to swap')
      } finally {
        setSaving(false)
        setSwapSource(null)
      }
    },
    [swapSource, starters, token, id, patchTeam],
  )

  const handleMoveToActive = useCallback(
    async (symbol: string) => {
      if (!token || !id) return
      const currentStarters = new Set(starters.map((s) => s.symbol))
      if (currentStarters.size >= rosterSize) return
      currentStarters.add(symbol)
      setSaving(true)
      setError(null)
      try {
        const updated = await setLineup(token, id, [...currentStarters])
        patchTeam(updated)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to move to active')
      } finally {
        setSaving(false)
      }
    },
    [starters, token, id, rosterSize, patchTeam],
  )

  const handleMoveToBench = useCallback(
    async (symbol: string) => {
      if (!token || !id) return
      const currentStarters = new Set(starters.map((s) => s.symbol))
      currentStarters.delete(symbol)
      setSaving(true)
      setError(null)
      try {
        const updated = await setLineup(token, id, [...currentStarters])
        patchTeam(updated)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to move to bench')
      } finally {
        setSaving(false)
      }
    },
    [starters, token, id, patchTeam],
  )

  const handleResetToBench = useCallback(async () => {
    if (!token || !id) return
    setSaving(true)
    setError(null)
    try {
      const updated = await setLineup(token, id, [])
      patchTeam(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset lineup')
    } finally {
      setSaving(false)
    }
  }, [token, id, patchTeam])

  const handleWaiverAdd = useCallback(
    async (addSym: string, dropSym: string) => {
      if (!token || !id) return
      setSaving(true)
      setError(null)
      try {
        const updated = await submitWaiver(token, id, addSym, dropSym)
        patchTeam(updated)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Waiver claim failed')
      } finally {
        setSaving(false)
        setAddingSymbol(null)
        setDropTarget(null)
      }
    },
    [token, id, patchTeam],
  )

  const handleWaiverAddNoDrop = useCallback(
    async (addSym: string) => {
      if (!token || !id) return
      setSaving(true)
      setError(null)
      try {
        const updated = await submitWaiver(token, id, addSym)
        patchTeam(updated)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Waiver claim failed')
      } finally {
        setSaving(false)
        setAddingSymbol(null)
      }
    },
    [token, id, patchTeam],
  )

  /** One pick per snake round; starters + bench = snake_rounds. */
  const totalRosterSlots = league?.settings?.snake_rounds ?? 10
  const canAddWithoutDrop = viewTeam ? viewTeam.roster.length < totalRosterSlots : false

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-700/40 px-4 py-2 flex items-center justify-between">
          <p className="text-sm text-red-300">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-xs text-red-400 hover:text-red-200 ml-3">Dismiss</button>
        </div>
      )}

      {/* Team selector */}
      {teams.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {teams.map((t) => {
            const tid = oidString(t._id)!
            const isMe = t.owner_wallet === walletRef.current
            const isSelected = viewTeam && oidString(viewTeam._id) === tid
            return (
              <button
                key={tid}
                type="button"
                onClick={() => { setSelectedTeamId(tid); setSwapSource(null); setAddingSymbol(null) }}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border ${
                  isSelected
                    ? 'bg-emerald-900/40 border-emerald-700/50 text-emerald-300'
                    : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-white hover:border-slate-600'
                }`}
              >
                {t.name}{isMe && ' (You)'}
              </button>
            )
          })}
        </div>
      )}

      {/* Drop picker modal */}
      {addingSymbol && (
        <div className="rounded-xl border border-blue-700/40 bg-blue-950/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-blue-300">
                Add <span className="font-mono">{addingSymbol}</span> from Waiver Wire
              </h3>
              <p className="text-xs text-blue-400/70 mt-0.5">
                {canAddWithoutDrop
                  ? 'You have an open roster slot, or select a player to drop.'
                  : 'Select a player from your roster to drop.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setAddingSymbol(null); setDropTarget(null) }}
              className="text-xs text-blue-400 hover:text-blue-200 font-medium px-2 py-1 rounded hover:bg-blue-900/40"
            >
              Cancel
            </button>
          </div>

          {canAddWithoutDrop && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleWaiverAddNoDrop(addingSymbol)}
              className="w-full rounded-lg bg-emerald-700/30 border border-emerald-600/40 text-emerald-300 text-sm font-medium py-2 hover:bg-emerald-700/50 transition-colors disabled:opacity-40"
            >
              Add without dropping anyone
            </button>
          )}

          {viewTeam && viewTeam.roster.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-slate-700/40 bg-slate-900/60">
              {viewTeam.roster.map((entry) => (
                <button
                  key={entry.symbol}
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setDropTarget(entry.symbol)
                    void handleWaiverAdd(addingSymbol, entry.symbol)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-red-900/20 disabled:opacity-40 ${
                    dropTarget === entry.symbol ? 'bg-red-900/30' : ''
                  }`}
                >
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-[0.55rem] font-bold ${
                    entry.slot === 'starter'
                      ? 'bg-emerald-900/40 text-emerald-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {entry.slot === 'starter' ? 'S' : 'BN'}
                  </span>
                  <span className="font-mono font-semibold text-white">{entry.symbol}</span>
                  <span className="text-slate-500 text-xs truncate">{entry.company_name || companyName(entry.symbol)}</span>
                  <span className="ml-auto text-red-400 text-xs font-medium">Drop</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {viewTeam ? (
        <div className="space-y-1">
          {/* Swap mode banner */}
          {swapSource && (
            <div className="rounded-lg bg-amber-900/30 border border-amber-700/40 px-4 py-2 flex items-center justify-between">
              <p className="text-sm text-amber-300">
                Select a player to swap with <span className="font-bold font-mono">{swapSource.symbol}</span>
              </p>
              <button
                type="button"
                onClick={() => setSwapSource(null)}
                className="text-xs text-amber-400 hover:text-amber-200 font-medium"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Reset lineup hint (shows when all entries are starters but user hasn't set lineup) */}
          {isMyRoster && starters.length > 0 && bench.length === 0 && starters.length === viewTeam.roster.length && (
            <div className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-slate-400">
                All companies are currently active. Move them to bench to set your lineup.
              </p>
              <button
                type="button"
                onClick={() => void handleResetToBench()}
                disabled={saving}
                className="text-xs font-medium rounded-md px-3 py-1.5 bg-slate-700 text-white hover:bg-slate-600 transition-colors disabled:opacity-40"
              >
                Reset all to bench
              </button>
            </div>
          )}

          {/* STARTERS TABLE */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_5rem_5rem] sm:grid-cols-[2.5rem_1fr_6rem_6rem_5rem] items-center px-3 py-2 bg-slate-800/60 border-b border-slate-700/50 text-[0.65rem] uppercase tracking-wider text-slate-500 font-semibold">
              <span>Slot</span>
              <span>Company</span>
              <span className="hidden sm:block text-right">Source</span>
              <span className="text-right">Slot</span>
              {isMyRoster && <span className="text-center">Act</span>}
            </div>

            {/* Starter rows */}
            {starters.map((entry) => (
              <RosterRow
                key={entry.symbol}
                entry={entry}
                slotLabel="S"
                slotColor="text-emerald-400 bg-emerald-900/40"
                isOwner={isMyRoster}
                isSwapSource={swapSource?.symbol === entry.symbol}
                isSwapTarget={!!swapSource && swapSource.symbol !== entry.symbol && swapSource.from === 'bench'}
                onSwapSelect={() => {
                  if (swapSource) {
                    void handleSwap(entry.symbol, 'active')
                  } else {
                    setSwapSource({ symbol: entry.symbol, from: 'active' })
                  }
                }}
                onMoveToBench={() => void handleMoveToBench(entry.symbol)}
                saving={saving}
              />
            ))}

            {/* Empty starter slots */}
            {Array.from({ length: emptyStarterSlots }, (_, i) => (
              <div key={`empty-${i}`} className="grid grid-cols-[2.5rem_1fr_5rem_5rem] sm:grid-cols-[2.5rem_1fr_6rem_6rem_5rem] items-center px-3 py-3 border-t border-slate-800/40">
                <span className="text-[0.65rem] font-bold text-slate-600 bg-slate-800/60 rounded w-6 h-6 flex items-center justify-center">S</span>
                <span className="text-sm text-slate-600 italic pl-3">Empty</span>
                <span className="hidden sm:block" />
                <span />
                <span />
              </div>
            ))}

            {/* Divider */}
            <div className="px-3 py-2 bg-slate-800/80 border-t border-b border-slate-700/50">
              <span className="text-[0.65rem] uppercase tracking-wider text-slate-400 font-semibold">
                Bench ({bench.length})
              </span>
            </div>

            {/* Bench rows */}
            {bench.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-slate-600">No bench companies</div>
            ) : (
              bench.map((entry) => (
                <RosterRow
                  key={entry.symbol}
                  entry={entry}
                  slotLabel="BN"
                  slotColor="text-slate-400 bg-slate-800"
                  isOwner={isMyRoster}
                  isSwapSource={swapSource?.symbol === entry.symbol}
                  isSwapTarget={!!swapSource && swapSource.symbol !== entry.symbol && swapSource.from === 'active'}
                  onSwapSelect={() => {
                    if (swapSource) {
                      void handleSwap(entry.symbol, 'bench')
                    } else {
                      setSwapSource({ symbol: entry.symbol, from: 'bench' })
                    }
                  }}
                  onMoveToActive={emptyStarterSlots > 0 ? () => void handleMoveToActive(entry.symbol) : undefined}
                  saving={saving}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center py-8">No teams available</p>
      )}

      {/* WAIVER WIRE */}
      {isMyRoster && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Waiver Wire</h2>
              <p className="text-xs text-slate-500 mt-0.5">{waiverPool.length} companies available &mdash; drop a player to add one</p>
            </div>
            <input
              type="text"
              placeholder="Search ticker or name..."
              value={waiverSearch}
              onChange={(e) => setWaiverSearch(e.target.value)}
              className="w-full sm:w-56 rounded-md bg-slate-950 border border-slate-700 px-3 py-1.5 text-sm placeholder:text-slate-600 focus:border-emerald-600 focus:outline-none"
            />
          </div>
          {waiverPool.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-600">
              Waiver wire will be available after the draft completes
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-800/90 backdrop-blur">
                  <tr className="text-[0.65rem] uppercase tracking-wider text-slate-500">
                    <th className="text-left px-4 py-2 font-semibold">Ticker</th>
                    <th className="text-left px-4 py-2 font-semibold">Company</th>
                    <th className="text-right px-4 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredWaivers.slice(0, 50).map((w) => (
                    <tr key={w.symbol} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className="font-mono font-semibold text-emerald-400">{w.symbol}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-300">{w.name}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          disabled={saving || !!addingSymbol}
                          onClick={() => setAddingSymbol(w.symbol)}
                          className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-[0.65rem] font-semibold uppercase bg-emerald-900/30 text-emerald-400 hover:bg-emerald-800/50 hover:text-emerald-300 transition-colors disabled:opacity-40"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Add
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredWaivers.length > 50 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-center text-xs text-slate-500">
                        Showing 50 of {filteredWaivers.length} &mdash; refine your search
                      </td>
                    </tr>
                  )}
                  {filteredWaivers.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-600">
                        No matches found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Read-only waiver view for other teams */}
      {!isMyRoster && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Waiver Wire</h2>
            <p className="text-xs text-slate-500 mt-0.5">Switch to your team to manage waivers</p>
          </div>
        </section>
      )}
    </div>
  )
}

/* ── Roster Row ── */
function RosterRow({
  entry,
  slotLabel,
  slotColor,
  isOwner,
  isSwapSource,
  isSwapTarget,
  onSwapSelect,
  onMoveToBench,
  onMoveToActive,
  saving,
}: {
  entry: RosterEntry
  slotLabel: string
  slotColor: string
  isOwner: boolean
  isSwapSource: boolean
  isSwapTarget: boolean
  onSwapSelect: () => void
  onMoveToBench?: () => void
  onMoveToActive?: () => void
  saving: boolean
}) {
  const name = entry.company_name || companyName(entry.symbol)

  return (
    <div
      className={`grid grid-cols-[2.5rem_1fr_5rem_5rem] sm:grid-cols-[2.5rem_1fr_6rem_6rem_5rem] items-center px-3 py-2.5 border-t border-slate-800/40 transition-colors ${
        isSwapSource
          ? 'bg-amber-900/20 ring-1 ring-inset ring-amber-600/40'
          : isSwapTarget
            ? 'bg-emerald-900/10 hover:bg-emerald-900/20 cursor-pointer'
            : 'hover:bg-slate-800/30'
      }`}
      onClick={isSwapTarget ? onSwapSelect : undefined}
    >
      {/* Slot badge + swap handle */}
      <div className="flex items-center">
        {isOwner ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSwapSelect() }}
            disabled={saving}
            className={`w-7 h-7 rounded flex items-center justify-center text-[0.6rem] font-bold transition-colors disabled:opacity-40 ${
              isSwapSource
                ? 'bg-amber-600 text-white'
                : isSwapTarget
                  ? 'bg-emerald-600 text-white animate-pulse'
                  : `${slotColor} hover:ring-1 hover:ring-slate-600`
            }`}
            title={isSwapSource ? 'Cancel' : 'Swap'}
          >
            {isSwapTarget ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            ) : (
              slotLabel
            )}
          </button>
        ) : (
          <span className={`w-7 h-7 rounded flex items-center justify-center text-[0.6rem] font-bold ${slotColor}`}>
            {slotLabel}
          </span>
        )}
      </div>

      {/* Company info */}
      <div className="flex items-center gap-2.5 min-w-0 pl-1">
        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-[0.65rem] font-bold text-emerald-400 shrink-0">
          {entry.symbol.slice(0, 3)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">{entry.symbol}</p>
          <p className="text-[0.7rem] text-slate-500 truncate leading-tight">{name}</p>
        </div>
      </div>

      {/* Source */}
      <div className="hidden sm:block text-right">
        <span className="text-[0.65rem] text-slate-500 capitalize">{entry.source}</span>
      </div>

      {/* Slot tag */}
      <div className="text-right">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ${
          entry.slot === 'starter'
            ? 'bg-emerald-900/40 text-emerald-400'
            : 'bg-slate-800 text-slate-400'
        }`}>
          {entry.slot === 'starter' ? 'Starter' : 'Bench'}
        </span>
      </div>

      {/* Quick actions */}
      {isOwner && (
        <div className="flex justify-center">
          {onMoveToBench && entry.slot === 'starter' && !isSwapSource && !isSwapTarget && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveToBench() }}
              disabled={saving}
              className="rounded p-1 text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
              title="Move to bench"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          )}
          {onMoveToActive && entry.slot !== 'starter' && !isSwapSource && !isSwapTarget && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMoveToActive() }}
              disabled={saving}
              className="rounded p-1 text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20 transition-colors disabled:opacity-40"
              title="Move to active"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
