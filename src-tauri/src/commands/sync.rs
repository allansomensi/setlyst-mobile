use crate::{
    db::Pool,
    error::AppError,
    sync::{client::SyncClient, engine},
};
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

/// The single entry point for "Sync now" in Settings. Requires the cached
/// `api_token` from the last online login (see commands/auth.rs); if it's
/// missing or the device genuinely has no connectivity, this fails fast with
/// a `NETWORK_ERROR` / `NO_OFFLINE_SESSION` the UI already knows how to show.
#[tauri::command]
pub async fn sync_now(
    pool: State<'_, Pool>,
    api_base_url: String,
) -> Result<engine::SyncReport, crate::error::SerializableError> {
    inner_sync_now(&pool, &api_base_url)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn resolve_preferences_conflict(
    pool: State<'_, Pool>,
    api_base_url: String,
    keep: String, // "local" | "remote"
) -> Result<(), crate::error::SerializableError> {
    inner_resolve(&pool, &api_base_url, &keep)
        .await
        .map_err(Into::into)
}

async fn inner_resolve(pool: &Pool, api_base_url: &str, keep: &str) -> Result<(), AppError> {
    let (user_id, token, language, theme, font): (String, Option<String>, String, String, i32) = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT s.user_id, s.api_token, p.language, p.theme, p.live_mode_font_size
             FROM local_session s JOIN user_preferences p ON p.user_id = s.user_id
             WHERE s.id = 1",
            params![],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )?
    };
    let token = token.ok_or(AppError::NoOfflineSession)?;
    let client = SyncClient::new(api_base_url.to_string());

    if keep == "local" {
        client
            .update_preferences(&token, &language, &theme, font)
            .await?;
        let conn = pool.get()?;
        conn.execute(
            "UPDATE user_preferences SET dirty = 0, synced_at = ?1 WHERE user_id = ?2",
            params![chrono::Utc::now().naive_utc(), user_id],
        )?;
    } else {
        let remote = client.get_preferences(&token).await?;
        let conn = pool.get()?;
        conn.execute(
            "UPDATE user_preferences SET language = ?1, theme = ?2, live_mode_font_size = ?3,
                updated_at = ?4, dirty = 0, synced_at = ?5 WHERE user_id = ?6",
            params![
                remote.language,
                remote.theme,
                remote.live_mode_font_size,
                remote.updated_at,
                chrono::Utc::now().naive_utc(),
                user_id
            ],
        )?;
    }
    Ok(())
}

async fn inner_sync_now(pool: &Pool, api_base_url: &str) -> Result<engine::SyncReport, AppError> {
    let (user_id, token): (String, Option<String>) = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT user_id, api_token FROM local_session WHERE id = 1",
            params![],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?
    };

    let token = token.ok_or(AppError::NoOfflineSession)?;
    let user_uuid = Uuid::parse_str(&user_id).map_err(|_| AppError::NoOfflineSession)?;

    engine::run_full_sync(pool, api_base_url, &token, user_uuid).await
}
