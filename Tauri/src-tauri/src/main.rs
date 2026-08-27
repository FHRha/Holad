// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  #[cfg(target_os = "windows")]
  unsafe {
      let app_id = windows::core::w!("com.holad.desktop");
      let _ = windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(app_id);
  }

  app_lib::run();
}
