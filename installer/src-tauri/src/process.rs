use std::time::Duration;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM, CloseHandle};
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

/// Finds all running Holad.exe processes.
/// Sends WM_CLOSE gracefully to all of their top-level windows.
/// Waits 600 ms (timeout 500-800 ms).
/// Force terminates (TerminateProcess) if any process is still running to ensure no locked files.
pub fn kill_holad_process() -> Result<usize, String> {
    unsafe {
        // 1. Enumerate processes using ToolHelp32
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
            .map_err(|e| format!("CreateToolhelp32Snapshot failed: {}", e))?;

        let mut entry = PROCESSENTRY32W::default();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        let mut holad_pids = Vec::new();

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let null_pos = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let exe_name = String::from_utf16_lossy(&entry.szExeFile[..null_pos]);

                if exe_name.eq_ignore_ascii_case("Holad.exe") {
                    holad_pids.push(entry.th32ProcessID);
                }

                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        let _ = CloseHandle(snapshot);

        if holad_pids.is_empty() {
            return Ok(0);
        }

        // 2. Softly send WM_CLOSE to all windows of the detected PIDs
        let mut context = WindowEnumContext {
            target_pids: holad_pids.clone(),
            found_hwnds: Vec::new(),
        };

        let _ = EnumWindows(
            Some(enum_windows_proc),
            LPARAM(&mut context as *mut WindowEnumContext as isize),
        );

        for hwnd in context.found_hwnds {
            let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
        }

        // 3. Grace timeout: 650 ms (within 500-800 ms range)
        std::thread::sleep(Duration::from_millis(650));

        // 4. Check if any PID remains alive and force terminate if necessary
        for &pid in &holad_pids {
            let flags =
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | PROCESS_SYNCHRONIZE;
            if let Ok(process_handle) = OpenProcess(flags, false, pid) {
                // Check if process has exited (WAIT_TIMEOUT = 0x102)
                let wait_state = WaitForSingleObject(process_handle, 0);
                if wait_state.0 == 0x00000102 {
                    let _ = TerminateProcess(process_handle, 1);
                }
                let _ = CloseHandle(process_handle);
            }
        }

        Ok(holad_pids.len())
    }
}
