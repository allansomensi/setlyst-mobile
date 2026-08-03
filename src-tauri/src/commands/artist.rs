use crate::{
    db::Pool,
    error::{AppError, AppResult},
    models::artist::{Artist, CreateArtistPayload, UpdateArtistPayload},
};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tauri::State;
use uuid::Uuid;

fn row_to_artist(row: &rusqlite::Row) -> rusqlite::Result<Artist> {
    let id: String = row.get("id")?;
    let user_id: String = row.get("user_id")?;
    Ok(Artist {
        id: Uuid::parse_str(&id).unwrap_or_default(),
        name: row.get("name")?,
        user_id: Uuid::parse_str(&user_id).unwrap_or_default(),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        dirty: Some(row.get::<_, i64>("dirty")? == 1),
    })
}

/// Same uniqueness rule as `setlyst-api`: an artist name must be unique
/// per-user, not globally. Excludes soft-deleted rows.
fn assert_unique(
    conn: &rusqlite::Connection,
    name: &str,
    user_id: &Uuid,
    exclude_id: Option<&Uuid>,
) -> AppResult<()> {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM artists
         WHERE name = ?1 AND user_id = ?2 AND deleted_at IS NULL
           AND (?3 IS NULL OR id != ?3)
         LIMIT 1",
            params![name, user_id.to_string(), exclude_id.map(|i| i.to_string())],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);

    if exists {
        return Err(AppError::AlreadyExists);
    }
    Ok(())
}

#[tauri::command]
pub async fn list_artists(
    pool: State<'_, Pool>,
    user_id: String,
) -> Result<Vec<Artist>, crate::error::SerializableError> {
    inner_list(&pool, &user_id).map_err(Into::into)
}

fn inner_list(pool: &Pool, user_id: &str) -> AppResult<Vec<Artist>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, user_id, created_at, updated_at, dirty
         FROM artists WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY name ASC",
    )?;
    let artists = stmt
        .query_map(params![user_id], row_to_artist)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(artists)
}

#[tauri::command]
pub async fn create_artist(
    pool: State<'_, Pool>,
    user_id: String,
    payload: CreateArtistPayload,
) -> Result<Artist, crate::error::SerializableError> {
    inner_create(&pool, &user_id, payload).map_err(Into::into)
}

fn inner_create(pool: &Pool, user_id: &str, payload: CreateArtistPayload) -> AppResult<Artist> {
    let name = payload.name.trim().to_string();
    Artist::validate_name(&name)?;

    let conn = pool.get()?;
    let user_uuid =
        Uuid::parse_str(user_id).map_err(|_| AppError::Validation("Invalid user id.".into()))?;
    assert_unique(&conn, &name, &user_uuid, None)?;

    let artist = Artist::new(&name, user_uuid);
    conn.execute(
        "INSERT INTO artists (id, name, user_id, created_at, updated_at, dirty, deleted_at, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, NULL, NULL)",
        params![
            artist.id.to_string(),
            artist.name,
            artist.user_id.to_string(),
            artist.created_at,
            artist.updated_at,
        ],
    )?;

    Ok(artist)
}

#[tauri::command]
pub async fn update_artist(
    pool: State<'_, Pool>,
    id: String,
    user_id: String,
    payload: UpdateArtistPayload,
) -> Result<Artist, crate::error::SerializableError> {
    inner_update(&pool, &id, &user_id, payload).map_err(Into::into)
}

fn inner_update(
    pool: &Pool,
    id: &str,
    user_id: &str,
    payload: UpdateArtistPayload,
) -> AppResult<Artist> {
    let conn = pool.get()?;
    let artist_uuid = Uuid::parse_str(id).map_err(|_| AppError::NotFound)?;
    let user_uuid =
        Uuid::parse_str(user_id).map_err(|_| AppError::Validation("Invalid user id.".into()))?;

    if let Some(name) = &payload.name {
        let name = name.trim();
        Artist::validate_name(name)?;
        assert_unique(&conn, name, &user_uuid, Some(&artist_uuid))?;

        let updated = conn.execute(
            "UPDATE artists SET name = ?1, updated_at = ?2, dirty = 1
             WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            params![name, Utc::now().naive_utc(), id, user_id],
        )?;
        if updated == 0 {
            return Err(AppError::NotFound);
        }
    }

    let conn = pool.get()?;
    conn.query_row(
        "SELECT id, name, user_id, created_at, updated_at, dirty FROM artists WHERE id = ?1",
        params![id],
        row_to_artist,
    )
    .map_err(|_| AppError::NotFound)
}

#[tauri::command]
pub async fn delete_artist(
    pool: State<'_, Pool>,
    id: String,
    user_id: String,
) -> Result<(), crate::error::SerializableError> {
    inner_delete(&pool, &id, &user_id).map_err(Into::into)
}

fn inner_delete(pool: &Pool, id: &str, user_id: &str) -> AppResult<()> {
    let conn = pool.get()?;

    let has_songs: bool = conn
        .query_row(
            "SELECT 1 FROM songs WHERE artist_id = ?1 AND deleted_at IS NULL LIMIT 1",
            params![id],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);

    if has_songs {
        return Err(AppError::Validation(
            "This artist still has songs linked to it. Remove or reassign them first.".into(),
        ));
    }

    let updated = conn.execute(
        "UPDATE artists SET deleted_at = ?1, dirty = 1, updated_at = ?1
         WHERE id = ?2 AND user_id = ?3 AND deleted_at IS NULL",
        params![Utc::now().naive_utc(), id, user_id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}
