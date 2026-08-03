use crate::{
    db::Pool,
    error::{AppError, AppResult},
    models::{artist::Artist, setlist::Setlist, song::Song},
    sync::client::SyncClient,
};
use chrono::{NaiveDateTime, Utc};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct PreferencesSnapshot {
    pub language: String,
    pub theme: String,
    pub live_mode_font_size: i32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreferencesConflict {
    pub local: PreferencesSnapshot,
    pub remote: PreferencesSnapshot,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct SyncReport {
    pub pushed: u32,
    pub pulled: u32,
    pub conflicts_resolved_remote: u32,
    pub errors: Vec<String>,
    pub preferences_conflict: Option<PreferencesConflict>,
}

pub async fn run_full_sync(
    pool: &Pool,
    api_base_url: &str,
    token: &str,
    user_id: Uuid,
) -> AppResult<SyncReport> {
    let client = SyncClient::new(api_base_url.to_string());
    let mut report = SyncReport::default();

    sync_artists(pool, &client, token, user_id, &mut report).await;
    sync_songs(pool, &client, token, user_id, &mut report).await;
    sync_setlists(pool, &client, token, user_id, &mut report).await;
    sync_preferences(pool, &client, token, &mut report).await;

    let conn = pool.get()?;
    conn.execute(
        "UPDATE local_session SET last_synced_at = ?1 WHERE id = 1",
        params![Utc::now().naive_utc()],
    )?;

    Ok(report)
}

async fn sync_preferences(pool: &Pool, client: &SyncClient, token: &str, report: &mut SyncReport) {
    match resolve_preferences(pool, client, token).await {
        Ok(Some(conflict)) => report.preferences_conflict = Some(conflict),
        Ok(None) => {}
        Err(e) => report.errors.push(format!("sync preferences: {e}")),
    }
}

async fn resolve_preferences(
    pool: &Pool,
    client: &SyncClient,
    token: &str,
) -> AppResult<Option<PreferencesConflict>> {
    let local: Option<(String, String, i32, bool, Option<String>)> = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT p.language, p.theme, p.live_mode_font_size, p.dirty, p.updated_at
             FROM user_preferences p
             JOIN local_session s ON s.user_id = p.user_id
             WHERE s.id = 1",
            params![],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get::<_, i64>(3)? == 1,
                    row.get(4)?,
                ))
            },
        )
        .optional()?
    };

    let remote = client.get_preferences(token).await?;

    let Some((l_lang, l_theme, l_font, l_dirty, l_updated_at)) = local else {
        apply_remote_preferences(pool, &remote)?;
        return Ok(None);
    };

    let differs = l_lang != remote.language
        || l_theme != remote.theme
        || l_font != remote.live_mode_font_size;

    if !differs {
        if l_dirty {
            client
                .update_preferences(token, &l_lang, &l_theme, l_font)
                .await?;
            mark_preferences_synced(pool)?;
        }
        return Ok(None);
    }

    if !l_dirty {
        apply_remote_preferences(pool, &remote)?;
        return Ok(None);
    }

    Ok(Some(PreferencesConflict {
        local: PreferencesSnapshot {
            language: l_lang,
            theme: l_theme,
            live_mode_font_size: l_font,
            updated_at: l_updated_at.unwrap_or_default(),
        },
        remote: PreferencesSnapshot {
            language: remote.language.clone(),
            theme: remote.theme.clone(),
            live_mode_font_size: remote.live_mode_font_size,
            updated_at: remote.updated_at.clone(),
        },
    }))
}

fn apply_remote_preferences(
    pool: &Pool,
    remote: &crate::sync::client::RemotePreferences,
) -> AppResult<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE user_preferences SET language = ?1, theme = ?2, live_mode_font_size = ?3,
            updated_at = ?4, dirty = 0, synced_at = ?5
         WHERE user_id = (SELECT user_id FROM local_session WHERE id = 1)",
        params![
            remote.language,
            remote.theme,
            remote.live_mode_font_size,
            remote.updated_at,
            Utc::now().naive_utc()
        ],
    )?;
    Ok(())
}

