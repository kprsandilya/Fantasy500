use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerFeedback {
    pub owner_wallet: String,
    pub team_name: String,
    pub commissioner_comment: Option<String>,
    pub ai_feedback: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommissionerReport {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<bson::oid::ObjectId>,
    pub league_id: bson::oid::ObjectId,
    /// ISO `YYYY-MM-DD` week anchor matching scoring weeks.
    pub week_start: String,
    /// Free-form commissioner commentary on the overall league.
    pub overall_comment: Option<String>,
    /// Per-player private feedback from the commissioner.
    pub player_feedback: Vec<PlayerFeedback>,
    /// AI-generated league summary (Gemini).
    pub ai_summary: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds_option", default)]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}
