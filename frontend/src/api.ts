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

export async function listLeagues(token: string | null) {
  return apiFetch<League[]>('/api/leagues', { token })
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

export async function joinLeague(token: string, id: string, team_name: string) {
  return apiFetch<Team>(`/api/leagues/${id}/join`, {
    method: 'POST',
    token,
    body: JSON.stringify({ team_name }),
  })
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
