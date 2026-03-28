use std::sync::Arc;
use std::time::Instant;

use mongodb::Database;
use tokio::sync::{broadcast, RwLock};

use crate::config::Config;
use crate::quotes::QuoteItem;

pub struct QuotesCache {
    pub items: Vec<QuoteItem>,
    pub fetched_at: Instant,
}

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub config: Config,
    pub ws_tx: broadcast::Sender<String>,
    pub quotes_cache: Arc<RwLock<Option<QuotesCache>>>,
}

impl AppState {
    pub fn new(db: Database, config: Config) -> Arc<Self> {
        let (ws_tx, _) = broadcast::channel(256);
        Arc::new(Self {
            db,
            config,
            ws_tx,
            quotes_cache: Arc::new(RwLock::new(None)),
        })
    }

    pub fn broadcast_json(&self, msg: &impl serde::Serialize) {
        if let Ok(s) = serde_json::to_string(msg) {
            let _ = self.ws_tx.send(s);
        }
    }
}