fn mark_preferences_synced(pool: &Pool) -> AppResult<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE user_preferences SET dirty = 0, synced_at = ?1
         WHERE user_id = (SELECT user_id FROM local_session WHERE id = 1)",
        params![Utc::now().naive_utc()],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------
// Artists
// ---------------------------------------------------------------------

async fn sync_artists(
    pool: &Pool,
    client: &SyncClient,
    token: &str,
    _user_id: Uuid,
    report: &mut SyncReport,
) {
    match push_dirty_artists(pool, client, token).await {
        Ok((pushed, errs)) => {
            report.pushed += pushed;
            report.errors.extend(errs);
        }
        Err(e) => report.errors.push(format!("push artists: {e}")),
    }
    match pull_artists(pool, client, token).await {
        Ok((pulled, conflicts)) => {
            report.pulled += pulled;
            report.conflicts_resolved_remote += conflicts;
        }
        Err(e) => report.errors.push(format!("pull artists: {e}")),
    }
}

/// Pushes every locally dirty artist: creates/updates via PATCH/POST, and
/// tombstoned rows via DELETE. On success, clears `dirty` and stamps
/// `synced_at`; hard-deletes rows whose tombstone was confirmed pushed.
async fn push_dirty_artists(
    pool: &Pool,
    client: &SyncClient,
    token: &str,
) -> AppResult<(u32, Vec<String>)> {
    let rows: Vec<(String, String, Option<String>, bool)> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, deleted_at, synced_at IS NULL FROM artists WHERE dirty = 1",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, bool>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    let mut pushed = 0;
    let mut errors = Vec::new();

    for (id, name, deleted_at, never_synced) in rows {
        let uuid = match Uuid::parse_str(&id) {
            Ok(u) => u,
            Err(_) => {
                errors.push(format!("artist {id}: invalid local uuid"));
                continue;
            }
        };

        let result: AppResult<()> = async {
            if deleted_at.is_some() {
                client.push_delete(token, "artists", uuid).await?;
                let conn = pool.get()?;
                conn.execute("DELETE FROM artists WHERE id = ?1", params![id])?;
            } else {
                #[derive(Serialize)]
                struct Body<'a> {
                    name: &'a str,
                }
                let remote_id = client
                    .push_created_or_updated(
                        token,
                        "artists",
                        if never_synced { None } else { Some(uuid) },
                        &Body { name: &name },
                    )
                    .await?;
                let conn = pool.get()?;
                if never_synced && remote_id != uuid {
                    let new_id = remote_id.to_string();
                    conn.execute(
                        "UPDATE artists SET id = ?1, dirty = 0, synced_at = ?2 WHERE id = ?3",
                        params![new_id, Utc::now().naive_utc(), id],
                    )?;
                    conn.execute(
                        "UPDATE songs SET artist_id = ?1 WHERE artist_id = ?2",
                        params![new_id, id],
                    )?;
                } else {
                    conn.execute(
                        "UPDATE artists SET dirty = 0, synced_at = ?1 WHERE id = ?2",
                        params![Utc::now().naive_utc(), id],
                    )?;
                }
            }
            Ok(())
        }
        .await;

        match result {
            Ok(()) => pushed += 1,
            Err(e) => errors.push(format!("artist {id}: {e}")),
        }
    }

    Ok((pushed, errors))
}

/// Pulls every remote artist for this user and upserts locally.
/// Conflict rule: if the local row is *also* dirty (edited offline since the
/// last sync) and the remote `updated_at` is newer, remote wins and overwrites
/// the local edit (last-write-wins). Otherwise the local edit is kept dirty
/// and will be pushed on the next sync pass.
async fn pull_artists(pool: &Pool, client: &SyncClient, token: &str) -> AppResult<(u32, u32)> {
    let remote: Vec<Artist> = client.fetch_all_pages(token, "artists").await?;
    let conn = pool.get()?;
    let mut pulled = 0;
    let mut conflicts = 0;

    for artist in remote {
        let local: Option<(bool, NaiveDateTime)> = conn
            .query_row(
                "SELECT dirty, updated_at FROM artists WHERE id = ?1",
                params![artist.id.to_string()],
                |row| Ok((row.get::<_, i64>(0)? == 1, row.get(1)?)),
            )
            .ok();

        let should_overwrite = match local {
            None => true,
            Some((dirty, local_updated_at)) => {
                if dirty && local_updated_at > artist.updated_at {
                    false
                } else {
                    if dirty {
                        conflicts += 1;
                    }
                    true
                }
            }
        };

        if should_overwrite {
            conn.execute(
                "INSERT INTO artists (id, name, user_id, created_at, updated_at, dirty, deleted_at, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 0, NULL, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name, updated_at = excluded.updated_at,
                    dirty = 0, deleted_at = NULL, synced_at = excluded.synced_at",
                params![
                    artist.id.to_string(),
                    artist.name,
                    artist.user_id.to_string(),
                    artist.created_at,
                    artist.updated_at,
                    Utc::now().naive_utc(),
                ],
            )?;
            pulled += 1;
        }
    }

    Ok((pulled, conflicts))
}

