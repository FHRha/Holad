#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct NativeAudioDevice {
    pub name: String,
    pub is_headphones: bool,
    pub device_type: String,
}

#[cfg(target_os = "windows")]
pub mod windows_audio {
    use std::collections::{HashMap, HashSet};
    use std::path::PathBuf;
    use std::sync::{Mutex, RwLock};
    use windows::core::{Interface, w, PCWSTR};
    use windows::Win32::Media::Audio::{
        MMDeviceEnumerator, IMMDeviceEnumerator, eRender, eMultimedia,
        IAudioSessionManager2, IAudioSessionEnumerator, IAudioSessionControl2,
        DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoCreateInstance, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows::Win32::Foundation::CloseHandle;

    const ICO_WAVE_DARK: &[u8] = include_bytes!("../icons/wave_dark.ico");
    const ICO_WAVE_LIGHT: &[u8] = include_bytes!("../icons/wave_light.ico");
    const ICO_CASSETTE: &[u8] = include_bytes!("../icons/cassette.ico");
    const PNG_LOGO: &[u8] = include_bytes!("../icons/Square150x150Logo.png");

    static CURRENT_ICON_WIDE: RwLock<Option<Vec<u16>>> = RwLock::new(None);
    static CURRENT_ICON_PATH: RwLock<Option<PathBuf>> = RwLock::new(None);
    static FAMILY_CACHE: Mutex<Option<(std::time::Instant, HashSet<u32>)>> = Mutex::new(None);
    static LAST_WINDOW_ICON_APPLY: Mutex<Option<std::time::Instant>> = Mutex::new(None);
    static CACHED_ENDPOINT: Mutex<Option<(String, super::NativeAudioDevice)>> = Mutex::new(None);

    fn register_registry_identity(ico_path: &std::path::Path, png_path: &std::path::Path) {
        use windows::Win32::System::Registry::{
            RegCreateKeyW, RegSetValueExW, RegCloseKey, HKEY_CURRENT_USER, REG_SZ,
        };

        unsafe {
            // 1. HKCU\Software\Classes\AppUserModelId\com.holad.desktop
            let subkey_aumid = w!("Software\\Classes\\AppUserModelId\\com.holad.desktop");
            let mut hkey = windows::Win32::System::Registry::HKEY::default();
            if RegCreateKeyW(HKEY_CURRENT_USER, subkey_aumid, &mut hkey).is_ok() {
                let name: Vec<u16> = "Holad".encode_utf16().chain(std::iter::once(0)).collect();
                let _ = RegSetValueExW(
                    hkey,
                    w!("DisplayName"),
                    None,
                    REG_SZ,
                    Some(std::slice::from_raw_parts(
                        name.as_ptr() as *const u8,
                        name.len() * 2,
                    )),
                );

                // IconUri in Windows WinRT/Toast/SMTC must be a direct file path without ",0"
                let png_str = format!("{}\0", png_path.to_string_lossy());
                let png_wide: Vec<u16> = png_str.encode_utf16().collect();
                let _ = RegSetValueExW(
                    hkey,
                    w!("IconUri"),
                    None,
                    REG_SZ,
                    Some(std::slice::from_raw_parts(
                        png_wide.as_ptr() as *const u8,
                        png_wide.len() * 2,
                    )),
                );

                let ico_str = format!("{},0\0", ico_path.to_string_lossy());
                let ico_wide: Vec<u16> = ico_str.encode_utf16().collect();
                let _ = RegSetValueExW(
                    hkey,
                    w!("IconPath"),
                    None,
                    REG_SZ,
                    Some(std::slice::from_raw_parts(
                        ico_wide.as_ptr() as *const u8,
                        ico_wide.len() * 2,
                    )),
                );
                let _ = RegSetValueExW(
                    hkey,
                    w!("IconLocation"),
                    None,
                    REG_SZ,
                    Some(std::slice::from_raw_parts(
                        ico_wide.as_ptr() as *const u8,
                        ico_wide.len() * 2,
                    )),
                );

                let bg: Vec<u16> = "FF121212".encode_utf16().chain(std::iter::once(0)).collect();
                let _ = RegSetValueExW(
                    hkey,
                    w!("IconBackgroundColor"),
                    None,
                    REG_SZ,
                    Some(std::slice::from_raw_parts(
                        bg.as_ptr() as *const u8,
                        bg.len() * 2,
                    )),
                );

                let _ = RegCloseKey(hkey);
            }

            // 2. HKCU\Software\Classes\Applications\Holad.exe
            let subkey_app = w!("Software\\Classes\\Applications\\Holad.exe");
            let mut hkey_app = windows::Win32::System::Registry::HKEY::default();
            if RegCreateKeyW(HKEY_CURRENT_USER, subkey_app, &mut hkey_app).is_ok() {
                let name: Vec<u16> = "Holad".encode_utf16().chain(std::iter::once(0)).collect();
                let _ = RegSetValueExW(
                    hkey_app,
                    w!("FriendlyAppName"),
                    None,
                    REG_SZ,
                    Some(std::slice::from_raw_parts(
                        name.as_ptr() as *const u8,
                        name.len() * 2,
                    )),
                );
                let _ = RegCloseKey(hkey_app);
            }

            // 3. HKCU\Software\Classes\Applications\Holad.exe\DefaultIcon
            let subkey_icon = w!("Software\\Classes\\Applications\\Holad.exe\\DefaultIcon");
            let mut hkey_icon = windows::Win32::System::Registry::HKEY::default();
            if RegCreateKeyW(HKEY_CURRENT_USER, subkey_icon, &mut hkey_icon).is_ok() {
                let ico_str = format!("{},0\0", ico_path.to_string_lossy());
                let ico_wide: Vec<u16> = ico_str.encode_utf16().collect();
                let _ = RegSetValueExW(
                    hkey_icon,
                    PCWSTR::null(),
                    None,
                    REG_SZ,
                    Some(std::slice::from_raw_parts(
                        ico_wide.as_ptr() as *const u8,
                        ico_wide.len() * 2,
                    )),
                );
                let _ = RegCloseKey(hkey_icon);
            }

            // 4. Clean up any legacy msedgewebview2.exe overrides if they were set previously,
            // to prevent hijacking Windows Shell components (Search, Copilot, Widgets).
            use windows::Win32::System::Registry::RegDeleteTreeW;
            let subkey_edge = w!(r"Software\Classes\Applications\msedgewebview2.exe");
            let _ = RegDeleteTreeW(HKEY_CURRENT_USER, subkey_edge);

            let subkey_edge_aumid = w!(r"Software\Classes\AppUserModelId\msedgewebview2.exe");
            let _ = RegDeleteTreeW(HKEY_CURRENT_USER, subkey_edge_aumid);
        }
    }

    fn ensure_ico_file(name: &str, ico_bytes: &[u8]) -> PathBuf {
        // 1. Папка %TEMP%\holad_icons\
        let temp_dir = std::env::temp_dir().join("holad_icons");
        let _ = std::fs::create_dir_all(&temp_dir);
        let temp_file = temp_dir.join(format!("{}.ico", name));
        let _ = std::fs::write(&temp_file, ico_bytes);

        let temp_png = temp_dir.join("holad_logo.png");
        let _ = std::fs::write(&temp_png, PNG_LOGO);

        let fallback_ico = std::env::temp_dir().join("holad_app_icon.ico");
        let _ = std::fs::write(&fallback_ico, ico_bytes);

        // 1.1 Папка C:\Temp\holad_icons\ (исторический путь, доступный всем службам Windows)
        let c_temp_dir = PathBuf::from("C:\\Temp\\holad_icons");
        if std::fs::create_dir_all(&c_temp_dir).is_ok() {
            let _ = std::fs::write(c_temp_dir.join(format!("{}.ico", name)), ico_bytes);
            let _ = std::fs::write(c_temp_dir.join("holad_logo.png"), PNG_LOGO);
        }

        // 2. Общесистемная папка C:\ProgramData\Holad\icons\ (гарантированные права для AudioSrv / LOCAL SERVICE)
        let mut final_path = temp_file;
        let mut final_png_path = temp_png;
        if let Ok(prog_data) = std::env::var("ProgramData") {
            let pd_dir = PathBuf::from(prog_data).join("Holad");
            let _ = std::fs::create_dir_all(&pd_dir);
            let _ = std::fs::write(pd_dir.join("holad_app_icon.ico"), ico_bytes);

            let pd_icons = pd_dir.join("icons");
            let _ = std::fs::create_dir_all(&pd_icons);
            let pd_file = pd_icons.join(format!("{}.ico", name));
            if std::fs::write(&pd_file, ico_bytes).is_ok() {
                final_path = pd_file;
            }
            let pd_png = pd_icons.join("holad_logo.png");
            if std::fs::write(&pd_png, PNG_LOGO).is_ok() {
                final_png_path = pd_png;
            }

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let _ = std::process::Command::new("icacls")
                    .args(&[
                        pd_dir.to_str().unwrap_or("C:\\ProgramData\\Holad"),
                        "/grant",
                        "*S-1-5-19:(OI)(CI)RX",
                        "*S-1-15-2-1:(OI)(CI)RX",
                        "*S-1-5-32-545:(OI)(CI)RX",
                        "/t",
                        "/c",
                        "/q",
                    ])
                    .creation_flags(0x08000000)
                    .status();

                let _ = std::process::Command::new("icacls")
                    .args(&[
                        "C:\\Temp\\holad_icons",
                        "/grant",
                        "*S-1-5-19:(OI)(CI)RX",
                        "*S-1-15-2-1:(OI)(CI)RX",
                        "*S-1-5-32-545:(OI)(CI)RX",
                        "/t",
                        "/c",
                        "/q",
                    ])
                    .creation_flags(0x08000000)
                    .status();

                if let Ok(exe_p) = std::env::current_exe() {
                    if let Some(exe_dir) = exe_p.parent() {
                        let _ = std::process::Command::new("icacls")
                            .args(&[
                                exe_dir.to_str().unwrap_or(""),
                                "/grant",
                                "*S-1-5-19:(OI)(CI)RX",
                                "*S-1-15-2-1:(OI)(CI)RX",
                                "*S-1-5-32-545:(OI)(CI)RX",
                                "/t",
                                "/c",
                                "/q",
                            ])
                            .creation_flags(0x08000000)
                            .status();
                    }
                }
            }
        }

        // 3. Регистрируем в реестре Windows для com.holad.desktop и msedgewebview2.exe (SMTC)
        register_registry_identity(&final_path, &final_png_path);

        final_path
    }

