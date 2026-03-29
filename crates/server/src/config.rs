use std::env;

#[derive(Clone)]
pub struct Config {
    pub mongo_uri: String,
    pub db_name: String,
    pub jwt_secret: String,
    pub host: String,
    pub program_id: String,
    pub rpc_url: String,
    pub gemini_api_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            mongo_uri: env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://127.0.0.1:27017".into()),
            db_name: env::var("MONGO_DB").unwrap_or_else(|_| "fantasy500".into()),
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into()),
            host: env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into()),
            program_id: env::var("PROGRAM_ID").unwrap_or_else(|_| "GVzcRC2a6iHReZbiED5RNJ3R1geCK7hn2gBiA3rEKtwN".into()),
            rpc_url: env::var("RPC_URL").unwrap_or_else(|_| "https://api.devnet.solana.com".into()),
            gemini_api_key: env::var("GEMINI_API_KEY").ok(),
        }
    }
}
