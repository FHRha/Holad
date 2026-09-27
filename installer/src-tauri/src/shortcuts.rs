use std::path::{Path, PathBuf};
use windows::core::{Interface, HSTRING, PCWSTR};
use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED, IPersistFile,
};
use windows::Win32::System::Com::StructuredStorage::{PROPVARIANT, PropVariantClear};
use windows::Win32::System::Variant::VT_LPWSTR;
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink, SHStrDupW};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::core::GUID;

// System defined PKEY_AppUserModel_ID: {9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}, 5
const PKEY_APPUSERMODEL_ID: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
    pid: 5,
};

/// Get the current user's Desktop directory
pub fn get_desktop_dir() -> Option<PathBuf> {
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(user_profile).join("Desktop");
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Get the current user's Start Menu Programs directory
pub fn get_start_menu_dir() -> Option<PathBuf> {
    if let Ok(app_data) = std::env::var("APPDATA") {
        let p = PathBuf::from(app_data).join(r"Microsoft\Windows\Start Menu\Programs");
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Initializes a PROPVARIANT with VT_LPWSTR string using SHStrDupW (exact matching Win32 InitPropVariantFromString)
unsafe fn create_prop_variant_string(s: &str) -> windows::core::Result<PROPVARIANT> {
    let wide: Vec<u16> = s.encode_utf16().chain(std::iter::once(0)).collect();
    let pcwstr = PCWSTR(wide.as_ptr());
    let pwsz = SHStrDupW(pcwstr)?;

    let mut propvar: PROPVARIANT = std::mem::zeroed();
    (*propvar.Anonymous.Anonymous).vt = VT_LPWSTR;
    (*propvar.Anonymous.Anonymous).Anonymous.pwszVal = pwsz;
    Ok(propvar)
}

/// Internal helper to create a Windows shortcut (.lnk) with AppUserModelId
fn create_shortcut_internal(
    target_exe: &Path,
    lnk_path: &Path,
    app_user_model_id: Option<&str>,
) -> Result<(), String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| format!("Failed to create IShellLinkW instance: {}", e))?;

        let exe_str = target_exe.to_string_lossy();
        let target_hstring = HSTRING::from(exe_str.as_ref());
        shell_link
            .SetPath(&target_hstring)
            .map_err(|e| format!("SetPath failed: {}", e))?;

        if let Some(parent) = target_exe.parent() {
            let parent_str = parent.to_string_lossy();
            let parent_hstring = HSTRING::from(parent_str.as_ref());
            let _ = shell_link.SetWorkingDirectory(&parent_hstring);
        }

        let _ = shell_link.SetIconLocation(&target_hstring, 0);

        // Set AppUserModelId if requested ("com.holad.desktop")
        if let Some(aumid) = app_user_model_id {
            if let Ok(prop_store) = shell_link.cast::<IPropertyStore>() {
                if let Ok(mut prop_var) = create_prop_variant_string(aumid) {
                    let _ = prop_store.SetValue(&PKEY_APPUSERMODEL_ID, &prop_var);
                    let _ = prop_store.Commit();
                    let _ = PropVariantClear(&mut prop_var);
                }
            }
        }

        // Save shortcut via IPersistFile
        let persist_file: IPersistFile = shell_link
            .cast()
            .map_err(|e| format!("Failed to cast IShellLink to IPersistFile: {}", e))?;

        if let Some(parent) = lnk_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let lnk_str = lnk_path.to_string_lossy();
        let lnk_hstring = HSTRING::from(lnk_str.as_ref());
        persist_file
            .Save(&lnk_hstring, true)
            .map_err(|e| format!("Failed to save shortcut file: {}", e))?;

        CoUninitialize();
        Ok(())
    }
}

/// Checks Desktop shortcut:
/// RULE: If %USERPROFILE%\Desktop\Holad.lnk already exists — DO NOT TOUCH OR DELETE!
/// This preserves its position on the user's desktop grid.
/// If it does not exist, creates it with AppUserModelId "com.holad.desktop".
pub fn ensure_desktop_shortcut(target_exe: &Path) -> Result<bool, String> {
    let desktop = get_desktop_dir().ok_or_else(|| "Could not locate Desktop directory".to_string())?;
    let lnk_path = desktop.join("Holad.lnk");

    if lnk_path.exists() {
        // Preserved existing shortcut as required!
        return Ok(false);
    }

    create_shortcut_internal(target_exe, &lnk_path, Some("com.holad.desktop"))?;
    Ok(true)
}

/// Creates or updates the Start Menu shortcut
pub fn ensure_start_menu_shortcut(target_exe: &Path) -> Result<(), String> {
    let start_menu = get_start_menu_dir()
        .ok_or_else(|| "Could not locate Start Menu Programs directory".to_string())?;
    let lnk_path = start_menu.join("Holad.lnk");

    create_shortcut_internal(target_exe, &lnk_path, Some("com.holad.desktop"))
}

/// Removes Holad shortcuts from Desktop and Start Menu upon uninstall
pub fn remove_shortcuts() {
    if let Some(desktop) = get_desktop_dir() {
        let lnk = desktop.join("Holad.lnk");
        if lnk.exists() {
            let _ = std::fs::remove_file(lnk);
        }
    }
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let onedrive_lnk = PathBuf::from(&user_profile)
            .join("OneDrive")
            .join("Desktop")
            .join("Holad.lnk");
        if onedrive_lnk.exists() {
            let _ = std::fs::remove_file(onedrive_lnk);
        }
    }
    if let Ok(public_dir) = std::env::var("PUBLIC") {
        let public_lnk = PathBuf::from(public_dir)
            .join("Desktop")
            .join("Holad.lnk");
        if public_lnk.exists() {
            let _ = std::fs::remove_file(public_lnk);
        }
    }
    if let Some(start_menu) = get_start_menu_dir() {
        let lnk = start_menu.join("Holad.lnk");
        if lnk.exists() {
            let _ = std::fs::remove_file(lnk);
        }
        let folder = start_menu.join("Holad");
        if folder.exists() && folder.is_dir() {
            let _ = std::fs::remove_dir_all(folder);
        }
    }
}


