use serde::Serialize;

/// Mirrors the intent of `setlyst-api`'s `ApiError`: a small, typed set of
/// failure modes that the frontend can branch on, instead of opaque strings.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Connection pool error: {0}")]
    Pool(#[from] r2d2::Error),

    #[error("Network error: {0}")]
    Network(#[from] tauri_plugin_http::reqwest::Error),

    #[error("A resource with the same name already exists for this user.")]
    AlreadyExists,

    #[error("The requested resource does not exist.")]
    NotFound,

    #[error("Invalid credentials.")]
    InvalidCredentials,

    #[error("No cached session found — you must log in at least once while online.")]
    NoOfflineSession,

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Sync failed: {0}")]
    Sync(String),
}

/// Tauri commands must return `Serialize` errors to reach the frontend as
/// structured rejects (not just a formatted string), so `invoke()` callers can
/// pattern-match on `error.code` the same way `setlyst-web` does with `ApiError`.
#[derive(Debug, Serialize)]
pub struct SerializableError {
    pub code: &'static str,
    pub message: String,
}

impl From<AppError> for SerializableError {
    fn from(err: AppError) -> Self {
        let code = match &err {
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::Pool(_) => "DATABASE_ERROR",
            AppError::Network(_) => "NETWORK_ERROR",
            AppError::AlreadyExists => "ALREADY_EXISTS",
            AppError::NotFound => "NOT_FOUND",
            AppError::InvalidCredentials => "WRONG_PASSWORD",
            AppError::NoOfflineSession => "NO_OFFLINE_SESSION",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::Sync(_) => "SYNC_ERROR",
        };
        SerializableError {
            code,
            message: err.to_string(),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
