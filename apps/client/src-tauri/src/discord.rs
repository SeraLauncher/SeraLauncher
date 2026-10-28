//! discord rich presence over the local ipc pipe. best effort by design: every
//! failure is logged and swallowed so the launcher never waits on discord.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::OnceLock;
use std::time::Duration;

use discord_rich_presence::activity::{Activity, Assets, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};

use crate::auth;
use crate::minecraft::RunningInstanceInfo;

const CLIENT_ID: &str = "965102016810594334";
const LARGE_IMAGE: &str = "seralogo";
const LARGE_TEXT: &str = "Sera launcher";
const SMALL_IMAGE: &str = "dotlogo";
const IDLE_DETAILS: &str = "Playing Sera";
const WORLD_SINGLEPLAYER: &str = "Playing in Survival World";
const WORLD_MULTIPLAYER: &str = "Playing in a Server";

/// discord caps the rendered fields at 128 chars on the wire
const MAX_FIELD_LEN: usize = 128;

/// worker refresh cadence; doubles as the retry interval while discord is closed.
const TICK: Duration = Duration::from_secs(30);

/// long-lived config mirror, refreshed whenever settings change.
static ENABLED: AtomicBool = AtomicBool::new(true);
static DETAILED: AtomicBool = AtomicBool::new(true);

/// the funnel from the rest of the app; the worker owns every piece of presence
/// state, so callers stay lock-free.
enum Msg {
    SessionStart(RunningInstanceInfo),
    SessionExit(String),
    /// instance id plus the in-game label; none clears the world status because the
    /// player left the world rather than the instance.
    SessionLine(String, Option<&'static str>),
    Navigation(Option<String>),
    Refresh,
    Shutdown,
}

static CHANNEL: OnceLock<Sender<Msg>> = OnceLock::new();

fn post(msg: Msg) {
    if let Some(sender) = CHANNEL.get() {
        // a dead worker just means no presence; never block the launcher
        let _ = sender.send(msg);
    }
}

pub fn init(app: tauri::AppHandle) {
    std::thread::spawn(move || run_worker(app));
}

/// mirrors written settings into the worker and triggers an immediate recalc.
pub fn set_config(enabled: bool, detailed: bool) {
    ENABLED.store(enabled, Ordering::Relaxed);
    DETAILED.store(detailed, Ordering::Relaxed);
    post(Msg::Refresh);
}

/// the current launcher navigation label, none when on a page with no presence.
pub fn set_navigation(label: Option<String>) {
    post(Msg::Navigation(label.map(truncate)));
}

pub fn session_started(mut info: RunningInstanceInfo) {
    info.name = truncate(info.name);
    info.mc_version = truncate(info.mc_version);
    post(Msg::SessionStart(info));
}

pub fn session_exit(id: &str) {
    post(Msg::SessionExit(id.to_string()));
}

pub fn shutdown() {
    post(Msg::Shutdown);
}

/// lets any state change trigger an immediate recalc (config writes, account swap).
pub fn refresh() {
    post(Msg::Refresh);
}

/// session log anchors verified against captured vanilla + fabric session logs on
/// this machine: singleplayer joins spawn the integrated server, multiplayer joins
/// print `Connecting to <host>, <port>`, singleplayer leave reports the logout.
fn classify_session_line(line: &str) -> Option<&'static str> {
    if line.contains("Starting integrated minecraft server") {
        Some(WORLD_SINGLEPLAYER)
    } else if line.contains("Connecting to") {
        Some(WORLD_MULTIPLAYER)
    } else if line.contains("Stopping singleplayer server") {
        Some("")
    } else {
        None
    }
}

/// the funnel for an instance's session log lines; anchors are rare, so unrelated
/// log chatter costs one substring scan and never reaches the worker.
pub fn note_session_log_line(id: &str, line: &str) {
    let Some(event) = classify_session_line(line) else {
        return;
    };
    let label = if event.is_empty() { None } else { Some(event) };
    post(Msg::SessionLine(id.to_string(), label));
}

