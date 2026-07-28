export const TONALITIES = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "E#",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
  "B#",
  "Cm",
  "C#m",
  "Dbm",
  "Dm",
  "D#m",
  "Ebm",
  "Em",
  "E#m",
  "Fm",
  "F#m",
  "Gbm",
  "Gm",
  "G#m",
  "Abm",
  "Am",
  "A#m",
  "Bbm",
  "Bm",
  "B#m",
] as const;

export const GENRES = [
  "Acoustic",
  "Alternative",
  "Axe",
  "Blues",
  "BossaNova",
  "Choro",
  "Classical",
  "Country",
  "DeathMetal",
  "Disco",
  "Electronic",
  "Emo",
  "Folk",
  "Forro",
  "Funk",
  "Gaucho",
  "Gospel",
  "Grunge",
  "HardRock",
  "HeavyMetal",
  "HipHop",
  "House",
  "Indie",
  "Jazz",
  "KPop",
  "Latin",
  "LoFi",
  "Metal",
  "MPB",
  "Pagode",
  "Pop",
  "PowerMetal",
  "ProgressiveRock",
  "PsychedelicRock",
  "Punk",
  "Reggae",
  "Reggaeton",
  "RnB",
  "Rock",
  "Samba",
  "Sertanejo",
  "Ska",
  "Soul",
  "SymphonicMetal",
  "Techno",
  "ThrashMetal",
  "Other",
] as const;

export type Tonality = (typeof TONALITIES)[number];
export type Genre = (typeof GENRES)[number];

export interface Artist {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  /** Local-only flag: true if this row has unsynced changes. */
  dirty?: boolean;
}

export interface CreateArtistPayload {
  name: string;
}

export interface UpdateArtistPayload {
  name?: string;
}

export interface Song {
  id: string;
  title: string;
  artist_id: string;
  user_id: string;
  tempo?: number | null;
  lyrics?: string | null;
  tonality?: Tonality | string | null;
  genre?: Genre | string | null;
  duration?: number | null;
  created_at: string;
  updated_at: string;
  dirty?: boolean;
}

export interface CreateSongPayload {
  title: string;
  artist_id: string;
  tempo?: number | null;
  lyrics?: string | null;
  tonality?: string | null;
  genre?: string | null;
  duration?: number | null;
}

export interface UpdateSongPayload {
  title?: string;
  artist_id?: string;
  tempo?: number | null;
  lyrics?: string | null;
  tonality?: string | null;
  genre?: string | null;
  duration?: number | null;
}

export interface Setlist {
  id: string;
  title: string;
  description: string | null;
  user_id: string;
  total_duration: number;
  created_at: string;
  updated_at: string;
  dirty?: boolean;
}

export interface CreateSetlistPayload {
  title: string;
  description?: string;
}

export interface UpdateSetlistPayload {
  title?: string;
  description?: string;
}

export interface LocalSession {
  user_id: string;
  username: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: "user" | "moderator" | "admin";
  api_token: string | null;
  api_token_exp: number | null;
  last_synced_at: string | null;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  conflicts_resolved_remote: number;
  errors: string[];
}

/** Matches src-tauri/src/error.rs SerializableError. */
export interface AppErrorPayload {
  code: string;
  message: string;
}

export interface UserPreferences {
  user_id: string;
  language: string;
  theme: "light" | "dark" | "system";
  live_mode_font_size: number;
}

export interface UpdatePreferencesPayload {
  language?: string;
  theme?: "light" | "dark" | "system";
  live_mode_font_size?: number;
}

export interface BackupArtist {
  id: string;
  name: string;
}

export interface BackupSong {
  id: string;
  title: string;
  artist_id: string;
  tempo?: number | null;
  lyrics?: string | null;
  tonality?: string | null;
  genre?: string | null;
  duration?: number | null;
}

export interface BackupSetlistSong {
  song_id: string;
  position: number;
}

export interface BackupSetlist {
  id: string;
  title: string;
  description?: string | null;
  songs: BackupSetlistSong[];
}

export interface BackupFile {
  version: number;
  exported_at: string;
  artists: BackupArtist[];
  songs: BackupSong[];
  setlists: BackupSetlist[];
}

export interface ImportBackupSummary {
  artists_imported: number;
  songs_imported: number;
  setlists_imported: number;
}

export interface PreferencesSnapshot {
  language: string;
  theme: "light" | "dark" | "system";
  live_mode_font_size: number;
  updated_at: string;
}

export interface PreferencesConflict {
  local: PreferencesSnapshot;
  remote: PreferencesSnapshot;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  conflicts_resolved_remote: number;
  errors: string[];
  preferences_conflict?: PreferencesConflict | null;
}
