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
