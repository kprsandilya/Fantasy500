use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use shared::WalletAuthPayload;

use crate::error::{AppError, AppResult};

/// Verify a wallet-signed UTF-8 message (Phantom / Solana wallet adapter `signMessage`).
pub fn verify_wallet_auth(payload: &WalletAuthPayload) -> AppResult<()> {
    let pk_bytes = bs58::decode(&payload.wallet)
        .into_vec()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    if pk_bytes.len() != 32 {
        return Err(AppError::BadRequest("invalid wallet pubkey".into()));
    }
    let sig_bytes = bs58::decode(&payload.signature)
        .into_vec()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    if sig_bytes.len() != 64 {
        return Err(AppError::BadRequest("invalid signature length".into()));
    }
    let vk = VerifyingKey::from_bytes(
        pk_bytes
            .as_slice()
            .try_into()
            .map_err(|_| AppError::BadRequest("pubkey bytes".into()))?,
    )
    .map_err(|e| AppError::BadRequest(e.to_string()))?;
    let sig = Signature::from_slice(&sig_bytes).map_err(|e| AppError::BadRequest(e.to_string()))?;
    vk.verify(payload.message.as_bytes(), &sig)
        .map_err(|_| AppError::Unauthorized)?;
    Ok(())
}