    /// Устанавливает активную иконку (выбранную в настройках: "wave_dark", "wave_light", "cassette")
    pub fn set_current_icon(icon_name: &str) {
        let file_path = match icon_name {
            "wave_light" => ensure_ico_file("holad_wave_light", ICO_WAVE_LIGHT),
            "cassette" => ensure_ico_file("holad_cassette", ICO_CASSETTE),
            _ => ensure_ico_file("holad_wave_dark", ICO_WAVE_DARK),
        };

        let path_str = format!("{}\0", file_path.to_string_lossy());
        let wide: Vec<u16> = path_str.encode_utf16().collect();

        if let Ok(mut lock) = CURRENT_ICON_WIDE.write() {
            *lock = Some(wide);
        }
        if let Ok(mut lock) = CURRENT_ICON_PATH.write() {
            *lock = Some(file_path);
        }

        invalidate_family_pids();
        let pids = get_family_pids(true);
        apply_icon_to_process_windows(&pids, true);
        // Немедленно обновляем уже активные сессии с новой иконкой
        update_audio_session_identity();
    }

    fn get_current_icon_wide() -> Option<Vec<u16>> {
        CURRENT_ICON_WIDE.read().ok().and_then(|lock| lock.clone())
    }

    /// Динамический сбор всех PID потомков нашего процесса (дети, внуки, WebView2 Audio Service).
    /// Использует кэш (60 секунд при обнаружении нескольких процессов, 5 секунд при старте),
    /// гарантируя отсутствие микрофризов операционной системы от частых вызовов CreateToolhelp32Snapshot.
    pub fn get_family_pids(force_refresh: bool) -> HashSet<u32> {
        if !force_refresh {
            if let Ok(lock) = FAMILY_CACHE.lock() {
                if let Some((cached_at, ref pids)) = *lock {
                    let cache_duration = if pids.len() > 1 {
                        std::time::Duration::from_secs(60)
                    } else {
                        std::time::Duration::from_secs(5)
                    };
                    if cached_at.elapsed() < cache_duration {
                        return pids.clone();
                    }
                }
            }
        }

        let my_pid = std::process::id();
        let mut family = HashSet::new();
        family.insert(my_pid);

        unsafe {
            if let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
                let mut entry = PROCESSENTRY32W::default();
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

                let mut parent_to_children: HashMap<u32, Vec<u32>> = HashMap::new();
                let mut process_names: HashMap<u32, String> = HashMap::new();

                if Process32FirstW(snapshot, &mut entry).is_ok() {
                    loop {
                        parent_to_children
                            .entry(entry.th32ParentProcessID)
                            .or_default()
                            .push(entry.th32ProcessID);

                        let null_pos = entry
                            .szExeFile
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(entry.szExeFile.len());
                        let exe_name = String::from_utf16_lossy(&entry.szExeFile[..null_pos]);
                        process_names.insert(entry.th32ProcessID, exe_name);

                        if Process32NextW(snapshot, &mut entry).is_err() {
                            break;
                        }
                    }
                }
                let _ = CloseHandle(snapshot);

                // BFS для нахождения всех потомков (дети, внуки, Audio Service WebView2)
                let mut queue = vec![my_pid];
                while let Some(current) = queue.pop() {
                    if let Some(children) = parent_to_children.get(&current) {
                        for &child in children {
                            if family.insert(child) {
                                queue.push(child);
                            }
                        }
                    }
                }

                // Также включаем любые процессы с именем Holad.exe
                for (pid, name) in &process_names {
                    if name.eq_ignore_ascii_case("Holad.exe") {
                        family.insert(*pid);
                    }
                }
            }
        }

