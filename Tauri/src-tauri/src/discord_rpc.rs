use std::io::{Read, Write};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const DEFAULT_DISCORD_CLIENT_ID: &str = "1565974937347301436";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DiscordActivity {
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration: Option<f64>,
    pub position: Option<f64>,
    pub is_playing: bool,
    pub cover_url: Option<String>,
}

#[derive(serde::Serialize)]
struct HandshakePayload<'a> {
    v: u32,
    client_id: &'a str,
}

#[derive(serde::Serialize)]
struct SetActivityPayload<'a> {
    cmd: &'static str,
    args: ActivityArgs<'a>,
    nonce: String,
}

#[derive(serde::Serialize)]
struct ActivityArgs<'a> {
    pid: u32,
    activity: Option<ActivityPayload<'a>>,
}

#[derive(serde::Serialize)]
struct ActivityPayload<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<String>,
    #[serde(rename = "type")]
    activity_type: u32, // 2 = Listening
    #[serde(skip_serializing_if = "Option::is_none")]
    timestamps: Option<TimestampsPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    assets: Option<AssetsPayload<'a>>,
}

#[derive(serde::Serialize)]
struct TimestampsPayload {
    start: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    end: Option<u64>,
}

#[derive(serde::Serialize)]
struct AssetsPayload<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    large_image: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    large_text: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    small_image: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    small_text: Option<&'a str>,
}

enum RpcCommand {
    SetEnabled(bool),
    SetClientId(String),
    UpdateActivity(Option<DiscordActivity>),
}

enum IpcStream {
    #[cfg(target_os = "windows")]
    Windows(std::fs::File),
    #[cfg(unix)]
    Unix(std::os::unix::net::UnixStream),
}

impl Read for IpcStream {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match self {
            #[cfg(target_os = "windows")]
            IpcStream::Windows(f) => f.read(buf),
            #[cfg(unix)]
            IpcStream::Unix(s) => s.read(buf),
        }
    }
}

impl Write for IpcStream {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        match self {
            #[cfg(target_os = "windows")]
            IpcStream::Windows(f) => f.write(buf),
            #[cfg(unix)]
            IpcStream::Unix(s) => s.write(buf),
        }
    }

    fn flush(&mut self) -> std::io::Result<()> {
        match self {
            #[cfg(target_os = "windows")]
            IpcStream::Windows(f) => f.flush(),
            #[cfg(unix)]
            IpcStream::Unix(s) => s.flush(),
        }
    }
}

static RPC_TX: OnceLock<Sender<RpcCommand>> = OnceLock::new();

#[tauri::command]
pub fn set_discord_rpc_enabled(enabled: bool) {
    if let Some(tx) = RPC_TX.get() {
        let _ = tx.send(RpcCommand::SetEnabled(enabled));
    }
}

#[tauri::command]
pub fn set_discord_client_id(client_id: String) {
    if let Some(tx) = RPC_TX.get() {
        let _ = tx.send(RpcCommand::SetClientId(client_id));
    }
}

#[tauri::command]
pub fn update_discord_activity(activity: Option<DiscordActivity>) {
    if let Some(tx) = RPC_TX.get() {
        let _ = tx.send(RpcCommand::UpdateActivity(activity));
    }
}

pub fn init() {
    let (tx, rx) = channel();
    let _ = RPC_TX.set(tx);
    std::thread::Builder::new()
        .name("discord-rpc-worker".to_string())
        .spawn(move || {
            worker_loop(rx);
        })
        .expect("Failed to spawn discord-rpc-worker thread");
}

#[cfg(target_os = "windows")]
fn connect_ipc() -> std::io::Result<IpcStream> {
    for i in 0..10 {
        let path = format!(r"\\.\pipe\discord-ipc-{}", i);
        if let Ok(file) = std::fs::OpenOptions::new().read(true).write(true).open(&path) {
            return Ok(IpcStream::Windows(file));
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Discord IPC pipe not found",
    ))
}

#[cfg(unix)]
fn connect_ipc() -> std::io::Result<IpcStream> {
    let dirs = [
        std::env::var("XDG_RUNTIME_DIR").ok(),
        std::env::var("TMPDIR").ok(),
        std::env::var("TMP").ok(),
        std::env::var("TEMP").ok(),
        Some("/tmp".to_string()),
    ];
    for dir in dirs.iter().flatten() {
        for i in 0..10 {
            let path = std::path::Path::new(dir).join(format!("discord-ipc-{}", i));
            if let Ok(stream) = std::os::unix::net::UnixStream::connect(&path) {
                let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
                let _ = stream.set_write_timeout(Some(Duration::from_millis(1500)));
                return Ok(IpcStream::Unix(stream));
            }
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Discord IPC socket not found",
    ))
}

#[cfg(not(any(target_os = "windows", unix)))]
fn connect_ipc() -> std::io::Result<IpcStream> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "Platform not supported",
    ))
}

fn send_frame<W: Write>(writer: &mut W, opcode: u32, payload: &str) -> std::io::Result<()> {
    let bytes = payload.as_bytes();
    let len = bytes.len() as u32;
    writer.write_all(&opcode.to_le_bytes())?;
    writer.write_all(&len.to_le_bytes())?;
    writer.write_all(bytes)?;
    writer.flush()?;
    Ok(())
}

fn read_frame<R: Read>(reader: &mut R) -> std::io::Result<(u32, String)> {
    let mut header = [0u8; 8];
    reader.read_exact(&mut header)?;
    let opcode = u32::from_le_bytes(header[0..4].try_into().unwrap());
    let length = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
    let mut payload_bytes = vec![0u8; length];
    reader.read_exact(&mut payload_bytes)?;
    let payload = String::from_utf8(payload_bytes)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok((opcode, payload))
}

