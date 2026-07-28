use crate::{
    db::Pool,
    error::{AppError, AppResult},
    models::setlist::{CreateSetlistPayload, Setlist, UpdateSetlistPayload},
    models::song::Song,
};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tauri::State;
use uuid::Uuid;

fn row_to_setlist(row: &rusqlite::Row) -> rusqlite::Result<Setlist> {
    let id: String = row.get("id")?;
    let user_id: String = row.get("user_id")?;
    Ok(Setlist {
        id: Uuid::parse_str(&id).unwrap_or_default(),
        title: row.get("title")?,
        description: row.get("description")?,
        user_id: Uuid::parse_str(&user_id).unwrap_or_default(),
        total_duration: row.get::<_, Option<i32>>("total_duration")?.unwrap_or(0),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        dirty: Some(row.get::<_, i64>("dirty")? == 1),
    })
}

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

fn assert_unique(
    conn: &rusqlite::Connection,
    title: &str,
    user_id: &Uuid,
    exclude_id: Option<&Uuid>,
) -> AppResult<()> {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM setlists
             WHERE title = ?1 AND user_id = ?2 AND deleted_at IS NULL
               AND (?3 IS NULL OR id != ?3)
             LIMIT 1",
            params![
                title,
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

const SELECT_SETLIST: &str =
    "SELECT s.id, s.title, s.description, s.user_id, s.created_at, s.updated_at, s.dirty,
        COALESCE(SUM(so.duration), 0) AS total_duration
 FROM setlists s
 LEFT JOIN setlist_songs ss ON s.id = ss.setlist_id AND ss.deleted_at IS NULL
 LEFT JOIN songs so ON ss.song_id = so.id AND so.deleted_at IS NULL";

#[tauri::command]
pub async fn list_setlists(
    pool: State<'_, Pool>,
    user_id: String,
) -> Result<Vec<Setlist>, crate::error::SerializableError> {
    inner_list(&pool, &user_id).map_err(Into::into)
}

fn inner_list(pool: &Pool, user_id: &str) -> AppResult<Vec<Setlist>> {
    let conn = pool.get()?;
    let sql = format!(
        "{SELECT_SETLIST} WHERE s.user_id = ?1 AND s.deleted_at IS NULL GROUP BY s.id ORDER BY s.title ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let setlists = stmt
        .query_map(params![user_id], row_to_setlist)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(setlists)
}

#[tauri::command]
pub async fn get_setlist(
    pool: State<'_, Pool>,
    id: String,
    user_id: String,
) -> Result<Setlist, crate::error::SerializableError> {
    inner_get(&pool, &id, &user_id).map_err(Into::into)
}

fn inner_get(pool: &Pool, id: &str, user_id: &str) -> AppResult<Setlist> {
    let conn = pool.get()?;
    let sql =
        format!("{SELECT_SETLIST} WHERE s.id = ?1 AND s.user_id = ?2 AND s.deleted_at IS NULL GROUP BY s.id");
    conn.query_row(&sql, params![id, user_id], row_to_setlist)
        .map_err(|_| AppError::NotFound)
}

#[tauri::command]
pub async fn create_setlist(
    pool: State<'_, Pool>,
    user_id: String,
    payload: CreateSetlistPayload,
) -> Result<Setlist, crate::error::SerializableError> {
    inner_create(&pool, &user_id, payload).map_err(Into::into)
}

fn inner_create(pool: &Pool, user_id: &str, payload: CreateSetlistPayload) -> AppResult<Setlist> {
    let title = payload.title.trim().to_string();
    Setlist::validate_title(&title)?;

    let conn = pool.get()?;
    let user_uuid =
        Uuid::parse_str(user_id).map_err(|_| AppError::Validation("Invalid user id.".into()))?;
    assert_unique(&conn, &title, &user_uuid, None)?;

    let setlist = Setlist::new(&title, payload.description.clone(), user_uuid);
    conn.execute(
        "INSERT INTO setlists (id, title, description, user_id, created_at, updated_at, dirty, deleted_at, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, NULL, NULL)",
        params![
            setlist.id.to_string(),
            setlist.title,
            setlist.description,
            setlist.user_id.to_string(),
            setlist.created_at,
            setlist.updated_at,
        ],
    )?;

    Ok(setlist)
}

#[tauri::command]
pub async fn update_setlist(
    pool: State<'_, Pool>,
    id: String,
    user_id: String,
    payload: UpdateSetlistPayload,
) -> Result<Setlist, crate::error::SerializableError> {
    inner_update(&pool, &id, &user_id, payload).map_err(Into::into)
}

fn inner_update(
    pool: &Pool,
    id: &str,
    user_id: &str,
    payload: UpdateSetlistPayload,
) -> AppResult<Setlist> {
    let conn = pool.get()?;
    let setlist_uuid = Uuid::parse_str(id).map_err(|_| AppError::NotFound)?;
    let user_uuid =
        Uuid::parse_str(user_id).map_err(|_| AppError::Validation("Invalid user id.".into()))?;

    if let Some(title) = &payload.title {
        let title = title.trim();
        Setlist::validate_title(title)?;
        assert_unique(&conn, title, &user_uuid, Some(&setlist_uuid))?;

        conn.execute(
            "UPDATE setlists SET title = ?1, updated_at = ?2, dirty = 1
             WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            params![title, Utc::now().naive_utc(), id, user_id],
        )?;
    }

    if let Some(description) = &payload.description {
        conn.execute(
            "UPDATE setlists SET description = ?1, updated_at = ?2, dirty = 1
             WHERE id = ?3 AND user_id = ?4 AND deleted_at IS NULL",
            params![description, Utc::now().naive_utc(), id, user_id],
        )?;
    }

    inner_get(pool, id, user_id)
}

#[tauri::command]
pub async fn delete_setlist(
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
        "UPDATE setlists SET deleted_at = ?1, dirty = 1, updated_at = ?1
         WHERE id = ?2 AND user_id = ?3 AND deleted_at IS NULL",
        params![now, id, user_id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound);
    }

    // Soft-delete all song links too, so the sync engine can push the removals.
    conn.execute(
        "UPDATE setlist_songs SET deleted_at = ?1, dirty = 1
         WHERE setlist_id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;

    Ok(())
}

#[tauri::command]
pub async fn get_setlist_songs(
    pool: State<'_, Pool>,
    setlist_id: String,
) -> Result<Vec<Song>, crate::error::SerializableError> {
    inner_get_songs(&pool, &setlist_id).map_err(Into::into)
}

fn inner_get_songs(pool: &Pool, setlist_id: &str) -> AppResult<Vec<Song>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT so.id, so.title, so.artist_id, so.user_id, so.tempo, so.lyrics,
                so.tonality, so.genre, so.duration, so.created_at, so.updated_at, so.dirty
         FROM songs so
         INNER JOIN setlist_songs ss ON so.id = ss.song_id
         WHERE ss.setlist_id = ?1 AND ss.deleted_at IS NULL AND so.deleted_at IS NULL
         ORDER BY ss.position ASC",
    )?;
    let songs = stmt
        .query_map(params![setlist_id], row_to_song)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(songs)
}

#[tauri::command]
pub async fn add_song_to_setlist(
    pool: State<'_, Pool>,
    setlist_id: String,
    song_id: String,
    position: i32,
) -> Result<(), crate::error::SerializableError> {
    inner_add_song(&pool, &setlist_id, &song_id, position).map_err(Into::into)
}

fn inner_add_song(pool: &Pool, setlist_id: &str, song_id: &str, position: i32) -> AppResult<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO setlist_songs (setlist_id, song_id, position, dirty, deleted_at, synced_at)
         VALUES (?1, ?2, ?3, 1, NULL, NULL)
         ON CONFLICT(setlist_id, song_id) DO UPDATE SET
            position = excluded.position, dirty = 1, deleted_at = NULL",
        params![setlist_id, song_id, position],
    )?;

    conn.execute(
        "UPDATE setlists SET dirty = 1, updated_at = ?1 WHERE id = ?2",
        params![Utc::now().naive_utc(), setlist_id],
    )?;

    Ok(())
}

