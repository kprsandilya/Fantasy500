//! Seed two presentation leagues in MongoDB:
//! 1) Completed 10-week season with full history (synthetic owners)
//! 2) Active league midway — you are commissioner + own Street West Desk (`SEED_WALLET`)
//!
//! Run: `cargo run -p server --bin seed_leagues`
//! Requires `SEED_WALLET` (your Phantom public address), plus `MONGO_URI` / `MONGO_DB`.

use std::env;

use anyhow::Context;
use bson::oid::ObjectId;
use chrono::{Datelike, Duration, Utc, Weekday};
use mongodb::Client;
use shared::{
    DraftDirection, DraftPick, DraftSession, DraftStatus, League, LeagueSettings, LeagueStatus,
    PlayerWeeklyScore, RosterEntry, RosterSlot, Team, TeamWeekTotal, WeeklyScoreboard,
};

/// Deterministic IDs so bookmarks stay stable.
const LEAGUE_COMPLETED_ID: &str = "674a1f77bcf86cd7994390a1";
const LEAGUE_MIDWAY_ID: &str = "674a1f77bcf86cd7994390a2";

const L1_T1: &str = "674a1f77bcf86cd7994390b1";
const L1_T2: &str = "674a1f77bcf86cd7994390b2";
const L1_T3: &str = "674a1f77bcf86cd7994390b3";
const L1_T4: &str = "674a1f77bcf86cd7994390b4";

const L2_T1: &str = "674a1f77bcf86cd7994390c1";
const L2_T2: &str = "674a1f77bcf86cd7994390c2";
const L2_T3: &str = "674a1f77bcf86cd7994390c3";
const L2_T4: &str = "674a1f77bcf86cd7994390c4";

const DRAFT_L1: &str = "674a1f77bcf86cd7994390d1";
const DRAFT_L2: &str = "674a1f77bcf86cd7994390d2";

/// 40 unique symbols — must exist in `fortune500.json`.
const DRAFT_SYMBOLS: [&str; 40] = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM", "V", "UNH", "JNJ", "XOM",
    "WMT", "PG", "MA", "HD", "DIS", "BAC", "KO", "PFE", "ABBV", "CVX", "AVGO", "COST", "MRK",
    "PEP", "TMO", "MCD", "CSCO", "ABT", "ACN", "AMD", "LIN", "PM", "ORCL", "IBM", "GE", "CAT",
    "HON", "MMM",
];

/// Synthetic owners for the finished-season league only (not signed in).
const L1_BOTS: [&str; 4] = [
    "F500SeedBot1AAAAAAAAAAAAAAAAAAAAAAAAAA",
    "F500SeedBot2AAAAAAAAAAAAAAAAAAAAAAAAAA",
    "F500SeedBot3AAAAAAAAAAAAAAAAAAAAAAAAAA",
    "F500SeedBot4AAAAAAAAAAAAAAAAAAAAAAAAAA",
];

/// Other owners in the active league (positions 2–4).
const L2_BOTS: [&str; 3] = [
    "F500SeedAliceAAAAAAAAAAAAAAAAAAAAAAAAA",
    "F500SeedBrunoAAAAAAAAAAAAAAAAAAAAAAAA",
    "F500SeedCleoAAAAAAAAAAAAAAAAAAAAAAAAA",
];

fn oid(hex: &str) -> ObjectId {
    ObjectId::parse_str(hex).expect("valid object id")
}

fn team_index_snake(pick_index: u32, n: u32) -> usize {
    let r = pick_index / n;
    let k = pick_index % n;
    if r % 2 == 0 {
        k as usize
    } else {
        (n - 1 - k) as usize
    }
}

fn monday_of_this_week() -> chrono::NaiveDate {
    let today = Utc::now().date_naive();
    let iso = today.iso_week();
    chrono::NaiveDate::from_isoywd_opt(iso.year(), iso.week(), Weekday::Mon)
        .unwrap_or(today)
}

