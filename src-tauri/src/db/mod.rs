use r2d2_sqlite::SqliteConnectionManager;
use std::path::PathBuf;
use tauri::Manager;

pub type Pool = r2d2::Pool<SqliteConnectionManager>;

const SCHEMA: &str = include_str!("schema.sql");

/// Opens (creating if needed) the app's local SQLite database under the
/// platform-appropriate app data directory, e.g. on Android this resolves under
/// the app's private storage — never shared, never wiped by "clear cache".
pub fn init_pool(app_handle: &tauri::AppHandle) -> Result<Pool, Box<dyn std::error::Error>> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("app data dir must be resolvable");
    std::fs::create_dir_all(&data_dir)?;

    let db_path: PathBuf = data_dir.join("setlyst.db");
    let manager = SqliteConnectionManager::file(db_path).with_init(|conn| {
        // Foreign keys are opt-in per connection in SQLite.
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
    });

    let pool = Pool::new(manager)?;
    let conn = pool.get()?;
    conn.execute_batch(SCHEMA)?;
    let _ = conn.execute(
        "ALTER TABLE user_preferences ADD COLUMN updated_at TIMESTAMP",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE local_session ADD COLUMN profile_dirty INTEGER NOT NULL DEFAULT 0",
        [],
    );

    Ok(pool)
}