#[tauri::command]
pub async fn remove_song_from_setlist(
    pool: State<'_, Pool>,
    setlist_id: String,
    song_id: String,
) -> Result<(), crate::error::SerializableError> {
    inner_remove_song(&pool, &setlist_id, &song_id).map_err(Into::into)
}

fn inner_remove_song(pool: &Pool, setlist_id: &str, song_id: &str) -> AppResult<()> {
    let conn = pool.get()?;
    let now = Utc::now().naive_utc();
    let updated = conn.execute(
        "UPDATE setlist_songs SET deleted_at = ?1, dirty = 1
         WHERE setlist_id = ?2 AND song_id = ?3 AND deleted_at IS NULL",
        params![now, setlist_id, song_id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound);
    }

    conn.execute(
        "UPDATE setlists SET dirty = 1, updated_at = ?1 WHERE id = ?2",
        params![now, setlist_id],
    )?;

    Ok(())
}

#[tauri::command]
pub async fn reorder_setlist_songs(
    pool: State<'_, Pool>,
    setlist_id: String,
    song_ids: Vec<String>,
) -> Result<(), crate::error::SerializableError> {
    inner_reorder(&pool, &setlist_id, song_ids).map_err(Into::into)
}

fn inner_reorder(pool: &Pool, setlist_id: &str, song_ids: Vec<String>) -> AppResult<()> {
    let conn = pool.get()?;
    for (index, song_id) in song_ids.iter().enumerate() {
        conn.execute(
            "UPDATE setlist_songs SET position = ?1, dirty = 1
             WHERE setlist_id = ?2 AND song_id = ?3 AND deleted_at IS NULL",
            params![(index as i32) + 1, setlist_id, song_id],
        )?;
    }

    conn.execute(
        "UPDATE setlists SET dirty = 1, updated_at = ?1 WHERE id = ?2",
        params![Utc::now().naive_utc(), setlist_id],
    )?;

    Ok(())
}