fn week_start_str(d: chrono::NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

fn build_draft_picks(team_ids: &[ObjectId; 4]) -> Vec<DraftPick> {
    let n = 4u32;
    let mut picks = Vec::with_capacity(40);
    for pick_idx in 0u16..40 {
        let ti = team_index_snake(pick_idx as u32, n);
        let team_id = team_ids[ti];
        let overall = pick_idx + 1;
        let round = (pick_idx / 4 + 1) as u8;
        let sym = DRAFT_SYMBOLS[pick_idx as usize].to_string();
        picks.push(DraftPick {
            round,
            overall,
            team_id,
            symbol: sym.clone(),
            company_name: sym,
            chain_commitment: None,
        });
    }
    picks
}

fn starter_symbols(picks: &[DraftPick], team_id: ObjectId) -> Vec<String> {
    let mut mine: Vec<&DraftPick> = picks.iter().filter(|p| p.team_id == team_id).collect();
    mine.sort_by_key(|p| p.overall);
    mine.into_iter()
        .take(8)
        .map(|p| p.symbol.clone())
        .collect()
}

fn roster_from_picks(
    picks: &[DraftPick],
    team_id: ObjectId,
    acquired_base: chrono::DateTime<Utc>,
) -> Vec<RosterEntry> {
    let mut mine: Vec<&DraftPick> = picks
        .iter()
        .filter(|p| p.team_id == team_id)
        .collect();
    mine.sort_by_key(|p| p.overall);
    mine.into_iter()
        .enumerate()
        .map(|(i, p)| RosterEntry {
            symbol: p.symbol.clone(),
            company_name: p.company_name.clone(),
            slot: if i < 8 {
                RosterSlot::Starter
            } else {
                RosterSlot::Bench
            },
            acquired_at: acquired_base - Duration::hours(i as i64 * 6),
            source: "draft".into(),
            entry_price: Some(100.0),
        })
        .collect()
}

fn starter_pct(week_idx: u32, team_slot: u32, starter_idx: u32) -> f64 {
    let x = (week_idx * 17 + team_slot * 31 + starter_idx * 13) % 100;
    -2.0 + (x as f64 / 100.0) * 8.0
}

fn score_week(
    league_id: ObjectId,
    week_start: &str,
    teams: &[(ObjectId, String)],
    picks: &[DraftPick],
    week_idx: u32,
) -> (WeeklyScoreboard, Vec<PlayerWeeklyScore>) {
    let mut team_totals = Vec::new();
    let mut player_scores = Vec::new();

    for (slot, (tid, wallet)) in teams.iter().enumerate() {
        let starters = starter_symbols(picks, *tid);
        let mut points = 0.0f64;
        for (s, sym) in starters.iter().enumerate() {
            let pct = starter_pct(week_idx, slot as u32, s as u32);
            points += pct;
            player_scores.push(PlayerWeeklyScore {
                wallet: wallet.clone(),
                team_id: *tid,
                symbol: sym.clone(),
                week_start: week_start.to_string(),
                pct_change: pct,
                points: pct,
            });
        }
        team_totals.push(TeamWeekTotal {
            team_id: *tid,
            owner_wallet: wallet.clone(),
            points,
        });
    }

    (
        WeeklyScoreboard {
            league_id,
            week_start: week_start.to_string(),
            team_totals,
        },
        player_scores,
    )
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    shared::load_dotenv();
    let mongo_uri = env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://127.0.0.1:27017".into());
    let db_name = env::var("MONGO_DB").unwrap_or_else(|_| "fantasy500".into());

    let my_wallet = env::var("SEED_WALLET")
        .context("Set SEED_WALLET in .env to your wallet public address (Phantom → copy).")?;
    let my_wallet = my_wallet.trim().to_string();
    if my_wallet.is_empty() {
        anyhow::bail!("SEED_WALLET is empty; add your Phantom public address to .env");
    }

    let client = Client::with_uri_str(&mongo_uri).await?;
    let db = client.database(&db_name);

    let league_completed = oid(LEAGUE_COMPLETED_ID);
    let league_midway = oid(LEAGUE_MIDWAY_ID);

    let l1_teams = [
        oid(L1_T1),
        oid(L1_T2),
        oid(L1_T3),
        oid(L1_T4),
    ];
    let l2_teams = [
        oid(L2_T1),
        oid(L2_T2),
        oid(L2_T3),
        oid(L2_T4),
    ];

    let all_team_ids: Vec<ObjectId> = l1_teams
        .iter()
        .chain(l2_teams.iter())
        .copied()
        .collect();

    let league_filter = mongodb::bson::doc! {
        "_id": { "$in": [&league_completed, &league_midway] }
    };
    db.collection::<League>("leagues")
        .delete_many(league_filter.clone())
        .await?;
    db.collection::<Team>("teams")
        .delete_many(mongodb::bson::doc! { "league_id": { "$in": [&league_completed, &league_midway] } })
        .await?;
    db.collection::<DraftSession>("draft_sessions")
        .delete_many(mongodb::bson::doc! { "league_id": { "$in": [&league_completed, &league_midway] } })
        .await?;
    db.collection::<WeeklyScoreboard>("weekly_scores")
        .delete_many(mongodb::bson::doc! { "league_id": { "$in": [&league_completed, &league_midway] } })
        .await?;
    db.collection::<PlayerWeeklyScore>("player_scores")
        .delete_many(mongodb::bson::doc! { "team_id": { "$in": &all_team_ids } })
        .await?;

    let monday = monday_of_this_week();

    // ── League 1: finished 10-week season (synthetic owners) ──
    let picks_l1 = build_draft_picks(&[l1_teams[0], l1_teams[1], l1_teams[2], l1_teams[3]]);

    let league1 = League {
        id: Some(league_completed),
        name: "Full Season Championship — 2026".into(),
        commissioner_wallet: L1_BOTS[0].into(),
        status: LeagueStatus::Completed,
        settings: LeagueSettings {
            roster_size: 8,
            snake_rounds: 10,
            waiver_period_hours: 48,
            scoring_week_anchor: "Mon".into(),
            draft_timer_seconds: 90,
        },
        team_count: 4,
        season_year: 2026,
        chain_league: None,
        buy_in_lamports: Some(1_000_000_000),
        created_at: Some(Utc::now() - Duration::days(120)),
    };

    db.collection::<League>("leagues")
        .insert_one(&league1)
        .await?;

    let team_specs_l1: [(&str, &str, ObjectId); 4] = [
        ("Gamma Kings", L1_BOTS[0], l1_teams[0]),
        ("Alpha Squeeze", L1_BOTS[1], l1_teams[1]),
        ("Beta Bandits", L1_BOTS[2], l1_teams[2]),
        ("Delta Dividends", L1_BOTS[3], l1_teams[3]),
    ];

    for (i, (name, w, tid)) in team_specs_l1.iter().enumerate() {
        let t = Team {
            id: Some(*tid),
            league_id: league_completed,
            owner_wallet: (*w).into(),
            name: (*name).into(),
            draft_position: (i + 1) as u8,
            roster: roster_from_picks(&picks_l1, *tid, Utc::now() - Duration::days(100)),
            chain_team: None,
        };
        db.collection::<Team>("teams").insert_one(&t).await?;
    }

    let teams_l1_arr: [(ObjectId, String); 4] = [
        (l1_teams[0], L1_BOTS[0].into()),
        (l1_teams[1], L1_BOTS[1].into()),
        (l1_teams[2], L1_BOTS[2].into()),
        (l1_teams[3], L1_BOTS[3].into()),
    ];
    for w in 1u32..=10 {
        let d = monday - Duration::weeks((11 - w) as i64);
        let ws = week_start_str(d);
        let (board, ps) = score_week(league_completed, &ws, &teams_l1_arr, &picks_l1, w);
        db.collection::<WeeklyScoreboard>("weekly_scores")
            .insert_one(&board)
            .await?;
        if !ps.is_empty() {
            db.collection::<PlayerWeeklyScore>("player_scores")
                .insert_many(ps)
                .await?;
        }
    }

    let session_l1 = DraftSession {
        id: Some(oid(DRAFT_L1)),
        league_id: league_completed,
        status: DraftStatus::Completed,
        current_round: 10,
        clock_team_id: None,
        direction: DraftDirection::Reverse,
        picks: picks_l1,
        deadline_at: None,
    };
    db.collection::<DraftSession>("draft_sessions")
        .insert_one(&session_l1)
        .await?;

    // ── League 2: active, week 6 — you are commissioner + Street West Desk ──
    let picks_l2 = build_draft_picks(&[l2_teams[0], l2_teams[1], l2_teams[2], l2_teams[3]]);

    let league2 = League {
        id: Some(league_midway),
        name: "Mid-Season Showdown — Spring 2026".into(),
        commissioner_wallet: my_wallet.clone(),
        status: LeagueStatus::Active,
        settings: LeagueSettings {
            roster_size: 8,
            snake_rounds: 10,
            waiver_period_hours: 48,
            scoring_week_anchor: "Mon".into(),
            draft_timer_seconds: 90,
        },
        team_count: 4,
        season_year: 2026,
        chain_league: None,
        buy_in_lamports: Some(500_000_000),
        created_at: Some(Utc::now() - Duration::days(45)),
    };

    db.collection::<League>("leagues")
        .insert_one(&league2)
        .await?;

    let team_specs_l2: [(String, String, ObjectId); 4] = [
        ("Street West Desk".into(), my_wallet.clone(), l2_teams[0]),
        ("LP Gaming".into(), L2_BOTS[0].into(), l2_teams[1]),
        ("Chart Chasers".into(), L2_BOTS[1].into(), l2_teams[2]),
        ("Candle Crew".into(), L2_BOTS[2].into(), l2_teams[3]),
    ];

    for (i, (name, w, tid)) in team_specs_l2.iter().enumerate() {
        let t = Team {
            id: Some(*tid),
            league_id: league_midway,
            owner_wallet: w.clone(),
            name: name.clone(),
            draft_position: (i + 1) as u8,
            roster: roster_from_picks(&picks_l2, *tid, Utc::now() - Duration::days(40)),
            chain_team: None,
        };
        db.collection::<Team>("teams").insert_one(&t).await?;
    }

    let teams_l2_arr: [(ObjectId, String); 4] = [
        (l2_teams[0], my_wallet.clone()),
        (l2_teams[1], L2_BOTS[0].into()),
        (l2_teams[2], L2_BOTS[1].into()),
        (l2_teams[3], L2_BOTS[2].into()),
    ];

    for w in 1u32..=6 {
        let d = monday - Duration::weeks((6 - w) as i64);
        let ws = week_start_str(d);
        let (board, ps) = score_week(league_midway, &ws, &teams_l2_arr, &picks_l2, w + 10);
        db.collection::<WeeklyScoreboard>("weekly_scores")
            .insert_one(&board)
            .await?;
        if !ps.is_empty() {
            db.collection::<PlayerWeeklyScore>("player_scores")
                .insert_many(ps)
                .await?;
        }
    }

    let session_l2 = DraftSession {
        id: Some(oid(DRAFT_L2)),
        league_id: league_midway,
        status: DraftStatus::Completed,
        current_round: 10,
        clock_team_id: None,
        direction: DraftDirection::Reverse,
        picks: picks_l2,
        deadline_at: None,
    };
    db.collection::<DraftSession>("draft_sessions")
        .insert_one(&session_l2)
        .await?;

    println!("OK — seeded presentation leagues in database {:?}", db_name);
    println!();
    println!("  Full season (complete): {}", LEAGUE_COMPLETED_ID);
    println!("    /league/{}", LEAGUE_COMPLETED_ID);
    println!("  Mid-season (you are commissioner): {}", LEAGUE_MIDWAY_ID);
    println!("    /league/{}", LEAGUE_MIDWAY_ID);
    println!();
    println!("  Signed in as: {}", my_wallet);
    println!("  Commissioner + Street West Desk in the active league.");
    Ok(())
}
