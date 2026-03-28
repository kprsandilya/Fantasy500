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
  team_count: number
  season_year: number
}

export function leagueIdString(l: League): string | undefined {
  const id = l._id as unknown
  if (id == null) return undefined
  if (typeof id === 'string') return id
  if (typeof id === 'object' && id && '$oid' in id)
    return (id as { $oid: string }).$oid
  return undefined
}

export async function listLeagues(token: string | null) {
  return apiFetch<League[]>('/api/leagues', { token })
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
  return apiFetch<unknown>(`/api/leagues/${id}/join`, {
    method: 'POST',
    token,
    body: JSON.stringify({ team_name }),
  })
}

export async function startDraft(token: string, id: string) {
  return apiFetch<unknown>(`/api/leagues/${id}/start-draft`, {
    method: 'POST',
    token,
  })
}

export async function getDraft(id: string) {
  return apiFetch<{
    status: string
    picks: { symbol: string; overall: number; team_id: string }[]
    clock_team_id?: string
  }>(`/api/leagues/${id}/draft`)
}

export async function draftPick(
  token: string,
  id: string,
  symbol: string,
  company_name: string,
) {
  return apiFetch<unknown>(`/api/leagues/${id}/draft/pick`, {
    method: 'POST',
    token,
    body: JSON.stringify({ symbol, company_name }),
  })
}
