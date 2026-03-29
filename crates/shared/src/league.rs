use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LeagueStatus {
    Forming,
    Drafting,
    Active,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeagueSettings {
    pub roster_size: u8,
    pub snake_rounds: u8,
    pub waiver_period_hours: u32,
    /// ISO weekday name for weekly scoring boundaries (e.g. `"Mon"`).
    pub scoring_week_anchor: String,
    /// Seconds each team has per pick. 0 = no timer.
    #[serde(default)]
    pub draft_timer_seconds: u32,
}

impl Default for LeagueSettings {
    fn default() -> Self {
        Self {
            roster_size: 8,
            snake_rounds: 10,
            waiver_period_hours: 48,
            scoring_week_anchor: "Mon".to_string(),
            draft_timer_seconds: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct League {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<bson::oid::ObjectId>,
    pub name: String,
    pub commissioner_wallet: String,
    pub status: LeagueStatus,
    pub settings: LeagueSettings,
    pub team_count: u8,
    pub season_year: i32,
    /// On-chain league PDA (base58) when bridged to Solana.
    pub chain_league: Option<String>,
    pub buy_in_lamports: Option<u64>,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}
