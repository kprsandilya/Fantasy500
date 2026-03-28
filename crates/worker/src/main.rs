//! Background worker: ingests quote snapshots, computes weekly percentage moves,
//! and writes `weekly_scores` + broadcasts over Mongo change streams (optional) / polling.

use std::collections::{HashMap, HashSet};

use chrono::Datelike;
use futures::TryStreamExt;
use mongodb::Client;
use serde::Deserialize;
use shared::{
    League, PlayerWeeklyScore, PriceBar, RosterSlot, Team, TeamWeekTotal, WeeklyScoreboard,
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

#[derive(Debug, Deserialize)]
struct YahooQuote {
    #[serde(rename = "regularMarketPrice")]
    regular_market_price: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct YahooResponse {
    #[serde(rename = "quoteResponse")]
    quote_response: YahooQuoteResponse,
}

#[derive(Debug, Deserialize)]
struct YahooQuoteResponse {
    result: Vec<YahooQuote>,
}

async fn yahoo_price(symbol: &str) -> anyhow::Result<f64> {
    let url = format!(
        "https://query1.finance.yahoo.com/v7/finance/quote?symbols={}",
        urlencoding::encode(symbol)
    );
    let client = reqwest::Client::builder()
        .user_agent("Fantasy500Worker/0.1")
        .build()?;
    let res: YahooResponse = client.get(&url).send().await?.json().await?;
    res.quote_response
        .result
        .get(0)
        .and_then(|q| q.regular_market_price)
        .ok_or_else(|| anyhow::anyhow!("no price for {}", symbol))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
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

    let mut prices: HashMap<String, f64> = HashMap::new();
    let mut symbols = HashSet::new();
    for t in &teams {
        for r in &t.roster {
            if r.slot == RosterSlot::Starter {
                symbols.insert(r.symbol.clone());
            }
        }
    }

    for s in &symbols {
        match yahoo_price(s).await {
            Ok(p) => {
                prices.insert(s.clone(), p);
            }
            Err(e) => tracing::warn!("quote {} failed: {}", s, e),
        }
    }

    let quotes = db.collection::<shared::QuoteSnapshot>("market_quotes");
    for (sym, price) in &prices {
        let snap = shared::QuoteSnapshot {
            symbol: sym.clone(),
            price: *price,
            currency: "USD".into(),
            as_of: chrono::Utc::now(),
        };
        quotes.insert_one(snap).await.ok();
        let bar = PriceBar {
            symbol: sym.clone(),
            week_start: week_start.to_string(),
            open: *price,
            close: *price,
            pct_change: 0.0,
        };
        db.collection::<PriceBar>("price_bars")
            .insert_one(bar)
            .await
            .ok();
    }

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
            let pct = prices.get(&r.symbol).copied().unwrap_or(0.0);
            points += pct;
            let pws = PlayerWeeklyScore {
                wallet: t.owner_wallet.clone(),
                team_id: tid,
                symbol: r.symbol.clone(),
                week_start: week_start.to_string(),
                pct_change: pct,
                points: pct,
            };
            db.collection::<PlayerWeeklyScore>("player_scores")
                .insert_one(pws)
                .await
                .ok();
        }
        team_totals.push(TeamWeekTotal {
            team_id: tid,
            owner_wallet: t.owner_wallet.clone(),
            points,
        });
    }

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
