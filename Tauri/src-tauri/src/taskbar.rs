#![allow(unused)]
use tauri::{AppHandle, Manager, Window, Emitter};

#[cfg(target_os = "windows")]
use windows::core::w;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER, CoInitializeEx, COINIT_APARTMENTTHREADED};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Shell::{
    DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList,
    THBN_CLICKED, THUMBBUTTON, THB_FLAGS, THB_ICON, THB_TOOLTIP, THBF_ENABLED
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    LoadImageW, RegisterWindowMessageW, IMAGE_ICON, LR_DEFAULTSIZE, LR_LOADFROMFILE, WM_COMMAND, HICON
};
#[cfg(target_os = "windows")]
use windows::Win32::System::ProcessStatus::EmptyWorkingSet;
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::GetCurrentProcess;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static BUTTONS_ADDED: AtomicBool = AtomicBool::new(false);
static IS_PLAYING: AtomicBool = AtomicBool::new(false);
static TASKBAR_BUTTON_CREATED_MSG: AtomicU32 = AtomicU32::new(0);

const BTN_PREV: u32 = 101;
const BTN_PLAY: u32 = 102;
const BTN_NEXT: u32 = 103;

const ICO_PREV: &[u8] = include_bytes!("../icons/taskbar/PREV_THUMB.ico");
const ICO_PLAY: &[u8] = include_bytes!("../icons/taskbar/PLAY_THUMB.ico");
const ICO_PAUSE: &[u8] = include_bytes!("../icons/taskbar/PAUSE_THUMB.ico");
const ICO_NEXT: &[u8] = include_bytes!("../icons/taskbar/NEXT_THUMB.ico");

#[cfg(target_os = "windows")]
pub fn ensure_taskbar_icons() -> PathBuf {
    let dir = std::env::temp_dir().join("holad_icons").join("taskbar");
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(dir.join("PREV_THUMB.ico"), ICO_PREV);
    let _ = std::fs::write(dir.join("PLAY_THUMB.ico"), ICO_PLAY);
    let _ = std::fs::write(dir.join("PAUSE_THUMB.ico"), ICO_PAUSE);
    let _ = std::fs::write(dir.join("NEXT_THUMB.ico"), ICO_NEXT);
    dir
}

#[cfg(target_os = "windows")]
fn get_taskbar_icon_path(filename: &str) -> PathBuf {
    let dir = std::env::temp_dir().join("holad_icons").join("taskbar");
    let file = dir.join(filename);
    if !file.exists() {
        let _ = ensure_taskbar_icons();
    }
    file
}

pub fn init_taskbar(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        let app = window.app_handle().clone();
        APP_HANDLE.get_or_init(|| app);
        
        let msg = unsafe { RegisterWindowMessageW(w!("TaskbarButtonCreated")) };
        TASKBAR_BUTTON_CREATED_MSG.store(msg, Ordering::SeqCst);
        ensure_taskbar_icons();

        if let Ok(hwnd_raw) = window.hwnd() {
            let hwnd_windows = HWND(hwnd_raw.0 as _);
            unsafe {
                SetWindowSubclass(hwnd_windows, Some(subclass_proc), 1, 0);
            }
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
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
    }
}

#[tauri::command]
pub fn init_taskbar_buttons(window: tauri::Window) {
    #[cfg(target_os = "windows")]
    {
        let window_clone = window.clone();
        let _ = window.run_on_main_thread(move || {
            if let Ok(hwnd_raw) = window_clone.hwnd() {
                unsafe {
                    setup_taskbar_buttons_hwnd(HWND(hwnd_raw.0 as _));
                }
            }
        });
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
    }
}

