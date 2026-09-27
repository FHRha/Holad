mod taskbar;
mod audio_session;
mod updater;
use std::sync::Mutex;
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::Manager;
use tauri::State;
use tauri::Emitter;

struct AppConfig {
    close_to_tray: Mutex<bool>,
}

#[tauri::command]
fn sync_audio_session() {
    #[cfg(target_os = "windows")]
    audio_session::windows_audio::trigger_sync_burst();
}

#[tauri::command]
fn get_audio_output_device() -> Option<audio_session::NativeAudioDevice> {
    #[cfg(target_os = "windows")]
    {
        audio_session::windows_audio::get_default_audio_device()
    }
    #[cfg(target_os = "linux")]
    {
        audio_session::linux_audio::get_default_audio_device()
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        None
    }
}

#[tauri::command]
fn is_autostart_launch() -> bool {
    std::env::args().any(|arg| arg == "--autostart")
}

#[tauri::command]
fn set_close_to_tray(config: State<'_, AppConfig>, enabled: bool) {
    *config.close_to_tray.lock().unwrap() = enabled;
}

#[tauri::command]
fn quit_app() {
    std::process::exit(0);
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit("window-visibility-change", true);
    }
}

const ICON_WAVE_DARK: &[u8] = include_bytes!("../../../client/public/icons/favicon_dark.png");
const ICON_WAVE_LIGHT: &[u8] = include_bytes!("../../../client/public/icons/favicon_light.png");
const ICON_CASSETTE: &[u8] = include_bytes!("../../../client/public/icons/logo_cassette.png");

#[tauri::command]
fn set_app_icon(app: tauri::AppHandle, icon: String) -> Result<(), String> {
    let bytes = match icon.as_str() {
        "wave_light" => ICON_WAVE_LIGHT,
        "cassette" => ICON_CASSETTE,
        _ => ICON_WAVE_DARK,
    };
    let img = tauri::image::Image::from_bytes(bytes).map_err(|e| e.to_string())?;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_icon(img.clone());
    }
    if let Some(window) = app.get_webview_window("tray_menu") {
        let _ = window.set_icon(img.clone());
    }
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_icon(Some(img));
    }

    #[cfg(target_os = "windows")]
    {
        audio_session::windows_audio::set_current_icon(&icon);
    }

    Ok(())
}

#[tauri::command]
fn set_app_language(language: String) -> Result<(), String> {
    let normalized = if language.to_lowercase().starts_with("ru") {
        "ru"
    } else {
        "en"
    };

    #[cfg(target_os = "windows")]
    {
        use windows::core::w;
        use windows::Win32::System::Registry::{
            RegCreateKeyW, RegSetValueExW, RegCloseKey, HKEY_CURRENT_USER, REG_SZ, HKEY,
        };
        use std::os::windows::ffi::OsStrExt;

        unsafe {
            let mut hkey = HKEY::default();
            let subkey = w!(r"Software\Holad");
            let status = RegCreateKeyW(
                HKEY_CURRENT_USER,
                subkey,
                &mut hkey,
            );
            if status.is_err() {
                log::warn!("RegCreateKeyW failed: {:?}", status);
                return Err(format!("RegCreateKeyW failed: {:?}", status));
            }

            let val_name = w!("Language");
            let wide_val: Vec<u16> = std::ffi::OsStr::new(normalized)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let byte_slice = std::slice::from_raw_parts(
                wide_val.as_ptr() as *const u8,
                wide_val.len() * std::mem::size_of::<u16>(),
            );

            let set_status = RegSetValueExW(
                hkey,
                val_name,
                None,
                REG_SZ,
                Some(byte_slice),
            );
            let _ = RegCloseKey(hkey);

            if set_status.is_err() {
                log::warn!("RegSetValueExW failed: {:?}", set_status);
                return Err(format!("RegSetValueExW failed: {:?}", set_status));
            }

            // Also synchronize with HKCU\Software\Holad\Installer\Language
            let mut inst_hkey = HKEY::default();
            let inst_subkey = w!(r"Software\Holad\Installer");
            if RegCreateKeyW(HKEY_CURRENT_USER, inst_subkey, &mut inst_hkey).is_ok() {
                let _ = RegSetValueExW(
                    inst_hkey,
                    val_name,
                    None,
                    REG_SZ,
                    Some(byte_slice),
                );
                let _ = RegCloseKey(inst_hkey);
            }
        }
        log::info!("Stored application language '{}' to HKCU\\Software\\Holad and HKCU\\Software\\Holad\\Installer", normalized);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = normalized;
    }

    Ok(())
}

