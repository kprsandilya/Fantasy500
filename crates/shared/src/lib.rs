//! Shared domain types for API, worker, and clients.

pub mod auth;
pub mod draft;
pub mod league;
pub mod market;
pub mod roster;
pub mod scoring;
pub mod user;
pub mod waiver;
pub mod ws;

pub use auth::{AuthClaims, WalletAuthPayload};
pub use draft::{DraftDirection, DraftPick, DraftSession, DraftStatus};
pub use league::{League, LeagueSettings, LeagueStatus};
pub use market::{PriceBar, QuoteSnapshot};
pub use roster::{RosterEntry, RosterSlot, Team};
pub use scoring::{PlayerWeeklyScore, TeamWeekTotal, WeeklyScoreboard};
pub use user::User;
pub use waiver::WaiverClaim;
pub use ws::WsServerMessage;