#[tauri::command]
pub fn update_taskbar_state(window: tauri::Window, is_playing: bool) {
    #[cfg(target_os = "windows")]
    {
        IS_PLAYING.store(is_playing, Ordering::SeqCst);
        let window_clone = window.clone();
        let _ = window.run_on_main_thread(move || {
            unsafe {
                if let Ok(hwnd_raw) = window_clone.hwnd() {
                    let hwnd = HWND(hwnd_raw.0 as _);
                    let taskbar: Result<ITaskbarList3, _> = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER);
                    if let Ok(taskbar) = taskbar {
                        let mut btn = THUMBBUTTON {
                            dwMask: THB_ICON | THB_TOOLTIP,
                            iId: BTN_PLAY,
                            ..Default::default()
                        };
                        
                        let icon_name = if is_playing { "PAUSE_THUMB.ico" } else { "PLAY_THUMB.ico" };
                        btn.hIcon = load_icon(&get_taskbar_icon_path(icon_name));
                        btn.szTip = encode_wide(if is_playing { "Pause" } else { "Play" });
                        
                        let _ = taskbar.ThumbBarUpdateButtons(hwnd, &[btn]);
                    }
                }
            }
        });
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        let _ = is_playing;
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
    let taskbar_created = TASKBAR_BUTTON_CREATED_MSG.load(Ordering::SeqCst);
    if taskbar_created != 0 && msg == taskbar_created {
        BUTTONS_ADDED.store(false, Ordering::SeqCst);
        setup_taskbar_buttons_hwnd(hwnd);
    } else if msg == WM_COMMAND {
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
    } else if msg == 0x0005 {
        // WM_SIZE
        const SIZE_RESTORED: usize = 0;
        const SIZE_MINIMIZED: usize = 1;
        const SIZE_MAXIMIZED: usize = 2;

        if wparam.0 == SIZE_MINIMIZED {
            if let Some(app) = APP_HANDLE.get() {
                let _ = app.emit("window-visibility-change", false);
            }
            // Мгновенный сброс неиспользуемой физической памяти (Working Set Trim)
            let _ = EmptyWorkingSet(GetCurrentProcess());
        } else if wparam.0 == SIZE_RESTORED || wparam.0 == SIZE_MAXIMIZED {
            if let Some(app) = APP_HANDLE.get() {
                let _ = app.emit("window-visibility-change", true);
            }
        }
    } else if msg == 0x0018 {
        // WM_SHOWWINDOW
        let is_visible = wparam.0 != 0;
        if let Some(app) = APP_HANDLE.get() {
            let _ = app.emit("window-visibility-change", is_visible);
        }
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

#[cfg(target_os = "windows")]
unsafe fn load_icon(path: &std::path::Path) -> HICON {
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
pub unsafe fn setup_taskbar_buttons_hwnd(hwnd: HWND) {
    let taskbar: Result<ITaskbarList3, _> = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER);
    if let Ok(taskbar) = taskbar {
        let _ = taskbar.HrInit();

        let is_playing = IS_PLAYING.load(Ordering::SeqCst);

        let mut prev = THUMBBUTTON {
            dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
            iId: BTN_PREV,
            dwFlags: THBF_ENABLED,
            ..Default::default()
        };
        prev.hIcon = load_icon(&get_taskbar_icon_path("PREV_THUMB.ico"));
        prev.szTip = encode_wide("Previous");

        let mut play = THUMBBUTTON {
            dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
            iId: BTN_PLAY,
            dwFlags: THBF_ENABLED,
            ..Default::default()
        };
        let play_icon_name = if is_playing { "PAUSE_THUMB.ico" } else { "PLAY_THUMB.ico" };
        play.hIcon = load_icon(&get_taskbar_icon_path(play_icon_name));
        play.szTip = encode_wide(if is_playing { "Pause" } else { "Play" });

        let mut next = THUMBBUTTON {
            dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
            iId: BTN_NEXT,
            dwFlags: THBF_ENABLED,
            ..Default::default()
        };
        next.hIcon = load_icon(&get_taskbar_icon_path("NEXT_THUMB.ico"));
        next.szTip = encode_wide("Next");

        let buttons = [prev, play, next];
        let was_added = BUTTONS_ADDED.load(Ordering::SeqCst);

        if was_added {
            let res = taskbar.ThumbBarUpdateButtons(hwnd, &buttons);
            if res.is_err() {
                if taskbar.ThumbBarAddButtons(hwnd, &buttons).is_ok() {
                    BUTTONS_ADDED.store(true, Ordering::SeqCst);
                }
            }
        } else {
            let res = taskbar.ThumbBarAddButtons(hwnd, &buttons);
            if res.is_ok() {
                BUTTONS_ADDED.store(true, Ordering::SeqCst);
            } else {
                if taskbar.ThumbBarUpdateButtons(hwnd, &buttons).is_ok() {
                    BUTTONS_ADDED.store(true, Ordering::SeqCst);
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub unsafe fn setup_taskbar_buttons(window: &tauri::WebviewWindow) {
    if let Ok(hwnd) = window.hwnd() {
        setup_taskbar_buttons_hwnd(HWND(hwnd.0 as _));
    }
}