#[tauri::command]
fn set_tray_menu_size(window: tauri::Window, width: f64, height: f64) {
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    
    // Get current logical size and position
    let current_size = window.outer_size().unwrap().to_logical::<f64>(scale_factor);
    let current_pos = window.outer_position().unwrap().to_logical::<f64>(scale_factor);
    
    // Calculate the current bottom-right corner coordinate
    let bottom_right_x = current_pos.x + current_size.width;
    let bottom_right_y = current_pos.y + current_size.height;
    
    // Set the new size
    let _ = window.set_size(tauri::LogicalSize::new(width, height));
    
    // Set the new position such that the bottom-right corner remains in the same spot
    let new_x = bottom_right_x - width;
    let new_y = bottom_right_y - height;
    
    let _ = window.set_position(tauri::LogicalPosition::new(new_x, new_y));
}

#[tauri::command]
fn get_music_download_dir(app: tauri::AppHandle) -> String {
    #[cfg(target_os = "windows")]
    {
        use windows::core::w;
        use windows::Win32::System::Registry::{
            RegOpenKeyExW, RegQueryValueExW, RegCloseKey, HKEY_CURRENT_USER, KEY_READ, HKEY,
        };
        unsafe {
            for sub in [w!(r"Software\Holad"), w!(r"Software\Holad\Installer")] {
                let mut hkey = HKEY::default();
                if RegOpenKeyExW(HKEY_CURRENT_USER, sub, Some(0), KEY_READ, &mut hkey).is_ok() {
                    let mut buf = [0u16; 512];
                    let mut size = (buf.len() * std::mem::size_of::<u16>()) as u32;
                    let val_name = w!("MusicPath");
                    let status = RegQueryValueExW(
                        hkey,
                        val_name,
                        None,
                        None,
                        Some(buf.as_mut_ptr() as *mut u8),
                        Some(&mut size),
                    );
                    let _ = RegCloseKey(hkey);
                    if status.is_ok() && size > 2 {
                        let len = (size as usize / std::mem::size_of::<u16>()).saturating_sub(1);
                        let s = String::from_utf16_lossy(&buf[..len]);
                        let trimmed = s.trim();
                        if !trimmed.is_empty() {
                            return trimmed.to_string();
                        }
                    }
                }
            }
        }
    }

    if let Ok(download_dir) = app.path().download_dir() {
        download_dir.join("Holad").to_string_lossy().to_string()
    } else {
        r"C:\Users\User\Downloads\Holad".to_string()
    }
}

