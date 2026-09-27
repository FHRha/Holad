use std::path::{Path, PathBuf};
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
use winreg::RegKey;

#[derive(Debug, Clone)]
pub struct DetectedInstallation {
    pub path: PathBuf,
    pub version: Option<String>,
}

/// Helper function to clean quotes and trailing commas (e.g. from DisplayIcon "C:\path\Holad.exe,0")
fn clean_raw_path(raw: &str) -> PathBuf {
    let unquoted = raw.trim().trim_matches('"');
    let path_str = if let Some((before_comma, _)) = unquoted.split_once(',') {
        before_comma.trim()
    } else {
        unquoted
    };
    PathBuf::from(path_str)
}

/// Extracts the installation folder from a path that might point directly to an exe or directory
fn extract_directory_from_candidate(candidate: PathBuf) -> Option<PathBuf> {
    if candidate.is_dir() {
        if candidate.join("Holad.exe").is_file() {
            return Some(candidate);
        }
        return Some(candidate);
    }
    if candidate.is_file() {
        if let Some(parent) = candidate.parent() {
            return Some(parent.to_path_buf());
        }
    }
    None
}

/// Detects previous installation location and version from HKCU and HKLM uninstall entries (WiX/NSIS/Tauri)
pub fn detect_old_installation() -> Option<DetectedInstallation> {
    let uninstall_subkeys = [
        r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Holad",
        r"Software\Microsoft\Windows\CurrentVersion\Uninstall\com.holad.desktop",
        r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Holad_is1",
    ];

    let hives = [
        (RegKey::predef(HKEY_CURRENT_USER), "HKCU"),
        (RegKey::predef(HKEY_LOCAL_MACHINE), "HKLM"),
    ];

    for (hive, _) in &hives {
        for subkey_path in &uninstall_subkeys {
            if let Ok(key) = hive.open_subkey_with_flags(subkey_path, KEY_READ) {
                let display_version: Option<String> = key.get_value("DisplayVersion").ok();

                // 1. Check InstallLocation
                if let Ok(loc) = key.get_value::<String, _>("InstallLocation") {
                    let cleaned = clean_raw_path(&loc);
                    if let Some(dir) = extract_directory_from_candidate(cleaned) {
                        return Some(DetectedInstallation {
                            path: dir,
                            version: display_version,
                        });
                    }
                }

                // 2. Check DisplayIcon
                if let Ok(icon) = key.get_value::<String, _>("DisplayIcon") {
                    let cleaned = clean_raw_path(&icon);
                    if let Some(dir) = extract_directory_from_candidate(cleaned) {
                        return Some(DetectedInstallation {
                            path: dir,
                            version: display_version,
                        });
                    }
                }

                // 3. Check UninstallString
                if let Ok(uninst) = key.get_value::<String, _>("UninstallString") {
                    let cleaned = clean_raw_path(&uninst);
                    if let Some(dir) = extract_directory_from_candidate(cleaned) {
                        return Some(DetectedInstallation {
                            path: dir,
                            version: display_version,
                        });
                    }
                }
            }
        }
    }

    // Fallback: Check standard locations on disk
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let p = PathBuf::from(local_app_data).join("Programs").join("Holad");
        if p.join("Holad.exe").is_file() {
            return Some(DetectedInstallation {
                path: p,
                version: None,
            });
        }
    }

    if let Ok(program_files) = std::env::var("ProgramFiles") {
        let p = PathBuf::from(program_files).join("Holad");
        if p.join("Holad.exe").is_file() {
            return Some(DetectedInstallation {
                path: p,
                version: None,
            });
        }
    }

    None
}

/// Reads the saved language from HKCU\Software\Holad\Language ("en" | "ru")
pub fn get_saved_language() -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey_with_flags(r"Software\Holad", KEY_READ) {
        if let Ok(lang) = key.get_value::<String, _>("Language") {
            let trimmed = lang.trim().to_lowercase();
            if trimmed == "ru" || trimmed == "en" {
                return Some(trimmed);
            }
        }
    }
    None
}

/// Saves the language to HKCU\Software\Holad\Language and HKCU\Software\Holad\Installer\Language
pub fn save_language(lang: &str) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(r"Software\Holad")
        .map_err(|e| format!("Failed to open HKCU\\Software\\Holad: {}", e))?;
    key.set_value("Language", &lang)
        .map_err(|e| format!("Failed to set Language registry value: {}", e))?;

    if let Ok((installer_key, _)) = hkcu.create_subkey(r"Software\Holad\Installer") {
        let _ = installer_key.set_value("Language", &lang);
    }

    Ok(())
}

/// Checks whether autostart is currently enabled in HKCU\Software\Microsoft\Windows\CurrentVersion\Run
pub fn is_autostart_enabled() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run_key) =
        hkcu.open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_READ)
    {
        return run_key.get_value::<String, _>("Holad").is_ok();
    }
    false
}

