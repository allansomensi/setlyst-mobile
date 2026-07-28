use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artist {
    pub id: Uuid,
    pub name: String,
    pub user_id: Uuid,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    /// Present locally
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dirty: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateArtistPayload {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateArtistPayload {
    pub name: Option<String>,
}

impl Artist {
    pub fn new(name: &str, user_id: Uuid) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4(),
            name: name.to_string(),
            user_id,
            created_at: now,
            updated_at: now,
            dirty: Some(true),
        }
    }

    pub fn validate_name(name: &str) -> Result<(), crate::error::AppError> {
        if name.trim().is_empty() || name.len() > 255 {
            return Err(crate::error::AppError::Validation(
                "Artist name must be between 1 and 255 chars.".into(),
            ));
        }
        Ok(())
    }
}