#[tauri::command]
fn set_music_download_dir(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let p = std::path::PathBuf::from(trimmed);
    if !p.exists() {
        let _ = std::fs::create_dir_all(&p);
    }

    #[cfg(target_os = "windows")]
    {
        use windows::core::w;
        use windows::Win32::System::Registry::{
            RegCreateKeyW, RegSetValueExW, RegCloseKey, HKEY_CURRENT_USER, REG_SZ, HKEY,
        };
        use std::os::windows::ffi::OsStrExt;

        unsafe {
            let val_name = w!("MusicPath");
            let wide_val: Vec<u16> = std::ffi::OsStr::new(trimmed)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let byte_slice = std::slice::from_raw_parts(
                wide_val.as_ptr() as *const u8,
                wide_val.len() * std::mem::size_of::<u16>(),
            );

            for sub in [w!(r"Software\Holad"), w!(r"Software\Holad\Installer")] {
                let mut hkey = HKEY::default();
                if RegCreateKeyW(HKEY_CURRENT_USER, sub, &mut hkey).is_ok() {
                    let _ = RegSetValueExW(
                        hkey,
                        val_name,
                        None,
                        REG_SZ,
                        Some(byte_slice),
                    );
                    let _ = RegCloseKey(hkey);
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn open_downloads_folder(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    use std::path::PathBuf;

    // Resolve target directory
    let target_path = if let Some(ref p) = path {
        let trimmed = p.trim();
        if trimmed.is_empty() {
            let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
            download_dir.join("Holad")
        } else {
            PathBuf::from(trimmed)
        }
    } else {
        let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
        download_dir.join("Holad")
    };

    // Ensure directory exists if it's the default Holad folder
    if !target_path.exists() {
        std::fs::create_dir_all(&target_path).map_err(|e| e.to_string())?;
    }

    let canonical = target_path.canonicalize().map_err(|e| e.to_string())?;

    // Security check 1: Must be a directory (NEVER an executable or file)
    if !canonical.is_dir() {
        return Err("Forbidden: Specified path is not a directory".into());
    }

    // Security check 2: Prevent opening critical OS system directories
    #[cfg(target_os = "windows")]
    {
        let path_str = canonical.to_string_lossy().to_lowercase();
        let win_dir = std::env::var("SystemRoot").unwrap_or_else(|_| "c:\\windows".into()).to_lowercase();
        let prog_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "c:\\program files".into()).to_lowercase();
        let prog_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "c:\\program files (x86)".into()).to_lowercase();

        if path_str.starts_with(&win_dir) || path_str.starts_with(&prog_files) || path_str.starts_with(&prog_files_x86) {
            return Err("Access to system directory is restricted".into());
        }
    }

    // Strip extended-length prefix on Windows (\\?\C:\...) so explorer.exe handles it reliably
    #[cfg(target_os = "windows")]
    {
        let canonical_str = canonical.to_string_lossy();
        let clean_path = canonical_str.strip_prefix(r"\\?\").unwrap_or(&canonical_str);
        std::process::Command::new("explorer")
            .arg(clean_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&canonical)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&canonical)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppConfig {
        close_to_tray: Mutex::new(true),
    })
    .plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec!["--autostart"]),
    ))
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }))
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
        taskbar::update_taskbar_state,
        is_autostart_launch,
        set_close_to_tray,
        quit_app,
        show_main_window,
        set_tray_menu_size,
        set_app_icon,
        set_app_language,
        sync_audio_session,
        get_audio_output_device,
        open_downloads_folder,
        get_music_download_dir,
        set_music_download_dir,
        updater::download_and_install_update
    ])
    .setup(|app| {
      let is_autostart = std::env::args().any(|arg| arg == "--autostart");
      
      #[cfg(target_os = "windows")]
      {
          if let Some(window) = app.get_webview_window("main") {
              taskbar::init_taskbar(&window);
          }

          // Запуск легковесного фонового супервизора микшера громкости Windows
          audio_session::windows_audio::start_audio_session_supervisor();
      }

      if let Some(window) = app.get_webview_window("main") {
          if !is_autostart {
              window.show().unwrap();
          }
      }

      let _tray = TrayIconBuilder::with_id("main")
          .icon(app.default_window_icon().unwrap().clone())
          .on_tray_icon_event(|tray, event| match event {
              TrayIconEvent::Click {
                  button: MouseButton::Right,
                  button_state: MouseButtonState::Up,
                  position: _position,
                  ..
              } => {
                  let app = tray.app_handle();
                  if let Some(window) = app.get_webview_window("tray_menu") {
                      let is_visible = window.is_visible().unwrap_or(false);
                      if is_visible {
                          window.hide().unwrap();
                      } else {
                          let _ = window.set_shadow(false);
                          let size = window.outer_size().unwrap();
                          
                          #[cfg(target_os = "windows")]
                          let cursor_pos = {
                              use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
                              use windows::Win32::Foundation::POINT;
                              let mut point = POINT::default();
                              unsafe {
                                  let _ = GetCursorPos(&mut point);
                              }
                              tauri::PhysicalPosition::new(point.x as f64, point.y as f64)
                          };
                          #[cfg(not(target_os = "windows"))]
                          let cursor_pos = window.cursor_position().unwrap_or(_position);
                          
                          let scale_factor = window.scale_factor().unwrap_or(1.0);
                          let logical_pos = cursor_pos.to_logical::<f64>(scale_factor);
                          let logical_size = size.to_logical::<f64>(scale_factor);
                          
                          let logical_x = logical_pos.x;
                          let logical_y = logical_pos.y;
                          
                          // Position menu such that it stays on screen relative to cursor
                          let win_x = if logical_x > logical_size.width { logical_x - logical_size.width } else { logical_x };
                          let win_y = if logical_y > logical_size.height { logical_y - logical_size.height } else { logical_y + 10.0 };
                          
                          window.set_position(tauri::LogicalPosition::new(win_x, win_y)).unwrap();
                          window.show().unwrap();
                          window.set_focus().unwrap();
                      }
                  }
              }
              TrayIconEvent::Click {
                  button: MouseButton::Left,
                  button_state: MouseButtonState::Up,
                  ..
              } => {
                  let app = tray.app_handle();
                  if let Some(window) = app.get_webview_window("main") {
                      let is_visible = window.is_visible().unwrap_or(false);
                      if is_visible {
                          window.hide().unwrap();
                          let _ = window.emit("window-visibility-change", false);
                          #[cfg(target_os = "windows")]
                          unsafe {
                              let _ = windows::Win32::System::ProcessStatus::EmptyWorkingSet(windows::Win32::System::Threading::GetCurrentProcess());
                          }
                      } else {
                          window.show().unwrap();
                          window.set_focus().unwrap();
                          let _ = window.emit("window-visibility-change", true);
                          #[cfg(target_os = "windows")]
                          {
                              unsafe { crate::taskbar::setup_taskbar_buttons(&window); }
                          }
                      }
                  }
              }
              _ => {}
          })
          .build(app)?;
      
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .on_window_event(|window, event| {
        match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    let config = window.state::<AppConfig>();
                    if *config.close_to_tray.lock().unwrap() {
                        window.hide().unwrap();
                        let _ = window.emit("window-visibility-change", false);
                        #[cfg(target_os = "windows")]
                        unsafe {
                            let _ = windows::Win32::System::ProcessStatus::EmptyWorkingSet(windows::Win32::System::Threading::GetCurrentProcess());
                        }
                        api.prevent_close();
                    } else {
                        // Exit the entire app, closing tray icon and child windows
                        let app = window.app_handle();
                        app.exit(0);
                    }
                }
            }
            tauri::WindowEvent::Focused(false) if window.label() == "tray_menu" => {
                window.hide().unwrap();
            }
            _ => {}
        }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
