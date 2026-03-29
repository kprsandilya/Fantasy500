//! Background worker: weekly starter % moves vs prior-week close (or acquisition price),
//! and season-to-date % is derived on read from `entry_price` + live quotes.

mod yahoo;

use std::collections::HashSet;

use chrono::Datelike;
use futures::TryStreamExt;
use mongodb::Client;
use shared::{
    load_dotenv, League, PlayerWeeklyScore, PriceBar, RosterSlot, Team, TeamWeekTotal,
    WeeklyScoreboard,
};

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Clone)]
struct Config {
    mongo_uri: String,
    db_name: String,
}

impl Config {
    fn from_env() -> Self {
        Self {
            mongo_uri: std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://127.0.0.1:27017".into()),
            db_name: std::env::var("MONGO_DB").unwrap_or_else(|_| "fantasy500".into()),
        }
    }
}

fn prev_week_iso(week_start: &str) -> Option<String> {
    let d = chrono::NaiveDate::parse_from_str(week_start, "%Y-%m-%d").ok()?;
    Some((d - chrono::Duration::weeks(1)).format("%Y-%m-%d").to_string())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    load_dotenv();
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let cfg = Config::from_env();
    let client = Client::with_uri_str(&cfg.mongo_uri).await?;
    let db = client.database(&cfg.db_name);

    let week_start = iso_week_start(chrono::Utc::now().date_naive());
    tracing::info!("scoring week anchor {}", week_start);

    let leagues = db.collection::<League>("leagues");
    let mut cur = leagues
        .find(mongodb::bson::doc! { "status": "active" })
        .await?;
    while let Some(league) = cur.try_next().await? {
        score_league(&db, &league, &week_start).await?;
    }

    Ok(())
}

fn iso_week_start(d: chrono::NaiveDate) -> String {
    let week = d.iso_week();
    let monday = chrono::NaiveDate::from_isoywd_opt(week.year(), week.week(), chrono::Weekday::Mon)
        .unwrap_or(d);
    monday.format("%Y-%m-%d").to_string()
}

async fn score_league(
    db: &mongodb::Database,
    league: &League,
    week_start: &str,
) -> anyhow::Result<()> {
    let league_id = league.id.ok_or_else(|| anyhow::anyhow!("league id"))?;
    let teams_col = db.collection::<Team>("teams");
    let mut cur = teams_col
        .find(mongodb::bson::doc! { "league_id": league_id })
        .await?;
    let mut teams: Vec<Team> = Vec::new();
    while let Some(t) = cur.try_next().await? {
        teams.push(t);
    }

    let mut symbols: HashSet<String> = HashSet::new();
    for t in &teams {
        for r in &t.roster {
            if r.slot == RosterSlot::Starter {
                symbols.insert(r.symbol.to_uppercase());
            }
        }
    }
    let sym_list: Vec<String> = symbols.into_iter().collect();
    let prices = yahoo::spot_prices(&sym_list).await;

    let bars_col = db.collection::<PriceBar>("price_bars");
    let ps_col = db.collection::<PlayerWeeklyScore>("player_scores");

    let team_ids: Vec<mongodb::bson::oid::ObjectId> = teams.iter().filter_map(|t| t.id).collect();
    ps_col
        .delete_many(mongodb::bson::doc! {
            "week_start": week_start,
            "team_id": { "$in": &team_ids },
        })
        .await
        .ok();

    let prev_ws = prev_week_iso(week_start);

    let mut team_totals: Vec<TeamWeekTotal> = vec![];
    for t in &teams {
        let tid = match t.id {
            Some(id) => id,
            None => continue,
        };
        let mut points = 0.0f64;
        for r in &t.roster {
            if r.slot != RosterSlot::Starter {
                continue;
            }
            let sym = r.symbol.to_uppercase();
            let p_now = match prices.get(&sym).copied() {
                Some(p) if p > 0.0 => p,
                _ => {
                    tracing::warn!("no price for {}", sym);
                    continue;
                }
            };
            let entry = r.entry_price.filter(|e| *e > 0.0).unwrap_or(p_now);

            let open_w = if let Some(ref pws) = prev_ws {
                let prev_bar = bars_col
                    .find_one(mongodb::bson::doc! {
                        "symbol": &sym,
                        "week_start": pws,
                    })
                    .await?;
                prev_bar
                    .map(|b: PriceBar| b.close)
                    .filter(|c| *c > 0.0)
                    .unwrap_or(entry)
            } else {
                entry
            };

            let week_pct = (p_now / open_w - 1.0) * 100.0;
            points += week_pct;

            let bar = PriceBar {
                symbol: sym.clone(),
                week_start: week_start.to_string(),
                open: open_w,
                close: p_now,
                pct_change: week_pct,
            };
            let _ = bars_col
                .delete_one(mongodb::bson::doc! { "symbol": &sym, "week_start": week_start })
                .await;
            let _ = bars_col.insert_one(&bar).await;

            let pws = PlayerWeeklyScore {
                wallet: t.owner_wallet.clone(),
                team_id: tid,
                symbol: sym,
                week_start: week_start.to_string(),
                pct_change: week_pct,
                points: week_pct,
            };
            ps_col.insert_one(pws).await.ok();
        }
        team_totals.push(TeamWeekTotal {
            team_id: tid,
            owner_wallet: t.owner_wallet.clone(),
            points,
        });
    }

    db.collection::<WeeklyScoreboard>("weekly_scores")
        .delete_one(mongodb::bson::doc! { "league_id": league_id, "week_start": week_start })
        .await
        .ok();
    let board = WeeklyScoreboard {
        league_id,
        week_start: week_start.to_string(),
        team_totals,
    };
    db.collection::<WeeklyScoreboard>("weekly_scores")
        .insert_one(board)
        .await?;
    tracing::info!("scored league {:?}", league_id);
    Ok(())
}
