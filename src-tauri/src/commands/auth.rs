use crate::{
    db::Pool,
    error::{AppError, AppResult},
    models::session::{LocalSession, LoginPayload},
    sync::client::SyncClient,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
struct JwtExpOnly {
    exp: i64,
}

/// Logs in. If `payload.online` is true, authenticates against `setlyst-api`
/// (same as `setlyst-web`'s `/auth/login`) and refreshes the local cache. If
/// false — no connectivity — validates the given password against the argon2
/// hash stored locally from the last successful online login. Either path
/// lets the rest of the app work identically afterwards.
#[tauri::command]
pub async fn login(
    pool: State<'_, Pool>,
    api_base_url: String,
    payload: LoginPayload,
) -> Result<LocalSession, crate::error::SerializableError> {
    inner_login(&pool, &api_base_url, payload)
        .await
        .map_err(Into::into)
}

async fn inner_login(
    pool: &Pool,
    api_base_url: &str,
    payload: LoginPayload,
) -> AppResult<LocalSession> {
    if payload.online {
        let client = SyncClient::new(api_base_url.to_string());
        let (token, user) = client.login(&payload.username, &payload.password).await?;

        let conn = pool.get()?;
        let old_user_id: Option<String> = conn
            .query_row(
                "SELECT user_id FROM local_session WHERE id = 1",
                params![],
                |r| r.get(0),
            )
            .optional()?;

        if let Some(old_id) = old_user_id {
            if old_id != user.id.to_string() {
                for table in ["artists", "songs", "setlists"] {
                    conn.execute(
                        &format!("UPDATE {table} SET user_id = ?1, dirty = 1 WHERE user_id = ?2"),
                        params![user.id.to_string(), old_id],
                    )?;
                }

                let account_has_prefs: bool = conn
                    .query_row(
                        "SELECT 1 FROM user_preferences WHERE user_id = ?1",
                        params![user.id.to_string()],
                        |_| Ok(true),
                    )
                    .optional()?
                    .unwrap_or(false);

                if account_has_prefs {
                    conn.execute(
                        "DELETE FROM user_preferences WHERE user_id = ?1",
                        params![old_id],
                    )?;
                } else {
                    conn.execute(
                        "UPDATE user_preferences SET user_id = ?1, dirty = 1 WHERE user_id = ?2",
                        params![user.id.to_string(), old_id],
                    )?;
                }
            }
        }

        // Cache a fresh argon2 hash of the password so future logins can work
        // fully offline. We never store or transmit the plaintext password.
        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(payload.password.as_bytes(), &salt)
            .map_err(|e| AppError::Validation(e.to_string()))?
            .to_string();

        let session = LocalSession {
            user_id: user.id,
            username: user.username,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            password_hash: hash,
            api_token: Some(token.clone()),
            api_token_exp: Some(token_exp(&token)),
            last_synced_at: None,
        };

        persist_session(pool, &session)?;
        Ok(session)
    } else {
        let conn = pool.get()?;
        let cached: Option<LocalSession> = conn
            .query_row(
                "SELECT user_id, username, email, first_name, last_name, role,
                        password_hash, api_token, api_token_exp, last_synced_at
                 FROM local_session WHERE id = 1 AND username = ?1",
                params![payload.username],
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
            .optional()?;

        let session = cached.ok_or(AppError::NoOfflineSession)?;
        let parsed_hash =
            PasswordHash::new(&session.password_hash).map_err(|_| AppError::InvalidCredentials)?;
        Argon2::default()
            .verify_password(payload.password.as_bytes(), &parsed_hash)
            .map_err(|_| AppError::InvalidCredentials)?;

        Ok(session)
    }
}

fn persist_session(pool: &Pool, session: &LocalSession) -> AppResult<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO local_session
            (id, user_id, username, email, first_name, last_name, role, password_hash, api_token, api_token_exp, last_synced_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id, username = excluded.username, email = excluded.email,
            first_name = excluded.first_name, last_name = excluded.last_name, role = excluded.role,
            password_hash = excluded.password_hash, api_token = excluded.api_token,
            api_token_exp = excluded.api_token_exp",
        params![
            session.user_id.to_string(),
            session.username,
            session.email,
            session.first_name,
            session.last_name,
            session.role,
            session.password_hash,
            session.api_token,
            session.api_token_exp,
            session.last_synced_at,
        ],
    )?;
    Ok(())
}

/// Ensures a local profile exists. Called on every app boot instead of
/// requiring login. If there's no local_session row yet, creates one with a
/// fresh device-local user_id — this becomes the `user_id` used by every
/// artist/song/setlist command until (and unless) the person signs in.
#[tauri::command]
pub async fn get_or_create_local_profile(
    pool: State<'_, Pool>,
) -> Result<LocalSession, crate::error::SerializableError> {
    inner_get_or_create(&pool).map_err(Into::into)
}

fn read_session_row(conn: &rusqlite::Connection) -> AppResult<Option<LocalSession>> {
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
    .optional()
    .map_err(AppError::from)
}

fn inner_get_or_create(pool: &Pool) -> AppResult<LocalSession> {
    let conn = pool.get()?;

    if let Some(session) = read_session_row(&conn)? {
        return Ok(session);
    }

    let session = LocalSession {
        user_id: uuid::Uuid::new_v4(),
        username: "Guest".to_string(),
        email: None,
        first_name: None,
        last_name: None,
        role: "user".to_string(),
        password_hash: String::new(),
        api_token: None,
        api_token_exp: None,
        last_synced_at: None,
    };

    conn.execute(
        "INSERT INTO local_session
            (id, user_id, username, email, first_name, last_name, role, password_hash, api_token, api_token_exp, last_synced_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, NULL)",
        params![
            session.user_id.to_string(),
            session.username,
            session.email,
            session.first_name,
            session.last_name,
            session.role,
            session.password_hash,
        ],
    )?;

    Ok(session)
}

#[tauri::command]
pub async fn logout(pool: State<'_, Pool>) -> Result<(), crate::error::SerializableError> {
    inner_logout(&pool).map_err(Into::into)
}

fn inner_logout(pool: &Pool) -> AppResult<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM local_session WHERE id = 1", params![])?;
    Ok(())
}

fn token_exp(jwt: &str) -> i64 {
    let mut validation = Validation::new(Algorithm::HS256);

    validation.validate_exp = false;
    decode::<JwtExpOnly>(jwt, &DecodingKey::from_secret(&[]), &validation)
        .map(|data| data.claims.exp)
        .unwrap_or_else(|_| chrono::Utc::now().timestamp() + 86_400)
}