/// Manages Windows autostart:
/// Writes or deletes "Holad" = "\"<path>\Holad.exe\" --autostart" in HKCU\...\Run.
/// Matches the format of tauri-plugin-autostart exactly.
pub fn set_autostart(install_dir: &Path, enable: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = hkcu
        .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
        .map_err(|e| format!("Failed to open Run registry key: {}", e))?;

    if enable {
        let exe_path = install_dir.join("Holad.exe");
        let command_str = format!("\"{}\" --autostart", exe_path.to_string_lossy());
        run_key
            .set_value("Holad", &command_str)
            .map_err(|e| format!("Failed to set Run entry: {}", e))?;
    } else {
        let _ = run_key.delete_value("Holad");
    }
    Ok(())
}

#[derive(Debug, Clone, Default)]
pub struct SavedInstallerSettings {
    pub install_path: Option<PathBuf>,
    pub music_path: Option<PathBuf>,
    pub desktop_shortcut: Option<bool>,
    pub start_menu_shortcut: Option<bool>,
    pub autostart: Option<bool>,
    pub language: Option<String>,
}

/// Reads the saved music download path from HKCU\Software\Holad\MusicPath or Installer\MusicPath
pub fn get_saved_music_path() -> Option<PathBuf> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey_with_flags(r"Software\Holad", KEY_READ) {
        if let Ok(p) = key.get_value::<String, _>("MusicPath") {
            let trimmed = p.trim();
            if !trimmed.is_empty() {
                return Some(PathBuf::from(trimmed));
            }
        }
    }
    if let Ok(key) = hkcu.open_subkey_with_flags(r"Software\Holad\Installer", KEY_READ) {
        if let Ok(p) = key.get_value::<String, _>("MusicPath") {
            let trimmed = p.trim();
            if !trimmed.is_empty() {
                return Some(PathBuf::from(trimmed));
            }
        }
    }
    None
}

/// Saves the music download path to HKCU\Software\Holad\MusicPath and HKCU\Software\Holad\Installer\MusicPath
pub fn save_music_path(path: &Path) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path_str = path.to_string_lossy().to_string();

    let (key, _) = hkcu
        .create_subkey(r"Software\Holad")
        .map_err(|e| format!("Failed to open HKCU\\Software\\Holad: {}", e))?;
    let _ = key.set_value("MusicPath", &path_str);

    if let Ok((inst_key, _)) = hkcu.create_subkey(r"Software\Holad\Installer") {
        let _ = inst_key.set_value("MusicPath", &path_str);
    }

    Ok(())
}

/// Saves user's installer choices to HKCU\Software\Holad\Installer
pub fn save_installer_settings(
    install_dir: &Path,
    music_dir: &Path,
    desktop_shortcut: bool,
    start_menu_shortcut: bool,
    autostart: bool,
    language: &str,
) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(r"Software\Holad\Installer")
        .map_err(|e| format!("Failed to open HKCU\\Software\\Holad\\Installer: {}", e))?;

    let _ = key.set_value("InstallPath", &install_dir.to_string_lossy().to_string());
    let _ = key.set_value("MusicPath", &music_dir.to_string_lossy().to_string());
    let _ = key.set_value("DesktopShortcut", &(desktop_shortcut as u32));
    let _ = key.set_value("StartMenuShortcut", &(start_menu_shortcut as u32));
    let _ = key.set_value("Autostart", &(autostart as u32));
    let _ = key.set_value("Language", &language);

    let _ = save_music_path(music_dir);
    Ok(())
}

/// Retrieves saved installer choices from HKCU\Software\Holad\Installer
pub fn get_saved_installer_settings() -> SavedInstallerSettings {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey_with_flags(r"Software\Holad\Installer", KEY_READ) {
        let install_path = key
            .get_value::<String, _>("InstallPath")
            .ok()
            .map(PathBuf::from);
        let music_path = key
            .get_value::<String, _>("MusicPath")
            .ok()
            .map(PathBuf::from)
            .or_else(get_saved_music_path);
        let desktop_shortcut = key
            .get_value::<u32, _>("DesktopShortcut")
            .ok()
            .map(|v| v != 0);
        let start_menu_shortcut = key
            .get_value::<u32, _>("StartMenuShortcut")
            .ok()
            .map(|v| v != 0);
        let autostart = key
            .get_value::<u32, _>("Autostart")
            .ok()
            .map(|v| v != 0);
        let language = key.get_value::<String, _>("Language").ok();

        SavedInstallerSettings {
            install_path,
            music_path,
            desktop_shortcut,
            start_menu_shortcut,
            autostart,
            language,
        }
    } else {
        SavedInstallerSettings {
            music_path: get_saved_music_path(),
            ..Default::default()
        }
    }
}


