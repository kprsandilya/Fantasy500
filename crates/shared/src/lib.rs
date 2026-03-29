//! Shared domain types for API, worker, and clients.

pub mod dotenv;
pub mod auth;
pub mod draft;
pub mod join_request;
pub mod league;
pub mod market;
pub mod roster;
pub mod scoring;
pub mod user;
pub mod waiver;
pub mod ws;
pub mod commissioner_report;

pub use dotenv::load_dotenv;
pub use auth::{AuthClaims, WalletAuthPayload};
pub use commissioner_report::{CommissionerReport, PlayerFeedback};
pub use draft::{DraftDirection, DraftPick, DraftSession, DraftStatus};
pub use join_request::{JoinRequest, JoinRequestStatus};
pub use league::{League, LeagueSettings, LeagueStatus};
pub use market::{PriceBar, QuoteSnapshot};
pub use roster::{RosterEntry, RosterSlot, Team};
pub use scoring::{PlayerWeeklyScore, TeamWeekTotal, WeeklyScoreboard};
pub use user::User;
pub use waiver::WaiverClaim;
pub use ws::WsServerMessage;
