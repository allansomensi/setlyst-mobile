use crate::{
    db::Pool,
    error::{AppError, AppResult},
    models::backup::{
        BackupArtist, BackupFile, BackupSetlist, BackupSetlistSong, BackupSong, ImportSummary,
        BACKUP_FORMAT_VERSION,
    },
};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn export_backup(
    pool: State<'_, Pool>,
    user_id: String,
) -> Result<BackupFile, crate::error::SerializableError> {
    inner_export(&pool, &user_id).map_err(Into::into)
}

fn inner_export(pool: &Pool, user_id: &str) -> AppResult<BackupFile> {
    let conn = pool.get()?;

    let mut artists = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, name FROM artists WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY name ASC",
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (id, name) = row?;
            artists.push(BackupArtist {
                id: Uuid::parse_str(&id).unwrap_or_default(),
                name,
            });
        }
    }

    let mut songs = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, title, artist_id, tempo, lyrics, tonality, genre, duration
             FROM songs WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY title ASC",
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok(BackupSong {
                id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_default(),
                title: row.get(1)?,
                artist_id: Uuid::parse_str(&row.get::<_, String>(2)?).unwrap_or_default(),
                tempo: row.get(3)?,
                lyrics: row.get(4)?,
                tonality: row.get(5)?,
                genre: row.get(6)?,
                duration: row.get(7)?,
            })
        })?;
        for row in rows {
            songs.push(row?);
        }
    }

    let mut setlists = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, title, description FROM setlists
             WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY title ASC",
        )?;
        let rows = stmt.query_map(params![user_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?;

        for row in rows {
            let (id, title, description) = row?;

            let mut song_stmt = conn.prepare(
                "SELECT song_id, position FROM setlist_songs
                 WHERE setlist_id = ?1 AND deleted_at IS NULL ORDER BY position ASC",
            )?;
            let song_rows = song_stmt.query_map(params![id], |row| {
                Ok(BackupSetlistSong {
                    song_id: Uuid::parse_str(&row.get::<_, String>(0)?).unwrap_or_default(),
                    position: row.get(1)?,
                })
            })?;
            let mut setlist_songs = Vec::new();
            for song_row in song_rows {
                setlist_songs.push(song_row?);
            }

            setlists.push(BackupSetlist {
                id: Uuid::parse_str(&id).unwrap_or_default(),
                title,
                description,
                songs: setlist_songs,
            });
        }
    }

    Ok(BackupFile {
        version: BACKUP_FORMAT_VERSION,
        exported_at: Utc::now().naive_utc(),
        artists,
        songs,
        setlists,
    })
}

#[tauri::command]
pub async fn import_backup(
    pool: State<'_, Pool>,
    user_id: String,
    backup: BackupFile,
) -> Result<ImportSummary, crate::error::SerializableError> {
    inner_import(&pool, &user_id, backup).map_err(Into::into)
}

fn inner_import(pool: &Pool, user_id: &str, backup: BackupFile) -> AppResult<ImportSummary> {
    let artists_incoming = backup.artists.len();
    let songs_incoming = backup.songs.len();
    let setlists_incoming = backup.setlists.len();

    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let now = Utc::now().naive_utc();

    let mut artist_id_map: HashMap<Uuid, String> = HashMap::with_capacity(artists_incoming);

    for artist in &backup.artists {
        let existing: Option<String> = tx
            .query_row(
                "SELECT id FROM artists WHERE name = ?1 AND user_id = ?2 AND deleted_at IS NULL",
                params![artist.name, user_id],
                |row| row.get(0),
            )
            .optional()?;

        let resolved_id = match existing {
            Some(id) => id,
            None => {
                let new_id = Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO artists (id, name, user_id, created_at, updated_at, dirty, deleted_at, synced_at)
                     VALUES (?1, ?2, ?3, ?4, ?4, 1, NULL, NULL)",
                    params![new_id, artist.name, user_id, now],
                )?;
                new_id
            }
        };

        artist_id_map.insert(artist.id, resolved_id);
    }

    let mut song_id_map: HashMap<Uuid, String> = HashMap::with_capacity(songs_incoming);

    for song in &backup.songs {
        let resolved_artist_id = artist_id_map.get(&song.artist_id).cloned().ok_or_else(|| {
            AppError::Validation(format!(
                "Song '{}' references an unknown artist in the backup file.",
                song.title
            ))
        })?;

        let existing: Option<String> = tx
            .query_row(
                "SELECT id FROM songs WHERE title = ?1 AND artist_id = ?2 AND user_id = ?3 AND deleted_at IS NULL",
                params![song.title, resolved_artist_id, user_id],
                |row| row.get(0),
            )
            .optional()?;

        let resolved_id = match existing {
            Some(id) => id,
            None => {
                let new_id = Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO songs (id, title, artist_id, user_id, tempo, lyrics, tonality, genre, duration,
                                         created_at, updated_at, dirty, deleted_at, synced_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, 1, NULL, NULL)",
                    params![
                        new_id,
                        song.title,
                        resolved_artist_id,
                        user_id,
                        song.tempo,
                        song.lyrics,
                        song.tonality,
                        song.genre,
                        song.duration,
                        now,
                    ],
                )?;
                new_id
            }
        };

        song_id_map.insert(song.id, resolved_id);
    }

    for setlist in &backup.setlists {
        let new_setlist_id = Uuid::new_v4().to_string();

        tx.execute(
            "INSERT INTO setlists (id, title, description, user_id, created_at, updated_at, dirty, deleted_at, synced_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, 1, NULL, NULL)",
            params![new_setlist_id, setlist.title, setlist.description, user_id, now],
        )?;

        for entry in &setlist.songs {
            let resolved_song_id = song_id_map.get(&entry.song_id).cloned().ok_or_else(|| {
                AppError::Validation(format!(
                    "Setlist '{}' references an unknown song in the backup file.",
                    setlist.title
                ))
            })?;

            tx.execute(
                "INSERT INTO setlist_songs (setlist_id, song_id, position, dirty, deleted_at, synced_at)
                 VALUES (?1, ?2, ?3, 1, NULL, NULL)
                 ON CONFLICT(setlist_id, song_id) DO UPDATE SET position = excluded.position, dirty = 1",
                params![new_setlist_id, resolved_song_id, entry.position],
            )?;
        }
    }

    tx.commit()?;

    Ok(ImportSummary {
        artists_imported: artists_incoming,
        songs_imported: songs_incoming,
        setlists_imported: setlists_incoming,
    })
}
