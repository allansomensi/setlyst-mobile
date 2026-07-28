use crate::{
    db::Pool,
    error::{AppError, AppResult},
    models::song::{CreateSongPayload, Song, UpdateSongPayload},
};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tauri::State;
use uuid::Uuid;

fn row_to_song(row: &rusqlite::Row) -> rusqlite::Result<Song> {
    let id: String = row.get("id")?;
    let artist_id: String = row.get("artist_id")?;
    let user_id: String = row.get("user_id")?;
    Ok(Song {
        id: Uuid::parse_str(&id).unwrap_or_default(),
        title: row.get("title")?,
        artist_id: Uuid::parse_str(&artist_id).unwrap_or_default(),
        user_id: Uuid::parse_str(&user_id).unwrap_or_default(),
        tempo: row.get("tempo")?,
        lyrics: row.get("lyrics")?,
        tonality: row.get("tonality")?,
        genre: row.get("genre")?,
        duration: row.get("duration")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        dirty: Some(row.get::<_, i64>("dirty")? == 1),
    })
}

/// Same uniqueness rule as `setlyst-api`: a song title must be unique per
/// (artist, user), not globally. Excludes soft-deleted rows.
fn assert_unique(
    conn: &rusqlite::Connection,
    title: &str,
    artist_id: &Uuid,
    user_id: &Uuid,
    exclude_id: Option<&Uuid>,
) -> AppResult<()> {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM songs
             WHERE title = ?1 AND artist_id = ?2 AND user_id = ?3 AND deleted_at IS NULL
               AND (?4 IS NULL OR id != ?4)
             LIMIT 1",
            params![
                title,
                artist_id.to_string(),
                user_id.to_string(),
                exclude_id.map(|i| i.to_string())
            ],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);

    if exists {
        return Err(AppError::AlreadyExists);
    }
    Ok(())
}

fn assert_artist_exists(
    conn: &rusqlite::Connection,
    artist_id: &Uuid,
    user_id: &Uuid,
) -> AppResult<()> {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM artists WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL",
            params![artist_id.to_string(), user_id.to_string()],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);

    if !exists {
        return Err(AppError::NotFound);
    }
    Ok(())
}

#[tauri::command]
pub async fn list_songs(
    pool: State<'_, Pool>,
    user_id: String,
) -> Result<Vec<Song>, crate::error::SerializableError> {
    inner_list(&pool, &user_id).map_err(Into::into)
}

fn inner_list(pool: &Pool, user_id: &str) -> AppResult<Vec<Song>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, title, artist_id, user_id, tempo, lyrics, tonality, genre, duration,
                created_at, updated_at, dirty
         FROM songs WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY title ASC",
    )?;
    let songs = stmt
        .query_map(params![user_id], row_to_song)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(songs)
}

#[tauri::command]
pub async fn create_song(
    pool: State<'_, Pool>,
    user_id: String,
    payload: CreateSongPayload,
) -> Result<Song, crate::error::SerializableError> {
    inner_create(&pool, &user_id, payload).map_err(Into::into)
}

fn inner_create(pool: &Pool, user_id: &str, payload: CreateSongPayload) -> AppResult<Song> {
    let title = payload.title.trim().to_string();
    Song::validate_title(&title)?;

    let conn = pool.get()?;
    let user_uuid =
        Uuid::parse_str(user_id).map_err(|_| AppError::Validation("Invalid user id.".into()))?;

    assert_artist_exists(&conn, &payload.artist_id, &user_uuid)?;
    assert_unique(&conn, &title, &payload.artist_id, &user_uuid, None)?;

    let mut payload = payload;
    payload.title = title;
    let song = Song::new(&payload, user_uuid);

    conn.execute(
        "INSERT INTO songs (id, title, artist_id, user_id, tempo, lyrics, tonality, genre, duration,
                             created_at, updated_at, dirty, deleted_at, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, NULL, NULL)",
        params![
            song.id.to_string(),
            song.title,
            song.artist_id.to_string(),
            song.user_id.to_string(),
            song.tempo,
            song.lyrics,
            song.tonality,
            song.genre,
            song.duration,
            song.created_at,
            song.updated_at,
        ],
    )?;

    Ok(song)
}