        if let Ok(mut lock) = FAMILY_CACHE.lock() {
            *lock = Some((std::time::Instant::now(), family.clone()));
        }

        family
    }

    /// Сброс кэша PID при необходимости принудительного пересканирования
    pub fn invalidate_family_pids() {
        if let Ok(mut lock) = FAMILY_CACHE.lock() {
            *lock = None;
        }
    }

    /// Устанавливает значок Holad на все окна семейства процессов (Holad.exe + msedgewebview2.exe).
    /// Это гарантирует, что Windows Volume Mixer и параметры Windows 10/11, запрашивающие
    /// значок окна процесса через WM_GETICON, получают аутентичную четкую иконку Holad.
    fn apply_icon_to_process_windows(pids: &HashSet<u32>, force: bool) {
        if !force {
            if let Ok(lock) = LAST_WINDOW_ICON_APPLY.lock() {
                if let Some(last) = *lock {
                    if last.elapsed() < std::time::Duration::from_secs(3) {
                        return;
                    }
                }
            }
        }
        if let Ok(mut lock) = LAST_WINDOW_ICON_APPLY.lock() {
            *lock = Some(std::time::Instant::now());
        }

        use windows::Win32::UI::WindowsAndMessaging::{
            LoadImageW, IMAGE_ICON, LR_LOADFROMFILE,
            SendMessageTimeoutW, SMTO_ABORTIFHUNG, WM_SETICON, ICON_BIG, ICON_SMALL,
            EnumWindows, EnumChildWindows, GetWindowThreadProcessId,
        };
        use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
        use windows::core::BOOL;
        use std::os::windows::ffi::OsStrExt;

        struct EnumContext<'a> {
            pids: &'a HashSet<u32>,
            hwnds: Vec<HWND>,
        }

        unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let ctx = &mut *(lparam.0 as *mut EnumContext);
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if ctx.pids.contains(&pid) {
                ctx.hwnds.push(hwnd);
            }
            BOOL(1)
        }

        let mut ctx = EnumContext {
            pids,
            hwnds: Vec::new(),
        };

        unsafe {
            let _ = EnumWindows(Some(enum_proc), LPARAM(&mut ctx as *mut EnumContext as isize));

            let top_hwnds = ctx.hwnds.clone();
            for top in top_hwnds {
                let _ = EnumChildWindows(Some(top), Some(enum_proc), LPARAM(&mut ctx as *mut EnumContext as isize));
            }

            if ctx.hwnds.is_empty() {
                return;
            }

            let ico_path = CURRENT_ICON_PATH.read().ok().and_then(|p| p.clone())
                .unwrap_or_else(|| PathBuf::from("C:\\ProgramData\\Holad\\icons\\holad_wave_dark.ico"));

            let mut path_wide: Vec<u16> = ico_path.as_os_str().encode_wide().collect();
            path_wide.push(0);

            let h_big = LoadImageW(
                None,
                PCWSTR(path_wide.as_ptr()),
                IMAGE_ICON,
                32,
                32,
                LR_LOADFROMFILE,
            );
            let h_small = LoadImageW(
                None,
                PCWSTR(path_wide.as_ptr()),
                IMAGE_ICON,
                16,
                16,
                LR_LOADFROMFILE,
            );

            for hwnd in ctx.hwnds {
                if let Ok(big) = h_big {
                    if !big.0.is_null() {
                        let mut res = 0usize;
                        let _ = SendMessageTimeoutW(
                            hwnd,
                            WM_SETICON,
                            WPARAM(ICON_BIG as usize),
                            LPARAM(big.0 as isize),
                            SMTO_ABORTIFHUNG,
                            100,
                            Some(&mut res),
                        );
                    }
                }
                if let Ok(small) = h_small {
                    if !small.0.is_null() {
                        let mut res = 0usize;
                        let _ = SendMessageTimeoutW(
                            hwnd,
                            WM_SETICON,
                            WPARAM(ICON_SMALL as usize),
                            LPARAM(small.0 as isize),
                            SMTO_ABORTIFHUNG,
                            100,
                            Some(&mut res),
                        );
                    }
                }
            }
        }
    }

    /// Синхронизирует имя "Holad" и выбранную иконку в микшере громкости Windows
    pub fn update_audio_session_identity() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let mut family_pids = get_family_pids(false);
            let icon_path_wide = match get_current_icon_wide() {
                Some(p) => p,
                None => {
                    // Если ещё не инициализировано, ставим wave_dark
                    set_current_icon("wave_dark");
                    get_current_icon_wide().unwrap_or_default()
                }
            };

            if icon_path_wide.is_empty() {
                return;
            }

            let enumerator: IMMDeviceEnumerator = match CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                Ok(e) => e,
                Err(_) => return,
            };

            let app_name = w!("Holad");

            // Canonical icon path: всегда используем файл .ico на системном диске C: (C:\ProgramData\Holad\icons\),
            // для которого явно выданы права чтения учетной записи NT AUTHORITY\LOCAL SERVICE (служба Windows AudioSrv).
            let target_wide = &icon_path_wide;

            let exe_icon_wide: Option<Vec<u16>> = std::env::current_exe().ok().map(|exe_path| {
                let s = format!("{}\0", exe_path.to_string_lossy());
                s.encode_utf16().collect()
            });

            let target_icon_pcwstr = PCWSTR(target_wide.as_ptr());

            let mut devices = Vec::new();
            if let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) {
                if let Ok(count) = collection.GetCount() {
                    for d in 0..count {
                        if let Ok(dev) = collection.Item(d) {
                            devices.push(dev);
                        }
                    }
                }
            }

            if devices.is_empty() {
                if let Ok(d) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                    devices.push(d);
                }
            }

            for device in devices {
                let session_manager: IAudioSessionManager2 = match device.Activate(CLSCTX_ALL, None) {
                    Ok(sm) => sm,
                    Err(_) => continue,
                };

                let session_enumerator: IAudioSessionEnumerator = match session_manager.GetSessionEnumerator() {
                    Ok(se) => se,
                    Err(_) => continue,
                };

                let count = match session_enumerator.GetCount() {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                for i in 0..count {
                    if let Ok(control) = session_enumerator.GetSession(i) {
                        if let Ok(control2) = control.cast::<IAudioSessionControl2>() {
                            if let Ok(pid) = control2.GetProcessId() {
                                let mut is_match = family_pids.contains(&pid);
                                if !is_match {
                                    // Если PID не был в начальном кэше, производим свежий снимок
                                    let fresh_pids = get_family_pids(true);
                                    if fresh_pids.contains(&pid) {
                                        is_match = true;
                                        family_pids = fresh_pids;
                                    }
                                }

                                if is_match {
                                    let _ = control.SetDisplayName(app_name, std::ptr::null());
                                    let _ = control2.SetDisplayName(app_name, std::ptr::null());

                                    let res1 = control.SetIconPath(target_icon_pcwstr, std::ptr::null());
                                    let _ = control2.SetIconPath(target_icon_pcwstr, std::ptr::null());

                                    if res1.is_err() {
                                        if let Some(ref exe_wide) = exe_icon_wide {
                                            let exe_pcwstr = PCWSTR(exe_wide.as_ptr());
                                            let _ = control.SetIconPath(exe_pcwstr, std::ptr::null());
                                            let _ = control2.SetIconPath(exe_pcwstr, std::ptr::null());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// Запускает серию ультрабыстрых попыток (0, 15, 35, 70, 120, 200, 350, 550, 850, 1300, 2000 мс)
    /// при старте воспроизведения для мгновенного перехвата сессии в EarTrumpet и микшере Windows.
    pub fn trigger_sync_burst() {
        invalidate_family_pids();
        std::thread::spawn(|| {
            let delays = [0, 15, 35, 70, 120, 200, 350, 550, 850, 1300, 2000];
            for delay in delays {
                if delay > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(delay));
                }
                update_audio_session_identity();
            }
        });
    }

    /// Форматирует имя устройства для отображения в UI, устраняя технические драйверные суффиксы
    /// (например, "Динамики (Realtek High Definition Audio)" -> "Динамики",
    /// "Наушники (HyperX Cloud III Wireless)" -> "HyperX Cloud III Wireless",
    /// "Стерео микшер (Realtek Audio)" -> "Стерео микшер").
    pub fn format_clean_device_name(name: &str, is_headphones: bool) -> String {
        let trimmed = name.trim();
        let lower = trimmed.to_lowercase();

        let driver_junk_keywords = [
            "стерео микшер",
            "stereo mix",
            "high definition audio device",
            "устройство с поддержкой high definition audio",
            "realtek high definition audio",
            "realtek audio",
            "realtek(r) audio",
            "realtek",
        ];

        // Разбор паттерна "Outer (Inner)"
        if let (Some(open_idx), Some(close_idx)) = (trimmed.find('('), trimmed.rfind(')')) {
            if open_idx < close_idx {
                let outer = trimmed[..open_idx].trim();
                let inner = trimmed[open_idx + 1..close_idx].trim();
                let inner_lower = inner.to_lowercase();

                let is_inner_junk = driver_junk_keywords.iter().any(|&junk| inner_lower.contains(junk));
                if is_inner_junk {
                    if !outer.is_empty() {
                        return outer.to_string();
                    } else if is_headphones {
                        return "Наушники".to_string();
                    } else {
                        return "Динамики".to_string();
                    }
                }

                // Если во внешнем названии общее обозначение ("Наушники", "Headphones", "Гарнитура", "Headset"),
                // а внутри реальная модель наушников (например, "HyperX Cloud III Wireless", "JBL TUNE510BT")
                let outer_lower = outer.to_lowercase();
                if (outer_lower == "наушники"
                    || outer_lower == "headphones"
                    || outer_lower == "гарнитура"
                    || outer_lower == "headset")
                    && !inner.is_empty()
                {
                    return inner.to_string();
                }
            }
        }

        let is_entirely_junk = driver_junk_keywords.iter().any(|&junk| lower.contains(junk));
        if is_entirely_junk {
            if lower.contains("микшер") || lower.contains("mixer") {
                return "Стерео микшер".to_string();
            }
            if is_headphones {
                return "Наушники".to_string();
            } else {
                return "Динамики".to_string();
            }
        }

        trimmed.to_string()
    }

    /// Считывает информацию о текущем дефолтном эндпоинте вывода звука Windows:
    /// возвращает (endpoint_id, NativeAudioDevice)
    pub fn get_default_audio_endpoint_info() -> Option<(String, super::NativeAudioDevice)> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let default_device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia).ok()?;

            let device_id = default_device.GetId().ok().and_then(|pwstr| {
                let s = pwstr.to_string().ok();
                windows::Win32::System::Com::CoTaskMemFree(Some(pwstr.0 as *const _));
                s
            }).unwrap_or_default();

            if !device_id.is_empty() {
                if let Ok(lock) = CACHED_ENDPOINT.lock() {
                    if let Some((ref cached_id, ref cached_dev)) = *lock {
                        if cached_id == &device_id {
                            return Some((device_id, cached_dev.clone()));
                        }
                    }
                }
            }

            let mut raw_name = String::new();
            let mut form_factor: Option<u32> = None;

            if let Ok(store) = default_device.OpenPropertyStore(windows::Win32::System::Com::STGM(0)) {
                // 1. PKEY_Device_FriendlyName (fmtid: a45c254e-df1c-4efd-8020-67d146a850e0, pid: 14)
                let pkey_name = windows::Win32::Foundation::PROPERTYKEY {
                    fmtid: windows::core::GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
                    pid: 14,
                };
                if let Ok(val) = store.GetValue(&pkey_name) {
                    raw_name = val.to_string();
                    let mut mut_val = val;
                    let _ = windows::Win32::System::Com::StructuredStorage::PropVariantClear(&mut mut_val);
                }

                // Fallback 1: DEVPKEY_DeviceInterface_FriendlyName (fmtid: 026e516e-b814-414b-83cd-856d6fef4822, pid: 2)
                if raw_name.trim().is_empty() {
                    let pkey_desc = windows::Win32::Foundation::PROPERTYKEY {
                        fmtid: windows::core::GUID::from_u128(0x026e516e_b814_414b_83cd_856d6fef4822),
                        pid: 2,
                    };
                    if let Ok(val) = store.GetValue(&pkey_desc) {
                        raw_name = val.to_string();
                        let mut mut_val = val;
                        let _ = windows::Win32::System::Com::StructuredStorage::PropVariantClear(&mut mut_val);
                    }
                }

                // Fallback 2: DEVPKEY_Device_DeviceDesc (fmtid: b3f8fa53-0004-438e-9003-51a46e139bfc, pid: 6)
                if raw_name.trim().is_empty() {
                    let pkey_bus = windows::Win32::Foundation::PROPERTYKEY {
                        fmtid: windows::core::GUID::from_u128(0xb3f8fa53_0004_438e_9003_51a46e139bfc),
                        pid: 6,
                    };
                    if let Ok(val) = store.GetValue(&pkey_bus) {
                        raw_name = val.to_string();
                        let mut mut_val = val;
                        let _ = windows::Win32::System::Com::StructuredStorage::PropVariantClear(&mut mut_val);
                    }
                }

                // 2. Query PKEY_AudioEndpoint_FormFactor
                // Standard Windows SDK: fmtid: 1da5d803-d492-4edd-8c23-e0c0ffee7f0e, pid: 0
                if let Ok(val) = store.GetValue(&windows::Win32::Media::Audio::PKEY_AudioEndpoint_FormFactor) {
                    if let Ok(num) = val.to_string().trim().parse::<u32>() {
                        form_factor = Some(num);
                    }
                    let mut mut_val = val;
                    let _ = windows::Win32::System::Com::StructuredStorage::PropVariantClear(&mut mut_val);
                }

                // Alternative GUID fallback (fmtid: 1da5d803-d346-45ab-9fde-070b4a41639c, pid: 0)
                if form_factor.is_none() {
                    let pkey_ff_alt = windows::Win32::Foundation::PROPERTYKEY {
                        fmtid: windows::core::GUID::from_u128(0x1da5d803_d346_45ab_9fde_070b4a41639c),
                        pid: 0,
                    };
                    if let Ok(val) = store.GetValue(&pkey_ff_alt) {
                        if let Ok(num) = val.to_string().trim().parse::<u32>() {
                            form_factor = Some(num);
                        }
                        let mut mut_val = val;
                        let _ = windows::Win32::System::Com::StructuredStorage::PropVariantClear(&mut mut_val);
                    }
                }
            }

            if raw_name.trim().is_empty() {
                if device_id.is_empty() {
                    return None;
                }
                raw_name = "Default Audio Output".to_string();
            }

            // EndpointFormFactor:
            // 3 = Headphones, 5 = Headset, 6 = Handset
            let form_factor_is_headphones = matches!(form_factor, Some(3 | 5 | 6));

            let lower = raw_name.to_lowercase();

            // Universal functional descriptors for Bluetooth / wireless (no hardcoded brand names)
            let is_bt = lower.contains("bluetooth")
                || lower.contains("wireless")
                || lower.split(|c: char| !c.is_alphanumeric()).any(|w| w == "bt" || (w.len() > 2 && w.ends_with("bt")));

            // Universal functional descriptors for headphones / headsets / in-ear / buds
            let is_hp_keyword = is_bt
                || lower.contains("headphone")
                || lower.contains("headphones")
                || lower.contains("headset")
                || lower.contains("earphone")
                || lower.contains("earphones")
                || lower.contains("earbuds")
                || lower.contains("buds")
                || lower.contains("pods")
                || lower.contains("in-ear")
                || lower.contains("iem")
                || lower.contains("наушник")
                || lower.contains("гарнитур");

            // Hardware FormFactor (3, 5, 6) grants headphones status unconditionally; fallback to functional keywords
            let is_hp = form_factor_is_headphones || is_hp_keyword;

            let clean_name = format_clean_device_name(&raw_name, is_hp);

            let device_type = if is_bt {
                "bluetooth".to_string()
            } else if is_hp {
                "wired".to_string()
            } else {
                "speaker".to_string()
            };

            let result_device = super::NativeAudioDevice {
                name: clean_name,
                is_headphones: is_hp,
                device_type,
            };

            if let Ok(mut lock) = CACHED_ENDPOINT.lock() {
                *lock = Some((device_id.clone(), result_device.clone()));
            }

            Some((device_id, result_device))
        }
    }

    /// Возвращает активное аудиоустройство вывода в Windows (например, "HyperX Cloud III Wireless", "Динамики")
    pub fn get_default_audio_device() -> Option<super::NativeAudioDevice> {
        get_default_audio_endpoint_info().map(|(_, dev)| dev)
    }

    /// Запускает фоновый супервизор: поддержание сессий при смене устройств (интервал 5000 мс)
    pub fn start_audio_session_supervisor() {
        set_current_icon("wave_dark");

        std::thread::spawn(|| {
            loop {
                update_audio_session_identity();
                std::thread::sleep(std::time::Duration::from_millis(5000));
            }
        });
    }

    /// Запускает фоновый монитор аудиоустройств: отслеживает смену вывода,
    /// мгновенно посылает "audio-becoming-noisy" при отключении наушников (кейс/штекер)
    /// и "audio-device-changed" с новыми метаданными.
    pub fn start_audio_device_supervisor(app: tauri::AppHandle) {
        use tauri::Emitter;

        std::thread::spawn(move || {
            let mut last_device_id: Option<String> = None;
            let mut last_is_headphones: bool = false;
            let mut initialized = false;

            loop {
                let current = get_default_audio_endpoint_info();

                match current {
                    Some((current_id, current_dev)) => {
                        let device_changed = last_device_id.as_deref() != Some(&current_id)
                            || last_is_headphones != current_dev.is_headphones;

                        if !initialized {
                            last_is_headphones = current_dev.is_headphones;
                            last_device_id = Some(current_id);
                            initialized = true;
                        } else if device_changed {
                            log::info!(
                                "[AudioDevice] Default audio endpoint changed: '{}' (headphones: {}, type: {})",
                                current_dev.name,
                                current_dev.is_headphones,
                                current_dev.device_type
                            );

                            // Disconnect check: headphones were active, but now active device is not headphones
                            if last_is_headphones && !current_dev.is_headphones {
                                log::warn!("[AudioDevice] Headphones disconnected/removed! Emitting audio-becoming-noisy");
                                let _ = app.emit("audio-becoming-noisy", ());
                            }

                            let _ = app.emit("audio-device-changed", &current_dev);

                            // Capture new device's session in Windows Volume Mixer
                            trigger_sync_burst();

                            last_is_headphones = current_dev.is_headphones;
                            last_device_id = Some(current_id);
                        }
                    }
                    None => {
                        if initialized && last_is_headphones {
                            log::warn!("[AudioDevice] Audio endpoint lost! Emitting audio-becoming-noisy");
                            let _ = app.emit("audio-becoming-noisy", ());
                            last_is_headphones = false;
                            last_device_id = None;
                        }
                    }
                }

                std::thread::sleep(std::time::Duration::from_millis(1000));
            }
        });
    }
}

#[cfg(target_os = "linux")]
pub mod linux_audio {
    use std::process::Command;

    pub fn get_default_audio_device() -> Option<super::NativeAudioDevice> {
        // 1. Try wpctl (PipeWire - default on modern Linux: Ubuntu 22.04+, Fedora, Arch, Debian 12+)
        if let Ok(output) = Command::new("wpctl").args(["inspect", "@DEFAULT_AUDIO_SINK@"]).output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("node.description =") || trimmed.starts_with("device.description =") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            let name = val.trim().trim_matches('"').trim().to_string();
                            if !name.is_empty() {
                                return Some(classify_device(name));
                            }
                        }
                    }
                }
            }
        }

        // 2. Try pactl (PulseAudio fallback)
        if let Ok(output) = Command::new("pactl").args(["get-default-sink"]).output() {
            if output.status.success() {
                let default_sink = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !default_sink.is_empty() {
                    if let Ok(list_out) = Command::new("pactl").args(["list", "sinks"]).output() {
                        let list_text = String::from_utf8_lossy(&list_out.stdout);
                        let mut found_sink = false;
                        for line in list_text.lines() {
                            let line_t = line.trim();
                            if line_t.starts_with("Name: ") && line_t.contains(&default_sink) {
                                found_sink = true;
                            } else if found_sink && line_t.starts_with("Description: ") {
                                let desc = line_t.strip_prefix("Description: ").unwrap_or("").trim().to_string();
                                if !desc.is_empty() {
                                    return Some(classify_device(desc));
                                }
                            } else if found_sink && line_t.starts_with("Name: ") {
                                break;
                            }
                        }
                    }
                    return Some(classify_device(default_sink));
                }
            }
        }

        None
    }

    fn classify_device(name: String) -> super::NativeAudioDevice {
        let lower = name.to_lowercase();
        let is_bt = lower.contains("bluetooth")
            || lower.contains("wireless")
            || lower.split(|c: char| !c.is_alphanumeric()).any(|w| w == "bt" || (w.len() > 2 && w.ends_with("bt")));
        let is_hp = is_bt
            || lower.contains("headphone")
            || lower.contains("headphones")
            || lower.contains("headset")
            || lower.contains("earphone")
            || lower.contains("earphones")
            || lower.contains("earbuds")
            || lower.contains("buds")
            || lower.contains("pods")
            || lower.contains("in-ear")
            || lower.contains("iem")
            || lower.contains("наушник")
            || lower.contains("гарнитур");

        super::NativeAudioDevice {
            name,
            is_headphones: is_hp,
            device_type: if is_bt {
                "bluetooth".to_string()
            } else if is_hp {
                "wired".to_string()
            } else {
                "speaker".to_string()
            },
        }
    }
}