fn truncate(value: String) -> String {
    if value.chars().count() > MAX_FIELD_LEN {
        value.chars().take(MAX_FIELD_LEN).collect()
    } else {
        value
    }
}

fn now_unix() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// what the presence should render, derived purely from state; the newest session
/// wins and a live game always beats navigation labels. `launcher_started_at` backs
/// the idle timer, so refreshing details never resets the elapsed clock.
fn render_presence(
    sessions: &HashMap<String, RunningInstanceInfo>,
    worlds: &HashMap<String, String>,
    nav: &Option<String>,
    detailed: bool,
    launcher_started_at: u64,
) -> Option<(String, Option<String>, Option<u64>)> {
    match sessions.values().max_by_key(|s| s.started_at) {
        Some(session) => {
            let state = if detailed {
                worlds.get(&session.id).cloned()
            } else {
                None
            }
            .filter(|s| !s.is_empty())
            .or_else(|| Some(session.mc_version.clone()));
            Some((session.name.clone(), state, Some(session.started_at)))
        }
        None => {
            let state = detailed.then(|| nav.clone()).flatten();
            Some((IDLE_DETAILS.to_string(), state, Some(launcher_started_at)))
        }
    }
}

/// what was last put on the wire; equality against the freshly rendered presence
/// means a stream of unrelated log lines never re-punches the ipc.
#[derive(PartialEq, Clone, Debug)]
struct Sent {
    details: String,
    state: Option<String>,
    started_at: Option<u64>,
}

struct Worker {
    app: tauri::AppHandle,
    client: Option<DiscordIpcClient>,
    /// none means nothing currently shown
    sent: Option<Sent>,
    /// re-arm after every reconnect or pipe loss, so a fresh discord re-receives us
    needs_send: bool,
}

impl Worker {
    fn sync(
        &mut self,
        sessions: &HashMap<String, RunningInstanceInfo>,
        worlds: &HashMap<String, String>,
        nav: &Option<String>,
        launcher_started_at: u64,
    ) {
        if !ENABLED.load(Ordering::Relaxed) {
            self.clear();
            return;
        }

        let detailed = DETAILED.load(Ordering::Relaxed);
        let Some((details, state, started_at)) =
            render_presence(sessions, worlds, nav, detailed, launcher_started_at)
        else {
            self.clear();
            return;
        };

        let want = Sent {
            details,
            state,
            started_at,
        };
        if self.sent.as_ref() == Some(&want) && !self.needs_send {
            trace(&format!("sync skip {want:?}"));
            return;
        }
        trace(&format!(
            "sync send details={:?} state={:?} started_at={:?} (was {:?})",
            want.details, want.state, want.started_at, self.sent
        ));

        let account = auth::get_active_account_info(&self.app)
            .ok()
            .flatten()
            .map(|acc| truncate(acc.username));

        if self.apply(&want, account) {
            self.sent = Some(want);
            self.needs_send = false;
        } else {
            // lost mid-update: the stale `sent` must never short-circuit the next tick
            self.needs_send = true;
        }
    }

    /// true when the wire now reflects `want`
    fn apply(&mut self, want: &Sent, account: Option<String>) -> bool {
        // take the socket so a failed send can drop it wholesale
        let mut live = self
            .client
            .take()
            .or_else(|| match DiscordIpcClient::new(CLIENT_ID) {
                mut fresh => match fresh.connect() {
                    Ok(()) => {
                        self.needs_send = true;
                        trace("connected to discord ipc");
                        Some(fresh)
                    }
                    Err(err) => {
                        eprintln!("sera-dcrp: discord ipc unavailable: {err}");
                        None
                    }
                },
            });

        let sent = 'send: {
            let Some(ref mut client) = live else {
                break 'send false;
            };
            let mut activity = Activity::new().details(want.details.as_str()).assets(
                Assets::new()
                    .large_image(LARGE_IMAGE)
                    .large_text(LARGE_TEXT)
                    .small_image(SMALL_IMAGE)
                    .small_text(account.as_deref().unwrap_or(LARGE_TEXT)),
            );
            if let Some(state) = want.state.as_deref() {
                activity = activity.state(state);
            }
            if let Some(started_at) = want.started_at {
                // unix seconds; the elapsed timer discord renders counts from this
                activity = activity.timestamps(Timestamps::new().start(started_at as i64));
            }
            match client.set_activity(activity) {
                Ok(()) => {
                    trace("set_activity ok");
                    break 'send true;
                }
                Err(err) => {
                    eprintln!("sera-dcrp: discord set_activity failed, dropping pipe: {err}");
                    break 'send false;
                }
            }
        };

