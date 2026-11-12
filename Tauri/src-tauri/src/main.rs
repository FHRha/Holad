// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  #[cfg(target_os = "windows")]
  unsafe {
      let app_id = windows::core::w!("com.holad.desktop");
      let _ = windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(app_id);
  }

  #[cfg(target_os = "windows")]
  std::env::set_var(
      "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
      "--app-name=Holad --app-user-model-id=com.holad.desktop --disable-features=AudioServiceOutOfProcess",
  );

  #[cfg(target_os = "linux")]
  {
      // WebKitGTK DMA-BUF renderer fails on modern Linux (NVIDIA drivers, Wayland / KWin, Arch Linux)
      // causing a blank/black window. Disabling it forces stable fallback rendering across all distros.
      if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
          std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
      }
      // Workaround for Wayland strict-sync / NVIDIA explicit sync driver crashes and blank screens
      if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
          std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
      }
  }

  holad_lib::run();
}
