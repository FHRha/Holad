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
        sync_audio_session,
        open_downloads_folder,
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
