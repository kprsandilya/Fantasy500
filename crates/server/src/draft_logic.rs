use bson::oid::ObjectId;
use shared::{DraftDirection, DraftSession, DraftStatus};

/// 0-based pick index `p` in a snake draft with `n` teams.
pub fn team_index_for_pick(p: u32, n: usize) -> usize {
    if n == 0 {
        return 0;
    }
    let r = p / n as u32 + 1;
    let k = p % n as u32;
    if r % 2 == 1 {
        k as usize
    } else {
        n - 1 - k as usize
    }
}

pub fn clock_team_for_pick(
    team_order: &[ObjectId],
    pick_index_zero_based: u32,
) -> Option<ObjectId> {
    let n = team_order.len();
    if n == 0 {
        return None;
    }
    let idx = team_index_for_pick(pick_index_zero_based, n);
    Some(team_order[idx])
}

pub fn direction_for_round_from_pick(p: u32, n: usize) -> DraftDirection {
    if n == 0 {
        return DraftDirection::Forward;
    }
    let r = p / n as u32 + 1;
    if r % 2 == 1 {
        DraftDirection::Forward
    } else {
        DraftDirection::Reverse
    }
}

/// Team on the clock for the next pick (current `session.picks.len()` is the next pick index).
pub fn next_clock_team(
    session: &DraftSession,
    team_order: &[ObjectId],
    total_rounds: u8,
) -> Option<ObjectId> {
    if session.status != DraftStatus::InProgress {
        return None;
    }
    let n = team_order.len() as u32;
    if n == 0 {
        return None;
    }
    let max_picks = total_rounds as u32 * n;
    let p = session.picks.len() as u32;
    if p >= max_picks {
        return None;
    }
    clock_team_for_pick(team_order, p)
}
