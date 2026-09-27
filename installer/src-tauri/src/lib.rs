use tauri::Manager;

pub mod commands;
pub mod payload;
pub mod process;
pub mod registry;
pub mod shortcuts;

const ICON_DARK_BYTES: &[u8] = include_bytes!("../../public/icons/favicon_dark.png");

pub fn run() {
    #[cfg(target_os = "windows")]
    unsafe {
        let app_id = windows::core::w!("com.holad.installer");
        let _ = windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(app_id);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(img) = tauri::image::Image::from_bytes(ICON_DARK_BYTES) {
                    let _ = window.set_icon(img);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_info,
            commands::save_language,
            commands::browse_folder,
            commands::start_installation,
            commands::finish_and_exit,
            commands::exit_app,
            commands::minimize_window,
            commands::start_dragging,
            commands::start_uninstallation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running holad installer application");
}
