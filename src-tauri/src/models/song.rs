use chrono::{NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Local mirror of `setlyst-api`'s `Song`. `tonality` and `genre` are kept as
/// free-form `String`s here (instead of the server's Postgres enums) because
/// SQLite has no native enum type — the API still validates/normalizes them
/// server-side on sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: Uuid,
    pub title: String,
    pub artist_id: Uuid,
    pub user_id: Uuid,
    pub tempo: Option<i32>,
    pub lyrics: Option<String>,
    pub tonality: Option<String>,
    pub genre: Option<String>,
    pub duration: Option<i32>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
    /// Present locally only — never sent to / received from setlyst-api as-is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dirty: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSongPayload {
    pub title: String,
    pub artist_id: Uuid,
    #[serde(default)]
    pub tempo: Option<i32>,
    #[serde(default)]
    pub lyrics: Option<String>,
    #[serde(default)]
    pub tonality: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub duration: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSongPayload {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub artist_id: Option<Uuid>,
    #[serde(default)]
    pub tempo: Option<i32>,
    #[serde(default)]
    pub lyrics: Option<String>,
    #[serde(default)]
    pub tonality: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub duration: Option<i32>,
}

impl Song {
    pub fn new(payload: &CreateSongPayload, user_id: Uuid) -> Self {
        let now = Utc::now().naive_utc();
        Self {
            id: Uuid::new_v4(),
            title: payload.title.clone(),
            artist_id: payload.artist_id,
            user_id,
            tempo: payload.tempo,
            lyrics: payload.lyrics.clone(),
            tonality: payload.tonality.clone(),
            genre: payload.genre.clone(),
            duration: payload.duration,
            created_at: now,
            updated_at: now,
            dirty: Some(true),
        }
    }

    pub fn validate_title(title: &str) -> Result<(), crate::error::AppError> {
        if title.trim().is_empty() || title.len() > 255 {
            return Err(crate::error::AppError::Validation(
                "Song title must be between 1 and 255 chars.".into(),
            ));
        }
        Ok(())
    }
}