// ---------------------------------------------------------------------
// Songs
// ---------------------------------------------------------------------

async fn sync_songs(
    pool: &Pool,
    client: &SyncClient,
    token: &str,
    _user_id: Uuid,
    report: &mut SyncReport,
) {
    match push_dirty_songs(pool, client, token).await {
        Ok(pushed) => report.pushed += pushed,
        Err(e) => report.errors.push(format!("push songs: {e}")),
    }
    match pull_songs(pool, client, token).await {
        Ok((pulled, conflicts)) => {
            report.pulled += pulled;
            report.conflicts_resolved_remote += conflicts;
        }
        Err(e) => report.errors.push(format!("pull songs: {e}")),
    }
}

#[allow(clippy::type_complexity)]
async fn push_dirty_songs(pool: &Pool, client: &SyncClient, token: &str) -> AppResult<u32> {
    let rows: Vec<(
        String,
        String,
        String,
        Option<i32>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i32>,
        Option<String>,
        bool,
    )> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, artist_id, tempo, lyrics, tonality, genre, duration, deleted_at, synced_at IS NULL
             FROM songs WHERE dirty = 1",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<i32>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<i32>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, bool>(9)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    let mut pushed = 0;

    for (
        id,
        title,
        artist_id,
        tempo,
        lyrics,
        tonality,
        genre,
        duration,
        deleted_at,
        never_synced,
    ) in rows
    {
        let uuid = Uuid::parse_str(&id).map_err(|_| AppError::Sync("bad local uuid".into()))?;

        if deleted_at.is_some() {
            client.push_delete(token, "songs", uuid).await?;
            let conn = pool.get()?;
            conn.execute("DELETE FROM songs WHERE id = ?1", params![id])?;
            pushed += 1;
            continue;
        }

        #[derive(Serialize)]
        struct Body<'a> {
            title: &'a str,
            artist_id: &'a str,
            tempo: Option<i32>,
            lyrics: &'a Option<String>,
            tonality: &'a Option<String>,
            genre: &'a Option<String>,
            duration: Option<i32>,
        }

        let remote_id = client
            .push_created_or_updated(
                token,
                "songs",
                if never_synced { None } else { Some(uuid) },
                &Body {
                    title: &title,
                    artist_id: &artist_id,
                    tempo,
                    lyrics: &lyrics,
                    tonality: &tonality,
                    genre: &genre,
                    duration,
                },
            )
            .await?;

        let conn = pool.get()?;
        if never_synced && remote_id != uuid {
            let new_id = remote_id.to_string();
            conn.execute(
                "UPDATE songs SET id = ?1, dirty = 0, synced_at = ?2 WHERE id = ?3",
                params![new_id, Utc::now().naive_utc(), id],
            )?;
            conn.execute(
                "UPDATE setlist_songs SET song_id = ?1 WHERE song_id = ?2",
                params![new_id, id],
            )?;
        } else {
            conn.execute(
                "UPDATE songs SET dirty = 0, synced_at = ?1 WHERE id = ?2",
                params![Utc::now().naive_utc(), id],
            )?;
        }

        pushed += 1;
    }

    Ok(pushed)
}

