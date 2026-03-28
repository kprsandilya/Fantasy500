use mongodb::Client;
use shared::load_dotenv;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Config;
use crate::db_indexes::ensure_indexes;
use crate::http::router;
use crate::state::AppState;

mod auth_wallet;
mod chain_tx;
mod config;
mod db_indexes;
mod draft_logic;
mod error;
mod extract;
mod fortune500;
mod http;
mod jwt;
mod pick_commit;
mod state;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    load_dotenv();
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    let bind_addr = config.host.clone();
    let client = Client::with_uri_str(&config.mongo_uri).await?;
    let db = client.database(&config.db_name);
    ensure_indexes(&db).await?;

    let state = AppState::new(db, config);
    let app = router().with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    tracing::info!("listening on {}", bind_addr);
    axum::serve(listener, app).await?;
    Ok(())
}