fn worker_loop(rx: Receiver<RpcCommand>) {
    let mut enabled = true;
    let mut client_id = DEFAULT_DISCORD_CLIENT_ID.to_string();
    let mut current_activity: Option<DiscordActivity> = None;
    let mut stream: Option<IpcStream> = None;
    let mut nonce = 0u64;
    let my_pid = std::process::id();

    loop {
        // Wait for next command or timeout after 15 seconds to attempt reconnect
        let cmd = match rx.recv_timeout(Duration::from_secs(15)) {
            Ok(c) => Some(c),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => None,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        };

        let mut should_update_activity = false;

        if let Some(cmd) = cmd {
            match cmd {
                RpcCommand::SetEnabled(e) => {
                    if enabled != e {
                        enabled = e;
                        if !enabled {
                            if let Some(mut s) = stream.take() {
                                nonce += 1;
                                let clear_payload = SetActivityPayload {
                                    cmd: "SET_ACTIVITY",
                                    args: ActivityArgs {
                                        pid: my_pid,
                                        activity: None,
                                    },
                                    nonce: nonce.to_string(),
                                };
                                if let Ok(json) = serde_json::to_string(&clear_payload) {
                                    let _ = send_frame(&mut s, 1, &json);
                                }
                            }
                            log::info!("[DiscordRPC] Discord Rich Presence disabled");
                            continue;
                        } else {
                            log::info!("[DiscordRPC] Discord Rich Presence enabled");
                            should_update_activity = true;
                        }
                    }
                }
                RpcCommand::SetClientId(new_id) => {
                    let target_id = if new_id.trim().is_empty() {
                        DEFAULT_DISCORD_CLIENT_ID.to_string()
                    } else {
                        new_id.trim().to_string()
                    };
                    if client_id != target_id {
                        client_id = target_id;
                        log::info!("[DiscordRPC] Client ID updated to: {}", client_id);
                        if let Some(mut s) = stream.take() {
                            nonce += 1;
                            let clear_payload = SetActivityPayload {
                                cmd: "SET_ACTIVITY",
                                args: ActivityArgs {
                                    pid: my_pid,
                                    activity: None,
                                },
                                nonce: nonce.to_string(),
                            };
                            if let Ok(json) = serde_json::to_string(&clear_payload) {
                                let _ = send_frame(&mut s, 1, &json);
                            }
                        }
                        should_update_activity = true;
                    }
                }
                RpcCommand::UpdateActivity(act) => {
                    current_activity = act;
                    should_update_activity = true;
                }
            }
        }

        if !enabled {
            continue;
        }

        let has_active_playback = current_activity.as_ref().map_or(false, |a| a.is_playing);

        // If disconnected and user is playing, attempt connection
        if stream.is_none() && has_active_playback {
            match connect_ipc() {
                Ok(mut s) => {
                    let hs = HandshakePayload {
                        v: 1,
                        client_id: &client_id,
                    };
                    if let Ok(hs_json) = serde_json::to_string(&hs) {
                        if send_frame(&mut s, 0, &hs_json).is_ok() {
                            if let Ok((op, _)) = read_frame(&mut s) {
                                if op == 1 {
                                    log::info!("[DiscordRPC] Connected to Discord with client_id {}", client_id);
                                    stream = Some(s);
                                    should_update_activity = true;
                                } else {
                                    log::warn!(
                                        "[DiscordRPC] Unexpected handshake response opcode: {}",
                                        op
                                    );
                                }
                            }
                        }
                    }
                }
                Err(_) => {
                    // Discord not running or pipe not available
                }
            }
        }

        // Send activity update when changed/commanded
        if should_update_activity {
            if let Some(ref mut s) = stream {
                nonce += 1;
                let now_secs = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                // If activity exists AND is playing, construct listening presence.
                // If stopped/paused (or None), activity_payload is None, which clears Discord presence!
                let activity_payload = match current_activity.as_ref() {
                    Some(act) if act.is_playing => {
                        let pos_sec = act.position.unwrap_or(0.0).max(0.0) as u64;
                        let start = now_secs.saturating_sub(pos_sec);
                        let end = act.duration.filter(|d| *d > 0.0).map(|d| start + (d as u64));
                        let album_ref = act.album.as_deref().unwrap_or("Holad");

                        Some(ActivityPayload {
                            details: Some(&act.title),
                            state: Some(act.artist.clone()),
                            activity_type: 2, // Listening
                            timestamps: Some(TimestampsPayload { start, end }),
                            assets: Some(AssetsPayload {
                                large_image: act.cover_url.as_deref().filter(|u| u.starts_with("http")).or(Some("logo")),
                                large_text: Some(album_ref),
                                small_image: Some("play"),
                                small_text: Some("Holad"),
                            }),
                        })
                    }
                    _ => None,
                };

                let payload = SetActivityPayload {
                    cmd: "SET_ACTIVITY",
                    args: ActivityArgs {
                        pid: my_pid,
                        activity: activity_payload,
                    },
                    nonce: nonce.to_string(),
                };

                let send_res = serde_json::to_string(&payload)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
                    .and_then(|json| send_frame(s, 1, &json));

                if let Err(e) = send_res {
                    log::warn!(
                        "[DiscordRPC] Failed to send activity to Discord: {:?}, disconnecting",
                        e
                    );
                    stream = None;
                } else if let Err(e) = read_frame(s) {
                    log::warn!(
                        "[DiscordRPC] Failed to read activity response: {:?}, disconnecting",
                        e
                    );
                    stream = None;
                }
            }
        }
    }
}
