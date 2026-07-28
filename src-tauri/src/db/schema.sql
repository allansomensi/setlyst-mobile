CREATE TABLE IF NOT EXISTS local_session (
    -- Single-row table holding the cached credentials/session for offline login.
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    user_id         TEXT NOT NULL,
    username        TEXT NOT NULL,
    email           TEXT,
    first_name      TEXT,
    last_name       TEXT,
    role            TEXT NOT NULL,
    password_hash   TEXT NOT NULL,   -- argon2 hash, verified locally when offline
    api_token       TEXT,            -- last known JWT from setlyst-api, refreshed on sync
    api_token_exp   INTEGER,
    last_synced_at  TIMESTAMP
);

CREATE TABLE IF NOT EXISTS artists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL,
    updated_at  TIMESTAMP NOT NULL,
    dirty       INTEGER NOT NULL DEFAULT 1,
    deleted_at  TIMESTAMP,
    synced_at   TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_artists_user_id ON artists(user_id);

CREATE TABLE IF NOT EXISTS songs (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    artist_id   TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL,
    tempo       INTEGER,
    lyrics      TEXT,
    tonality    TEXT,
    genre       TEXT,
    duration    INTEGER,
    created_at  TIMESTAMP NOT NULL,
    updated_at  TIMESTAMP NOT NULL,
    dirty       INTEGER NOT NULL DEFAULT 1,
    deleted_at  TIMESTAMP,
    synced_at   TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_songs_user_id ON songs(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON songs(artist_id);

CREATE TABLE IF NOT EXISTS setlists (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT,
    user_id     TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL,
    updated_at  TIMESTAMP NOT NULL,
    dirty       INTEGER NOT NULL DEFAULT 1,
    deleted_at  TIMESTAMP,
    synced_at   TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_setlists_user_id ON setlists(user_id);

CREATE TABLE IF NOT EXISTS setlist_songs (
    setlist_id  TEXT NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
    song_id     TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    dirty       INTEGER NOT NULL DEFAULT 1,
    deleted_at  TIMESTAMP,
    synced_at   TIMESTAMP,
    PRIMARY KEY (setlist_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_setlist_songs_song_id ON setlist_songs(song_id);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id             TEXT PRIMARY KEY,
    language            TEXT NOT NULL DEFAULT 'en',
    theme               TEXT NOT NULL DEFAULT 'system',
    live_mode_font_size INTEGER NOT NULL DEFAULT 100,
    dirty               INTEGER NOT NULL DEFAULT 1,
    synced_at           TIMESTAMP
);
