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

    const ICON_WAVE_DARK: &[u8] = include_bytes!("../../../client/public/icons/favicon_dark.png");
    const ICON_WAVE_LIGHT: &[u8] = include_bytes!("../../../client/public/icons/favicon_light.png");
    const ICON_CASSETTE: &[u8] = include_bytes!("../../../client/public/icons/logo_cassette.png");

    static CURRENT_ICON_WIDE: RwLock<Option<Vec<u16>>> = RwLock::new(None);
    static FAMILY_PIDS: Mutex<Option<HashSet<u32>>> = Mutex::new(None);

    /// Оборачивает PNG-байты в валидный контейнер Windows ICO (стандарт Vista, 7, 8, 10, 11)
    fn png_to_ico(png_data: &[u8]) -> Vec<u8> {
        let (width, height) = if png_data.len() >= 24
            && &png_data[0..8] == b"\x89PNG\r\n\x1a\n"
            && &png_data[12..16] == b"IHDR"
        {
            let w = u32::from_be_bytes([png_data[16], png_data[17], png_data[18], png_data[19]]);
            let h = u32::from_be_bytes([png_data[20], png_data[21], png_data[22], png_data[23]]);
            (w, h)
        } else {
            (256, 256)
        };

        let b_width = if width >= 256 { 0u8 } else { width as u8 };
        let b_height = if height >= 256 { 0u8 } else { height as u8 };

        let mut ico = Vec::with_capacity(22 + png_data.len());
        // ICONDIR (6 bytes)
        ico.extend_from_slice(&0u16.to_le_bytes()); // idReserved = 0
        ico.extend_from_slice(&1u16.to_le_bytes()); // idType = 1 (Icon)
        ico.extend_from_slice(&1u16.to_le_bytes()); // idCount = 1

        // ICONDIRENTRY (16 bytes)
        ico.push(b_width);
        ico.push(b_height);
        ico.push(0); // bColorCount
        ico.push(0); // bReserved
        ico.extend_from_slice(&1u16.to_le_bytes());  // wPlanes
        ico.extend_from_slice(&32u16.to_le_bytes()); // wBitCount
        ico.extend_from_slice(&(png_data.len() as u32).to_le_bytes()); // dwBytesInRes
        ico.extend_from_slice(&22u32.to_le_bytes()); // dwImageOffset = 22

        // Raw PNG stream
        ico.extend_from_slice(png_data);
        ico
    }

    fn ensure_ico_file(name: &str, png_bytes: &[u8]) -> PathBuf {
        let dir = std::env::temp_dir().join("holad_icons");
        let _ = std::fs::create_dir_all(&dir);
        let file_path = dir.join(format!("{}.ico", name));

        let ico_bytes = png_to_ico(png_bytes);
        let needs_write = !file_path.exists()
            || std::fs::metadata(&file_path).map(|m| m.len() as usize).unwrap_or(0) != ico_bytes.len();

        if needs_write {
            let _ = std::fs::write(&file_path, &ico_bytes);
        }
        file_path
    }

    /// Устанавливает активную иконку (выбранную в настройках: "wave_dark", "wave_light", "cassette")
    pub fn set_current_icon(icon_name: &str) {
        let file_path = match icon_name {
            "wave_light" => ensure_ico_file("holad_wave_light", ICON_WAVE_LIGHT),
            "cassette" => ensure_ico_file("holad_cassette", ICON_CASSETTE),
            _ => ensure_ico_file("holad_wave_dark", ICON_WAVE_DARK),
        };

        let path_str = file_path.to_string_lossy();
        let mut wide: Vec<u16> = path_str.encode_utf16().collect();
        wide.push(0);

        if let Ok(mut lock) = CURRENT_ICON_WIDE.write() {
            *lock = Some(wide);
        }

        // Немедленно обновляем уже активные сессии с новой иконкой
        update_audio_session_identity();
    }

    fn get_current_icon_wide() -> Option<Vec<u16>> {
        CURRENT_ICON_WIDE.read().ok().and_then(|lock| lock.clone())
    }

    /// Кэшированный сбор всех PID потомков нашего процесса (дети, внуки, Audio Service).
    /// Выполняется 1 раз при старте, полностью устраняя повторные снимки процессов всей ОС.
    fn get_family_pids() -> HashSet<u32> {
        if let Ok(cached) = FAMILY_PIDS.lock() {
            if let Some(ref pids) = *cached {
                return pids.clone();
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

                if Process32FirstW(snapshot, &mut entry).is_ok() {
                    loop {
                        parent_to_children
                            .entry(entry.th32ParentProcessID)
                            .or_default()
                            .push(entry.th32ProcessID);

                        if Process32NextW(snapshot, &mut entry).is_err() {
                            break;
                        }
                    }
                }
                let _ = CloseHandle(snapshot);

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
            }
        }

        if let Ok(mut cached) = FAMILY_PIDS.lock() {
            *cached = Some(family.clone());
        }

        family
    }

    /// Сброс кэша PID при необходимости пересканирования
    #[allow(dead_code)]
    pub fn invalidate_family_pids() {
        if let Ok(mut cached) = FAMILY_PIDS.lock() {
            *cached = None;
        }
    }

    /// Синхронизирует имя "Holad" и выбранную иконку в микшере громкости Windows
    pub fn update_audio_session_identity() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let family_pids = get_family_pids();
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
            let icon_pcwstr = PCWSTR(icon_path_wide.as_ptr());

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
                                if family_pids.contains(&pid) {
                                    let _ = control.SetDisplayName(app_name, std::ptr::null());
                                    let _ = control.SetIconPath(icon_pcwstr, std::ptr::null());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// Запускает серию быстрых попыток (0, 150, 400, 1000 мс) при старте воспроизведения для немедленного перехвата сессии
    pub fn trigger_sync_burst() {
        std::thread::spawn(|| {
            let delays = [0, 150, 400, 1000];
            for delay in delays {
                if delay > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(delay));
                }
                update_audio_session_identity();
            }
        });
    }

    /// Запускает фоновый супервизор: мгновенный подхват сессий при переключении треков или смене устройств
    pub fn start_audio_session_supervisor() {
        set_current_icon("wave_dark");

        std::thread::spawn(|| {
            loop {
                update_audio_session_identity();
                std::thread::sleep(std::time::Duration::from_secs(10));
            }
        });
    }
}

#[cfg(not(target_os = "windows"))]
pub mod windows_audio {
    pub fn set_current_icon(_icon_name: &str) {}
    pub fn update_audio_session_identity() {}
    pub fn trigger_sync_burst() {}
    pub fn start_audio_session_supervisor() {}
}