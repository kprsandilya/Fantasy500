use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerWeeklyScore {
    pub wallet: String,
    pub team_id: bson::oid::ObjectId,
    pub symbol: String,
    /// ISO `YYYY-MM-DD` week anchor (Monday of scoring week).
    pub week_start: String,
    pub pct_change: f64,
    pub points: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeeklyScoreboard {
    pub league_id: bson::oid::ObjectId,
    pub week_start: String,
    pub team_totals: Vec<TeamWeekTotal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamWeekTotal {
    pub team_id: bson::oid::ObjectId,
    pub owner_wallet: String,
    pub points: f64,
}
