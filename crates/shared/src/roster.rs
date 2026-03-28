use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RosterSlot {
    Bench,
    Starter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RosterEntry {
    pub symbol: String,
    pub company_name: String,
    pub slot: RosterSlot,
    pub acquired_at: chrono::DateTime<chrono::Utc>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<bson::oid::ObjectId>,
    pub league_id: bson::oid::ObjectId,
    pub owner_wallet: String,
    pub name: String,
    pub draft_position: u8,
    pub roster: Vec<RosterEntry>,
    /// Optional on-chain team PDA reference.
    pub chain_team: Option<String>,
}
