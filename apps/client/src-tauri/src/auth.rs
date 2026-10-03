use std::collections::HashMap;
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::paths::accounts_file_path;

pub const MS_CLIENT_ID: &str = "b7fd5c17-f26e-47c5-9a41-5d9fa68b5a4b";

fn default_account_type() -> String {
    "microsoft".to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeResponse {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAccount {
    pub id: String,
    #[serde(default = "default_account_type")]
    pub account_type: String, // "microsoft", "offline", "elyby", "littleskin"
    pub username: String,
    pub uuid: String,
    pub skin_url: Option<String>,
    #[serde(default)]
    pub microsoft_refresh_token: Option<String>,
    #[serde(default)]
    pub minecraft_access_token: Option<String>,
    #[serde(default)]
    pub client_token: Option<String>,
    #[serde(default)]
    pub auth_server_url: Option<String>,
    #[serde(default)]
    pub expires_at: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountDatabase {
    pub active_account_id: Option<String>,
    pub accounts: Vec<StoredAccount>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAccountInfo {
    pub id: String,
    pub account_type: String,
    pub username: String,
    pub uuid: String,
    pub skin_url: Option<String>,
    pub is_active: bool,
}


/// Standardises a 32-hex character Yggdrasil UUID into standard 8-4-4-4-12 hyphenated format.
pub fn format_uuid_with_dashes(raw: &str) -> String {
    let clean = raw.replace('-', "");
    if clean.len() == 32 {
        format!(
            "{}-{}-{}-{}-{}",
            &clean[0..8],
            &clean[8..12],
            &clean[12..16],
            &clean[16..20],
            &clean[20..32]
        )
    } else {
        raw.to_string()
    }
}

/// Generates a unique client token for Yggdrasil authentication requests.
pub fn generate_client_token() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let pid = std::process::id();

    let mut hasher = Md5::new();
    hasher.update(format!("sera-client-token:{}:{}:{}", now, pid, count).as_bytes());
    let bytes = hasher.finalize();

    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

impl StoredAccount {
    pub fn to_public(&self, is_active: bool) -> PublicAccountInfo {
        PublicAccountInfo {
            id: self.id.clone(),
            account_type: self.account_type.clone(),
            username: self.username.clone(),
            uuid: self.uuid.clone(),
            skin_url: self.skin_url.clone(),
            is_active,
        }
    }
}

pub fn generate_offline_uuid(username: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{}", username).as_bytes());
    let mut bytes = hasher.finalize();

    // Java UUID.nameUUIDFromBytes equivalent:
    bytes[6] = (bytes[6] & 0x0f) | 0x30; // Version 3
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // IETF variant

    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

pub fn add_offline_account(
    app: &tauri::AppHandle,
    raw_username: &str,
) -> Result<PublicAccountInfo, String> {
    let username = raw_username.trim();
    if username.is_empty() {
        return Err("Player name cannot be empty.".to_string());
    }
    if username.len() > 16 {
        return Err("Player name must be 16 characters or fewer.".to_string());
    }
    if !username.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("Player name can only contain letters, numbers, and underscores.".to_string());
    }

    let uuid = generate_offline_uuid(username);
    let id = format!("offline-{}", uuid);

    let account = StoredAccount {
        id: id.clone(),
        account_type: "offline".to_string(),
        username: username.to_string(),
        uuid: uuid.clone(),
        skin_url: None,
        microsoft_refresh_token: None,
        minecraft_access_token: None,
        client_token: None,
        auth_server_url: None,
        expires_at: None,
    };

    let mut db = load_account_database(app);
    db.accounts.retain(|a| a.uuid != uuid);
    db.active_account_id = Some(id);
    let public_info = account.to_public(true);
    db.accounts.push(account);

    save_account_database(app, &db)?;

    Ok(public_info)
}

pub fn load_account_database(app: &tauri::AppHandle) -> AccountDatabase {
    let Ok(path) = accounts_file_path(app) else {
        return AccountDatabase::default();
    };
    if !path.exists() {
        return AccountDatabase::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => AccountDatabase::default(),
    }
}

pub fn save_account_database(app: &tauri::AppHandle, db: &AccountDatabase) -> Result<(), String> {
    let path = accounts_file_path(app)?;
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(db).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn get_active_account_info(app: &tauri::AppHandle) -> Result<Option<PublicAccountInfo>, String> {
    let db = load_account_database(app);
    if let Some(active_id) = &db.active_account_id {
        if let Some(acc) = db.accounts.iter().find(|a| &a.id == active_id) {
            return Ok(Some(acc.to_public(true)));
        }
    }
    if let Some(first) = db.accounts.first() {
        return Ok(Some(first.to_public(true)));
    }
    Ok(None)
}

pub fn get_all_accounts_info(app: &tauri::AppHandle) -> Result<Vec<PublicAccountInfo>, String> {
    let db = load_account_database(app);
    let active_id = db.active_account_id.as_deref();
    let list = db
        .accounts
        .iter()
        .map(|a| {
            let is_active = match active_id {
                Some(id) => a.id == id,
                None => false,
            };
            a.to_public(is_active)
        })
        .collect();
    Ok(list)
}

pub fn remove_account_by_id(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let mut db = load_account_database(app);
    db.accounts.retain(|a| a.id != id);
    if db.active_account_id.as_deref() == Some(id) {
        db.active_account_id = db.accounts.first().map(|a| a.id.clone());
    }
    save_account_database(app, &db)
}

pub fn set_active_account_by_id(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let mut db = load_account_database(app);
    if db.accounts.iter().any(|a| a.id == id) {
        db.active_account_id = Some(id.to_string());
        save_account_database(app, &db)?;
        Ok(())
    } else {
        Err(format!("Account with id {} not found", id))
    }
}

// =========================================================================
// Microsoft & Minecraft OAuth Pipeline
// =========================================================================

pub async fn start_device_code_flow() -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.4")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let body_str = format!("client_id={}&scope=XboxLive.signin%20offline_access", MS_CLIENT_ID);

    let res = client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body_str)
        .send()
        .await
        .map_err(|e| {
            let err_str = e.to_string();
            if err_str.contains("error sending request") || err_str.contains("dns") || err_str.contains("timeout") {
                "Could not connect to Microsoft login service. Please check your internet connection and try again.".to_string()
            } else {
                format!("Failed to connect to Microsoft: {}", e)
            }
        })?;

    if !res.status().is_success() {
        return Err("Microsoft device code request returned non-success status.".into());
    }

    #[derive(Deserialize)]
    struct MsDeviceCodeResponse {
        device_code: String,
        user_code: String,
        verification_uri: String,
        expires_in: u64,
        interval: u64,
        message: String,
    }

    let data: MsDeviceCodeResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Microsoft device code response: {}", e))?;

    Ok(DeviceCodeResponse {
        user_code: data.user_code,
        device_code: data.device_code,
        verification_uri: data.verification_uri,
        expires_in: data.expires_in,
        interval: data.interval,
        message: data.message,
    })
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct MsTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct XboxLiveAuthResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: HashMap<String, Vec<HashMap<String, String>>>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct McLoginResponse {
    access_token: String,
    expires_in: u64,
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct McSkinInfo {
    id: Option<String>,
    state: Option<String>,
    url: String,
    variant: Option<String>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct McProfileResponse {
    id: String,
    name: String,
    skins: Option<Vec<McSkinInfo>>,
}

pub async fn poll_device_code(
    app: &tauri::AppHandle,
    device_code: &str,
) -> Result<PublicAccountInfo, String> {
    let client = reqwest::Client::new();
    let body_str = format!(
        "client_id={}&grant_type=urn:ietf:params:oauth:grant-type:device_code&code={}",
        MS_CLIENT_ID, device_code
    );

    let res = client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body_str)
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?;

    let token_res: MsTokenResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    if let Some(err) = token_res.error {
        if err == "authorization_pending" {
            return Err("authorization_pending".to_string());
        } else if err == "authorization_declined" {
            return Err("authorization_declined".to_string());
        } else if err == "bad_verification_code" || err == "expired_token" {
            return Err("code_expired".to_string());
        }
        let desc = token_res.error_description.unwrap_or(err);
        return Err(format!("Microsoft authorization error: {}", desc));
    }

    let ms_access = token_res.access_token.ok_or("No Microsoft access token returned")?;
    let ms_refresh = token_res.refresh_token.ok_or("No Microsoft refresh token returned")?;

    // Complete the full chain to Minecraft profile
    let account = authenticate_minecraft_chain(&client, &ms_access, &ms_refresh).await?;

    // Save into database
    let mut db = load_account_database(app);
    let public_info = account.to_public(true);

    db.accounts.retain(|a| a.uuid != account.uuid);
    db.active_account_id = Some(account.id.clone());
    db.accounts.push(account);

    save_account_database(app, &db)?;

    Ok(public_info)
}

async fn authenticate_minecraft_chain(
    client: &reqwest::Client,
    ms_access_token: &str,
    ms_refresh_token: &str,
) -> Result<StoredAccount, String> {
    // 1. Xbox Live Authentication (user token)
    let mut xbl_req_props = HashMap::new();
    xbl_req_props.insert("AuthMethod", serde_json::json!("RPS"));
    xbl_req_props.insert("SiteName", serde_json::json!("user.auth.xboxlive.com"));
    xbl_req_props.insert(
        "RpsTicket",
        serde_json::json!(format!("d={}", ms_access_token)),
    );

    let mut xbl_body = HashMap::new();
    xbl_body.insert("Properties", serde_json::json!(xbl_req_props));
    xbl_body.insert(
        "RelyingParty",
        serde_json::json!("http://auth.xboxlive.com"),
    );
    xbl_body.insert("TokenType", serde_json::json!("JWT"));

    let xbl_res = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&xbl_body)
        .send()
        .await
        .map_err(|e| format!("Xbox Live authentication request failed: {}", e))?;

    if !xbl_res.status().is_success() {
        return Err("Failed to authenticate with Xbox Live.".into());
    }

    let xbl_data: XboxLiveAuthResponse = xbl_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Xbox Live response: {}", e))?;

    let xbl_token = xbl_data.token;
    let uhs = xbl_data
        .display_claims
        .get("xui")
        .and_then(|xui| xui.first())
        .and_then(|map| map.get("uhs"))
        .ok_or("Failed to extract Xbox user hash (uhs)")?;

    // 2. XSTS Token Authentication
    let mut xsts_req_props = HashMap::new();
    xsts_req_props.insert("SandboxId", serde_json::json!("RETAIL"));
    xsts_req_props.insert(
        "UserTokens",
        serde_json::json!(vec![xbl_token.as_str()]),
    );

    let mut xsts_body = HashMap::new();
    xsts_body.insert("Properties", serde_json::json!(xsts_req_props));
    xsts_body.insert(
        "RelyingParty",
        serde_json::json!("rp://api.minecraftservices.com/"),
    );
    xsts_body.insert("TokenType", serde_json::json!("JWT"));

    let xsts_res = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&xsts_body)
        .send()
        .await
        .map_err(|e| format!("XSTS authorization request failed: {}", e))?;

    let xsts_status = xsts_res.status();
    let xsts_raw = xsts_res.text().await.map_err(|e| format!("Failed to read XSTS response: {}", e))?;

    if !xsts_status.is_success() {
        #[derive(Deserialize)]
        struct XstsErrorPayload {
            #[serde(rename = "XErr")]
            x_err: Option<u64>,
            #[serde(rename = "Message")]
            message: Option<String>,
        }
        if let Ok(err_data) = serde_json::from_str::<XstsErrorPayload>(&xsts_raw) {
            match err_data.x_err {
                Some(2148916233) => {
                    return Err("This Microsoft account does not have an Xbox profile. Please visit xbox.com to create an Xbox account, then sign in again.".into());
                }
                Some(2148916235) => {
                    return Err("Xbox Live is currently unavailable in your region.".into());
                }
                Some(2148916238) => {
                    return Err("Child account detected. An adult must add this account to a Microsoft Family to permit multiplayer games.".into());
                }
                Some(code) => {
                    return Err(format!("Xbox Live error ({})", code));
                }
                None => {
                    if let Some(msg) = err_data.message {
                        return Err(msg);
                    }
                }
            }
        }
        return Err("Failed to obtain XSTS token from Xbox Live. Please check your Xbox account status.".into());
    }

    let xsts_data: XboxLiveAuthResponse = serde_json::from_str(&xsts_raw)
        .map_err(|e| format!("Failed to parse XSTS token response: {}", e))?;

    let xsts_token = xsts_data.token;

    // 3. Minecraft Services Authentication
    let mut mc_login_body = HashMap::new();
    mc_login_body.insert("identityToken", format!("XBL3.0 x={};{}", uhs, xsts_token));

    let mc_login_res = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&mc_login_body)
        .send()
        .await
        .map_err(|e| format!("Minecraft login request failed: {}", e))?;

    let mc_status = mc_login_res.status();
    let mc_text = mc_login_res.text().await.map_err(|e| format!("Failed to read Minecraft login response: {}", e))?;

    if !mc_status.is_success() {
        #[derive(Deserialize)]
        struct McErrorPayload {
            #[serde(rename = "errorMessage")]
            error_message: Option<String>,
            error: Option<String>,
        }
        if let Ok(err_data) = serde_json::from_str::<McErrorPayload>(&mc_text) {
            if let Some(msg) = err_data.error_message.or(err_data.error) {
                return Err(format!("Minecraft Services error: {}", msg));
            }
        }
        return Err(format!("Failed to authenticate with Minecraft services (HTTP {}): {}", mc_status, mc_text));
    }

    let mc_login: McLoginResponse = serde_json::from_str(&mc_text)
        .map_err(|e| format!("Failed to parse Minecraft login response: {}", e))?;

    // 4. Fetch Minecraft Profile
    let profile_res = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(&mc_login.access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to request Minecraft profile: {}", e))?;

    if profile_res.status().as_u16() == 404 {
        return Err("This Microsoft account does not own Minecraft Java Edition.".into());
    }

    if !profile_res.status().is_success() {
        return Err("Failed to fetch Minecraft profile.".into());
    }

    let profile: McProfileResponse = profile_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Minecraft profile: {}", e))?;

    let skin_url = profile
        .skins
        .and_then(|skins| {
            skins
                .iter()
                .find(|s| s.state.as_deref() == Some("ACTIVE"))
                .or_else(|| skins.first())
                .map(|s| s.url.clone())
        });

    let now_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Format UUID with hyphens if needed (32 hex -> 8-4-4-4-12)
    let formatted_uuid = if profile.id.len() == 32 && !profile.id.contains('-') {
        format!(
            "{}-{}-{}-{}-{}",
            &profile.id[0..8],
            &profile.id[8..12],
            &profile.id[12..16],
            &profile.id[16..20],
            &profile.id[20..32]
        )
    } else {
        profile.id.clone()
    };

    Ok(StoredAccount {
        id: formatted_uuid.clone(),
        account_type: "microsoft".to_string(),
        username: profile.name,
        uuid: formatted_uuid,
        skin_url,
        microsoft_refresh_token: Some(ms_refresh_token.to_string()),
        minecraft_access_token: Some(mc_login.access_token),
        client_token: None,
        auth_server_url: None,
        expires_at: Some(now_epoch + mc_login.expires_in),
    })
}

/// Refreshes the Microsoft -> Minecraft token if needed (within 5 minutes of expiring)
pub async fn get_valid_active_account(app: &tauri::AppHandle) -> Result<StoredAccount, String> {
    let mut db = load_account_database(app);
    let active_id = db
        .active_account_id
        .clone()
        .or_else(|| db.accounts.first().map(|a| a.id.clone()))
        .ok_or("No account logged in. Please log in or add an offline account before launching Minecraft.")?;

    let index = db
        .accounts
        .iter()
        .position(|a| a.id == active_id)
        .ok_or("Active account could not be found.")?;

    let mut account = db.accounts[index].clone();
    if account.account_type == "offline" {
        return Ok(account);
    }

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.4")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    if account.account_type == "elyby" || account.account_type == "littleskin" {
        validate_and_refresh_yggdrasil(&client, &mut account).await?;
        db.accounts[index] = account.clone();
        let _ = save_account_database(app, &db);
        return Ok(account);
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let expires_at = account.expires_at.unwrap_or(0);
    // If still valid for at least 5 minutes, use as is
    if expires_at > now + 300 {
        return Ok(account);
    }

    let refresh_token = account
        .microsoft_refresh_token
        .as_ref()
        .ok_or("Microsoft account is missing refresh token")?;

    // Refresh using Microsoft refresh token
    let body_str = format!(
        "client_id={}&grant_type=refresh_token&refresh_token={}",
        MS_CLIENT_ID, refresh_token
    );

    let res = client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body_str)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh Microsoft token: {}", e))?;

    let token_res: MsTokenResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse refreshed token response: {}", e))?;

    let ms_access = token_res
        .access_token
        .ok_or("No access token in refresh response")?;
    let ms_refresh = token_res
        .refresh_token
        .unwrap_or_else(|| refresh_token.clone());

    let updated_account = authenticate_minecraft_chain(&client, &ms_access, &ms_refresh).await?;

    db.accounts[index] = updated_account.clone();
    let _ = save_account_database(app, &db);

    Ok(updated_account)
}

// =========================================================================
// Ely.by and LittleSkin (Yggdrasil) Authentication Pipeline
// =========================================================================

pub const ELYBY_AUTH_URL: &str = "https://authserver.ely.by/auth/authenticate";
pub const ELYBY_REFRESH_URL: &str = "https://authserver.ely.by/auth/refresh";
pub const ELYBY_VALIDATE_URL: &str = "https://authserver.ely.by/auth/validate";
pub const ELYBY_SERVER_URL: &str = "https://authserver.ely.by";

pub const LITTLESKIN_AUTH_URL: &str = "https://littleskin.cn/api/yggdrasil/authserver/authenticate";
pub const LITTLESKIN_REFRESH_URL: &str = "https://littleskin.cn/api/yggdrasil/authserver/refresh";
pub const LITTLESKIN_VALIDATE_URL: &str = "https://littleskin.cn/api/yggdrasil/authserver/validate";
pub const LITTLESKIN_SERVER_URL: &str = "https://littleskin.cn/api/yggdrasil";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct YggdrasilAgent<'a> {
    name: &'a str,
    version: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct YggdrasilAuthRequest<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    agent: Option<YggdrasilAgent<'a>>,
    username: &'a str,
    password: &'a str,
    client_token: &'a str,
    request_user: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct YggdrasilRefreshRequest<'a> {
    access_token: &'a str,
    client_token: &'a str,
    request_user: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct YggdrasilValidateRequest<'a> {
    access_token: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    client_token: Option<&'a str>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct YggdrasilProfile {
    id: String,
    name: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct YggdrasilAuthResponse {
    access_token: String,
    client_token: Option<String>,
    selected_profile: Option<YggdrasilProfile>,
    #[serde(default)]
    available_profiles: Vec<YggdrasilProfile>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct YggdrasilErrorResponse {
    error: Option<String>,
    error_message: Option<String>,
}


fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut buf: u32 = 0;
    let mut bits = 0;
    for &b in input.as_bytes() {
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b' ' | b'\r' | b'\n' => continue,
            _ => return None,
        };
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

/// Resolves real 64x64 skin texture from a Yggdrasil profile's textures property
async fn fetch_yggdrasil_skin_texture(client: &reqwest::Client, profile_url: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct ProfileProperty {
        name: String,
        value: String,
    }
    #[derive(Deserialize)]
    struct ProfileResponse {
        properties: Option<Vec<ProfileProperty>>,
    }
    #[derive(Deserialize)]
    struct TexturesMap {
        #[serde(rename = "SKIN")]
        skin: Option<TextureSkinItem>,
    }
    #[derive(Deserialize)]
    struct TextureSkinItem {
        url: String,
    }
    #[derive(Deserialize)]
    struct TexturesEnvelope {
        textures: Option<TexturesMap>,
    }

    let res = client.get(profile_url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }

    let data: ProfileResponse = res.json().await.ok()?;
    for prop in data.properties.unwrap_or_default() {
        if prop.name == "textures" {
            let bytes = base64_decode(&prop.value)?;
            let text = String::from_utf8(bytes).ok()?;
            let envelope: TexturesEnvelope = serde_json::from_str(&text).ok()?;
            if let Some(tex) = envelope.textures {
                if let Some(skin) = tex.skin {
                    if !skin.url.is_empty() {
                        return Some(skin.url);
                    }
                }
            }
        }
    }
    None
}

fn parse_yggdrasil_error(status: reqwest::StatusCode, body: &str) -> String {
    if let Ok(err_data) = serde_json::from_str::<YggdrasilErrorResponse>(body) {
        if let Some(msg) = err_data.error_message {
            return msg;
        }
        if let Some(err) = err_data.error {
            return err;
        }
    }
    format!("Server returned HTTP status {}", status)
}

/// Authenticates a user against Ely.by and saves the account in accounts.json.
pub async fn login_elyby(
    app: &tauri::AppHandle,
    raw_username: &str,
    raw_password: &str,
) -> Result<PublicAccountInfo, String> {
    let username = raw_username.trim();
    let password = raw_password.trim();

    if username.is_empty() {
        return Err("Username or email cannot be empty.".to_string());
    }
    if password.is_empty() {
        return Err("Password cannot be empty.".to_string());
    }

    let client_token = generate_client_token();
    let req_body = YggdrasilAuthRequest {
        agent: None,
        username,
        password,
        client_token: &client_token,
        request_user: true,
    };

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.4")
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let res = client
        .post(ELYBY_AUTH_URL)
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ely.by auth server: {}", e))?;

    let status = res.status();
    let body_text = res.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(parse_yggdrasil_error(status, &body_text));
    }

    let auth_data: YggdrasilAuthResponse = serde_json::from_str(&body_text)
        .map_err(|e| format!("Failed to parse Ely.by auth response: {}", e))?;

    let profile = auth_data
        .selected_profile
        .or_else(|| auth_data.available_profiles.into_iter().next())
        .ok_or("No Minecraft profile found for this Ely.by account.")?;

    let formatted_uuid = format_uuid_with_dashes(&profile.id);
    let account_id = format!("elyby-{}", formatted_uuid);
    let raw_uuid = profile.id.replace('-', "");
    let profile_url = format!("https://authserver.ely.by/session/profile/{}", raw_uuid);
    let skin_url = fetch_yggdrasil_skin_texture(&client, &profile_url).await;

    let now_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let account = StoredAccount {
        id: account_id.clone(),
        account_type: "elyby".to_string(),
        username: profile.name,
        uuid: formatted_uuid.clone(),
        skin_url,
        microsoft_refresh_token: None,
        minecraft_access_token: Some(auth_data.access_token),
        client_token: Some(auth_data.client_token.unwrap_or(client_token)),
        auth_server_url: Some(ELYBY_SERVER_URL.to_string()),
        expires_at: Some(now_epoch + 86400 * 7),
    };

    let mut db = load_account_database(app);
    db.accounts.retain(|a| a.uuid != formatted_uuid);
    db.active_account_id = Some(account_id);
    let public_info = account.to_public(true);
    db.accounts.push(account);

    save_account_database(app, &db)?;

    Ok(public_info)
}

/// Authenticates a user against LittleSkin Yggdrasil API and saves the account in accounts.json.
pub async fn login_littleskin(
    app: &tauri::AppHandle,
    raw_username: &str,
    raw_password: &str,
) -> Result<PublicAccountInfo, String> {
    let username = raw_username.trim();
    let password = raw_password.trim();

    if username.is_empty() {
        return Err("Email or player name cannot be empty.".to_string());
    }
    if password.is_empty() {
        return Err("Password cannot be empty.".to_string());
    }

    let client_token = generate_client_token();
    let req_body = YggdrasilAuthRequest {
        agent: Some(YggdrasilAgent {
            name: "Minecraft",
            version: 1,
        }),
        username,
        password,
        client_token: &client_token,
        request_user: true,
    };

    let client = reqwest::Client::builder()
        .user_agent("SeraLauncher/0.1.4")
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let res = client
        .post(LITTLESKIN_AUTH_URL)
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to LittleSkin auth server: {}", e))?;

    let status = res.status();
    let body_text = res.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(parse_yggdrasil_error(status, &body_text));
    }

    let auth_data: YggdrasilAuthResponse = serde_json::from_str(&body_text)
        .map_err(|e| format!("Failed to parse LittleSkin auth response: {}", e))?;

    let profile = auth_data
        .selected_profile
        .or_else(|| auth_data.available_profiles.into_iter().next())
        .ok_or("No character profile selected on this LittleSkin account.")?;

    let formatted_uuid = format_uuid_with_dashes(&profile.id);
    let account_id = format!("littleskin-{}", formatted_uuid);
    let raw_uuid = profile.id.replace('-', "");
    let profile_url = format!("https://littleskin.cn/api/yggdrasil/sessionserver/session/minecraft/profile/{}", raw_uuid);
    let skin_url = fetch_yggdrasil_skin_texture(&client, &profile_url).await;

    let now_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let account = StoredAccount {
        id: account_id.clone(),
        account_type: "littleskin".to_string(),
        username: profile.name,
        uuid: formatted_uuid.clone(),
        skin_url,
        microsoft_refresh_token: None,
        minecraft_access_token: Some(auth_data.access_token),
        client_token: Some(auth_data.client_token.unwrap_or(client_token)),
        auth_server_url: Some(LITTLESKIN_SERVER_URL.to_string()),
        expires_at: Some(now_epoch + 86400 * 7),
    };

    let mut db = load_account_database(app);
    db.accounts.retain(|a| a.uuid != formatted_uuid);
    db.active_account_id = Some(account_id);
    let public_info = account.to_public(true);
    db.accounts.push(account);

    save_account_database(app, &db)?;

    Ok(public_info)
}

async fn validate_and_refresh_yggdrasil(
    client: &reqwest::Client,
    account: &mut StoredAccount,
) -> Result<(), String> {
    let access_token = match &account.minecraft_access_token {
        Some(t) => t.clone(),
        None => return Err("Account has no active session token. Please log in again.".to_string()),
    };
    let client_token = account.client_token.clone().unwrap_or_default();

    let validate_url = if account.account_type == "elyby" {
        ELYBY_VALIDATE_URL
    } else {
        LITTLESKIN_VALIDATE_URL
    };

    let refresh_url = if account.account_type == "elyby" {
        ELYBY_REFRESH_URL
    } else {
        LITTLESKIN_REFRESH_URL
    };

    // 1. Check validity first
    let val_body = YggdrasilValidateRequest {
        access_token: &access_token,
        client_token: if client_token.is_empty() { None } else { Some(&client_token) },
    };

    let val_res = client.post(validate_url).json(&val_body).send().await;
    if let Ok(res) = val_res {
        if res.status().is_success() || res.status() == reqwest::StatusCode::NO_CONTENT {
            // Token is still valid!
            return Ok(());
        }
    }

    // 2. Refresh token if validation failed
    let ref_body = YggdrasilRefreshRequest {
        access_token: &access_token,
        client_token: &client_token,
        request_user: true,
    };

    let ref_res = client
        .post(refresh_url)
        .json(&ref_body)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh session: {}", e))?;

    let status = ref_res.status();
    let body = ref_res.text().await.map_err(|e| format!("Failed to read refresh response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Session expired: {}", parse_yggdrasil_error(status, &body)));
    }

    let auth_data: YggdrasilAuthResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    account.minecraft_access_token = Some(auth_data.access_token);
    if let Some(ct) = auth_data.client_token {
        account.client_token = Some(ct);
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    account.expires_at = Some(now + 86400 * 7);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uuid_with_dashes_normalizes_correctly() {
        let raw = "c36a9fb64f2a41ff90bdae7cc92031eb";
        let dashed = format_uuid_with_dashes(raw);
        assert_eq!(dashed, "c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb");

        // Already dashed strings remain unchanged
        assert_eq!(format_uuid_with_dashes(&dashed), dashed);
    }

    #[test]
    fn parses_yggdrasil_error_cleanly() {
        let err_json = r#"{"error":"ForbiddenOperationException","errorMessage":"Invalid credentials."}"#;
        let msg = parse_yggdrasil_error(reqwest::StatusCode::FORBIDDEN, err_json);
        assert_eq!(msg, "Invalid credentials.");
    }

    #[test]
    fn backward_compatible_deserialization() {
        let old_json = r#"{
            "id": "test-id",
            "accountType": "offline",
            "username": "Steve",
            "uuid": "00000000-0000-0000-0000-000000000000",
            "skinUrl": null
        }"#;
        let account: StoredAccount = serde_json::from_str(old_json).expect("should deserialize");
        assert_eq!(account.client_token, None);
        assert_eq!(account.auth_server_url, None);
    }
}
