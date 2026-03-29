import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  generateCommissionerReport,
  getCommissionerReport,
  saveCommissionerReport,
  type CommissionerReport,
  type League,
  type PlayerFeedback,
  type ScoresResponse,
  type Team,
} from '../../api'

export function CommissionerReportTab({
  id,
  token,
  league,
  teams,
  scores,
  isCommissioner,
  walletRef,
}: {
  id: string
  token: string | null
  league: League | null
  teams: Team[]
  scores: ScoresResponse | null
  isCommissioner: boolean
  walletRef: React.RefObject<string | null>
}) {
  const totalWeeks = league?.settings?.snake_rounds ?? 10

  const currentWeekNum = useMemo(() => {
    if (!scores || scores.weeks.length === 0) return 1
    const idx = scores.weeks.findIndex(
      (w) => w.week_start === scores.current_week_start,
    )
    if (idx >= 0) return idx + 1
    return Math.min(scores.weeks.length + 1, totalWeeks)
  }, [scores, totalWeeks])

  const weekStartForNum = useCallback(
    (num: number): string | undefined => {
      if (!scores) return undefined
      if (num >= 1 && num <= scores.weeks.length) {
        return scores.weeks[num - 1].week_start
      }
      if (num === scores.weeks.length + 1) {
        return scores.current_week_start
      }
      return undefined
    },
    [scores],
  )

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const displayWeek = selectedWeek ?? currentWeekNum

  const weekStart = weekStartForNum(displayWeek)

  const weekLabel =
    displayWeek === currentWeekNum
      ? 'Current'
      : displayWeek < currentWeekNum
        ? 'Completed'
        : 'Upcoming'

  const [report, setReport] = useState<CommissionerReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [editOverall, setEditOverall] = useState('')
  const [editFeedback, setEditFeedback] = useState<PlayerFeedback[]>([])

  const fetchReport = useCallback(
    async (week?: string) => {
      if (!id) return
      setLoading(true)
      try {
        const res = await getCommissionerReport(id, token, week)
        setReport(res.report)
      } catch {
        setReport(null)
      } finally {
        setLoading(false)
      }
    },
    [id, token],
  )

  useEffect(() => {
    void fetchReport(weekStart)
  }, [fetchReport, weekStart])

  function openEditor() {
    setEditOverall(report?.overall_comment ?? '')
    setEditFeedback(
      teams.map((t) => {
        const existing = report?.player_feedback?.find(
          (f) => f.owner_wallet === t.owner_wallet,
        )
        return {
          owner_wallet: t.owner_wallet,
          team_name: t.name,
          commissioner_comment: existing?.commissioner_comment ?? '',
          ai_feedback: existing?.ai_feedback ?? null,
        }
      }),
    )
    setEditing(true)
    setMsg(null)
  }

  async function handleSave() {
    if (!token) return
    setSaving(true)
    setMsg(null)
    try {
      const saved = await saveCommissionerReport(
        token,
        id,
        {
          overall_comment: editOverall || null,
          player_feedback: editFeedback,
        },
        weekStart,
      )
      setReport(saved)
      setEditing(false)
      setMsg('Report saved!')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerate() {
    if (!token) return
    setGenerating(true)
    setMsg(null)
    try {
      const updated = await generateCommissionerReport(token, id, weekStart)
      setReport(updated)
      setMsg('AI summary generated!')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  function updateFeedback(wallet: string, comment: string) {
    setEditFeedback((prev) =>
      prev.map((f) =>
        f.owner_wallet === wallet ? { ...f, commissioner_comment: comment } : f,
      ),
    )
  }

  const myWallet = walletRef.current
  const myFeedback = report?.player_feedback?.find(
    (f) => f.owner_wallet === myWallet,
  )

  return (
    <div className="space-y-6">
      {/* Week navigator — matches MatchupTab */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setSelectedWeek(Math.max(1, displayWeek - 1))}
          disabled={displayWeek <= 1}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-30 disabled:hover:text-slate-400"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <p className="text-lg font-bold text-white">Week {displayWeek}</p>
          <p className="text-xs text-slate-500">
            {weekLabel} &middot; {displayWeek} of {totalWeeks}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedWeek(Math.min(totalWeeks, displayWeek + 1))}
          disabled={displayWeek >= totalWeeks}
          className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-30 disabled:hover:text-slate-400"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* AI Summary */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  AI Weekly Summary
                </h2>
              </div>
              {isCommissioner && weekStart && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      Generate with AI
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="px-5 py-4">
              {report?.ai_summary ? (
                <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {report.ai_summary}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">
                  {!weekStart
                    ? 'No scoring data for this week yet.'
                    : isCommissioner
                      ? 'No AI summary yet. Click "Generate with AI" to create one based on this week\'s data.'
                      : 'No AI summary available for this week yet.'}
                </p>
              )}
            </div>
          </section>

          {/* Commissioner's Overall Comment */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Commissioner&apos;s Comment
                </h2>
              </div>
              {isCommissioner && !editing && weekStart && (
                <button
                  type="button"
                  onClick={openEditor}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                  {report ? 'Edit Report' : 'Write Report'}
                </button>
              )}
            </div>
            <div className="px-5 py-4">
              {report?.overall_comment ? (
                <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {report.overall_comment}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">
                  {!weekStart
                    ? 'No scoring data for this week yet.'
                    : isCommissioner
                      ? 'No commissioner comment yet. Click "Write Report" to add your thoughts.'
                      : 'The commissioner hasn\'t posted a comment for this week yet.'}
                </p>
              )}
            </div>
          </section>

          {/* Personalized Player Feedback (only visible to the player themselves) */}
          {!isCommissioner && myFeedback?.commissioner_comment && (
            <section className="rounded-xl border border-amber-800/50 bg-amber-950/20 overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-800/30 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM14.362 5.027l.5-1.064a.75.75 0 011.344 0l.5 1.064a.75.75 0 00.593.409l1.162.169a.75.75 0 01.415 1.279l-.84.82a.75.75 0 00-.216.664l.198 1.157a.75.75 0 01-1.088.791l-1.04-.547a.75.75 0 00-.698 0l-1.04.547a.75.75 0 01-1.088-.79l.198-1.158a.75.75 0 00-.216-.664l-.84-.82a.75.75 0 01.416-1.28l1.16-.168a.75.75 0 00.594-.41z" />
                </svg>
                <h2 className="text-sm font-semibold text-amber-300 uppercase tracking-wider">
                  Personal Feedback From Commissioner
                </h2>
              </div>
              <div className="px-5 py-4">
                <div className="text-sm text-amber-200/80 leading-relaxed whitespace-pre-wrap">
                  {myFeedback.commissioner_comment}
                </div>
              </div>
            </section>
          )}

          {/* Commissioner editing form */}
          {editing && isCommissioner && (
            <section className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-white">Edit Commissioner Report</h2>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>

              {/* Overall comment */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-400">
                  Overall League Commentary
                </label>
                <div className="rounded-xl border border-slate-700/50 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all focus-within:border-emerald-500/45 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.14)]">
                  <textarea
                    rows={4}
                    className="w-full rounded-xl border-0 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:ring-0 focus:outline-none resize-y"
                    placeholder="Share your thoughts on this week's league activity..."
                    value={editOverall}
                    onChange={(e) => setEditOverall(e.target.value)}
                  />
                </div>
              </div>

              {/* Per-player feedback */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-300">
                  Private Player Feedback
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    (only visible to each player)
                  </span>
                </h3>
                {editFeedback.map((fb) => (
                  <div key={fb.owner_wallet} className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-400">
                      {fb.team_name}{' '}
                      <span className="text-slate-600">
                        ({fb.owner_wallet.slice(0, 4)}...{fb.owner_wallet.slice(-4)})
                      </span>
                    </label>
                    <div className="rounded-xl border border-slate-700/50 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all focus-within:border-emerald-500/45 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.14)]">
                      <textarea
                        rows={2}
                        className="w-full rounded-xl border-0 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:ring-0 focus:outline-none resize-y"
                        placeholder={`Private feedback for ${fb.team_name}...`}
                        value={fb.commissioner_comment ?? ''}
                        onChange={(e) => updateFeedback(fb.owner_wallet, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Save / Cancel */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-emerald-600 px-5 py-2 font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Report'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </section>
          )}

          {/* Commissioner view of all player feedback */}
          {isCommissioner && !editing && report?.player_feedback && report.player_feedback.length > 0 && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Player Feedback (Commissioner View)
                </h2>
              </div>
              <div className="divide-y divide-slate-800/50">
                {report.player_feedback
                  .filter((f) => f.commissioner_comment)
                  .map((fb) => (
                    <div key={fb.owner_wallet} className="px-5 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-white">{fb.team_name}</span>
                        <span className="text-xs text-slate-600">
                          {fb.owner_wallet.slice(0, 4)}...{fb.owner_wallet.slice(-4)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 whitespace-pre-wrap">
                        {fb.commissioner_comment}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </>
      )}

      {msg && (
        <p className={`text-sm ${msg.includes('fail') || msg.includes('error') ? 'text-red-400' : 'text-emerald-400'}`}>
          {msg}
        </p>
      )}
    </div>
  )
}
