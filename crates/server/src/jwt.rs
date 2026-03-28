use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use shared::AuthClaims;

use crate::error::{AppError, AppResult};

pub fn sign(wallet: &str, secret: &str) -> AppResult<String> {
    let exp = (chrono::Utc::now().timestamp() as usize).saturating_add(60 * 60 * 24 * 7);
    let claims = AuthClaims {
        sub: wallet.to_string(),
        wallet: wallet.to_string(),
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(e.to_string()))
}

pub fn verify(token: &str, secret: &str) -> AppResult<AuthClaims> {
    let data = decode::<AuthClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized)?;
    Ok(data.claims)
}
