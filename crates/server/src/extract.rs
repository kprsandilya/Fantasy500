use std::sync::Arc;

use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};

use crate::error::AppError;
use crate::jwt;
use crate::state::AppState;

pub struct AuthWallet(pub String);

#[async_trait]
impl FromRequestParts<Arc<AppState>> for AuthWallet {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let auth = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::Unauthorized)?;
        let token = auth.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?;
        let claims = jwt::verify(token, &state.config.jwt_secret)?;
        Ok(AuthWallet(claims.wallet))
    }
}

pub fn require_commissioner(wallet: &str, commissioner: &str) -> Result<(), AppError> {
    if wallet != commissioner {
        return Err(AppError::Forbidden);
    }
    Ok(())
}
