mod commands;
mod db;
mod error;
mod models;
mod sync;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let pool = db::init_pool(app.handle())?;
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::artist::list_artists,
            commands::artist::create_artist,
            commands::artist::update_artist,
            commands::artist::delete_artist,
            commands::song::list_songs,
            commands::song::create_song,
            commands::song::update_song,
            commands::song::delete_song,
            commands::setlist::list_setlists,
            commands::setlist::get_setlist,
            commands::setlist::create_setlist,
            commands::setlist::update_setlist,
            commands::setlist::delete_setlist,
            commands::setlist::get_setlist_songs,
            commands::setlist::add_song_to_setlist,
            commands::setlist::remove_song_from_setlist,
            commands::setlist::reorder_setlist_songs,
            commands::preferences::get_preferences,
            commands::preferences::update_preferences,
            commands::backup::export_backup,
            commands::backup::import_backup,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::get_or_create_local_profile,
            commands::sync::sync_now,
            commands::sync::resolve_preferences_conflict,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Setlyst application");
}
