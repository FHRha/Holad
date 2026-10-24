use std::collections::HashSet;
use std::time::{Duration, Instant};
use windows::core::BOOL;
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, WPARAM};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, TerminateProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION,
    PROCESS_SYNCHRONIZE, PROCESS_TERMINATE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
};

struct WindowEnumContext {
    target_pids: Vec<u32>,
    found_hwnds: Vec<HWND>,
}

unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let context = &mut *(lparam.0 as *mut WindowEnumContext);
    let mut process_id = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut process_id));

    if context.target_pids.contains(&process_id) {
        context.found_hwnds.push(hwnd);
    }

    BOOL(1)
}

/// Returns PIDs of all running Holad.exe processes and their child processes (e.g. WebView2),
/// excluding the current installer process.
pub fn get_holad_process_ids() -> Vec<u32> {
    let current_pid = std::process::id();
    let mut holad_pids: HashSet<u32> = HashSet::new();

    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        let mut entry = PROCESSENTRY32W::default();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        let mut all_processes: Vec<(u32, u32, String)> = Vec::new();

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let null_pos = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let exe_name = String::from_utf16_lossy(&entry.szExeFile[..null_pos]);

                all_processes.push((entry.th32ProcessID, entry.th32ParentProcessID, exe_name));

                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        let _ = CloseHandle(snapshot);

        // 1. Identify primary Holad.exe processes
        for (pid, _, exe_name) in &all_processes {
            if *pid != current_pid && exe_name.eq_ignore_ascii_case("Holad.exe") {
                holad_pids.insert(*pid);
            }
        }

        // 2. Identify child processes belonging to Holad (e.g. msedgewebview2.exe or child Holad.exe)
        let mut added_more = true;
        while added_more {
            added_more = false;
            for (pid, parent_pid, exe_name) in &all_processes {
                if *pid != current_pid && !holad_pids.contains(pid) && holad_pids.contains(parent_pid) {
                    if exe_name.eq_ignore_ascii_case("msedgewebview2.exe")
                        || exe_name.eq_ignore_ascii_case("Holad.exe")
                    {
                        holad_pids.insert(*pid);
                        added_more = true;
                    }
                }
            }
        }
    }

    holad_pids.into_iter().collect()
}

/// Finds all running Holad.exe processes (and child WebView2 processes).
/// 1. Sends WM_CLOSE gracefully to all of their top-level windows.
/// 2. Waits up to 600 ms for graceful termination.
/// 3. Force terminates (TerminateProcess) any remaining processes.
/// 4. Synchronously waits (WaitForSingleObject) for processes to release locks.
/// 5. Verifies all processes are dead before returning.
pub fn kill_holad_process() -> Result<usize, String> {
    let initial_pids = get_holad_process_ids();
    if initial_pids.is_empty() {
        return Ok(0);
    }

    // 1. Softly send WM_CLOSE to all windows of detected PIDs
    let mut context = WindowEnumContext {
        target_pids: initial_pids.clone(),
        found_hwnds: Vec::new(),
    };

    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_proc),
            LPARAM(&mut context as *mut WindowEnumContext as isize),
        );

        for hwnd in context.found_hwnds {
            let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
        }
    }

    // 2. Wait up to 600 ms to allow graceful shutdown
    let grace_start = Instant::now();
    while grace_start.elapsed() < Duration::from_millis(600) {
        let active = get_holad_process_ids();
        if active.is_empty() {
            // All processes exited gracefully
            std::thread::sleep(Duration::from_millis(100));
            return Ok(initial_pids.len());
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    // 3. Force terminate any still active processes
    let remaining = get_holad_process_ids();
    for pid in remaining {
        let flags = PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | PROCESS_SYNCHRONIZE;
        unsafe {
            if let Ok(process_handle) = OpenProcess(flags, false, pid) {
                let wait_state = WaitForSingleObject(process_handle, 0);
                if wait_state.0 == 0x00000102 {
                    // Still running, terminate and wait for exit
                    let _ = TerminateProcess(process_handle, 1);
                    let _ = WaitForSingleObject(process_handle, 5000);
                }
                let _ = CloseHandle(process_handle);
            }
        }
    }

    // 4. Verification loop: ensure no Holad processes remain alive
    let verify_start = Instant::now();
    while verify_start.elapsed() < Duration::from_millis(3000) {
        let still_alive = get_holad_process_ids();
        if still_alive.is_empty() {
            break;
        }
        for pid in still_alive {
            let flags = PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | PROCESS_SYNCHRONIZE;
            unsafe {
                if let Ok(handle) = OpenProcess(flags, false, pid) {
                    let _ = TerminateProcess(handle, 1);
                    let _ = WaitForSingleObject(handle, 1000);
                    let _ = CloseHandle(handle);
                }
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    // Brief cool-down to allow the Windows kernel and filesystem drivers to release all file locks
    std::thread::sleep(Duration::from_millis(150));

    Ok(initial_pids.len())
}
