import { invoke } from "@tauri-apps/api/core";
import type {
  Artist,
  CreateArtistPayload,
  UpdateArtistPayload,
  Song,
  CreateSongPayload,
  UpdateSongPayload,
  Setlist,
  CreateSetlistPayload,
  UpdateSetlistPayload,
  LocalSession,
  SyncReport,
  AppErrorPayload,
  UserPreferences,
  UpdatePreferencesPayload,
  BackupFile,
  ImportBackupSummary,
} from "@/types/api";

export class LocalApiError extends Error {
  code: string;
  constructor(payload: AppErrorPayload) {
    super(payload.message);
    this.code = payload.code;
    this.name = "LocalApiError";
  }
}

async function call<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    // Tauri rejects with whatever we returned as `Err` in Rust — here that's
    // always our SerializableError shape.
    throw new LocalApiError(err as AppErrorPayload);
  }
}

export const artistsApi = {
  list: (userId: string) => call<Artist[]>("list_artists", { userId }),
  create: (userId: string, payload: CreateArtistPayload) =>
    call<Artist>("create_artist", { userId, payload }),
  update: (id: string, userId: string, payload: UpdateArtistPayload) =>
    call<Artist>("update_artist", { id, userId, payload }),
  remove: (id: string, userId: string) =>
    call<void>("delete_artist", { id, userId }),
};

export const songsApi = {
  list: (userId: string) => call<Song[]>("list_songs", { userId }),
  create: (userId: string, payload: CreateSongPayload) =>
    call<Song>("create_song", { userId, payload }),
  update: (id: string, userId: string, payload: UpdateSongPayload) =>
    call<Song>("update_song", { id, userId, payload }),
  remove: (id: string, userId: string) =>
    call<void>("delete_song", { id, userId }),
};

export const setlistsApi = {
  list: (userId: string) => call<Setlist[]>("list_setlists", { userId }),
  get: (id: string, userId: string) =>
    call<Setlist>("get_setlist", { id, userId }),
  create: (userId: string, payload: CreateSetlistPayload) =>
    call<Setlist>("create_setlist", { userId, payload }),
  update: (id: string, userId: string, payload: UpdateSetlistPayload) =>
    call<Setlist>("update_setlist", { id, userId, payload }),
  remove: (id: string, userId: string) =>
    call<void>("delete_setlist", { id, userId }),
  getSongs: (setlistId: string) =>
    call<Song[]>("get_setlist_songs", { setlistId }),
  addSong: (setlistId: string, songId: string, position: number) =>
    call<void>("add_song_to_setlist", { setlistId, songId, position }),
  removeSong: (setlistId: string, songId: string) =>
    call<void>("remove_song_from_setlist", { setlistId, songId }),
  reorder: (setlistId: string, songIds: string[]) =>
    call<void>("reorder_setlist_songs", { setlistId, songIds }),
};

export const authApi = {
  ensureLocalProfile: () => call<LocalSession>("get_or_create_local_profile"),
  login: (
    apiBaseUrl: string,
    username: string,
    password: string,
    online: boolean,
  ) =>
    call<LocalSession>("login", {
      apiBaseUrl,
      payload: { username, password, online },
    }),
  logout: () => call<void>("logout"),
};

export const syncApi = {
  run: (apiBaseUrl: string) => call<SyncReport>("sync_now", { apiBaseUrl }),
};

export const preferencesApi = {
  get: (userId: string) => call<UserPreferences>("get_preferences", { userId }),
  update: (userId: string, payload: UpdatePreferencesPayload) =>
    call<UserPreferences>("update_preferences", { userId, payload }),
  resolveConflict: (apiBaseUrl: string, keep: "local" | "remote") =>
    call<void>("resolve_preferences_conflict", { apiBaseUrl, keep }),
};

export const backupApi = {
  export: (userId: string) => call<BackupFile>("export_backup", { userId }),
  import: (userId: string, backup: BackupFile) =>
    call<ImportBackupSummary>("import_backup", { userId, backup }),
};
