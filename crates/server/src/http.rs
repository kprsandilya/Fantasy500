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
    DraftDirection, DraftPick, DraftSession, DraftStatus, JoinRequest, JoinRequestStatus,
    League, LeagueSettings, LeagueStatus, PlayerWeeklyScore, RosterEntry, RosterSlot, Team,
    User, WalletAuthPayload, WaiverClaim, WeeklyScoreboard, WsServerMessage,
};

use rand::seq::SliceRandom;

use crate::auth_wallet;
use crate::chain_tx;
use crate::draft_logic::{direction_for_round_from_pick, next_clock_team};
use crate::error::{AppError, AppResult};
use crate::extract::{require_commissioner, AuthWallet};
use crate::fortune500;
use crate::jwt;
use crate::pick_commit;
use crate::state::AppState;

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
        .route("/api/leagues/:id/waivers", post(submit_waiver))
        .route("/api/leagues/:id/scores", get(get_scores))
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
        for t in &mut teams {
            let tid = match t.id {
                Some(id) => id,
                None => continue,
            };
            let picks_for_team: Vec<_> = session
                .picks
                .iter()
                .filter(|p| p.team_id == tid)
                .cloned()
                .collect();
            let mut roster = vec![];
            for p in picks_for_team {
                roster.push(RosterEntry {
                    symbol: p.symbol,
                    company_name: p.company_name,
                    slot: RosterSlot::Starter,
                    acquired_at: chrono::Utc::now(),
                    source: "draft".into(),
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

async fn submit_waiver(
    State(state): State<Arc<AppState>>,
    AuthWallet(wallet): AuthWallet,
    Path(id): Path<String>,
    Json(body): Json<WaiverBody>,
) -> AppResult<Json<WaiverClaim>> {
    let sym = body.add_symbol.to_uppercase();
    if !fortune500::is_valid_symbol(&sym) {
        return Err(AppError::BadRequest("symbol not in universe".into()));
    }
    let league_oid = ObjectId::parse_str(&id).map_err(|_| AppError::BadRequest("bad id".into()))?;
    let teams_col = state.db.collection::<Team>("teams");
    let team = teams_col
        .find_one(mongodb::bson::doc! { "league_id": league_oid, "owner_wallet": &wallet })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound)?;
    let n = state
        .db
        .collection::<WaiverClaim>("waivers")
        .count_documents(mongodb::bson::doc! { "league_id": league_oid, "processed": false })
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let claim = WaiverClaim {
        id: None,
        league_id: league_oid,
        team_id: team.id.ok_or_else(|| AppError::Internal("team".into()))?,
        add_symbol: sym,
        drop_symbol: body.drop_symbol.map(|s| s.to_uppercase()),
        submitted_at: chrono::Utc::now(),
        priority: (n as u8).saturating_add(1),
        processed: false,
    };
    let col = state.db.collection::<WaiverClaim>("waivers");
    let res = col
        .insert_one(&claim)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut claim = claim;
    claim.id = res.inserted_id.as_object_id();
    Ok(Json(claim))
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
    let mut team_ids: Vec<bson::oid::ObjectId> = Vec::new();
    while let Some(t) = tcur
        .try_next()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
    {
        if let Some(tid) = t.id {
            team_ids.push(tid);
        }
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

    let today = chrono::Utc::now().date_naive();
    let iso = today.iso_week();
    let monday =
        chrono::NaiveDate::from_isoywd_opt(iso.year(), iso.week(), chrono::Weekday::Mon)
            .unwrap_or(today);
    let current_week_start = monday.format("%Y-%m-%d").to_string();

    Ok(Json(json!({
        "weeks": weeks,
        "player_scores": player_scores,
        "current_week_start": current_week_start,
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
