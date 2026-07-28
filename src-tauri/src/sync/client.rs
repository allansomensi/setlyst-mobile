use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use tauri::http::StatusCode;
use tauri_plugin_http::reqwest::Client;
use uuid::Uuid;

/// Thin wrapper around `setlyst-api`'s HTTP surface. Every call here is the
/// *only* place in the whole app that touches the network — everything else
/// (all CRUD, all reads) goes through `commands/*` straight to SQLite.
pub struct SyncClient {
    base_url: String,
    http: tauri_plugin_http::reqwest::Client,
}

#[derive(Debug, Deserialize)]
pub struct RemoteUser {
    pub id: Uuid,
    pub username: String,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub role: String,
}

#[derive(Serialize)]
struct LoginPayload<'a> {
    username: &'a str,
    password: &'a str,
}

impl SyncClient {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            http: Client::new(),
        }
    }

    pub async fn login(&self, username: &str, password: &str) -> AppResult<(String, RemoteUser)> {
        let res = self
            .http
            .post(format!("{}/auth/login", self.base_url))
            .json(&LoginPayload { username, password })
            .send()
            .await?;

        if res.status() == StatusCode::UNAUTHORIZED {
            return Err(AppError::InvalidCredentials);
        }
        if !res.status().is_success() {
            return Err(AppError::Sync(format!(
                "login failed: HTTP {}",
                res.status()
            )));
        }

        let token: String = res.json().await?;
        let me = self.get_current_user(&token).await?;
        Ok((token, me))
    }

    async fn get_current_user(&self, token: &str) -> AppResult<RemoteUser> {
        let res = self
            .http
            .get(format!("{}/users/me", self.base_url))
            .bearer_auth(token)
            .send()
            .await?
            .error_for_status()
            .map_err(|e| AppError::Sync(e.to_string()))?;
        Ok(res.json().await?)
    }

    /// Generic helper used by `engine.rs` for every entity's pull step:
    /// `GET /{resource}?page=1&per_page=100` paginated the same way the rest
    /// of setlyst-api already does, walked until the last page comes back.
    pub async fn fetch_all_pages<T: for<'de> Deserialize<'de>>(
        &self,
        token: &str,
        resource: &str,
    ) -> AppResult<Vec<T>> {
        #[derive(Deserialize)]
        struct Page<T> {
            data: Vec<T>,
            meta: Meta,
        }
        #[derive(Deserialize)]
        struct Meta {
            total_pages: i64,
        }

        let mut page = 1;
        let mut all = Vec::new();
        loop {
            let res: Page<T> = self
                .http
                .get(format!("{}/{}", self.base_url, resource))
                .bearer_auth(token)
                .query(&[("page", page), ("per_page", 100)])
                .send()
                .await?
                .error_for_status()
                .map_err(|e| AppError::Sync(e.to_string()))?
                .json()
                .await?;

            let total_pages = res.meta.total_pages;
            all.extend(res.data);
            if page >= total_pages {
                break;
            }
            page += 1;
        }
        Ok(all)
    }

    /// Creates or updates a resource. Returns the resource's authoritative id.
    pub async fn push_created_or_updated<B: Serialize>(
        &self,
        token: &str,
        resource: &str,
        id: Option<Uuid>,
        body: &B,
    ) -> AppResult<Uuid> {
        match id {
            Some(id) => {
                self.http
                    .patch(format!("{}/{}/{}", self.base_url, resource, id))
                    .bearer_auth(token)
                    .json(body)
                    .send()
                    .await?
                    .error_for_status()
                    .map_err(|e| AppError::Sync(e.to_string()))?;
                Ok(id)
            }
            None => {
                let res: serde_json::Value = self
                    .http
                    .post(format!("{}/{}", self.base_url, resource))
                    .bearer_auth(token)
                    .json(body)
                    .send()
                    .await?
                    .error_for_status()
                    .map_err(|e| AppError::Sync(e.to_string()))?
                    .json()
                    .await?;

                res.get("id")
                    .and_then(|v| v.as_str())
                    .and_then(|s| Uuid::parse_str(s).ok())
                    .ok_or_else(|| AppError::Sync("create response missing id".into()))
            }
        }
    }

    pub async fn push_delete(&self, token: &str, resource: &str, id: Uuid) -> AppResult<()> {
        let status = self
            .http
            .delete(format!("{}/{}/{}", self.base_url, resource, id))
            .bearer_auth(token)
            .send()
            .await?
            .status();

        // 404 means the server already doesn't have it — treat as success so
        // the local tombstone can be purged instead of retrying forever.
        if !status.is_success() && status != StatusCode::NOT_FOUND {
            return Err(AppError::Sync(format!("delete failed: HTTP {status}")));
        }
        Ok(())
    }

    pub async fn add_setlist_song(
        &self,
        token: &str,
        setlist_id: &str,
        song_id: &str,
        position: i32,
    ) -> AppResult<()> {
        #[derive(Serialize)]
        struct Body<'a> {
            song_id: &'a str,
            position: i32,
        }

        self.http
            .post(format!("{}/setlists/{setlist_id}/songs", self.base_url))
            .bearer_auth(token)
            .json(&Body { song_id, position })
            .send()
            .await?
            .error_for_status()
            .map_err(|e| AppError::Sync(e.to_string()))?;
        Ok(())
    }

    pub async fn remove_setlist_song(
        &self,
        token: &str,
        setlist_id: &str,
        song_id: &str,
    ) -> AppResult<()> {
        let status = self
            .http
            .delete(format!(
                "{}/setlists/{}/songs/{}",
                self.base_url, setlist_id, song_id
            ))
            .bearer_auth(token)
            .send()
            .await?
            .status();

        if !status.is_success() && status != StatusCode::NOT_FOUND {
            return Err(AppError::Sync(format!(
                "remove setlist song failed: HTTP {status}"
            )));
        }
        Ok(())
    }

    /// Fetches a setlist's songs in server order — used to make the server
    /// authoritative for ordering once local additions/removals are pushed.
    pub async fn fetch_setlist_songs(
        &self,
        token: &str,
        setlist_id: &str,
    ) -> AppResult<Vec<crate::models::song::Song>> {
        let mut page = 1;
        let mut all = Vec::new();
        loop {
            let res: serde_json::Value = self
                .http
                .get(format!("{}/setlists/{}/songs", self.base_url, setlist_id))
                .bearer_auth(token)
                .query(&[("page", page), ("per_page", 100)])
                .send()
                .await?
                .error_for_status()
                .map_err(|e| AppError::Sync(e.to_string()))?
                .json()
                .await?;

            let data = res
                .get("data")
                .cloned()
                .unwrap_or(serde_json::Value::Array(vec![]));
            let songs: Vec<crate::models::song::Song> =
                serde_json::from_value(data).map_err(|e| AppError::Sync(e.to_string()))?;

            let total_pages = res
                .get("meta")
                .and_then(|m| m.get("total_pages"))
                .and_then(|v| v.as_i64())
                .unwrap_or(1);

            all.extend(songs);
            if page as i64 >= total_pages {
                break;
            }
            page += 1;
        }
        Ok(all)
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct RemotePreferences {
    pub language: String,
    pub theme: String,
    pub live_mode_font_size: i32,
    pub updated_at: String,
}

impl SyncClient {
    pub async fn get_preferences(&self, token: &str) -> AppResult<RemotePreferences> {
        Ok(self
            .http
            .get(format!("{}/users/me/preferences", self.base_url))
            .bearer_auth(token)
            .send()
            .await?
            .error_for_status()
            .map_err(|e| AppError::Sync(e.to_string()))?
            .json()
            .await?)
    }

    pub async fn update_preferences(
        &self,
        token: &str,
        language: &str,
        theme: &str,
        live_mode_font_size: i32,
    ) -> AppResult<RemotePreferences> {
        #[derive(Serialize)]
        struct Body<'a> {
            language: &'a str,
            theme: &'a str,
            live_mode_font_size: i32,
        }
        self.http
            .patch(format!("{}/users/me/preferences", self.base_url))
            .bearer_auth(token)
            .json(&Body {
                language,
                theme,
                live_mode_font_size,
            })
            .send()
            .await?
            .error_for_status()
            .map_err(|e| AppError::Sync(e.to_string()))?;
        self.get_preferences(token).await
    }
}
