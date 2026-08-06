use crate::{
    db::Pool,
    error::{AppError, AppResult},
    models::session::LocalSession,
    sync::client::SyncClient,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rusqlite::params;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct UpdateProfilePayload {
    pub username: Option<String>,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

#[tauri::command]
pub async fn update_profile(
    pool: State<'_, Pool>,
    payload: UpdateProfilePayload,
) -> Result<LocalSession, crate::error::SerializableError> {
    inner_update(&pool, payload).map_err(Into::into)
}

fn inner_update(pool: &Pool, payload: UpdateProfilePayload) -> AppResult<LocalSession> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE local_session SET
            username = COALESCE(?1, username), email = ?2,
            first_name = ?3, last_name = ?4, profile_dirty = 1
         WHERE id = 1",
        params![
            payload.username,
            payload.email,
            payload.first_name,
            payload.last_name
        ],
    )?;

    conn.query_row(
        "SELECT user_id, username, email, first_name, last_name, role,
                password_hash, api_token, api_token_exp, last_synced_at
         FROM local_session WHERE id = 1",
        params![],
        |row| {
            Ok(LocalSession {
                user_id: row.get::<_, String>(0)?.parse().unwrap_or_default(),
                username: row.get(1)?,
                email: row.get(2)?,
                first_name: row.get(3)?,
                last_name: row.get(4)?,
                role: row.get(5)?,
                password_hash: row.get(6)?,
                api_token: row.get(7)?,
                api_token_exp: row.get(8)?,
                last_synced_at: row.get(9)?,
            })
        },
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub async fn change_password(
    pool: State<'_, Pool>,
    api_base_url: String,
    current_password: String,
    new_password: String,
) -> Result<(), crate::error::SerializableError> {
    inner_change_password(&pool, &api_base_url, &current_password, &new_password)
        .await
        .map_err(Into::into)
}

async fn inner_change_password(
    pool: &Pool,
    api_base_url: &str,
    current_password: &str,
    new_password: &str,
) -> AppResult<()> {
    let (token, hash): (Option<String>, String) = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT api_token, password_hash FROM local_session WHERE id = 1",
            params![],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?
    };
    let token = token.ok_or(AppError::NoOfflineSession)?;

    let parsed_hash = PasswordHash::new(&hash).map_err(|_| AppError::InvalidCredentials)?;
    Argon2::default()
        .verify_password(current_password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::InvalidCredentials)?;

    let client = SyncClient::new(api_base_url.to_string());
    client
        .change_password(&token, current_password, new_password)
        .await?;

    let salt = SaltString::generate(&mut OsRng);
    let new_hash = Argon2::default()
        .hash_password(new_password.as_bytes(), &salt)
        .map_err(|e| AppError::Validation(e.to_string()))?
        .to_string();

    let conn = pool.get()?;
    conn.execute(
        "UPDATE local_session SET password_hash = ?1 WHERE id = 1",
        params![new_hash],
    )?;
    Ok(())
}
