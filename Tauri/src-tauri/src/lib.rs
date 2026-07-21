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
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
        taskbar::update_taskbar_state,
        is_autostart_launch,
        set_close_to_tray,
        quit_app
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
                          let x = position.x as f64;
                          let y = position.y as f64;
                          let size = window.outer_size().unwrap();
                          
                          // Position above tray icon if it's at the bottom of the screen
                          let win_x = if x > 1000.0 { x - size.width as f64 } else { x };
                          let win_y = if y > 500.0 { y - size.height as f64 - 10.0 } else { y + 40.0 };
                          
                          window.set_position(tauri::PhysicalPosition::new(win_x, win_y)).unwrap();
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
            tauri::WindowEvent::Focused(focused) => {
                if !focused && window.label() == "tray_menu" {
                    window.hide().unwrap();
                }
            }
            _ => {}
        }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
