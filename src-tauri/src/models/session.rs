use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Cached locally after the first successful online login. Lets the app
/// authenticate the user again with zero connectivity: the password is checked
/// against the argon2 hash on-device, exactly like `setlyst-api` does server-side.
/// `api_token` is only needed later, at sync time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalSession {
    pub user_id: Uuid,
    pub username: String,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub role: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub api_token: Option<String>,
    pub api_token_exp: Option<i64>,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginPayload {
    pub username: String,
    pub password: String,
    /// If false (e.g. airplane mode / no server reachable), skip the network
    /// call entirely and validate against the cached session instead.
    pub online: bool,
}