        // a failed send drops the client entirely; the next tick reconnects and resends
        self.client = sent.then_some(live).flatten();
        sent
    }

    fn clear(&mut self) {
        if self.sent.is_some() {
            if let Some(ref mut client) = self.client {
                if client.clear_activity().is_ok() {
                    self.sent = None;
                } else {
                    // discord drops the presence itself when the pipe dies anyway
                    eprintln!("sera: discord clear_activity failed, dropping pipe");
                    self.client = None;
                    self.sent = None;
                }
            }
        }
    }
}

/// terminal-only traces so a misbehaving wire can be followed live; compiled out
/// of release builds.
fn trace(msg: &str) {
    if cfg!(debug_assertions) {
        eprintln!("sera-dcrp: {msg}");
    }
}

fn trace_msg(msg: &Msg) {
    if !cfg!(debug_assertions) {
        return;
    }
    let label = match msg {
        Msg::SessionStart(info) => format!("session start {}", info.name),
        Msg::SessionLine(id, label) => format!("session line {id} {label:?}"),
        Msg::SessionExit(id) => format!("session exit {id}"),
        Msg::Navigation(label) => format!("nav {label:?}"),
        Msg::Refresh => "refresh (tick)".to_string(),
        Msg::Shutdown => "shutdown".to_string(),
    };
    eprintln!("sera-dcrp: {label}");
}

