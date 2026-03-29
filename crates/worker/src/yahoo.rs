//! Yahoo Finance spark quotes (same endpoint as server `quotes`).

use std::collections::HashMap;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct SparkEntry {
    symbol: Option<String>,
    #[serde(rename = "chartPreviousClose")]
    chart_previous_close: Option<f64>,
    close: Option<Vec<f64>>,
}

pub async fn spot_prices(symbols: &[String]) -> HashMap<String, f64> {
    if symbols.is_empty() {
        return HashMap::new();
    }
    let client = reqwest::Client::builder()
        .user_agent("Fantasy500Worker/0.1")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .unwrap_or_default();
    const BATCH: usize = 20;
    let mut out = HashMap::new();
    for chunk in symbols.chunks(BATCH) {
        let joined = chunk.join(",");
        let url = format!(
            "https://query2.finance.yahoo.com/v8/finance/spark?symbols={}&range=1d&interval=1d",
            urlencoding::encode(&joined)
        );
        let Ok(resp) = client.get(&url).send().await else {
            continue;
        };
        let Ok(map): Result<HashMap<String, SparkEntry>, _> = resp.json().await else {
            continue;
        };
        for (_, entry) in map {
            let Some(sym) = entry.symbol else { continue };
            let Some(_prev) = entry.chart_previous_close.filter(|p| *p > 0.0) else {
                continue;
            };
            let Some(price) = entry.close.as_ref().and_then(|c| c.last().copied()) else {
                continue;
            };
            out.insert(sym.to_uppercase(), price);
        }
    }
    out
}
