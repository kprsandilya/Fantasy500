import { apiBase } from './config'

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text) return {} as T
  return JSON.parse(text) as T
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { token?: string | null },
): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (init?.token) headers.set('Authorization', `Bearer ${init.token}`)
  const res = await fetch(`${apiBase}${path}`, { ...init, headers })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
  return parseJson<T>(res)
}

export type ChallengeResponse = { message: string }
export type VerifyResponse = { token: string; wallet: string }

export async function authChallenge(wallet: string) {
  return apiFetch<ChallengeResponse>('/api/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  })
}

export async function authVerify(payload: {
  wallet: string
  message: string
  signature: string
}) {
  return apiFetch<VerifyResponse>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export type League = {
  _id?: string | { $oid: string }
  name: string
  commissioner_wallet: string
  status: string
  settings: {
    roster_size: number
    snake_rounds: number
    waiver_period_hours: number
    scoring_week_anchor: string
    draft_timer_seconds: number
  }
  team_count: number
  season_year: number
  buy_in_lamports?: number
}

export type Team = {
  _id?: string | { $oid: string }
  league_id: string | { $oid: string }
  owner_wallet: string
  name: string
  draft_position: number
  roster: RosterEntry[]
}

export type RosterEntry = {
  symbol: string
  company_name: string
  slot: string
  acquired_at: string
  source: string
  /** Acquisition price; season % = (spot / entry - 1) × 100 averaged for starters */
  entry_price?: number
}

export type DraftPick = {
  round: number
  overall: number
  team_id: string | { $oid: string }
  symbol: string
  company_name: string
  chain_commitment?: string
}

export type DraftSession = {
  _id?: string | { $oid: string }
  league_id: string | { $oid: string }
  status: string
  current_round: number
  clock_team_id?: string | { $oid: string }
  direction: string
  picks: DraftPick[]
  deadline_at?: number
}

export function oidString(id: unknown): string | undefined {
  if (id == null) return undefined
  if (typeof id === 'string') return id
  if (typeof id === 'object' && id && '$oid' in id)
    return (id as { $oid: string }).$oid
  return undefined
}

export function leagueIdString(l: League): string | undefined {
  return oidString(l._id)
}

export async function listLeagues(
  token: string | null,
  filters?: { status?: string; name?: string },
) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.name) params.set('name', filters.name)
  const qs = params.toString()
  return apiFetch<League[]>(`/api/leagues${qs ? `?${qs}` : ''}`, { token })
}

export async function listMyLeagues(token: string) {
  return apiFetch<League[]>('/api/my-leagues', { token })
}

export async function getLeague(id: string, token?: string | null) {
  return apiFetch<League>(`/api/leagues/${id}`, { token })
}

export type UpdateLeagueBody = {
  name?: string
  team_count?: number
  buy_in_lamports?: number
  snake_rounds?: number
  roster_size?: number
  draft_timer_seconds?: number
}

