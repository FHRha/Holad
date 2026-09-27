use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

use crate::payload;
use crate::process;
use crate::registry;
use crate::shortcuts;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub is_installed: bool,
    pub old_version: Option<String>,
    pub new_version: String,
    pub detected_path: String,
    pub default_path: String,
    pub default_music_path: String,
    pub saved_music_path: Option<String>,
    pub saved_language: Option<String>,
    pub is_autostart: bool,
    pub is_uninstall_mode: bool,
    pub saved_desktop_shortcut: Option<bool>,
    pub saved_start_menu_shortcut: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstallOptions {
    pub install_path: String,
    pub music_path: Option<String>,
    pub create_desktop_shortcut: bool,
    pub create_start_menu_shortcut: bool,
    pub enable_autostart: bool,
    pub language: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstallProgressPayload {
    pub stage: String,
    pub percent: f64,
    pub message: String,
    pub error: Option<String>,
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    let saved_settings = registry::get_saved_installer_settings();
    let detected = registry::detect_old_installation();
    let saved_lang = registry::get_saved_language().or_else(|| saved_settings.language);
    let is_autostart = saved_settings.autostart.unwrap_or_else(|| registry::is_autostart_enabled());

    let default_path = std::env::var("LOCALAPPDATA")
        .map(|p| PathBuf::from(p).join("Programs").join("Holad"))
        .unwrap_or_else(|_| PathBuf::from(r"C:\Program Files\Holad"));

    let default_music_path = std::env::var("USERPROFILE")
        .map(|p| PathBuf::from(p).join("Downloads").join("Holad"))
        .unwrap_or_else(|_| PathBuf::from(r"C:\Users\User\Downloads\Holad"));

    let saved_music_path = saved_settings
        .music_path
        .map(|p| p.to_string_lossy().to_string());

    let is_uninstall_mode = std::env::args().any(|a| {
        let l = a.to_lowercase();
        l == "--uninstall" || l == "/uninstall" || l == "-uninstall"
    }) || std::env::current_exe()
        .map(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase().contains("uninstall"))
                .unwrap_or(false)
        })
        .unwrap_or(false);

    let detected_path = saved_settings.install_path
        .map(|p| p.to_string_lossy().to_string())
        .or_else(|| detected.as_ref().map(|d| d.path.to_string_lossy().to_string()))
        .unwrap_or_default();

    let is_installed = !detected_path.is_empty();
    let old_version = detected.and_then(|d| d.version).or_else(|| if is_installed { Some("1.0.0".to_string()) } else { None });

    SystemInfo {
        is_installed,
        old_version,
        new_version: env!("CARGO_PKG_VERSION").to_string(),
        detected_path,
        default_path: default_path.to_string_lossy().to_string(),
        default_music_path: default_music_path.to_string_lossy().to_string(),
        saved_music_path,
        saved_language: saved_lang,
        is_autostart,
        is_uninstall_mode,
        saved_desktop_shortcut: saved_settings.desktop_shortcut,
        saved_start_menu_shortcut: saved_settings.start_menu_shortcut,
    }
}

#[tauri::command]
pub fn save_language(lang: String) -> Result<(), String> {
    registry::save_language(&lang)
}

#[tauri::command]
pub fn browse_folder(default_path: Option<String>) -> Option<String> {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows::core::HSTRING;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::{
            FileOpenDialog, IFileOpenDialog, IShellItem, SHCreateItemFromParsingName,
            FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
        };

        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let dialog: Result<IFileOpenDialog, _> =
            CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER);

        if let Ok(dialog) = dialog {
            let _ = dialog.SetOptions(FOS_PICKFOLDERS);

            if let Some(def) = default_path {
                let hpath = HSTRING::from(def);
                let item: Result<IShellItem, _> = SHCreateItemFromParsingName(&hpath, None);
                if let Ok(item) = item {
                    let _ = dialog.SetFolder(&item);
                }
            }

            if dialog.Show(None).is_ok() {
                if let Ok(result) = dialog.GetResult() {
                    if let Ok(pwstr) = result.GetDisplayName(SIGDN_FILESYSPATH) {
                        let path_str = pwstr.to_string().ok();
                        CoUninitialize();
                        return path_str;
                    }
                }
            }
        }
        CoUninitialize();
    }
    None
}

