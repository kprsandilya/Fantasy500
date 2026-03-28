use std::sync::Arc;

use mongodb::Database;
use tokio::sync::broadcast;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub config: Config,
    pub ws_tx: broadcast::Sender<String>,
}

impl AppState {
    pub fn new(db: Database, config: Config) -> Arc<Self> {
        let (ws_tx, _) = broadcast::channel(256);
        Arc::new(Self { db, config, ws_tx })
    }

    pub fn broadcast_json(&self, msg: &impl serde::Serialize) {
        if let Ok(s) = serde_json::to_string(msg) {
            let _ = self.ws_tx.send(s);
        }
    }
}
