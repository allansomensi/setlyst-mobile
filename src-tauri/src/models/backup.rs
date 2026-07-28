use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const BACKUP_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupFile {
    pub version: u32,
    pub exported_at: NaiveDateTime,
    pub artists: Vec<BackupArtist>,
    pub songs: Vec<BackupSong>,
    pub setlists: Vec<BackupSetlist>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupArtist {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupSong {
    pub id: Uuid,
    pub title: String,
    pub artist_id: Uuid,
    pub tempo: Option<i32>,
    pub lyrics: Option<String>,
    pub tonality: Option<String>,
    pub genre: Option<String>,
    pub duration: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupSetlist {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub songs: Vec<BackupSetlistSong>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupSetlistSong {
    pub song_id: Uuid,
    pub position: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportSummary {
    pub artists_imported: usize,
    pub songs_imported: usize,
    pub setlists_imported: usize,
}
