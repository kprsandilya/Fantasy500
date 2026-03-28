use sha2::{Digest, Sha256};

pub fn draft_pick_hash(
    league_id: &str,
    round: u8,
    overall: u16,
    symbol: &str,
    wallet: &str,
) -> String {
    let payload = format!("{league_id}|{round}|{overall}|{symbol}|{wallet}");
    let h = Sha256::digest(payload.as_bytes());
    hex::encode(h)
}
