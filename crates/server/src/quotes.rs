use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::fortune500;
use crate::state::AppState;

const CACHE_TTL: Duration = Duration::from_secs(60);
const BATCH_SIZE: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteItem {
    pub symbol: String,
    pub price: f64,
    pub change: f64,
    pub change_percent: f64,
}

#[derive(Debug, Deserialize)]
struct SparkEntry {
    symbol: Option<String>,
    #[serde(rename = "chartPreviousClose")]
    chart_previous_close: Option<f64>,
    close: Option<Vec<f64>>,
}

async fn fetch_batch(client: &reqwest::Client, symbols: &[String]) -> Vec<QuoteItem> {
    let joined = symbols.join(",");
    let url = format!(
        "https://query2.finance.yahoo.com/v8/finance/spark?symbols={}&range=1d&interval=1d",
        urlencoding::encode(&joined)
    );
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("yahoo spark request failed: {e}");
            return vec![];
        }
    };
    let map: HashMap<String, SparkEntry> = match resp.json().await {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!("yahoo spark parse failed: {e}");
            return vec![];
        }
    };
    map.into_iter()
        .filter_map(|(_, entry)| {
            let sym = entry.symbol?;
            let prev = entry.chart_previous_close.filter(|p| *p > 0.0)?;
            let price = entry.close.as_ref()?.last().copied()?;
            let change = price - prev;
            let change_percent = (change / prev) * 100.0;
            Some(QuoteItem {
                symbol: sym,
                price,
                change,
                change_percent,
            })
        })
        .collect()
}

