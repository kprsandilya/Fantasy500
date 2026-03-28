use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteSnapshot {
    pub symbol: String,
    pub price: f64,
    pub currency: String,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub as_of: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceBar {
    pub symbol: String,
    pub week_start: String,
    pub open: f64,
    pub close: f64,
    pub pct_change: f64,
}
