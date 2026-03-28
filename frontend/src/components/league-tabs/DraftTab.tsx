import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  approveJoinRequest,
  joinLeague,
  oidString,
  rejectJoinRequest,
  startDraft,
  type DraftSession,
  type JoinRequest,
  type League,
  type Team,
} from '../../api'

export function DraftTab({
  id,
  token,
  league,
  draft,
  teams,
  joinRequests,
  isCommissioner,
  myTeam,
  walletRef,
  msg,
  setMsg,
  refresh,
  joinedCount,
  maxTeams,
}: {
  id: string
  token: string | null
  league: League | null
  draft: DraftSession | null
  teams: Team[]
  joinRequests: JoinRequest[]
  isCommissioner: boolean
  myTeam: Team | null
  walletRef: React.RefObject<string | null>
  msg: string | null
  setMsg: (m: string | null) => void
  refresh: () => Promise<void>
  joinedCount: number
  maxTeams: number
}) {
  const [teamName, setTeamName] = useState('My desk')
  const hasJoined = myTeam !== null
  const myRequest = joinRequests.find((r) => r.wallet === walletRef.current)
  const pendingRequests = joinRequests.filter((r) => r.status === 'pending')

  return (
    <div className="space-y-6">
      {/* Join / Status section */}
      {token && league?.status === 'forming' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          {hasJoined ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-900/40">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  You&apos;re in as <span className="text-emerald-400">{myTeam?.name}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Waiting for {maxTeams - joinedCount} more player{maxTeams - joinedCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          ) : myRequest?.status === 'pending' ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-900/40">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  Request pending for <span className="text-amber-400">{myRequest.team_name}</span>
                </p>
                <p className="text-xs text-slate-500">Waiting for commissioner approval</p>
              </div>
            </div>
          ) : myRequest?.status === 'rejected' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-900/40">
                  <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Your request was <span className="text-red-400">declined</span></p>
                  <p className="text-xs text-slate-500">Submit a new request below</p>
                </div>
              </div>
              <JoinForm token={token} id={id} teamName={teamName} setTeamName={setTeamName} setMsg={setMsg} refresh={refresh} label="Re-request" />
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-lg font-medium text-white">Join this league</h2>
              <JoinForm token={token} id={id} teamName={teamName} setTeamName={setTeamName} setMsg={setMsg} refresh={refresh} label="Request to join" />
            </div>
          )}

          {/* Commissioner controls */}
          {isCommissioner && (
            <div className="space-y-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium hover:bg-amber-500 transition-colors"
                onClick={() =>
                  startDraft(token!, id)
                    .then(() => void refresh())
                    .catch((e) => setMsg(String(e)))
                }
              >
                Start draft
              </button>
              {joinedCount < maxTeams && (
                <p className="text-xs text-slate-500">
                  {joinedCount}/{maxTeams} players joined &mdash; all slots must be filled first
                </p>
              )}
            </div>
          )}
          {msg && <p className="text-sm text-amber-300">{msg}</p>}
        </section>
      )}

      {/* Commissioner approval panel */}
      {isCommissioner && league?.status === 'forming' && joinRequests.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            Join Requests
            {pendingRequests.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-600 text-xs font-bold text-white">
                {pendingRequests.length}
              </span>
            )}
          </h2>
          <div className="divide-y divide-slate-800">
            {joinRequests.map((req) => {
              const rid = oidString(req._id)!
              const isPending = req.status === 'pending'
              return (
                <div key={rid} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{req.team_name}</p>
                    <p className="text-xs text-slate-500 font-mono truncate">{req.wallet}</p>
                  </div>
                  {isPending ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
                        onClick={() =>
                          approveJoinRequest(token!, id, rid)
                            .then(() => void refresh())
                            .catch((e) => setMsg(String(e)))
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-red-800 bg-red-950/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/40 transition-colors"
                        onClick={() =>
                          rejectJoinRequest(token!, id, rid)
                            .then(() => void refresh())
                            .catch((e) => setMsg(String(e)))
                        }
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 ${
                      req.status === 'approved' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {req.status}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Draft progress / link to draft room */}
      {draft && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-white">Draft Room</h2>
            <span className="text-xs text-slate-500 capitalize">{draft.status.replace('_', ' ')}</span>
          </div>
          {(draft.status === 'in_progress' || draft.status === 'completed') && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">
                {draft.picks.length} picks made
                {draft.status === 'in_progress' && ` · Round ${draft.current_round}`}
              </p>
              <Link
                to={`/league/${id}/draft`}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {draft.status === 'in_progress' ? 'Enter Draft Room' : 'View Draft Results'}
              </Link>
              {draft.picks.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Latest picks</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {[...draft.picks].reverse().slice(0, 12).map((p) => (
                      <span key={p.overall} className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-xs">
                        <span className="text-slate-500">#{p.overall}</span>
                        <span className="font-mono font-semibold text-emerald-400">{p.symbol}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function JoinForm({
  token,
  id,
  teamName,
  setTeamName,
  setMsg,
  refresh,
  label,
}: {
  token: string
  id: string
  teamName: string
  setTeamName: (v: string) => void
  setMsg: (m: string | null) => void
  refresh: () => Promise<void>
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <label className="text-sm space-y-1 flex-1 min-w-[12rem]">
        <span className="text-slate-400">Team name</span>
        <input
          className="w-full rounded-md bg-slate-950 border border-slate-800 px-3 py-2 focus:border-emerald-600 focus:outline-none"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="rounded-md bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 transition-colors"
        onClick={() =>
          joinLeague(token, id, teamName)
            .then(() => {
              setMsg('Request sent! Waiting for commissioner approval.')
              void refresh()
            })
            .catch((e) => setMsg(String(e)))
        }
      >
        {label}
      </button>
    </div>
  )
}