#[tauri::command]
pub async fn update_song(
    pool: State<'_, Pool>,
    id: String,
    user_id: String,
    payload: UpdateSongPayload,
) -> Result<Song, crate::error::SerializableError> {
    inner_update(&pool, &id, &user_id, payload).map_err(Into::into)
}

fn inner_update(
    pool: &Pool,
    id: &str,
    user_id: &str,
    payload: UpdateSongPayload,
) -> AppResult<Song> {
    let conn = pool.get()?;
    let song_uuid = Uuid::parse_str(id).map_err(|_| AppError::NotFound)?;
    let user_uuid =
        Uuid::parse_str(user_id).map_err(|_| AppError::Validation("Invalid user id.".into()))?;

    let now = Utc::now().naive_utc();
    let mut touched = false;

    if let Some(title) = &payload.title {
        let title = title.trim();
        Song::validate_title(title)?;

        let artist_id: String = conn
            .query_row(
                "SELECT artist_id FROM songs WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(|_| AppError::NotFound)?;
        let artist_uuid = Uuid::parse_str(&artist_id).unwrap_or_default();

        assert_unique(&conn, title, &artist_uuid, &user_uuid, Some(&song_uuid))?;

        conn.execute(
            "UPDATE songs SET title = ?1, updated_at = ?2, dirty = 1
             WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            params![title, now, id, user_id],
        )?;
        touched = true;
    }

    if let Some(artist_id) = payload.artist_id {
        assert_artist_exists(&conn, &artist_id, &user_uuid)?;
        conn.execute(
            "UPDATE songs SET artist_id = ?1, updated_at = ?2, dirty = 1
             WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            params![artist_id.to_string(), now, id, user_id],
        )?;
        touched = true;
    }

    if payload.tempo.is_some() {
        conn.execute(
            "UPDATE songs SET tempo = ?1, updated_at = ?2, dirty = 1
             WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            params![payload.tempo, now, id, user_id],
        )?;
        touched = true;
    }

    if let Some(lyrics) = &payload.lyrics {
        conn.execute(
            "UPDATE songs SET lyrics = ?1, updated_at = ?2, dirty = 1
             WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            params![lyrics, now, id, user_id],
        )?;
        touched = true;
    }

    if let Some(tonality) = &payload.tonality {
        conn.execute(
            "UPDATE songs SET tonality = ?1, updated_at = ?2, dirty = 1
             WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            params![tonality, now, id, user_id],
        )?;
        touched = true;
    }

    if let Some(genre) = &payload.genre {
        conn.execute(
            "UPDATE songs SET genre = ?1, updated_at = ?2, dirty = 1
             WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            params![genre, now, id, user_id],
        )?;
        touched = true;
    }

    if payload.duration.is_some() {
        conn.execute(
            "UPDATE songs SET duration = ?1, updated_at = ?2, dirty = 1
             WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            params![payload.duration, now, id, user_id],
        )?;
        touched = true;
    }

    if !touched {
        return Err(AppError::Validation("No fields to update.".into()));
    }

    conn.query_row(
        "SELECT id, title, artist_id, user_id, tempo, lyrics, tonality, genre, duration,
                created_at, updated_at, dirty
         FROM songs WHERE id = ?1",
        params![id],
        row_to_song,
    )
    .map_err(|_| AppError::NotFound)
}

#[tauri::command]
pub async fn delete_song(
    pool: State<'_, Pool>,
    id: String,
    user_id: String,
) -> Result<(), crate::error::SerializableError> {
    inner_delete(&pool, &id, &user_id).map_err(Into::into)
}

fn inner_delete(pool: &Pool, id: &str, user_id: &str) -> AppResult<()> {
    let conn = pool.get()?;
    let now = Utc::now().naive_utc();
    let updated = conn.execute(
        "UPDATE songs SET deleted_at = ?1, dirty = 1, updated_at = ?1
         WHERE id = ?2 AND user_id = ?3 AND deleted_at IS NULL",
        params![now, id, user_id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound);
    }

    // Also soft-delete this song's membership in any setlists, so the sync
    // engine can push those removals too.
    conn.execute(
        "UPDATE setlist_songs SET deleted_at = ?1, dirty = 1
         WHERE song_id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;

    Ok(())
}