#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
pub mod windows_audio {
    pub fn set_current_icon(_icon_name: &str) {}
    pub fn update_audio_session_identity() {}
    pub fn trigger_sync_burst() {}
    pub fn start_audio_session_supervisor() {}
    pub fn start_audio_device_supervisor(_app: tauri::AppHandle) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "windows")]
    fn test_windows_audio_device() {
        let dev = windows_audio::get_default_audio_device();
        println!("Detected Windows Audio Device: {:?}", dev);
        assert!(dev.is_some());
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_format_clean_device_name() {
        assert_eq!(
            windows_audio::format_clean_device_name("Динамики (Realtek High Definition Audio)", false),
            "Динамики"
        );
        assert_eq!(
            windows_audio::format_clean_device_name("Speakers (High Definition Audio Device)", false),
            "Speakers"
        );
        assert_eq!(
            windows_audio::format_clean_device_name("Наушники (HyperX Cloud III Wireless)", true),
            "HyperX Cloud III Wireless"
        );
        assert_eq!(
            windows_audio::format_clean_device_name("Наушники (Realtek Audio)", true),
            "Наушники"
        );
        assert_eq!(
            windows_audio::format_clean_device_name("Стерео микшер (Realtek Audio)", false),
            "Стерео микшер"
        );
        assert_eq!(
            windows_audio::format_clean_device_name("Realtek High Definition Audio", false),
            "Динамики"
        );
        assert_eq!(
            windows_audio::format_clean_device_name("JBL TUNE510BT", true),
            "JBL TUNE510BT"
        );
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_inspect_and_set_sessions() {
        use windows::core::Interface;
        use windows::Win32::Media::Audio::{
            MMDeviceEnumerator, IMMDeviceEnumerator, eRender,
            IAudioSessionManager2, IAudioSessionEnumerator, IAudioSessionControl2,
            DEVICE_STATE_ACTIVE,
        };
        use windows::Win32::System::Com::{CoInitializeEx, CoCreateInstance, CLSCTX_ALL, COINIT_MULTITHREADED};

        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).unwrap();

            if let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) {
                let count = collection.GetCount().unwrap_or(0);
                println!("Active Render Endpoints: {}", count);
                for d in 0..count {
                    if let Ok(device) = collection.Item(d) {
                        let sm: IAudioSessionManager2 = match device.Activate(CLSCTX_ALL, None) {
                            Ok(s) => s,
                            Err(e) => {
                                println!("Activate failed: {:?}", e);
                                continue;
                            }
                        };
                        let se: IAudioSessionEnumerator = match sm.GetSessionEnumerator() {
                            Ok(s) => s,
                            Err(e) => {
                                println!("GetSessionEnumerator failed: {:?}", e);
                                continue;
                            }
                        };
                        let sess_count = se.GetCount().unwrap_or(0);
                        println!("Device [{}] has {} sessions", d, sess_count);
                        let family = windows_audio::get_family_pids(true);
                        println!("  Family PIDs: {:?}", family);
                        for i in 0..sess_count {
                            if let Ok(control) = se.GetSession(i) {
                                if let Ok(c2) = control.cast::<IAudioSessionControl2>() {
                                    let pid = c2.GetProcessId().unwrap_or(0);
                                    let disp_str = control.GetDisplayName().map(|p| p.to_string().unwrap_or_default()).unwrap_or_default();
                                    let icon_str = control.GetIconPath().map(|p| p.to_string().unwrap_or_default()).unwrap_or_default();
                                    let is_in_fam = family.contains(&pid);
                                    println!("  [Session {}] PID: {}, DisplayName: '{}', IconPath: '{}', in_family: {}", i, pid, disp_str, icon_str, is_in_fam);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}