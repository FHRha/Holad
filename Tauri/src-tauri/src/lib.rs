mod taskbar;
use std::sync::Mutex;
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::Manager;
use tauri::State;

struct AppConfig {
    close_to_tray: Mutex<bool>,
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
    }
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
        show_main_window
    ])
    .setup(|app| {
      let is_autostart = std::env::args().any(|arg| arg == "--autostart");
      
      #[cfg(target_os = "windows")]
      {
          if let Some(window) = app.get_webview_window("main") {
              taskbar::init_taskbar(&window);
          }
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
                  position,
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
                          let cursor_pos = window.cursor_position().unwrap_or(position);
                          
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
                      } else {
                          window.show().unwrap();
                          window.set_focus().unwrap();
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
