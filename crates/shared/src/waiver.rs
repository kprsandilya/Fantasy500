use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaiverClaim {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<bson::oid::ObjectId>,
    pub league_id: bson::oid::ObjectId,
    pub team_id: bson::oid::ObjectId,
    pub add_symbol: String,
    pub drop_symbol: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds")]
    pub submitted_at: chrono::DateTime<chrono::Utc>,
    pub priority: u8,
    pub processed: bool,
}
