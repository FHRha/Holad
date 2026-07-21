#![allow(unused)]
use tauri::{AppHandle, Manager, Window, Emitter};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER, CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{
    DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList,
    THBN_CLICKED, THUMBBUTTON, THB_FLAGS, THB_ICON, THB_TOOLTIP, THBF_ENABLED
};
use windows::Win32::UI::WindowsAndMessaging::{
    LoadImageW, IMAGE_ICON, LR_DEFAULTSIZE, LR_LOADFROMFILE, WM_COMMAND, HICON
};
use std::sync::OnceLock;
use std::path::PathBuf;
use std::os::windows::ffi::OsStrExt;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

const BTN_PREV: u32 = 101;
const BTN_PLAY: u32 = 102;
const BTN_NEXT: u32 = 103;

pub fn init_taskbar(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        let app = window.app_handle().clone();
        APP_HANDLE.get_or_init(|| app);
        
        let hwnd = window.hwnd().unwrap().0 as isize;
        unsafe {
            let hwnd_windows = HWND(hwnd as _);
            SetWindowSubclass(hwnd_windows, Some(subclass_proc), 1, 0);
        }
        
        let window_clone = window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1000));
            let value = window_clone.clone();
            let _ = window_clone.run_on_main_thread(move || {
                unsafe { setup_taskbar_buttons(&value); }
            });
        });
    }
}

#[tauri::command]
pub fn update_taskbar_state(window: tauri::Window, is_playing: bool) {
    #[cfg(target_os = "windows")]
    {
        let window_clone = window.clone();
        let _ = window.run_on_main_thread(move || {
            unsafe {
                let hwnd = HWND(window_clone.hwnd().unwrap().0 as _);
                let taskbar: Result<ITaskbarList3, _> = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER);
                if let Ok(taskbar) = taskbar {
                    let mut btn = THUMBBUTTON::default();
                    btn.dwMask = THB_ICON | THB_TOOLTIP;
                    btn.iId = BTN_PLAY;
                    
                    let icon_name = if is_playing { "PAUSE_THUMB.ico" } else { "PLAY_THUMB.ico" };
                    if let Some(path) = get_icon_path(window_clone.app_handle(), icon_name) {
                        btn.hIcon = load_icon(&path);
                    }
                    btn.szTip = encode_wide(if is_playing { "Pause" } else { "Play" });
                    
                    let _ = taskbar.ThumbBarUpdateButtons(hwnd, &[btn]);
                }
            }
        });
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    u_id_subclass: usize,
    dw_ref_data: usize,
) -> LRESULT {
    if msg == WM_COMMAND {
        let hiword = (wparam.0 >> 16) & 0xFFFF;
        let loword = wparam.0 & 0xFFFF;
        
        if hiword == THBN_CLICKED as usize {
            if let Some(app) = APP_HANDLE.get() {
                let action = match loword as u32 {
                    BTN_PREV => "previoustrack",
                    BTN_PLAY => "playpause",
                    BTN_NEXT => "nexttrack",
                    _ => "",
                };
                if !action.is_empty() {
                    let _ = app.emit("taskbar-action", action);
                }
            }
        }
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

#[cfg(target_os = "windows")]
fn get_icon_path(app: &AppHandle, filename: &str) -> Option<PathBuf> {
    app.path().resolve(
        format!("icons/taskbar/{}", filename),
        tauri::path::BaseDirectory::Resource
    ).ok()
}

#[cfg(target_os = "windows")]
unsafe fn load_icon(path: &PathBuf) -> HICON {
    let mut path_str: Vec<u16> = path.as_os_str().encode_wide().collect();
    path_str.push(0);
    
    let handle = LoadImageW(
        None,
        windows::core::PCWSTR(path_str.as_ptr()),
        IMAGE_ICON,
        0,
        0,
        LR_LOADFROMFILE | LR_DEFAULTSIZE,
    ).unwrap_or_default();
    
    HICON(handle.0)
}

#[cfg(target_os = "windows")]
fn encode_wide(s: &str) -> [u16; 260] {
    let mut arr = [0u16; 260];
    let encoded: Vec<u16> = s.encode_utf16().collect();
    let len = encoded.len().min(259);
    arr[..len].copy_from_slice(&encoded[..len]);
    arr
}

#[cfg(target_os = "windows")]
unsafe fn setup_taskbar_buttons(window: &tauri::WebviewWindow) {
    let taskbar: Result<ITaskbarList3, _> = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER);
    if let Ok(taskbar) = taskbar {
        let hwnd = HWND(window.hwnd().unwrap().0 as _);
        let _ = taskbar.HrInit();

        let app = window.app_handle();
        let mut prev = THUMBBUTTON::default();
        prev.dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
        prev.iId = BTN_PREV;
        prev.dwFlags = THBF_ENABLED;
        if let Some(ref p) = get_icon_path(app, "PREV_THUMB.ico") { prev.hIcon = load_icon(p); }
        prev.szTip = encode_wide("Previous");

        let mut play = THUMBBUTTON::default();
        play.dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
        play.iId = BTN_PLAY;
        play.dwFlags = THBF_ENABLED;
        if let Some(ref p) = get_icon_path(app, "PLAY_THUMB.ico") { play.hIcon = load_icon(p); }
        play.szTip = encode_wide("Play");

        let mut next = THUMBBUTTON::default();
        next.dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
        next.iId = BTN_NEXT;
        next.dwFlags = THBF_ENABLED;
        if let Some(ref p) = get_icon_path(app, "NEXT_THUMB.ico") { next.hIcon = load_icon(p); }
        next.szTip = encode_wide("Next");

        let _ = taskbar.ThumbBarAddButtons(hwnd, &[prev, play, next]);
    }
}