export async function updateLeague(token: string, id: string, body: UpdateLeagueBody) {
  return apiFetch<League>(`/api/leagues/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  })
}

export async function createLeague(
  token: string,
  body: { name: string; team_count: number; buy_in_lamports?: number },
) {
  return apiFetch<League>('/api/leagues', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

export type JoinRequest = {
  _id?: string | { $oid: string }
  league_id: string | { $oid: string }
  wallet: string
  team_name: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: number
  resolved_at?: number | null
}

export async function joinLeague(token: string, id: string, team_name: string) {
  return apiFetch<JoinRequest>(`/api/leagues/${id}/join`, {
    method: 'POST',
    token,
    body: JSON.stringify({ team_name }),
  })
}

export async function listJoinRequests(leagueId: string, token?: string | null) {
  return apiFetch<JoinRequest[]>(`/api/leagues/${leagueId}/join-requests`, { token })
}

export async function approveJoinRequest(token: string, leagueId: string, requestId: string) {
  return apiFetch<JoinRequest>(`/api/leagues/${leagueId}/join-requests/${requestId}/approve`, {
    method: 'POST',
    token,
  })
}

export async function rejectJoinRequest(token: string, leagueId: string, requestId: string) {
  return apiFetch<JoinRequest>(`/api/leagues/${leagueId}/join-requests/${requestId}/reject`, {
    method: 'POST',
    token,
  })
}

export type QuoteItem = {
  symbol: string
  price: number
  change: number
  change_percent: number
  market_state?: string
}

export async function getQuotes() {
  return apiFetch<QuoteItem[]>('/api/quotes')
}

export async function startDraft(token: string, id: string) {
  return apiFetch<DraftSession>(`/api/leagues/${id}/start-draft`, {
    method: 'POST',
    token,
  })
}

export async function getDraft(id: string) {
  return apiFetch<DraftSession>(`/api/leagues/${id}/draft`)
}

export async function getTeams(leagueId: string) {
  return apiFetch<Team[]>(`/api/leagues/${leagueId}/teams`)
}

export async function getUniverse() {
  return apiFetch<{ symbols: string[] }>('/api/universe')
}

export async function setLineup(token: string, leagueId: string, starters: string[]) {
  return apiFetch<Team>(`/api/leagues/${leagueId}/roster/set-lineup`, {
    method: 'POST',
    token,
    body: JSON.stringify({ starters }),
  })
}

export async function submitWaiver(
  token: string,
  leagueId: string,
  addSymbol: string,
  dropSymbol?: string,
) {
  return apiFetch<Team>(`/api/leagues/${leagueId}/waivers`, {
    method: 'POST',
    token,
    body: JSON.stringify({
      add_symbol: addSymbol,
      ...(dropSymbol ? { drop_symbol: dropSymbol } : {}),
    }),
  })
}

export async function autoPick(id: string) {
  return apiFetch<DraftSession>(`/api/leagues/${id}/draft/auto-pick`, {
    method: 'POST',
  })
}

export async function draftPick(
  token: string,
  id: string,
  symbol: string,
  company_name: string,
) {
  return apiFetch<DraftSession>(`/api/leagues/${id}/draft/pick`, {
    method: 'POST',
    token,
    body: JSON.stringify({ symbol, company_name }),
  })
}

export type TeamWeekTotal = {
  team_id: string | { $oid: string }
  owner_wallet: string
  points: number
}

export type WeeklyScoreboard = {
  league_id: string | { $oid: string }
  week_start: string
  team_totals: TeamWeekTotal[]
}

export type PlayerWeeklyScore = {
  wallet: string
  team_id: string | { $oid: string }
  symbol: string
  week_start: string
  pct_change: number
  points: number
}

export type ScoresResponse = {
  weeks: WeeklyScoreboard[]
  player_scores: PlayerWeeklyScore[]
  current_week_start: string
  /** team ObjectId hex → average season % for starters (spot vs entry_price) */
  team_season_pct?: Record<string, number>
}

export async function getScores(leagueId: string) {
  return apiFetch<ScoresResponse>(`/api/leagues/${leagueId}/scores`)
}

// ─── Stock Alerts ──────────────────────────────────────────────────────

export type StockAlert = {
  symbol: string
  alert_type: string
  headline: string
  date?: string | null
}

export async function getStockAlerts(leagueId: string) {
  return apiFetch<StockAlert[]>(`/api/leagues/${leagueId}/stock-alerts`)
}

// ─── Commissioner Report ───────────────────────────────────────────────

export type PlayerFeedback = {
  owner_wallet: string
  team_name: string
  commissioner_comment?: string | null
  ai_feedback?: string | null
}

export type CommissionerReport = {
  _id?: string | { $oid: string }
  league_id: string | { $oid: string }
  week_start: string
  overall_comment?: string | null
  player_feedback: PlayerFeedback[]
  ai_summary?: string | null
  updated_at?: number | null
}

export type CommissionerReportResponse = {
  report: CommissionerReport | null
  available_weeks: string[]
}

export async function getCommissionerReport(
  leagueId: string,
  token?: string | null,
  week?: string,
) {
  const params = week ? `?week=${encodeURIComponent(week)}` : ''
  return apiFetch<CommissionerReportResponse>(
    `/api/leagues/${leagueId}/commissioner-report${params}`,
    { token },
  )
}

export async function saveCommissionerReport(
  token: string,
  leagueId: string,
  body: {
    overall_comment?: string | null
    player_feedback?: PlayerFeedback[]
  },
  week?: string,
) {
  const params = week ? `?week=${encodeURIComponent(week)}` : ''
  return apiFetch<CommissionerReport>(
    `/api/leagues/${leagueId}/commissioner-report${params}`,
    { method: 'POST', token, body: JSON.stringify(body) },
  )
}

export async function generateCommissionerReport(
  token: string,
  leagueId: string,
  week?: string,
) {
  return apiFetch<CommissionerReport>(
    `/api/leagues/${leagueId}/commissioner-report/generate`,
    { method: 'POST', token, body: JSON.stringify({ week: week ?? null }) },
  )
}
