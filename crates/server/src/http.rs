use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{Path, Query, State, WebSocketUpgrade},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch, post},
    Json, Router,
};
use bson::oid::ObjectId;
use chrono::Datelike;
use futures::{StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};

use shared::{
    CommissionerReport, DraftDirection, DraftPick, DraftSession, DraftStatus, JoinRequest,
    JoinRequestStatus, League, LeagueSettings, LeagueStatus, PlayerFeedback, PlayerWeeklyScore,
    RosterEntry, RosterSlot, Team, User, WalletAuthPayload, WaiverClaim, WeeklyScoreboard,
    WsServerMessage,
};

use rand::seq::SliceRandom;

use crate::auth_wallet;
use crate::chain_tx;
use crate::draft_logic::{direction_for_round_from_pick, next_clock_team};
use crate::error::{AppError, AppResult};
use crate::extract::{require_commissioner, AuthWallet};
use crate::fortune500;
use crate::gemini;
use crate::jwt;
use crate::pick_commit;
use crate::quotes;
use crate::state::AppState;

/// Match frontend `MatchupTab` / `LeagueTab`: circle method round-robin, week `1..=weeks.len()`.
fn round_robin_pairs(teams: &[Team], week: usize) -> Vec<(Option<ObjectId>, Option<ObjectId>)> {
    let mut with_id: Vec<&Team> = teams.iter().filter(|t| t.id.is_some()).collect();
    if with_id.len() < 2 {
        if with_id.len() == 1 {
            return vec![(with_id[0].id, None)];
        }
        return Vec::new();
    }
    with_id.sort_by(|a, b| a.id.unwrap().to_hex().cmp(&b.id.unwrap().to_hex()));
    let is_odd = with_id.len() % 2 != 0;
    let mut list: Vec<Option<ObjectId>> = with_id.iter().map(|t| t.id).collect();
    if is_odd {
        list.push(None);
    }
    let n = list.len();
    let rest = &list[1..];
    let round = (week - 1) % (n - 1);
    let mut rotated: Vec<Option<ObjectId>> = Vec::with_capacity(rest.len());
    for i in 0..rest.len() {
        let idx = (i as i32 - round as i32).rem_euclid(rest.len() as i32) as usize;
        rotated.push(rest[idx]);
    }
    let mut arrangement: Vec<Option<ObjectId>> = vec![list[0]];
    arrangement.extend(rotated);
    let mut pairs = Vec::new();
    for i in 0..n / 2 {
        pairs.push((arrangement[i], arrangement[n - 1 - i]));
    }
    pairs
}

fn team_week_points(board: &WeeklyScoreboard, tid: &ObjectId) -> f64 {
    board
        .team_totals
        .iter()
        .find(|t| &t.team_id == tid)
        .map(|t| t.points)
        .unwrap_or(0.0)
}

/// Wins from completed weeks only (`week_start` before current week), same rules as `LeagueTab`.
fn compute_matchup_wins(
    teams: &[Team],
    weeks: &[WeeklyScoreboard],
    current_week_start: &str,
) -> HashMap<ObjectId, u32> {
    let mut wins: HashMap<ObjectId, u32> = HashMap::new();
    for t in teams {
        if let Some(id) = t.id {
            wins.insert(id, 0);
        }
    }
    let completed: Vec<&WeeklyScoreboard> = weeks
        .iter()
        .filter(|w| w.week_start.as_str() < current_week_start)
        .collect();
    for (week_idx, board) in completed.iter().enumerate() {
        let week_num = week_idx + 1;
        for (a, b) in round_robin_pairs(teams, week_num) {
            match (a, b) {
                (Some(ta), None) => {
                    *wins.entry(ta).or_insert(0) += 1;
                }
                (Some(ta), Some(tb)) => {
                    let pa = team_week_points(board, &ta);
                    let pb = team_week_points(board, &tb);
                    if pa > pb {
                        *wins.entry(ta).or_insert(0) += 1;
                    } else if pb > pa {
                        *wins.entry(tb).or_insert(0) += 1;
                    }
                }
                _ => {}
            }
        }
    }
    wins
}

/// Stable “organic” jitter in cents from team id (display only).
fn pct_jitter_cents(tid: &ObjectId, rank: usize, max_abs: i64) -> i64 {
    let b = tid.bytes();
    let mut h: u32 = (rank as u32).wrapping_mul(0x9e37_79b9);
    for i in 0..12 {
        h = h.wrapping_add((b[i] as u32).wrapping_mul(31 + i as u32));
        h = h.rotate_left(5);
    }
    let span = (max_abs * 2 + 1).max(1) as u32;
    (h % span) as i64 - max_abs
}

/// Down market: leader up to +1%; rest negative; believable decimals (not −5 / −10 stairs).
fn season_pct_from_standings_order(tid: &ObjectId, rank: usize, n: usize) -> f64 {
    if n == 0 {
        return 0.0;
    }
    if n == 1 {
        let j = pct_jitter_cents(tid, 0, 22) as f64 / 100.0;
        return -0.73 + j;
    }
    // Cents: +100 (1%) down to −1500 (−15%) across ranks, with jitter smaller than step.
    let step_cents = 1600.0_f64 / (n - 1) as f64;
    let max_j = ((step_cents * 0.34).floor() as i64).clamp(5, 48);
    let j = pct_jitter_cents(tid, rank, max_j) as f64;
    let center_cents = 100.0 - rank as f64 * step_cents;
    let mut cents = center_cents + j;
    if rank == 0 {
        cents = cents.clamp(8.0, 100.0);
    } else {
        cents = cents.min(-1.0);
    }
    cents / 100.0
}

/// After rounding, enforce strictly decreasing % so standings order never inverts (two decimals).
fn enforce_season_pct_order(mut cents: Vec<i64>) -> Vec<i64> {
    for i in 0..cents.len().saturating_sub(1) {
        if cents[i + 1] >= cents[i] {
            cents[i + 1] = cents[i] - 1;
        }
    }
    for c in &mut cents {
        *c = (*c).clamp(-1500, 100);
    }
    cents
}

#[derive(Deserialize)]
pub struct ChallengeBody {
    pub wallet: String,
}

#[derive(Serialize)]
pub struct ChallengeResponse {
    pub message: String,
}

#[derive(Deserialize)]
pub struct CreateLeagueBody {
    pub name: String,
    pub team_count: u8,
    pub buy_in_lamports: Option<u64>,
}

#[derive(Deserialize)]
pub struct JoinLeagueBody {
    pub team_name: String,
}

#[derive(Deserialize)]
pub struct DraftPickBody {
    pub symbol: String,
    pub company_name: String,
}

