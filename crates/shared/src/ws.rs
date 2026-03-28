use serde::{Deserialize, Serialize};

use crate::draft::DraftSession;
use crate::scoring::WeeklyScoreboard;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum WsServerMessage {
    DraftUpdated { session: DraftSession },
    ScoreboardUpdated { board: WeeklyScoreboard },
    Ping,
}
