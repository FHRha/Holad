// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// Migrates WebView2 user data (`localStorage`, `IndexedDB`, cookies) from legacy
/// `com.holad.desktop\EBWebView` to `com.holad.app\EBWebView` and removes the legacy folder.
#[cfg(target_os = "windows")]
fn migrate_legacy_webview_data() {
    let Ok(local_app_data) = std::env::var("LOCALAPPDATA") else {
        return;
    };
    let local_path = std::path::PathBuf::from(local_app_data);
    let legacy_root = local_path.join("com.holad.desktop");
    let legacy_webview = legacy_root.join("EBWebView");
    if !legacy_webview.exists() {
        return;
    }

    let target_root = local_path.join("com.holad.app");
    let target_webview = target_root.join("EBWebView");
    let target_has_storage = target_webview
        .join("Default")
        .join("Local Storage")
        .exists();

    if !target_has_storage {
        let _ = std::fs::create_dir_all(&target_root);
        if target_webview.exists() {
            let _ = std::fs::remove_dir_all(&target_webview);
        }
        if std::fs::rename(&legacy_webview, &target_webview).is_err() {
            if copy_dir_recursive(&legacy_webview, &target_webview).is_ok() {
                let _ = std::fs::remove_dir_all(&legacy_webview);
            }
        }
    } else {
        let _ = std::fs::remove_dir_all(&legacy_webview);
    }

    // Remove legacy root folder if it is now empty
    if let Ok(mut entries) = std::fs::read_dir(&legacy_root) {
        if entries.next().is_none() {
            let _ = std::fs::remove_dir(&legacy_root);
        }
    }
}

fn main() {
  #[cfg(target_os = "windows")]
  migrate_legacy_webview_data();

  #[cfg(target_os = "windows")]
  unsafe {
      let app_id = windows::core::w!("com.holad.app");
      let _ = windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(app_id);
  }

  #[cfg(target_os = "windows")]
  std::env::set_var(
      "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
      "--app-name=Holad --app-user-model-id=com.holad.app --disable-features=AudioServiceOutOfProcess",
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
