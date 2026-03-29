import { useCallback, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import type { PlayerWeeklyScore, ScoresResponse, Team } from '../api'
import { oidString } from '../api'
import { companyName } from '../stockNames'

type Props = {
  team: Team
  scores: ScoresResponse
}

function generateSummary(totalGain: number, topSymbol: string | null, worstSymbol: string | null): string {
  if (totalGain > 3) return topSymbol ? `${topSymbol} carrying the portfolio this week 🚀` : 'Portfolio is on fire this week 🔥'
  if (totalGain > 1) return 'Steady gains across the board — solid week.'
  if (totalGain > 0) return 'Green is green. Small wins compound.'
  if (totalGain > -1) return 'Flat week — the market giveth and taketh.'
  if (totalGain > -3) return worstSymbol ? `${worstSymbol} dragging things down. Regroup.` : 'Rough week, but still in the game.'
  return 'Red week. Time to rethink the lineup.'
}

function formatWeekRange(weekStart: string): string {
  try {
    const d = new Date(weekStart)
    const end = new Date(d)
    end.setDate(end.getDate() + 4)
    const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(d)} – ${fmt(end)}, ${d.getFullYear()}`
  } catch {
    return weekStart
  }
}

export function WeeklyCard({ team, scores }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  const teamId = oidString(team._id)
  const currentWeek = scores.current_week_start

  const myScores: PlayerWeeklyScore[] = scores.player_scores.filter(
    (ps) => oidString(ps.team_id) === teamId && ps.week_start === currentWeek,
  )

  const sorted = [...myScores].sort((a, b) => b.pct_change - a.pct_change)
  const totalGain = sorted.length > 0 ? sorted.reduce((s, p) => s + p.pct_change, 0) / sorted.length : 0
  const topSymbol = sorted.length > 0 ? sorted[0].symbol : null
  const worstSymbol = sorted.length > 0 ? sorted[sorted.length - 1].symbol : null
  const summary = generateSummary(totalGain, topSymbol, worstSymbol)

  const weekTotal = scores.weeks.find((w) => w.week_start === currentWeek)
  const myWeekPoints = weekTotal?.team_totals.find((t) => oidString(t.team_id) === teamId)?.points ?? 0

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
      })
      const url = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `fantasy500-${team.name.replace(/\s+/g, '-').toLowerCase()}-week.png`
      link.href = url
      link.click()
    } catch {
      /* fallback: just screenshot manually */
    } finally {
      setDownloading(false)
    }
  }, [team.name])

  const handleCopy = useCallback(async () => {
    if (!cardRef.current) return
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
      })
      canvas.toBlob(async (blob) => {
        if (!blob) return
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    } catch {
      /* clipboard not supported in all contexts */
    }
  }, [])

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-center">
        <p className="text-sm text-slate-500">No scores yet this week to generate a card.</p>
      </div>
    )
  }

  const up = totalGain >= 0

  return (
    <div className="space-y-3">
      {/* The Card */}
      <div
        ref={cardRef}
        className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-800"
        style={{ width: '100%', maxWidth: 420 }}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/30 via-transparent to-slate-900" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-[0.55rem] font-black text-white">
                F5
              </div>
              <span className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">
                Fantasy500 Weekly
              </span>
            </div>
            <span className="text-[0.6rem] text-slate-600">{formatWeekRange(currentWeek)}</span>
          </div>

          <div className="relative mt-4">
            <h2 className="text-xl font-black text-white tracking-tight">{team.name}</h2>
            <div className="flex items-baseline gap-3 mt-1">
              <span className={`text-3xl font-black tabular-nums ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                {up ? '+' : ''}{totalGain.toFixed(2)}%
              </span>
              <span className="text-xs text-slate-500">avg gain &middot; {myWeekPoints.toFixed(1)} pts</span>
            </div>
          </div>
        </div>

        {/* Stocks */}
        <div className="px-6 pb-2">
          <div className="space-y-1">
            {sorted.map((ps) => {
              const isUp = ps.pct_change >= 0
              const barWidth = Math.min(100, Math.abs(ps.pct_change) * 15)
              return (
                <div key={ps.symbol} className="flex items-center gap-3 py-1.5">
                  <div className="w-12 shrink-0">
                    <span className="font-mono text-xs font-bold text-white">{ps.symbol}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[0.6rem] text-slate-500 truncate">{companyName(ps.symbol)}</div>
                    <div className="mt-0.5 h-1 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isUp ? 'bg-emerald-500' : 'bg-rose-500'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                  <span className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
                    isUp ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {isUp ? '+' : ''}{ps.pct_change.toFixed(2)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Summary */}
        <div className="px-6 py-4 border-t border-slate-800/60">
          <p className="text-xs text-slate-400 italic leading-relaxed">&ldquo;{summary}&rdquo;</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-900/60 border-t border-slate-800/40 flex items-center justify-between">
          <span className="text-[0.55rem] text-slate-600">fantasy500.app</span>
          <span className="text-[0.55rem] text-slate-600">Solana &middot; On-chain commitments</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {downloading ? 'Generating…' : 'Download Card'}
        </button>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
      </div>
    </div>
  )
}