#[tauri::command]
pub async fn start_installation(
    app: AppHandle,
    options: InstallOptions,
    _auto_update: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target_dir = PathBuf::from(&options.install_path);

        // Stage 1: Gracefully terminate Holad
        let _ = app.emit(
            "install-progress",
            InstallProgressPayload {
                stage: "stopping".into(),
                percent: 10.0,
                message: if options.language == "ru" {
                    "Завершение процесса Holad...".into()
                } else {
                    "Closing running Holad instance...".into()
                },
                error: None,
            },
        );

        if let Err(e) = process::kill_holad_process() {
            eprintln!("Warning while terminating processes: {}", e);
        }

        // Stage 2: Extract files with granular percentage
        let _ = app.emit(
            "install-progress",
            InstallProgressPayload {
                stage: "extracting".into(),
                percent: 20.0,
                message: if options.language == "ru" {
                    "Распаковка файлов программы...".into()
                } else {
                    "Extracting files...".into()
                },
                error: None,
            },
        );

        let app_clone = app.clone();
        let lang = options.language.clone();
        let unpack_res = payload::unpack_payload(&target_dir, move |pct, file_name| {
            let mapped_percent = 20.0 + (pct * 0.55); // 20% to 75%
            let _ = app_clone.emit(
                "install-progress",
                InstallProgressPayload {
                    stage: "extracting".into(),
                    percent: mapped_percent,
                    message: if lang == "ru" {
                        format!("Распаковка: {}", file_name)
                    } else {
                        format!("Extracting: {}", file_name)
                    },
                    error: None,
                },
            );
        });

        if let Err(e) = unpack_res {
            let _ = app.emit(
                "install-progress",
                InstallProgressPayload {
                    stage: "error".into(),
                    percent: 0.0,
                    message: "Extraction failed".into(),
                    error: Some(e.clone()),
                },
            );
            return Err(e);
        }

        // Stage 3: Register in Windows Registry (Uninstall, Language, Autostart)
        let _ = app.emit(
            "install-progress",
            InstallProgressPayload {
                stage: "registry".into(),
                percent: 80.0,
                message: if options.language == "ru" {
                    "Регистрация приложения в системе...".into()
                } else {
                    "Registering application...".into()
                },
                error: None,
            },
        );

        let music_dir = options
            .music_path
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                std::env::var("USERPROFILE")
                    .map(|p| PathBuf::from(p).join("Downloads").join("Holad"))
                    .unwrap_or_else(|_| PathBuf::from(r"C:\Users\User\Downloads\Holad"))
            });

        let _ = std::fs::create_dir_all(&music_dir);
        let _ = registry::save_music_path(&music_dir);
        let _ = registry::save_language(&options.language);
        let _ = registry::set_autostart(&target_dir, options.enable_autostart);
        let _ = registry::save_installer_settings(
            &target_dir,
            &music_dir,
            options.create_desktop_shortcut,
            options.create_start_menu_shortcut,
            options.enable_autostart,
            &options.language,
        );

        // Copy current installer executable as uninstall.exe for Windows Add/Remove programs
        if let Ok(current_exe) = std::env::current_exe() {
            let uninst_path = target_dir.join("uninstall.exe");
            let _ = std::fs::copy(&current_exe, &uninst_path);
        }

        let _ = registry::register_uninstall(&target_dir, env!("CARGO_PKG_VERSION"), "Holad");

        // Stage 4: Create / Verify shortcuts
        let _ = app.emit(
            "install-progress",
            InstallProgressPayload {
                stage: "shortcuts".into(),
                percent: 90.0,
                message: if options.language == "ru" {
                    "Настройка ярлыков...".into()
                } else {
                    "Configuring shortcuts...".into()
                },
                error: None,
            },
        );

        let exe_path = target_dir.join("Holad.exe");
        if options.create_desktop_shortcut {
            // Note: will NOT overwrite if desktop lnk already exists! Preserves position.
            let _ = shortcuts::ensure_desktop_shortcut(&exe_path);
        }

        if options.create_start_menu_shortcut {
            let _ = shortcuts::ensure_start_menu_shortcut(&exe_path);
        }

        // Stage 5: Finalized
        let _ = app.emit(
            "install-progress",
            InstallProgressPayload {
                stage: "complete".into(),
                percent: 100.0,
                message: if options.language == "ru" {
                    "Установка успешно завершена!".into()
                } else {
                    "Installation completed!".into()
                },
                error: None,
            },
        );

        Ok(())
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
pub fn finish_and_exit(install_path: String, launch_app: bool) {
    if launch_app {
        let exe = PathBuf::from(install_path).join("Holad.exe");
        let _ = std::process::Command::new(exe).spawn();
    }
    std::process::exit(0);
}

#[tauri::command]
pub fn exit_app() {
    std::process::exit(0);
}

#[tauri::command]
pub fn minimize_window(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.minimize();
    }
}

#[tauri::command]
pub fn start_dragging(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.start_dragging();
    }
}

#[tauri::command]
pub async fn start_uninstallation(
    app: AppHandle,
    delete_user_data: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let saved_settings = registry::get_saved_installer_settings();
        let detected = registry::detect_old_installation();
        let target_dir = if let Ok(current_exe) = std::env::current_exe() {
            if let Some(parent) = current_exe.parent() {
                if parent.join("Holad.exe").exists() {
                    parent.to_path_buf()
                } else {
                    saved_settings
                        .install_path
                        .or_else(|| detected.map(|d| d.path))
                        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files\Holad"))
                }
            } else {
                saved_settings
                    .install_path
                    .or_else(|| detected.map(|d| d.path))
                    .unwrap_or_else(|| PathBuf::from(r"C:\Program Files\Holad"))
            }
        } else {
            saved_settings
                .install_path
                .or_else(|| detected.map(|d| d.path))
                .unwrap_or_else(|| PathBuf::from(r"C:\Program Files\Holad"))
        };

        let _ = app.emit(
            "install-progress",
            InstallProgressPayload {
                stage: "stopping".into(),
                percent: 20.0,
                message: "Closing Holad processes...".into(),
                error: None,
            },
        );

        let _ = process::kill_holad_process();

        let _ = app.emit(
            "install-progress",
            InstallProgressPayload {
                stage: "shortcuts".into(),
                percent: 50.0,
                message: "Removing shortcuts...".into(),
                error: None,
            },
        );

        shortcuts::remove_shortcuts();

        let _ = app.emit(
            "install-progress",
            InstallProgressPayload {
                stage: "registry".into(),
                percent: 75.0,
                message: "Cleaning registry entries...".into(),
                error: None,
            },
        );

        registry::remove_uninstall_and_autostart();

        if delete_user_data {
            registry::remove_user_data();
        }

        let _ = app.emit(
            "install-progress",
            InstallProgressPayload {
                stage: "complete".into(),
                percent: 100.0,
                message: "Uninstall completed".into(),
                error: None,
            },
        );

        registry::schedule_folder_cleanup(&target_dir);

        Ok(())
    })
    .await
    .map_err(|e| format!("Uninstall task error: {}", e))?
}

