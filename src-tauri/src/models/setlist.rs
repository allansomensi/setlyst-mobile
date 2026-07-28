use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Local mirror of `setlyst-api`'s `Setlist`. `total_duration` is never
/// stored locally (the local schema has no such column) — it is computed on
/// the fly via a JOIN against `songs`/`setlist_songs`, exactly like the
/// server does. When pulling a remote `Setlist` during sync, this field is
/// simply ignored on INSERT.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setlist {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub user_id: Uuid,
    #[serde(default)]
    pub total_duration: i32,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    /// Present locally only — never sent to / received from setlyst-api as-is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dirty: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSetlistPayload {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSetlistPayload {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

impl Setlist {
    pub fn new(title: &str, description: Option<String>, user_id: Uuid) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4(),
            title: title.to_string(),
            description,
            user_id,
            total_duration: 0,
            created_at: now,
            updated_at: now,
            dirty: Some(true),
        }
    }

    pub fn validate_title(title: &str) -> Result<(), crate::error::AppError> {
        if title.trim().is_empty() || title.len() > 255 {
            return Err(crate::error::AppError::Validation(
                "Setlist title must be between 1 and 255 chars.".into(),
            ));
        }
        Ok(())
    }
}