#[derive(Deserialize)]
pub struct WaiverBody {
    pub add_symbol: String,
    pub drop_symbol: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateLeagueBody {
    pub name: Option<String>,
    pub team_count: Option<u8>,
    pub buy_in_lamports: Option<u64>,
    pub snake_rounds: Option<u8>,
    pub roster_size: Option<u8>,
    pub draft_timer_seconds: Option<u32>,
}

#[derive(Deserialize)]
pub struct ChainInitQuery {
    pub buy_in_lamports: u64,
    pub max_teams: u8,
}

#[derive(Deserialize)]
pub struct ChainPickQuery {
    pub pick_index: u32,
    pub pick_hash_hex: String,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health))
        .route("/api/auth/challenge", post(challenge))
        .route("/api/auth/verify", post(verify))
        .route("/api/me", get(me))
        .route("/api/universe", get(universe))
        .route("/api/quotes", get(live_quotes))
        .route("/api/leagues", get(list_leagues).post(create_league))
        .route(
            "/api/leagues/:id",
            get(get_league).patch(update_league).delete(delete_league),
        )
        .route("/api/leagues/:id/teams", get(get_teams))
        .route("/api/leagues/:id/join", post(join_league))
        .route("/api/leagues/:id/join-requests", get(list_join_requests))
        .route("/api/leagues/:id/join-requests/:rid/approve", post(approve_join))
        .route("/api/leagues/:id/join-requests/:rid/reject", post(reject_join))
        .route("/api/leagues/:id/start-draft", post(start_draft))
        .route("/api/leagues/:id/draft", get(get_draft))
        .route("/api/leagues/:id/draft/pick", post(draft_pick))
        .route("/api/leagues/:id/draft/auto-pick", post(auto_pick))
        .route("/api/leagues/:id/roster/set-lineup", post(set_lineup))
        .route("/api/leagues/:id/waivers", post(submit_waiver))
        .route("/api/leagues/:id/scores", get(get_scores))
        .route(
            "/api/leagues/:id/commissioner-report",
            get(get_commissioner_report).post(save_commissioner_report),
        )
        .route(
            "/api/leagues/:id/commissioner-report/generate",
            post(generate_commissioner_report),
        )
        .route("/api/leagues/:id/stock-alerts", get(get_stock_alerts))
        .route("/api/chain/ix/init-league", get(chain_init_ix))
        .route("/api/chain/ix/record-pick", get(chain_record_pick_ix))
        .route("/api/chain/ix/deposit-buy-in", get(chain_deposit_ix))
        .route("/ws", get(ws_handler))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
}

async fn health() -> impl IntoResponse {
    Json(json!({ "ok": true }))
}

async fn challenge(Json(body): Json<ChallengeBody>) -> AppResult<Json<ChallengeResponse>> {
    let nonce = uuid::Uuid::new_v4();
    let message = format!(
        "Fantasy500 login\nWallet: {}\nNonce: {}",
        body.wallet, nonce
    );
    Ok(Json(ChallengeResponse { message }))
}

async fn verify(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<WalletAuthPayload>,
) -> AppResult<Json<serde_json::Value>> {
    auth_wallet::verify_wallet_auth(&payload)?;
    let users = state.db.collection::<User>("users");
    let filter = mongodb::bson::doc! { "wallet": &payload.wallet };
    let now = chrono::Utc::now();
    let update = mongodb::bson::doc! {
        "$setOnInsert": { "created_at": now },
        "$set": { "wallet": &payload.wallet }
    };
    let opts = mongodb::options::UpdateOptions::builder().upsert(true).build();
    users
        .update_one(filter, update)
        .with_options(opts)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let token = jwt::sign(&payload.wallet, &state.config.jwt_secret)?;
    Ok(Json(json!({ "token": token, "wallet": payload.wallet })))
}

async fn me(AuthWallet(wallet): AuthWallet) -> AppResult<Json<serde_json::Value>> {
    Ok(Json(json!({ "wallet": wallet })))
}

async fn universe() -> AppResult<Json<serde_json::Value>> {
    let list: Vec<&str> = fortune500::universe().iter().map(|s| s.as_str()).collect();
    Ok(Json(json!({ "symbols": list })))
}

async fn live_quotes(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<quotes::QuoteItem>>> {
    let items = quotes::get_quotes(&state).await;
    Ok(Json(items))
}

async fn list_leagues(State(state): State<Arc<AppState>>) -> AppResult<Json<Vec<League>>> {
    let col = state.db.collection::<League>("leagues");
    let mut cur = col
        .find(mongodb::bson::doc! {})
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut out = Vec::new();
    while let Some(doc) = cur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        out.push(doc);
    }
    Ok(Json(out))
}

async fn create_league(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Json(body): Json<CreateLeagueBody>,
) -> AppResult<Json<League>> {
    if body.team_count < 2 || body.team_count > 32 {
        return Err(AppError::BadRequest(
            "team_count must be between 2 and 32".into(),
        ));
    }
    let mut league = League {
        id: None,
        name: body.name,
        commissioner_wallet: wallet.clone(),
        status: LeagueStatus::Forming,
        settings: LeagueSettings::default(),
        team_count: body.team_count,
        season_year: chrono::Utc::now().year(),
        chain_league: None,
        buy_in_lamports: body.buy_in_lamports,
        created_at: Some(chrono::Utc::now()),
    };
    let col = state.db.collection::<League>("leagues");
    let res = col
        .insert_one(&league)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    league.id = res.inserted_id.as_object_id();
    Ok(Json(league))
}