async fn pull_songs(pool: &Pool, client: &SyncClient, token: &str) -> AppResult<(u32, u32)> {
    let remote: Vec<Song> = client.fetch_all_pages(token, "songs").await?;
    let conn = pool.get()?;
    let mut pulled = 0;
    let mut conflicts = 0;

    for song in remote {
        let local: Option<(bool, NaiveDateTime)> = conn
            .query_row(
                "SELECT dirty, updated_at FROM songs WHERE id = ?1",
                params![song.id.to_string()],
                |row| Ok((row.get::<_, i64>(0)? == 1, row.get(1)?)),
            )
            .ok();

        let should_overwrite = match local {
            None => true,
            Some((dirty, local_updated_at)) => {
                if dirty && local_updated_at > song.updated_at {
                    false
                } else {
                    if dirty {
                        conflicts += 1;
                    }
                    true
                }
            }
        };

        if should_overwrite {
            conn.execute(
                "INSERT INTO songs (id, title, artist_id, user_id, tempo, lyrics, tonality, genre, duration, created_at, updated_at, dirty, deleted_at, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, NULL, ?12)
                 ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title, artist_id = excluded.artist_id, tempo = excluded.tempo,
                    lyrics = excluded.lyrics, tonality = excluded.tonality, genre = excluded.genre,
                    duration = excluded.duration, updated_at = excluded.updated_at,
                    dirty = 0, deleted_at = NULL, synced_at = excluded.synced_at",
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
                    Utc::now().naive_utc(),
                ],
            )?;
            pulled += 1;
        }
    }

    Ok((pulled, conflicts))
}

// ---------------------------------------------------------------------
// Setlists (+ setlist_songs)
// ---------------------------------------------------------------------

async fn sync_setlists(
    pool: &Pool,
    client: &SyncClient,
    token: &str,
    _user_id: Uuid,
    report: &mut SyncReport,
) {
    match push_dirty_setlists(pool, client, token).await {
        Ok(pushed) => report.pushed += pushed,
        Err(e) => report.errors.push(format!("push setlists: {e}")),
    }
    match pull_setlists(pool, client, token).await {
        Ok((pulled, conflicts)) => {
            report.pulled += pulled;
            report.conflicts_resolved_remote += conflicts;
        }
        Err(e) => report.errors.push(format!("pull setlists: {e}")),
    }
    match sync_setlist_songs(pool, client, token).await {
        Ok(pushed) => report.pushed += pushed,
        Err(e) => report.errors.push(format!("sync setlist songs: {e}")),
    }
}

async fn push_dirty_setlists(pool: &Pool, client: &SyncClient, token: &str) -> AppResult<u32> {
    let rows: Vec<(String, String, Option<String>, Option<String>, bool)> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, description, deleted_at, synced_at IS NULL FROM setlists WHERE dirty = 1",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, bool>(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    let mut pushed = 0;

    for (id, title, description, deleted_at, never_synced) in rows {
        let uuid = Uuid::parse_str(&id).map_err(|_| AppError::Sync("bad local uuid".into()))?;

        if deleted_at.is_some() {
            client.push_delete(token, "setlists", uuid).await?;
            let conn = pool.get()?;
            conn.execute("DELETE FROM setlists WHERE id = ?1", params![id])?;
            conn.execute(
                "DELETE FROM setlist_songs WHERE setlist_id = ?1",
                params![id],
            )?;
            pushed += 1;
            continue;
        }

        #[derive(Serialize)]
        struct Body<'a> {
            title: &'a str,
            description: &'a Option<String>,
        }

        let remote_id = client
            .push_created_or_updated(
                token,
                "setlists",
                if never_synced { None } else { Some(uuid) },
                &Body {
                    title: &title,
                    description: &description,
                },
            )
            .await?;

        let conn = pool.get()?;
        if never_synced && remote_id != uuid {
            let new_id = remote_id.to_string();
            conn.execute(
                "UPDATE setlists SET id = ?1, dirty = 0, synced_at = ?2 WHERE id = ?3",
                params![new_id, Utc::now().naive_utc(), id],
            )?;
            conn.execute(
                "UPDATE setlist_songs SET setlist_id = ?1 WHERE setlist_id = ?2",
                params![new_id, id],
            )?;
        } else {
            conn.execute(
                "UPDATE setlists SET dirty = 0, synced_at = ?1 WHERE id = ?2",
                params![Utc::now().naive_utc(), id],
            )?;
        }

        pushed += 1;
    }

    Ok(pushed)
}