/// Registers the application in Windows "Installed Apps" (Add/Remove Programs)
pub fn register_uninstall(install_dir: &Path, version: &str, display_name: &str) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (uninst_key, _) = hkcu
        .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Holad")
        .map_err(|e| format!("Failed to open Uninstall registry key: {}", e))?;

    let exe_path = install_dir.join("Holad.exe");
    let uninst_exe = install_dir.join("uninstall.exe");
    let display_icon = format!("\"{}\",0", exe_path.to_string_lossy());
    let uninst_string = format!("\"{}\"", uninst_exe.to_string_lossy());
    let quiet_uninst = format!("\"{}\" --silent", uninst_exe.to_string_lossy());

    let _ = uninst_key.set_value("DisplayName", &display_name);
    let _ = uninst_key.set_value("DisplayVersion", &version);
    let _ = uninst_key.set_value("Publisher", &"FHRha");
    let _ = uninst_key.set_value("InstallLocation", &install_dir.to_string_lossy().to_string());
    let _ = uninst_key.set_value("DisplayIcon", &display_icon);
    let _ = uninst_key.set_value("UninstallString", &uninst_string);
    let _ = uninst_key.set_value("QuietUninstallString", &quiet_uninst);
    let _ = uninst_key.set_value("NoModify", &1u32);
    let _ = uninst_key.set_value("NoRepair", &1u32);
    let _ = uninst_key.set_value("EstimatedSize", &55000u32);

    Ok(())
}

/// Cleans up Uninstall and Run registry entries upon uninstallation
pub fn remove_uninstall_and_autostart() {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run_key) = hkcu.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        winreg::enums::KEY_WRITE,
    ) {
        let _ = run_key.delete_value("Holad");
    }
    let _ = hkcu.delete_subkey(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Holad");
    let _ = hkcu.delete_subkey(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\com.holad.desktop");
    let _ = hkcu.delete_subkey(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Holad_is1");
    let _ = hkcu.delete_subkey_all(r"Software\Holad\Installer");
}

/// Removes user data directories in %APPDATA%, %LOCALAPPDATA%, and music download folder if requested
pub fn remove_user_data() {
    // 1. Clean downloaded music folder
    if let Some(music_path) = get_saved_music_path().or_else(|| {
        std::env::var("USERPROFILE")
            .ok()
            .map(|p| PathBuf::from(p).join("Downloads").join("Holad"))
    }) {
        if music_path.exists() {
            let path_str = music_path.to_string_lossy().to_lowercase();
            let is_root = music_path.parent().is_none() || path_str.len() <= 3;
            let is_downloads_root = std::env::var("USERPROFILE")
                .map(|p| PathBuf::from(p).join("Downloads"))
                .map(|p| p == music_path)
                .unwrap_or(false);

            if !is_root && !is_downloads_root {
                let _ = std::fs::remove_dir_all(&music_path);
            }
        }
    }

    if let Ok(app_data) = std::env::var("APPDATA") {
        let _ = std::fs::remove_dir_all(PathBuf::from(&app_data).join("Holad"));
        let _ = std::fs::remove_dir_all(PathBuf::from(&app_data).join("com.holad.desktop"));
    }
    if let Ok(local_data) = std::env::var("LOCALAPPDATA") {
        let _ = std::fs::remove_dir_all(PathBuf::from(&local_data).join("Holad"));
        let _ = std::fs::remove_dir_all(PathBuf::from(&local_data).join("com.holad.desktop"));
    }
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey_all(r"Software\Holad");
}

/// Schedules deletion of the remaining installation directory in the background
pub fn schedule_folder_cleanup(install_dir: &Path) {
    if !install_dir.exists() {
        return;
    }
    // Delete non-locked files first
    if let Ok(current_exe) = std::env::current_exe() {
        if let Ok(entries) = std::fs::read_dir(install_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                let is_self = p.file_name()
                    .and_then(|n| current_exe.file_name().map(|c| n.eq_ignore_ascii_case(c)))
                    .unwrap_or(false);
                if !is_self {
                    if p.is_dir() {
                        let _ = std::fs::remove_dir_all(&p);
                    } else {
                        let _ = std::fs::remove_file(&p);
                    }
                }
            }
        }
    }

    let pid = std::process::id();
    let escaped_path = install_dir.to_string_lossy().replace('\'', "''");

    // Safety: if install_dir is drive root (e.g. "C:\" or "E:\"), NEVER delete root!
    let is_root = install_dir.parent().is_none() || install_dir.to_string_lossy().len() <= 3;
    let delete_command = if is_root {
        format!("Get-ChildItem -LiteralPath '{}' -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue", escaped_path)
    } else {
        format!("for ($i=0; $i -lt 5; $i++) {{ if (Test-Path -LiteralPath '{0}') {{ Remove-Item -LiteralPath '{0}' -Recurse -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400 }} else {{ break }} }}", escaped_path)
    };

    let script = format!(
        "Wait-Process -Id {} -Timeout 60 -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400; {}",
        pid, delete_command
    );

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let temp_dir = std::env::temp_dir();
        let _ = std::process::Command::new("powershell.exe")
            .current_dir(temp_dir)
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
}


