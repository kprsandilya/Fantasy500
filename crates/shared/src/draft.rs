use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DraftStatus {
    Waiting,
    InProgress,
    Completed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DraftDirection {
    Forward,
    Reverse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftPick {
    pub round: u8,
    pub overall: u16,
    pub team_id: bson::oid::ObjectId,
    pub symbol: String,
    pub company_name: String,
    /// Keccak/SHA256 of pick payload anchored on-chain (hex).
    pub chain_commitment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftSession {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<bson::oid::ObjectId>,
    pub league_id: bson::oid::ObjectId,
    pub status: DraftStatus,
    pub current_round: u8,
    pub clock_team_id: Option<bson::oid::ObjectId>,
    pub direction: DraftDirection,
    pub picks: Vec<DraftPick>,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub deadline_at: Option<chrono::DateTime<chrono::Utc>>,
}