async fn pull_setlists(pool: &Pool, client: &SyncClient, token: &str) -> AppResult<(u32, u32)> {
    let remote: Vec<Setlist> = client.fetch_all_pages(token, "setlists").await?;
    let conn = pool.get()?;
    let mut pulled = 0;
    let mut conflicts = 0;

    for setlist in remote {
        let local: Option<(bool, NaiveDateTime)> = conn
            .query_row(
                "SELECT dirty, updated_at FROM setlists WHERE id = ?1",
                params![setlist.id.to_string()],
                |row| Ok((row.get::<_, i64>(0)? == 1, row.get(1)?)),
            )
            .ok();

        let should_overwrite = match local {
            None => true,
            Some((dirty, local_updated_at)) => {
                if dirty && local_updated_at > setlist.updated_at {
                    false
                } else {
                    if dirty {
                        conflicts += 1;
                    }
                    true
                }
            }
        };

        if should_overwrite {
            conn.execute(
                "INSERT INTO setlists (id, title, description, user_id, created_at, updated_at, dirty, deleted_at, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, NULL, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title, description = excluded.description, updated_at = excluded.updated_at,
                    dirty = 0, deleted_at = NULL, synced_at = excluded.synced_at",
                params![
                    setlist.id.to_string(),
                    setlist.title,
                    setlist.description,
                    setlist.user_id.to_string(),
                    setlist.created_at,
                    setlist.updated_at,
                    Utc::now().naive_utc(),
                ],
            )?;
            pulled += 1;
        }
    }

    Ok((pulled, conflicts))
}

/// Syncs the song ordering within each setlist. Local additions/removals are
/// pushed first; then, since there is no local reorder-merge logic yet, each
/// setlist's song list is re-pulled from the server and used to overwrite
/// local positions — simple and correct for the common case of one device
/// editing a given setlist at a time.
async fn sync_setlist_songs(pool: &Pool, client: &SyncClient, token: &str) -> AppResult<u32> {
    let rows: Vec<(String, String, i32, Option<String>)> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT setlist_id, song_id, position, deleted_at FROM setlist_songs WHERE dirty = 1",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    let mut pushed = 0;

    for (setlist_id, song_id, position, deleted_at) in rows {
        if deleted_at.is_some() {
            // Best-effort: if the setlist or song was itself already deleted
            // remotely this 404s, which we treat as already-consistent.
            let _ = client
                .remove_setlist_song(token, &setlist_id, &song_id)
                .await;
            let conn = pool.get()?;
            conn.execute(
                "DELETE FROM setlist_songs WHERE setlist_id = ?1 AND song_id = ?2",
                params![setlist_id, song_id],
            )?;
        } else if client
            .add_setlist_song(token, &setlist_id, &song_id, position)
            .await
            .is_ok()
        {
            let conn = pool.get()?;
            conn.execute(
                "UPDATE setlist_songs SET dirty = 0, synced_at = ?1
                 WHERE setlist_id = ?2 AND song_id = ?3",
                params![Utc::now().naive_utc(), setlist_id, song_id],
            )?;
        }
        pushed += 1;
    }

    let setlist_ids: Vec<String> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare("SELECT id FROM setlists WHERE deleted_at IS NULL")?;
        let ids = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        ids
    };

    for setlist_id in setlist_ids {
        let Ok(songs) = client.fetch_setlist_songs(token, &setlist_id).await else {
            continue;
        };

        let conn = pool.get()?;
        for (index, song) in songs.iter().enumerate() {
            conn.execute(
                "INSERT INTO setlist_songs (setlist_id, song_id, position, dirty, deleted_at, synced_at)
                 VALUES (?1, ?2, ?3, 0, NULL, ?4)
                 ON CONFLICT(setlist_id, song_id) DO UPDATE SET
                    position = excluded.position, dirty = 0, deleted_at = NULL, synced_at = excluded.synced_at",
                params![
                    setlist_id,
                    song.id.to_string(),
                    (index as i32) + 1,
                    Utc::now().naive_utc()
                ],
            )?;
        }
    }

    Ok(pushed)
}
