// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

fn run_silent_installation() {
    // 1. Terminate old Holad process gracefully then forcefully if needed
    let _ = holad_installer_lib::process::kill_holad_process();

    // 2. Resolve user settings: prioritize saved settings from HKCU\Software\Holad\Installer
    let saved_settings = holad_installer_lib::registry::get_saved_installer_settings();
    let detected = holad_installer_lib::registry::detect_old_installation();

    let install_dir = saved_settings
        .install_path
        .or_else(|| detected.map(|d| d.path))
        .unwrap_or_else(|| {
            std::env::var("LOCALAPPDATA")
                .map(|p| PathBuf::from(p).join("Programs").join("Holad"))
                .unwrap_or_else(|_| PathBuf::from(r"C:\Program Files\Holad"))
        });

    // 3. Unpack all payload files into destination
    if let Err(e) = holad_installer_lib::payload::unpack_payload(&install_dir, |_, _| {}) {
        eprintln!("Silent installation payload unpacking failed: {}", e);
        std::process::exit(1);
    }

    let exe_path = install_dir.join("Holad.exe");

    // 4. Desktop shortcut (respects user choice and preserves desktop grid position)
    let desktop_exists = holad_installer_lib::shortcuts::get_desktop_dir()
        .map(|d| d.join("Holad.lnk").exists())
        .unwrap_or(false);
    let want_desktop = saved_settings.desktop_shortcut.unwrap_or(desktop_exists);
    if want_desktop {
        let _ = holad_installer_lib::shortcuts::ensure_desktop_shortcut(&exe_path);
    }

    // 5. Start Menu shortcut (respects user choice and existing shortcut)
    let start_menu_exists = holad_installer_lib::shortcuts::get_start_menu_dir()
        .map(|d| d.join("Holad.lnk").exists())
        .unwrap_or(false);
    let want_start_menu = saved_settings.start_menu_shortcut.unwrap_or(start_menu_exists);
    if want_start_menu {
        let _ = holad_installer_lib::shortcuts::ensure_start_menu_shortcut(&exe_path);
    }

    // 6. Autostart (respects user choice / current registry state)
    let autostart_currently_on = holad_installer_lib::registry::is_autostart_enabled();
    let want_autostart = saved_settings.autostart.unwrap_or(autostart_currently_on);
    let _ = holad_installer_lib::registry::set_autostart(&install_dir, want_autostart);

    // 7. Language
    let current_lang = saved_settings
        .language
        .or_else(|| holad_installer_lib::registry::get_saved_language())
        .unwrap_or_else(|| "ru".to_string());
    let _ = holad_installer_lib::registry::save_language(&current_lang);

    let music_dir = saved_settings.music_path.unwrap_or_else(|| {
        std::env::var("USERPROFILE")
            .map(|p| PathBuf::from(p).join("Downloads").join("Holad"))
            .unwrap_or_else(|_| PathBuf::from(r"C:\Users\User\Downloads\Holad"))
    });

    // 8. Re-persist the exact settings
    let _ = holad_installer_lib::registry::save_installer_settings(
        &install_dir,
        &music_dir,
        want_desktop,
        want_start_menu,
        want_autostart,
        &current_lang,
    );

    // 9. Update uninstall executable and registry entry
    if let Ok(current_exe) = std::env::current_exe() {
        let uninst_path = install_dir.join("uninstall.exe");
        let _ = std::fs::copy(&current_exe, &uninst_path);
    }
    let _ = holad_installer_lib::registry::register_uninstall(&install_dir, env!("CARGO_PKG_VERSION"), "Holad");

    // 10. Launch updated Holad.exe
    let _ = std::process::Command::new(&exe_path).spawn();

    // 11. Complete and exit immediately
    std::process::exit(0);
}

fn run_silent_uninstallation() {
    let _ = holad_installer_lib::process::kill_holad_process();
    let install_dir = if let Some(detected) = holad_installer_lib::registry::detect_old_installation() {
        detected.path
    } else {
        std::env::var("LOCALAPPDATA")
            .map(|p| PathBuf::from(p).join("Programs").join("Holad"))
            .unwrap_or_else(|_| PathBuf::from(r"C:\Program Files\Holad"))
    };

    holad_installer_lib::shortcuts::remove_shortcuts();
    holad_installer_lib::registry::remove_uninstall_and_autostart();
    holad_installer_lib::registry::schedule_folder_cleanup(&install_dir);
    std::process::exit(0);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let is_silent = args.iter().any(|arg| {
        let lower = arg.to_lowercase();
        lower == "--silent" || lower == "/s" || lower == "-s" || lower == "/silent"
    });

    let is_uninstall = args.iter().any(|arg| {
        let lower = arg.to_lowercase();
        lower == "--uninstall" || lower == "/uninstall" || lower == "-uninstall"
    }) || std::env::current_exe()
        .map(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase().contains("uninstall"))
                .unwrap_or(false)
        })
        .unwrap_or(false);

    if is_uninstall && is_silent {
        run_silent_uninstallation();
        return;
    }

    if is_silent {
        run_silent_installation();
        return;
    }

    holad_installer_lib::run();
}