pub async fn get_quotes(state: &Arc<AppState>) -> Vec<QuoteItem> {
    {
        let cache = state.quotes_cache.read().await;
        if let Some(ref c) = *cache {
            if c.fetched_at.elapsed() < CACHE_TTL {
                return c.items.clone();
            }
        }
    }

    let symbols: Vec<String> = fortune500::universe().iter().cloned().collect();
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; Fantasy500/0.1)")
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_default();

    let chunks: Vec<&[String]> = symbols.chunks(BATCH_SIZE).collect();
    let mut handles = Vec::with_capacity(chunks.len());
    for chunk in chunks {
        let c = client.clone();
        let batch: Vec<String> = chunk.to_vec();
        handles.push(tokio::spawn(async move { fetch_batch(&c, &batch).await }));
    }

    let mut all_quotes = Vec::with_capacity(symbols.len());
    for h in handles {
        if let Ok(batch) = h.await {
            all_quotes.extend(batch);
        }
    }

    all_quotes.sort_by(|a, b| a.symbol.cmp(&b.symbol));

    {
        let mut cache = state.quotes_cache.write().await;
        *cache = Some(crate::state::QuotesCache {
            items: all_quotes.clone(),
            fetched_at: Instant::now(),
        });
    }

    all_quotes
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockAlert {
    pub symbol: String,
    pub alert_type: String,
    pub headline: String,
    pub date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QSRoot {
    #[serde(rename = "quoteSummary")]
    quote_summary: Option<QSBody>,
}

#[derive(Debug, Deserialize)]
struct QSBody {
    result: Option<Vec<QSResult>>,
}

#[derive(Debug, Deserialize)]
struct QSResult {
    #[serde(rename = "calendarEvents")]
    calendar_events: Option<QSCalendar>,
    #[serde(rename = "summaryDetail")]
    summary_detail: Option<QSSummaryDetail>,
}

#[derive(Debug, Deserialize)]
struct QSCalendar {
    earnings: Option<QSEarnings>,
    #[serde(rename = "exDividendDate")]
    ex_dividend_date: Option<YFValue>,
}

#[derive(Debug, Deserialize)]
struct QSEarnings {
    #[serde(rename = "earningsDate")]
    earnings_date: Option<Vec<YFValue>>,
}

#[derive(Debug, Deserialize)]
struct QSSummaryDetail {
    #[serde(rename = "fiftyTwoWeekHigh")]
    fifty_two_week_high: Option<YFValue>,
    #[serde(rename = "fiftyTwoWeekLow")]
    fifty_two_week_low: Option<YFValue>,
    #[serde(rename = "previousClose")]
    previous_close: Option<YFValue>,
}

#[derive(Debug, Deserialize)]
struct YFValue {
    raw: Option<f64>,
}

async fn fetch_symbol_alerts(
    client: &reqwest::Client,
    symbol: &str,
    now: i64,
) -> Vec<StockAlert> {
    let url = format!(
        "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{}?modules=calendarEvents,summaryDetail",
        urlencoding::encode(symbol),
    );
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::debug!("yahoo quoteSummary request failed for {symbol}: {e}");
            return vec![];
        }
    };
    if !resp.status().is_success() {
        tracing::debug!("yahoo quoteSummary {} returned {}", symbol, resp.status());
        return vec![];
    }
    let data: QSRoot = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            tracing::debug!("yahoo quoteSummary parse failed for {symbol}: {e}");
            return vec![];
        }
    };

    let result = match data
        .quote_summary
        .and_then(|qs| qs.result)
        .and_then(|mut r| if r.is_empty() { None } else { Some(r.remove(0)) })
    {
        Some(r) => r,
        None => return vec![],
    };

    let fourteen_days = 14 * 24 * 3600;
    let seven_days = 7 * 24 * 3600;
    let sym = symbol.to_string();
    let mut alerts = Vec::new();

    if let Some(cal) = &result.calendar_events {
        if let Some(earnings) = &cal.earnings {
            if let Some(dates) = &earnings.earnings_date {
                if let Some(ts) = dates.first().and_then(|d| d.raw).map(|r| r as i64) {
                    if ts > now && ts - now < fourteen_days {
                        let date_str = chrono::DateTime::from_timestamp(ts, 0)
                            .map(|dt| dt.format("%b %d").to_string());
                        let days_until = (ts - now) / 86400;
                        alerts.push(StockAlert {
                            symbol: sym.clone(),
                            alert_type: "earnings".into(),
                            headline: format!(
                                "Earnings report in {} day{}",
                                days_until,
                                if days_until == 1 { "" } else { "s" }
                            ),
                            date: date_str,
                        });
                    }
                }
            }
        }

        if let Some(ex_div) = cal.ex_dividend_date.as_ref().and_then(|d| d.raw).map(|r| r as i64) {
            if ex_div > now && ex_div - now < seven_days {
                let date_str = chrono::DateTime::from_timestamp(ex_div, 0)
                    .map(|dt| dt.format("%b %d").to_string());
                alerts.push(StockAlert {
                    symbol: sym.clone(),
                    alert_type: "dividend".into(),
                    headline: "Ex-dividend date approaching".into(),
                    date: date_str,
                });
            }
        }
    }

    if let Some(sd) = &result.summary_detail {
        let price = sd.previous_close.as_ref().and_then(|v| v.raw).unwrap_or(0.0);
        if let Some(high) = sd.fifty_two_week_high.as_ref().and_then(|v| v.raw) {
            if high > 0.0 && price > 0.0 && price >= high * 0.97 {
                alerts.push(StockAlert {
                    symbol: sym.clone(),
                    alert_type: "52w_high".into(),
                    headline: "Near 52-week high".into(),
                    date: None,
                });
            }
        }
        if let Some(low) = sd.fifty_two_week_low.as_ref().and_then(|v| v.raw) {
            if low > 0.0 && price > 0.0 && price <= low * 1.03 {
                alerts.push(StockAlert {
                    symbol: sym.clone(),
                    alert_type: "52w_low".into(),
                    headline: "Near 52-week low".into(),
                    date: None,
                });
            }
        }
    }

    alerts
}

pub async fn fetch_stock_alerts(symbols: &[String]) -> Vec<StockAlert> {
    if symbols.is_empty() {
        return Vec::new();
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    let now = chrono::Utc::now().timestamp();

    let mut handles = Vec::with_capacity(symbols.len());
    for sym in symbols {
        let c = client.clone();
        let s = sym.clone();
        handles.push(tokio::spawn(async move {
            fetch_symbol_alerts(&c, &s, now).await
        }));
    }

    let mut all_alerts = Vec::new();
    for h in handles {
        if let Ok(batch) = h.await {
            all_alerts.extend(batch);
        }
    }

    all_alerts
}

/// Spot prices for a subset of symbols (draft completion, waivers). Does not update the global cache.
pub async fn spot_prices(symbols: &[String]) -> HashMap<String, f64> {
    if symbols.is_empty() {
        return HashMap::new();
    }
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; Fantasy500/0.1)")
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_default();
    let mut out = HashMap::new();
    for chunk in symbols.chunks(BATCH_SIZE) {
        let owned: Vec<String> = chunk.to_vec();
        for q in fetch_batch(&client, &owned).await {
            out.insert(q.symbol.to_uppercase(), q.price);
        }
    }
    out
}
