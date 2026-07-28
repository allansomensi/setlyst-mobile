use crate::{db::Pool, error::AppResult};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    pub user_id: String,
    pub language: String,
    pub theme: String,
    pub live_mode_font_size: i32,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePreferencesPayload {
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub live_mode_font_size: Option<i32>,
}

fn row_to_prefs(row: &rusqlite::Row) -> rusqlite::Result<UserPreferences> {
    Ok(UserPreferences {
        user_id: row.get("user_id")?,
        language: row.get("language")?,
        theme: row.get("theme")?,
        live_mode_font_size: row.get("live_mode_font_size")?,
        updated_at: row.get("updated_at")?,
    })
}

#[tauri::command]
pub async fn get_preferences(
    pool: State<'_, Pool>,
    user_id: String,
) -> Result<UserPreferences, crate::error::SerializableError> {
    inner_get(&pool, &user_id).map_err(Into::into)
}

fn inner_get(pool: &Pool, user_id: &str) -> AppResult<UserPreferences> {
    let conn = pool.get()?;
    let existing = conn
        .query_row(
            "SELECT user_id, language, theme, live_mode_font_size, updated_at
         FROM user_preferences WHERE user_id = ?1",
            params![user_id],
            row_to_prefs,
        )
        .optional()?;

    if let Some(prefs) = existing {
        return Ok(prefs);
    }

    let now = chrono::Utc::now().naive_utc().to_string();
    conn.execute(
        "INSERT INTO user_preferences (user_id, language, theme, live_mode_font_size, dirty, updated_at, synced_at)
         VALUES (?1, 'en', 'system', 100, 1, ?2, NULL)
         ON CONFLICT(user_id) DO NOTHING",
        params![user_id, now],
    )?;

    Ok(UserPreferences {
        user_id: user_id.to_string(),
        language: "en".to_string(),
        theme: "system".to_string(),
        live_mode_font_size: 100,
        updated_at: Some(now),
    })
}

#[tauri::command]
pub async fn update_preferences(
    pool: State<'_, Pool>,
    user_id: String,
    payload: UpdatePreferencesPayload,
) -> Result<UserPreferences, crate::error::SerializableError> {
    inner_update(&pool, &user_id, payload).map_err(Into::into)
}

fn inner_update(
    pool: &Pool,
    user_id: &str,
    payload: UpdatePreferencesPayload,
) -> AppResult<UserPreferences> {
    inner_get(pool, user_id)?;
    let conn = pool.get()?;
    let now = chrono::Utc::now().naive_utc().to_string();
    conn.execute(
        "UPDATE user_preferences SET
            language = COALESCE(?1, language),
            theme = COALESCE(?2, theme),
            live_mode_font_size = COALESCE(?3, live_mode_font_size),
            dirty = 1,
            updated_at = ?4
         WHERE user_id = ?5",
        params![
            payload.language,
            payload.theme,
            payload.live_mode_font_size,
            now,
            user_id
        ],
    )?;
    inner_get(pool, user_id)
}