async fn get_league(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<League>> {
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let col = state.db.collection::<League>("leagues");
    let league = col
        .find_one(mongodb::bson::doc! { "_id": oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    Ok(Json(league))
}

async fn update_league(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Path(id): Path<String>,
    Json(body): Json<UpdateLeagueBody>,
) -> AppResult<Json<League>> {
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let col = state.db.collection::<League>("leagues");
    let league = col
        .find_one(mongodb::bson::doc! { "_id": oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    require_commissioner(&wallet, &league.commissioner_wallet)?;
    if league.status != LeagueStatus::Forming {
        return Err(AppError::Conflict("can only edit a league that is still forming".into()));
    }

    let mut update_doc = mongodb::bson::Document::new();
    if let Some(name) = &body.name {
        update_doc.insert("name", name.as_str());
    }
    if let Some(tc) = body.team_count {
        if tc < 2 || tc > 32 {
            return Err(AppError::BadRequest("team_count must be between 2 and 32".into()));
        }
        update_doc.insert("team_count", tc as i32);
    }
    if let Some(bi) = body.buy_in_lamports {
        update_doc.insert("buy_in_lamports", bi as i64);
    }
    if let Some(sr) = body.snake_rounds {
        if sr == 0 || sr > 30 {
            return Err(AppError::BadRequest("snake_rounds must be between 1 and 30".into()));
        }
        update_doc.insert("settings.snake_rounds", sr as i32);
    }
    if let Some(rs) = body.roster_size {
        if rs == 0 || rs > 30 {
            return Err(AppError::BadRequest("roster_size must be between 1 and 30".into()));
        }
        update_doc.insert("settings.roster_size", rs as i32);
    }
    if let Some(dt) = body.draft_timer_seconds {
        update_doc.insert("settings.draft_timer_seconds", dt as i32);
    }

    if update_doc.is_empty() {
        return Ok(Json(league));
    }

    col.update_one(
        mongodb::bson::doc! { "_id": oid },
        mongodb::bson::doc! { "$set": update_doc },
    )
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    let updated = col
        .find_one(mongodb::bson::doc! { "_id": oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    Ok(Json(updated))
}

async fn get_teams(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<Team>>> {
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let teams_col = state.db.collection::<Team>("teams");
    let mut cur = teams_col
        .find(mongodb::bson::doc! { "league_id": league_oid })
        .sort(mongodb::bson::doc! { "draft_position": 1 })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut out = Vec::new();
    while let Some(t) = cur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        out.push(t);
    }
    Ok(Json(out))
}

async fn delete_league(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    let oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let col = state.db.collection::<League>("leagues");
    let league = col
        .find_one(mongodb::bson::doc! { "_id": oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    require_commissioner(&wallet, &league.commissioner_wallet)?;
    col.delete_one(mongodb::bson::doc! { "_id": oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn join_league(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Path(id): Path<String>,
    Json(body): Json<JoinLeagueBody>,
) -> AppResult<Json<JoinRequest>> {
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let leagues = state.db.collection::<League>("leagues");
    let league = leagues
        .find_one(mongodb::bson::doc! { "_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    if league.status != LeagueStatus::Forming {
        return Err(AppError::Conflict("league not accepting joins".into()));
    }

    let jr_col = state.db.collection::<JoinRequest>("join_requests");
    let existing = jr_col
        .find_one(mongodb::bson::doc! {
            "league_id": league_oid,
            "wallet": &wallet,
            "status": "pending",
        })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if existing.is_some() {
        return Err(AppError::Conflict("you already have a pending request".into()));
    }

    let teams = state.db.collection::<Team>("teams");
    let already_joined = teams
        .find_one(mongodb::bson::doc! { "league_id": league_oid, "owner_wallet": &wallet })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if already_joined.is_some() {
        return Err(AppError::Conflict("you already joined this league".into()));
    }

    let is_commissioner = wallet == league.commissioner_wallet;
    let status = if is_commissioner {
        JoinRequestStatus::Approved
    } else {
        JoinRequestStatus::Pending
    };
    let now = chrono::Utc::now().timestamp();
    let mut req = JoinRequest {
        id: None,
        league_id: league_oid,
        wallet: wallet.clone(),
        team_name: body.team_name.clone(),
        status,
        created_at: now,
        resolved_at: if is_commissioner { Some(now) } else { None },
    };
    let res = jr_col
        .insert_one(&req)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    req.id = res.inserted_id.as_object_id();

    if is_commissioner {
        let teams_col = state.db.collection::<Team>("teams");
        let count = teams_col
            .count_documents(mongodb::bson::doc! { "league_id": league_oid })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let team = Team {
            id: None,
            league_id: league_oid,
            owner_wallet: wallet,
            name: body.team_name,
            draft_position: (count as u8) + 1,
            roster: vec![],
            chain_team: None,
        };
        teams_col
            .insert_one(&team)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }

    Ok(Json(req))
}

async fn list_join_requests(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<JoinRequest>>> {
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let col = state.db.collection::<JoinRequest>("join_requests");
    let mut cur = col
        .find(mongodb::bson::doc! { "league_id": league_oid })
        .sort(mongodb::bson::doc! { "created_at": 1 })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut out = Vec::new();
    while let Some(r) = cur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        out.push(r);
    }
    Ok(Json(out))
}

async fn approve_join(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Path((id, rid)): Path<(String, String)>,
) -> AppResult<Json<JoinRequest>> {
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad league id".into()))?;
    let req_oid = ObjectId::parse_str(&rid).map_err(|_| AppError::BadRequest("bad request id".into()))?;

    let leagues = state.db.collection::<League>("leagues");
    let league = leagues
        .find_one(mongodb::bson::doc! { "_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    require_commissioner(&wallet, &league.commissioner_wallet)?;

    let jr_col = state.db.collection::<JoinRequest>("join_requests");
    let req = jr_col
        .find_one(mongodb::bson::doc! { "_id": req_oid, "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    if req.status != JoinRequestStatus::Pending {
        return Err(AppError::Conflict("request already resolved".into()));
    }

    let teams_col = state.db.collection::<Team>("teams");
    let count = teams_col
        .count_documents(mongodb::bson::doc! { "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if count >= league.team_count as u64 {
        return Err(AppError::Conflict("league full".into()));
    }

    let draft_pos = (count as u8) + 1;
    let team = Team {
        id: None,
        league_id: league_oid,
        owner_wallet: req.wallet.clone(),
        name: req.team_name.clone(),
        draft_position: draft_pos,
        roster: vec![],
        chain_team: None,
    };
    teams_col
        .insert_one(&team)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let now = chrono::Utc::now().timestamp();
    jr_col
        .update_one(
            mongodb::bson::doc! { "_id": req_oid },
            mongodb::bson::doc! { "$set": { "status": "approved", "resolved_at": now } },
        )
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut updated = req;
    updated.status = JoinRequestStatus::Approved;
    updated.resolved_at = Some(now);
    Ok(Json(updated))
}

async fn reject_join(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Path((id, rid)): Path<(String, String)>,
) -> AppResult<Json<JoinRequest>> {
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad league id".into()))?;
    let req_oid = ObjectId::parse_str(&rid).map_err(|_| AppError::BadRequest("bad request id".into()))?;

    let leagues = state.db.collection::<League>("leagues");
    let league = leagues
        .find_one(mongodb::bson::doc! { "_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    require_commissioner(&wallet, &league.commissioner_wallet)?;

    let jr_col = state.db.collection::<JoinRequest>("join_requests");
    let req = jr_col
        .find_one(mongodb::bson::doc! { "_id": req_oid, "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    if req.status != JoinRequestStatus::Pending {
        return Err(AppError::Conflict("request already resolved".into()));
    }

    let now = chrono::Utc::now().timestamp();
    jr_col
        .update_one(
            mongodb::bson::doc! { "_id": req_oid },
            mongodb::bson::doc! { "$set": { "status": "rejected", "resolved_at": now } },
        )
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let mut updated = req;
    updated.status = JoinRequestStatus::Rejected;
    updated.resolved_at = Some(now);
    Ok(Json(updated))
}

async fn start_draft(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Path(id): Path<String>,
) -> AppResult<Json<DraftSession>> {
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let leagues = state.db.collection::<League>("leagues");
    let league = leagues
        .find_one(mongodb::bson::doc! { "_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    require_commissioner(&wallet, &league.commissioner_wallet)?;
    let teams_col = state.db.collection::<Team>("teams");
    let n = teams_col
        .count_documents(mongodb::bson::doc! { "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if n != league.team_count as u64 {
        return Err(AppError::Conflict(
            "all team slots must be filled before draft".into(),
        ));
    }
    let mut cur = teams_col
        .find(mongodb::bson::doc! { "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut teams: Vec<Team> = Vec::new();
    while let Some(t) = cur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        teams.push(t);
    }

    {
        let mut rng = rand::thread_rng();
        teams.shuffle(&mut rng);
    }

    for (i, team) in teams.iter().enumerate() {
        if let Some(tid) = team.id {
            let pos = (i as u8) + 1;
            teams_col
                .update_one(
                    mongodb::bson::doc! { "_id": tid },
                    mongodb::bson::doc! { "$set": { "draft_position": pos as i32 } },
                )
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }
    }

    let order: Vec<ObjectId> = teams.iter().filter_map(|t| t.id).collect();
    let clock = order.first().cloned();
    let deadline = if league.settings.draft_timer_seconds > 0 {
        Some(chrono::Utc::now() + chrono::Duration::seconds(league.settings.draft_timer_seconds as i64))
    } else {
        None
    };
    let session = DraftSession {
        id: None,
        league_id: league_oid,
        status: DraftStatus::InProgress,
        current_round: 1,
        clock_team_id: clock,
        direction: DraftDirection::Forward,
        picks: vec![],
        deadline_at: deadline,
    };
    let draft = state.db.collection::<DraftSession>("draft_sessions");
    draft
        .delete_many(mongodb::bson::doc! { "league_id": league_oid })
        .await
        .ok();
    let res = draft
        .insert_one(&session)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut session = session;
    session.id = res.inserted_id.as_object_id();
    leagues
        .update_one(
            mongodb::bson::doc! { "_id": league_oid },
            mongodb::bson::doc! { "$set": { "status": "drafting" } },
        )
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    state.broadcast_json(&WsServerMessage::DraftUpdated {
        session: session.clone(),
    });
    Ok(Json(session))
}

async fn get_draft(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<DraftSession>> {
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let col = state.db.collection::<DraftSession>("draft_sessions");
    let s = col
        .find_one(mongodb::bson::doc! { "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    Ok(Json(s))
}

async fn draft_pick(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Path(id): Path<String>,
    Json(body): Json<DraftPickBody>,
) -> AppResult<Json<DraftSession>> {
    let sym = body.symbol.to_uppercase();
    if !fortune500::is_valid_symbol(&sym) {
        return Err(AppError::BadRequest("symbol not in Fortune500 universe".into()));
    }
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let leagues = state.db.collection::<League>("leagues");
    let league = leagues
        .find_one(mongodb::bson::doc! { "_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    let teams_col = state.db.collection::<Team>("teams");
    let mut cur = teams_col
        .find(mongodb::bson::doc! { "league_id": league_oid })
        .sort(mongodb::bson::doc! { "draft_position": 1 })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut teams: Vec<Team> = Vec::new();
    while let Some(t) = cur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        teams.push(t);
    }
    teams.sort_by_key(|t| t.draft_position);
    let order: Vec<ObjectId> = teams.iter().filter_map(|t| t.id).collect();
    let draft_col = state.db.collection::<DraftSession>("draft_sessions");
    let mut session = draft_col
        .find_one(mongodb::bson::doc! { "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    if session.status != DraftStatus::InProgress {
        return Err(AppError::Conflict("draft not active".into()));
    }
    let on_clock = next_clock_team(
        &session,
        &order,
        league.settings.snake_rounds,
    )
    .ok_or_else(|| AppError::Conflict("draft complete or invalid state".into()))?;
    let my_team = teams
        .iter()
        .find(|t| t.owner_wallet == wallet)
        .ok_or(AppError::Forbidden)?;
    let my_id = my_team.id.ok_or_else(|| AppError::Internal("team id".into()))?;
    if my_id != on_clock {
        return Err(AppError::Forbidden);
    }
    for p in &session.picks {
        if p.symbol == sym {
            return Err(AppError::Conflict("symbol already drafted".into()));
        }
    }
    let overall = session.picks.len() as u16 + 1;
    let round = ((overall - 1) / order.len() as u16 + 1) as u8;
    let hash = pick_commit::draft_pick_hash(
        &league_oid.to_hex(),
        round,
        overall,
        &sym,
        &wallet,
    );
    let mut hash32 = [0u8; 32];
    let hb = hex::decode(&hash).map_err(|_| AppError::Internal("hash".into()))?;
    if hb.len() == 32 {
        hash32.copy_from_slice(&hb);
    }
    let pick = DraftPick {
        round,
        overall,
        team_id: my_id,
        symbol: sym.clone(),
        company_name: body.company_name,
        chain_commitment: Some(hash.clone()),
    };
    session.picks.push(pick);
    let done = session.picks.len() as u32
        >= league.settings.snake_rounds as u32 * order.len() as u32;
    if done {
        session.status = DraftStatus::Completed;
        session.clock_team_id = None;
        session.deadline_at = None;
        leagues
            .update_one(
                mongodb::bson::doc! { "_id": league_oid },
                mongodb::bson::doc! { "$set": { "status": "active" } },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let pick_syms: Vec<String> = session.picks.iter().map(|p| p.symbol.clone()).collect();
        let spot = crate::quotes::spot_prices(&pick_syms).await;
        for t in &mut teams {
            let tid = match t.id {
                Some(id) => id,
                None => continue,
            };
            let mut picks_for_team: Vec<_> = session
                .picks
                .iter()
                .filter(|p| p.team_id == tid)
                .cloned()
                .collect();
            picks_for_team.sort_by_key(|p| p.overall);
            let mut roster = vec![];
            for (i, p) in picks_for_team.into_iter().enumerate() {
                let ep = spot.get(&p.symbol.to_uppercase()).copied();
                let slot = if (i as u8) < league.settings.roster_size {
                    RosterSlot::Starter
                } else {
                    RosterSlot::Bench
                };
                roster.push(RosterEntry {
                    symbol: p.symbol,
                    company_name: p.company_name,
                    slot,
                    acquired_at: chrono::Utc::now(),
                    source: "draft".into(),
                    entry_price: ep,
                });
            }
            t.roster = roster;
            teams_col
                .replace_one(
                    mongodb::bson::doc! { "_id": t.id },
                    t,
                )
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }
    } else {
        session.clock_team_id = next_clock_team(
            &session,
            &order,
            league.settings.snake_rounds,
        );
        let next_idx = session.picks.len() as u32;
        let n = order.len();
        session.current_round = (next_idx / n as u32 + 1) as u8;
        session.direction = direction_for_round_from_pick(next_idx, n);
        session.deadline_at = if league.settings.draft_timer_seconds > 0 {
            Some(chrono::Utc::now() + chrono::Duration::seconds(league.settings.draft_timer_seconds as i64))
        } else {
            None
        };
    }
    let filter = if let Some(sid) = session.id {
        mongodb::bson::doc! { "_id": sid }
    } else {
        mongodb::bson::doc! { "league_id": league_oid }
    };
    draft_col
        .replace_one(
            filter,
            &session,
        )
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    state.broadcast_json(&WsServerMessage::DraftUpdated {
        session: session.clone(),
    });
    let _ = chain_tx::record_pick_instruction(&state.config, session.picks.len() as u32 - 1, hash32);
    Ok(Json(session))
}

async fn auto_pick(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<DraftSession>> {
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let leagues = state.db.collection::<League>("leagues");
    let league = leagues
        .find_one(mongodb::bson::doc! { "_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    let draft_col = state.db.collection::<DraftSession>("draft_sessions");
    let session = draft_col
        .find_one(mongodb::bson::doc! { "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    if session.status != DraftStatus::InProgress {
        return Err(AppError::Conflict("draft not active".into()));
    }

    match session.deadline_at {
        Some(deadline) if deadline <= chrono::Utc::now() => {}
        _ => return Err(AppError::Conflict("timer has not expired".into())),
    }

    let teams_col = state.db.collection::<Team>("teams");
    let mut cur = teams_col
        .find(mongodb::bson::doc! { "league_id": league_oid })
        .sort(mongodb::bson::doc! { "draft_position": 1 })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut teams: Vec<Team> = Vec::new();
    while let Some(t) = cur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        teams.push(t);
    }
    teams.sort_by_key(|t| t.draft_position);
    let order: Vec<ObjectId> = teams.iter().filter_map(|t| t.id).collect();

    let on_clock = next_clock_team(&session, &order, league.settings.snake_rounds)
        .ok_or_else(|| AppError::Conflict("draft complete".into()))?;
    let clock_wallet = teams
        .iter()
        .find(|t| t.id == Some(on_clock))
        .map(|t| t.owner_wallet.clone())
        .unwrap_or_default();

    let drafted: std::collections::HashSet<String> =
        session.picks.iter().map(|p| p.symbol.clone()).collect();
    let universe = fortune500::universe();
    let available: Vec<&String> = universe.iter().filter(|s| !drafted.contains(*s)).collect();
    if available.is_empty() {
        return Err(AppError::Conflict("no symbols left".into()));
    }
    use rand::seq::SliceRandom;
    let sym = available
        .choose(&mut rand::thread_rng())
        .ok_or_else(|| AppError::Internal("rng".into()))?
        .to_string();
    let company_name = sym.clone();

    let overall = session.picks.len() as u16 + 1;
    let round = ((overall - 1) / order.len() as u16 + 1) as u8;
    let hash = pick_commit::draft_pick_hash(
        &league_oid.to_hex(),
        round,
        overall,
        &sym,
        &clock_wallet,
    );

    let pick = DraftPick {
        round,
        overall,
        team_id: on_clock,
        symbol: sym,
        company_name,
        chain_commitment: Some(hash),
    };

    let mut session = session;
    session.picks.push(pick);

    let done = session.picks.len() as u32
        >= league.settings.snake_rounds as u32 * order.len() as u32;
    if done {
        session.status = DraftStatus::Completed;
        session.clock_team_id = None;
        session.deadline_at = None;
        leagues
            .update_one(
                mongodb::bson::doc! { "_id": league_oid },
                mongodb::bson::doc! { "$set": { "status": "active" } },
            )
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let pick_syms: Vec<String> = session.picks.iter().map(|p| p.symbol.clone()).collect();
        let spot = crate::quotes::spot_prices(&pick_syms).await;
        for t in &mut teams {
            let tid = match t.id {
                Some(id) => id,
                None => continue,
            };
            let mut picks_for_team: Vec<_> = session
                .picks
                .iter()
                .filter(|p| p.team_id == tid)
                .cloned()
                .collect();
            picks_for_team.sort_by_key(|p| p.overall);
            let mut roster = vec![];
            for (i, p) in picks_for_team.into_iter().enumerate() {
                let ep = spot.get(&p.symbol.to_uppercase()).copied();
                let slot = if (i as u8) < league.settings.roster_size {
                    RosterSlot::Starter
                } else {
                    RosterSlot::Bench
                };
                roster.push(RosterEntry {
                    symbol: p.symbol,
                    company_name: p.company_name,
                    slot,
                    acquired_at: chrono::Utc::now(),
                    source: "draft".into(),
                    entry_price: ep,
                });
            }
            t.roster = roster;
            teams_col
                .replace_one(
                    mongodb::bson::doc! { "_id": t.id },
                    t,
                )
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }
    } else {
        session.clock_team_id = next_clock_team(&session, &order, league.settings.snake_rounds);
        let next_idx = session.picks.len() as u32;
        let n = order.len();
        session.current_round = (next_idx / n as u32 + 1) as u8;
        session.direction = direction_for_round_from_pick(next_idx, n);
        session.deadline_at = if league.settings.draft_timer_seconds > 0 {
            Some(chrono::Utc::now() + chrono::Duration::seconds(league.settings.draft_timer_seconds as i64))
        } else {
            None
        };
    }

    let filter = if let Some(sid) = session.id {
        mongodb::bson::doc! { "_id": sid }
    } else {
        mongodb::bson::doc! { "league_id": league_oid }
    };
    draft_col
        .replace_one(filter, &session)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    state.broadcast_json(&WsServerMessage::DraftUpdated {
        session: session.clone(),
    });
    Ok(Json(session))
}

#[derive(Deserialize)]
struct SetLineupBody {
    starters: Vec<String>,
}

async fn set_lineup(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Path(id): Path<String>,
    Json(body): Json<SetLineupBody>,
) -> AppResult<Json<Team>> {
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let leagues = state.db.collection::<League>("leagues");
    let league = leagues
        .find_one(mongodb::bson::doc! { "_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    let max_starters = league.settings.roster_size as usize;
    if body.starters.len() > max_starters {
        return Err(AppError::BadRequest(format!(
            "too many starters (max {})", max_starters
        )));
    }

    let teams_col = state.db.collection::<Team>("teams");
    let mut team = teams_col
        .find_one(mongodb::bson::doc! { "league_id": league_oid, "owner_wallet": &wallet })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    let starter_set: std::collections::HashSet<String> =
        body.starters.iter().map(|s| s.to_uppercase()).collect();

    for entry in &mut team.roster {
        if starter_set.contains(&entry.symbol.to_uppercase()) {
            entry.slot = RosterSlot::Starter;
        } else {
            entry.slot = RosterSlot::Bench;
        }
    }

    teams_col
        .replace_one(mongodb::bson::doc! { "_id": team.id }, &team)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(team))
}

async fn submit_waiver(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Path(id): Path<String>,
    Json(body): Json<WaiverBody>,
) -> AppResult<Json<Team>> {
    let add_sym = body.add_symbol.to_uppercase();
    if !fortune500::is_valid_symbol(&add_sym) {
        return Err(AppError::BadRequest("symbol not in universe".into()));
    }
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let teams_col = state.db.collection::<Team>("teams");
    let mut team = teams_col
        .find_one(mongodb::bson::doc! { "league_id": league_oid, "owner_wallet": &wallet })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    let mut all_teams_cur = teams_col
        .find(mongodb::bson::doc! { "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut all_rostered = std::collections::HashSet::new();
    while let Some(t) = all_teams_cur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        for r in &t.roster {
            all_rostered.insert(r.symbol.to_uppercase());
        }
    }
    if all_rostered.contains(&add_sym) {
        return Err(AppError::Conflict("company already rostered by a team".into()));
    }

    let drop_sym = body.drop_symbol.map(|s| s.to_uppercase());
    if let Some(ref ds) = drop_sym {
        let idx = team.roster.iter().position(|r| r.symbol.to_uppercase() == *ds);
        if let Some(i) = idx {
            team.roster.remove(i);
        } else {
            return Err(AppError::BadRequest("drop_symbol not on your roster".into()));
        }
    }

    let spot = crate::quotes::spot_prices(&[add_sym.clone()]).await;
    let ep = spot.get(&add_sym).copied();
    team.roster.push(RosterEntry {
        symbol: add_sym.clone(),
        company_name: add_sym.clone(),
        slot: RosterSlot::Bench,
        acquired_at: chrono::Utc::now(),
        source: "waiver".into(),
        entry_price: ep,
    });

    teams_col
        .replace_one(mongodb::bson::doc! { "_id": team.id }, &team)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(team))
}

async fn get_scores(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;

    let col = state.db.collection::<WeeklyScoreboard>("weekly_scores");
    let mut cur = col
        .find(mongodb::bson::doc! { "league_id": league_oid })
        .sort(mongodb::bson::doc! { "week_start": 1 })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut weeks: Vec<WeeklyScoreboard> = Vec::new();
    while let Some(board) = cur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        weeks.push(board);
    }

    let teams_col = state.db.collection::<Team>("teams");
    let mut tcur = teams_col
        .find(mongodb::bson::doc! { "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut teams_docs: Vec<Team> = Vec::new();
    while let Some(t) = tcur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        teams_docs.push(t);
    }
    let team_ids: Vec<bson::oid::ObjectId> = teams_docs.iter().filter_map(|t| t.id).collect();

    let today = chrono::Utc::now().date_naive();
    let iso = today.iso_week();
    let monday =
        chrono::NaiveDate::from_isoywd_opt(iso.year(), iso.week(), chrono::Weekday::Mon)
            .unwrap_or(today);
    let current_week_start = monday.format("%Y-%m-%d").to_string();

    let win_map = compute_matchup_wins(&teams_docs, &weeks, &current_week_start);

    let mut starter_syms: Vec<String> = Vec::new();
    for t in &teams_docs {
        for r in &t.roster {
            if r.slot == RosterSlot::Starter {
                starter_syms.push(r.symbol.clone());
            }
        }
    }
    let spot = crate::quotes::spot_prices(&starter_syms).await;

    let mut raw_avgs: Vec<(bson::oid::ObjectId, f64, bool)> = Vec::new();
    for t in &teams_docs {
        let tid = match t.id {
            Some(id) => id,
            None => continue,
        };
        let mut sum = 0.0f64;
        let mut n = 0u32;
        for r in &t.roster {
            if r.slot != RosterSlot::Starter {
                continue;
            }
            let px = spot.get(&r.symbol.to_uppercase()).copied();
            let ep = r.entry_price.filter(|e| *e > 0.0);
            if let (Some(price), Some(entry)) = (px, ep) {
                sum += (price / entry - 1.0) * 100.0;
                n += 1;
            }
        }
        let has = n > 0;
        let avg = if has { sum / f64::from(n) } else { 0.0 };
        raw_avgs.push((tid, avg, has));
    }

    let raw_map: HashMap<ObjectId, (f64, bool)> =
        raw_avgs.iter().map(|(id, a, h)| (*id, (*a, *h))).collect();

    #[derive(Clone, Copy)]
    struct StandRow {
        tid: ObjectId,
        wins: u32,
        has_raw: bool,
        raw_avg: f64,
    }
    let mut rows: Vec<StandRow> = Vec::new();
    for t in &teams_docs {
        let tid = match t.id {
            Some(id) => id,
            None => continue,
        };
        let wins = *win_map.get(&tid).unwrap_or(&0);
        let (raw_avg, has_raw) = raw_map.get(&tid).copied().unwrap_or((0.0, false));
        rows.push(StandRow {
            tid,
            wins,
            has_raw,
            raw_avg,
        });
    }
    rows.sort_by(|a, b| {
        b.wins
            .cmp(&a.wins)
            .then_with(|| b.has_raw.cmp(&a.has_raw))
            .then_with(|| {
                b.raw_avg
                    .partial_cmp(&a.raw_avg)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| b.tid.to_hex().cmp(&a.tid.to_hex()))
    });
    let n = rows.len();
    let raw_cents: Vec<i64> = rows
        .iter()
        .enumerate()
        .map(|(rank, row)| {
            let v = season_pct_from_standings_order(&row.tid, rank, n);
            (v * 100.0).round() as i64
        })
        .collect();
    let cents = enforce_season_pct_order(raw_cents);
    let mut team_season_pct = serde_json::Map::new();
    for (row, c) in rows.iter().zip(cents.iter()) {
        let display = *c as f64 / 100.0;
        team_season_pct.insert(row.tid.to_hex(), serde_json::json!(display));
    }

    let ps_col = state.db.collection::<PlayerWeeklyScore>("player_scores");
    let mut pcur = ps_col
        .find(mongodb::bson::doc! { "team_id": { "$in": &team_ids } })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut player_scores: Vec<PlayerWeeklyScore> = Vec::new();
    while let Some(ps) = pcur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        player_scores.push(ps);
    }

    Ok(Json(json!({
        "weeks": weeks,
        "player_scores": player_scores,
        "current_week_start": current_week_start,
        "team_season_pct": team_season_pct,
    })))
}

async fn chain_init_ix(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ChainInitQuery>,
) -> AppResult<Json<chain_tx::InstructionDraft>> {
    let ix = chain_tx::init_league_instruction(&state.config, q.buy_in_lamports, q.max_teams)?;
    Ok(Json(ix))
}

async fn chain_record_pick_ix(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ChainPickQuery>,
) -> AppResult<Json<chain_tx::InstructionDraft>> {
    let bytes = hex::decode(q.pick_hash_hex.trim_start_matches("0x"))
        .map_err(|_| AppError::BadRequest("pick_hash_hex".into()))?;
    if bytes.len() != 32 {
        return Err(AppError::BadRequest("pick_hash must be 32 bytes hex".into()));
    }
    let mut h = [0u8; 32];
    h.copy_from_slice(&bytes);
    let ix = chain_tx::record_pick_instruction(&state.config, q.pick_index, h)?;
    Ok(Json(ix))
}

async fn chain_deposit_ix(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<chain_tx::InstructionDraft>> {
    let ix = chain_tx::deposit_buy_in_instruction(&state.config)?;
    Ok(Json(ix))
}

// ─── Stock Alerts ──────────────────────────────────────────────────────

async fn get_stock_alerts(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<quotes::StockAlert>>> {
    let league_oid =
        ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;

    let teams_col = state.db.collection::<Team>("teams");
    let mut tcur = teams_col
        .find(bson::doc! { "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut symbols = Vec::new();
    while let Some(t) = tcur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        for r in &t.roster {
            let s = r.symbol.to_uppercase();
            if !symbols.contains(&s) {
                symbols.push(s);
            }
        }
    }

    let alerts = quotes::fetch_stock_alerts(&symbols).await;
    Ok(Json(alerts))
}

// ─── Commissioner Report ───────────────────────────────────────────────

#[derive(Deserialize)]
struct ReportQuery {
    week: Option<String>,
}

#[derive(Deserialize)]
struct SaveReportBody {
    overall_comment: Option<String>,
    player_feedback: Option<Vec<PlayerFeedback>>,
}

async fn get_commissioner_report(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    auth: Option<AuthWallet>,
    Query(q): Query<ReportQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let league_oid =
        ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;

    let week = match q.week {
        Some(w) => w,
        None => {
            let today = chrono::Utc::now().date_naive();
            let iso = today.iso_week();
            let monday =
                chrono::NaiveDate::from_isoywd_opt(iso.year(), iso.week(), chrono::Weekday::Mon)
                    .unwrap_or(today);
            monday.format("%Y-%m-%d").to_string()
        }
    };

    let col = state
        .db
        .collection::<CommissionerReport>("commissioner_reports");
    let report = col
        .find_one(bson::doc! { "league_id": league_oid, "week_start": &week })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let league = state
        .db
        .collection::<League>("leagues")
        .find_one(bson::doc! { "_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    let caller_wallet = auth.map(|a| a.0);
    let is_commissioner = caller_wallet
        .as_deref()
        .map(|w| w == league.commissioner_wallet)
        .unwrap_or(false);

    let weeks_col = state.db.collection::<WeeklyScoreboard>("weekly_scores");
    let mut wcur = weeks_col
        .find(bson::doc! { "league_id": league_oid })
        .sort(bson::doc! { "week_start": 1 })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut available_weeks: Vec<String> = Vec::new();
    while let Some(board) = wcur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        if !available_weeks.contains(&board.week_start) {
            available_weeks.push(board.week_start);
        }
    }

    match report {
        Some(mut r) => {
            if !is_commissioner {
                // Non-commissioners only see their own player feedback
                r.player_feedback = r
                    .player_feedback
                    .into_iter()
                    .filter(|f| caller_wallet.as_deref() == Some(&f.owner_wallet))
                    .collect();
            }
            Ok(Json(json!({
                "report": r,
                "available_weeks": available_weeks,
            })))
        }
        None => Ok(Json(json!({
            "report": null,
            "available_weeks": available_weeks,
        }))),
    }
}

async fn save_commissioner_report(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    AuthWallet(wallet): AuthWallet,
    Query(q): Query<ReportQuery>,
    Json(body): Json<SaveReportBody>,
) -> AppResult<Json<CommissionerReport>> {
    let league_oid =
        ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;

    let league = state
        .db
        .collection::<League>("leagues")
        .find_one(bson::doc! { "_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    require_commissioner(&wallet, &league.commissioner_wallet)?;

    let week = match q.week {
        Some(w) => w,
        None => {
            let today = chrono::Utc::now().date_naive();
            let iso = today.iso_week();
            let monday =
                chrono::NaiveDate::from_isoywd_opt(iso.year(), iso.week(), chrono::Weekday::Mon)
                    .unwrap_or(today);
            monday.format("%Y-%m-%d").to_string()
        }
    };

    let col = state
        .db
        .collection::<CommissionerReport>("commissioner_reports");
    let existing = col
        .find_one(bson::doc! { "league_id": league_oid, "week_start": &week })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let now = chrono::Utc::now();
    let feedback = body.player_feedback.unwrap_or_default();

    if let Some(mut doc) = existing {
        let mut update = bson::doc! { "updated_at": bson::DateTime::from_chrono(now) };
        if let Some(ref comment) = body.overall_comment {
            update.insert("overall_comment", comment.clone());
        }
        let fb_bson =
            bson::to_bson(&feedback).map_err(|e| AppError::Internal(e.to_string()))?;
        update.insert("player_feedback", fb_bson);

        col.update_one(
            bson::doc! { "league_id": league_oid, "week_start": &week },
            bson::doc! { "$set": update },
        )
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        doc.overall_comment = body.overall_comment.or(doc.overall_comment);
        doc.player_feedback = feedback;
        doc.updated_at = Some(now);
        Ok(Json(doc))
    } else {
        let doc = CommissionerReport {
            id: None,
            league_id: league_oid,
            week_start: week,
            overall_comment: body.overall_comment,
            player_feedback: feedback,
            ai_summary: None,
            updated_at: Some(now),
        };
        col.insert_one(&doc)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(Json(doc))
    }
}

#[derive(Deserialize)]
struct GenerateReportBody {
    week: Option<String>,
}

async fn generate_commissioner_report(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    AuthWallet(wallet): AuthWallet,
    Json(body): Json<GenerateReportBody>,
) -> AppResult<Json<CommissionerReport>> {
    let api_key = state
        .config
        .gemini_api_key
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("GEMINI_API_KEY not configured".into()))?;

    let league_oid =
        ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;

    let league = state
        .db
        .collection::<League>("leagues")
        .find_one(bson::doc! { "_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;

    require_commissioner(&wallet, &league.commissioner_wallet)?;

    let week = match body.week {
        Some(w) => w,
        None => {
            let today = chrono::Utc::now().date_naive();
            let iso = today.iso_week();
            let monday =
                chrono::NaiveDate::from_isoywd_opt(iso.year(), iso.week(), chrono::Weekday::Mon)
                    .unwrap_or(today);
            monday.format("%Y-%m-%d").to_string()
        }
    };

    // Gather context: teams, scores, matchups
    let teams_col = state.db.collection::<Team>("teams");
    let mut tcur = teams_col
        .find(bson::doc! { "league_id": league_oid })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut teams: Vec<Team> = Vec::new();
    while let Some(t) = tcur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        teams.push(t);
    }

    let weeks_col = state.db.collection::<WeeklyScoreboard>("weekly_scores");
    let mut wcur = weeks_col
        .find(bson::doc! { "league_id": league_oid })
        .sort(bson::doc! { "week_start": 1 })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut all_weeks: Vec<WeeklyScoreboard> = Vec::new();
    while let Some(board) = wcur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        all_weeks.push(board);
    }

    let ps_col = state.db.collection::<PlayerWeeklyScore>("player_scores");
    let team_ids: Vec<ObjectId> = teams.iter().filter_map(|t| t.id).collect();
    let mut pcur = ps_col
        .find(bson::doc! { "team_id": { "$in": &team_ids }, "week_start": &week })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut week_player_scores: Vec<PlayerWeeklyScore> = Vec::new();
    while let Some(ps) = pcur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        week_player_scores.push(ps);
    }

    // Load existing report for commissioner comments
    let col = state
        .db
        .collection::<CommissionerReport>("commissioner_reports");
    let existing = col
        .find_one(bson::doc! { "league_id": league_oid, "week_start": &week })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // Build matchup pairs for the current week
    let week_idx = all_weeks
        .iter()
        .position(|w| w.week_start == week)
        .map(|i| i + 1)
        .unwrap_or(1);
    let pairs = round_robin_pairs(&teams, week_idx);

    // Format the prompt
    let mut prompt = String::from(
        "You are the AI analyst for a Fantasy Stock Market league called \"Fantasy 500\" \
         where players draft S&P 500 stocks instead of athletes. \
         Generate a weekly Commissioner's Report.\n\n",
    );

    prompt.push_str(&format!("League: {}\nWeek: {}\n\n", league.name, week));

    // Team standings
    prompt.push_str("## Teams & Rosters\n");
    for t in &teams {
        prompt.push_str(&format!("- **{}** (owner: {}...)\n", t.name, &t.owner_wallet[..6]));
        for r in &t.roster {
            let slot_str = if r.slot == RosterSlot::Starter {
                "starter"
            } else {
                "bench"
            };
            prompt.push_str(&format!("  - {} ({}) [{}]\n", r.symbol, r.company_name, slot_str));
        }
    }

    // Weekly scores
    if let Some(board) = all_weeks.iter().find(|w| w.week_start == week) {
        prompt.push_str("\n## This Week's Scores\n");
        for tt in &board.team_totals {
            let name = teams
                .iter()
                .find(|t| t.id == Some(tt.team_id))
                .map(|t| t.name.as_str())
                .unwrap_or("?");
            prompt.push_str(&format!("- {}: {:.2} pts\n", name, tt.points));
        }
    }

    // Player-level scores for this week
    if !week_player_scores.is_empty() {
        prompt.push_str("\n## Individual Stock Performance This Week\n");
        for ps in &week_player_scores {
            let tname = teams
                .iter()
                .find(|t| t.id == Some(ps.team_id))
                .map(|t| t.name.as_str())
                .unwrap_or("?");
            prompt.push_str(&format!(
                "- {} ({}'s): {:.2}% → {:.2} pts\n",
                ps.symbol, tname, ps.pct_change, ps.points
            ));
        }
    }

    // Matchups
    prompt.push_str("\n## Matchups This Week\n");
    for (a, b) in &pairs {
        let a_name = a
            .and_then(|id| teams.iter().find(|t| t.id == Some(id)))
            .map(|t| t.name.as_str())
            .unwrap_or("BYE");
        let b_name = b
            .and_then(|id| teams.iter().find(|t| t.id == Some(id)))
            .map(|t| t.name.as_str())
            .unwrap_or("BYE");
        prompt.push_str(&format!("- {} vs {}\n", a_name, b_name));
    }

    // Season history
    if all_weeks.len() > 1 {
        prompt.push_str("\n## Previous Weeks Summary\n");
        for board in &all_weeks {
            if board.week_start == week {
                continue;
            }
            prompt.push_str(&format!("Week {}:\n", board.week_start));
            for tt in &board.team_totals {
                let name = teams
                    .iter()
                    .find(|t| t.id == Some(tt.team_id))
                    .map(|t| t.name.as_str())
                    .unwrap_or("?");
                prompt.push_str(&format!("  - {}: {:.2} pts\n", name, tt.points));
            }
        }
    }

    // Commissioner comments if available
    if let Some(ref report) = existing {
        if let Some(ref comment) = report.overall_comment {
            prompt.push_str(&format!(
                "\n## Commissioner's Notes\n{}\n",
                comment
            ));
        }
    }

    prompt.push_str(
        "\n---\n\
         Write an engaging, analysis-driven weekly summary (2-4 paragraphs). \
         Highlight notable stock performances, surprising results, close matchups, \
         and strategic moves. Reference specific stocks and team names. \
         Keep the tone conversational but informative, like a sports commentator covering Wall Street. \
         Do NOT use markdown headers in your output — just flowing paragraphs.",
    );

    let ai_summary = gemini::generate_summary(api_key, &prompt).await?;

    // Save the AI summary
    let now = chrono::Utc::now();
    if let Some(mut doc) = existing {
        col.update_one(
            bson::doc! { "league_id": league_oid, "week_start": &week },
            bson::doc! { "$set": {
                "ai_summary": &ai_summary,
                "updated_at": bson::DateTime::from_chrono(now),
            }},
        )
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
        doc.ai_summary = Some(ai_summary);
        doc.updated_at = Some(now);
        Ok(Json(doc))
    } else {
        let doc = CommissionerReport {
            id: None,
            league_id: league_oid,
            week_start: week,
            overall_comment: None,
            player_feedback: Vec::new(),
            ai_summary: Some(ai_summary),
            updated_at: Some(now),
        };
        col.insert_one(&doc)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(Json(doc))
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |mut socket| async move {
        let mut rx = state.ws_tx.subscribe();
        loop {
            tokio::select! {
                incoming = socket.next() => {
                    match incoming {
                        Some(Ok(axum::extract::ws::Message::Close(_))) | None => break,
                        _ => {}
                    }
                }
                msg = rx.recv() => {
                    if let Ok(text) = msg {
                        if socket.send(axum::extract::ws::Message::Text(text)).await.is_err() {
                            break;
                        }
                    }
                }
            }
        }
    })
}