fn run_worker(app: tauri::AppHandle) {
    let (tx, rx) = channel::<Msg>();
    let _ = CHANNEL.set(tx);

    let mut worker = Worker {
        app,
        client: None,
        sent: None,
        needs_send: false,
    };
    let mut sessions: HashMap<String, RunningInstanceInfo> = HashMap::new();
    let mut worlds: HashMap<String, String> = HashMap::new();
    let mut nav: Option<String> = None;
    // one fixed start for the launcher's own elapsed timer; detail refreshes and
    // tab switches never move it
    let launcher_started_at = now_unix();
    trace("worker started");

    loop {
        let msg = match rx.recv_timeout(TICK) {
            Ok(msg) => msg,
            Err(RecvTimeoutError::Timeout) => Msg::Refresh,
            Err(RecvTimeoutError::Disconnected) => break,
        };
        trace_msg(&msg);

        match msg {
            Msg::SessionStart(info) => {
                sessions.insert(info.id.clone(), info);
            }
            Msg::SessionLine(id, label) => match label {
                Some(label) => {
                    worlds.insert(id, label.to_string());
                }
                // player left the world; the session itself is still alive
                None => {
                    worlds.remove(&id);
                }
            },
            Msg::SessionExit(id) => {
                sessions.remove(&id);
                worlds.remove(&id);
            }
            Msg::Navigation(label) => nav = label,
            // static payloads never change on their own, so the tick re-punches
            // the wire and keeps the elapsed timer fresh like a real game client
            Msg::Refresh => worker.needs_send = true,
            Msg::Shutdown => {
                worker.clear();
                if let Some(ref mut client) = worker.client {
                    let _ = client.close();
                }
                break;
            }
        }

        worker.sync(&sessions, &worlds, &nav, launcher_started_at);
    }
    trace("worker stopped");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(id: &str, name: &str, version: &str, started_at: u64) -> RunningInstanceInfo {
        RunningInstanceInfo {
            id: id.into(),
            name: name.into(),
            mc_version: version.into(),
            started_at,
        }
    }

    #[test]
    fn idle_without_navigation_leads_with_the_launcher() {
        let (details, state, ts) =
            render_presence(&HashMap::new(), &HashMap::new(), &None, true, 777).unwrap();
        assert_eq!(details, "Playing Sera");
        assert_eq!(state, None);
        // the launcher's own clock backs the idle presence, stable across refreshes
        assert_eq!(ts, Some(777));
    }

    #[test]
    fn detailed_navigation_surfaces_as_state() {
        let (details, state, ts) = render_presence(
            &HashMap::new(),
            &HashMap::new(),
            &Some("Searching Mods".into()),
            true,
            777,
        )
        .unwrap();
        assert_eq!(details, "Playing Sera");
        assert_eq!(state, Some("Searching Mods".into()));
        assert_eq!(ts, Some(777));
    }

    #[test]
    fn the_detailed_toggle_hides_navigation() {
        let (_, state, _) = render_presence(
            &HashMap::new(),
            &HashMap::new(),
            &Some("Searching Mods".into()),
            false,
            777,
        )
        .unwrap();
        assert_eq!(state, None);
    }

    #[test]
    fn the_newest_running_game_takes_over_the_presence() {
        let sessions = HashMap::from([
            ("a".into(), session("a", "Single Alpha", "1.21.11", 1000)),
            ("b".into(), session("b", "Beta", "1.20.4", 2000)),
        ]);
        let (details, state, ts) = render_presence(
            &sessions,
            &HashMap::new(),
            &Some("Searching Mods".into()),
            true,
            777,
        )
        .unwrap();
        assert_eq!(details, "Beta");
        assert_eq!(state, Some("1.20.4".into()));
        assert_eq!(ts, Some(2000));
    }

    #[test]
    fn world_status_overrides_the_version_when_detailed() {
        let sessions = HashMap::from([("a".into(), session("a", "Pack", "1.21.11", 3000))]);
        let worlds = HashMap::from([("a".into(), WORLD_MULTIPLAYER.into())]);

        let (_, state, ts) = render_presence(&sessions, &worlds, &None, true, 777).unwrap();
        assert_eq!(state, Some("Playing in a Server".into()));
        assert_eq!(ts, Some(3000));

        // granular in-game labels sit behind the same detailed toggle
        let (_, state, _) = render_presence(&sessions, &worlds, &None, false, 777).unwrap();
        assert_eq!(state, Some("1.21.11".into()));
    }

    #[test]
    fn leaving_a_world_falls_back_to_the_version() {
        let sessions = HashMap::from([("a".into(), session("a", "Pack", "1.21.11", 3000))]);
        let (_, state, _) = render_presence(&sessions, &HashMap::new(), &None, true, 777).unwrap();
        assert_eq!(state, Some("1.21.11".into()));
    }

    #[test]
    fn real_log_anchors_classify() {
        assert_eq!(
            classify_session_line("[01:27:40] [Server thread/INFO]: Starting integrated minecraft server version 1.21.11"),
            Some(WORLD_SINGLEPLAYER)
        );
        assert_eq!(
            classify_session_line(
                "[09:11:46] [Render thread/INFO]: Connecting to staticpvp.fun, 25565"
            ),
            Some(WORLD_MULTIPLAYER)
        );
        assert_eq!(
            classify_session_line("[01:34:05] [Server thread/INFO]: Stopping singleplayer server as player logged out"),
            Some("")
        );
        assert_eq!(
            classify_session_line("[authlib-injector] [INFO] Authentication server: https://littleskin.cn/api/yggdrasil"),
            None
        );
        assert_eq!(classify_session_line("[System] [CHAT] hello world"), None);
        // the leave anchor stops announcing a world instead of killing the session
        assert_eq!(note_session_log_line("a", "[x] Connecting to test"), ());
    }
}
