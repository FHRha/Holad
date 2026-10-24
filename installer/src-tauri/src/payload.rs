use std::fs::{self, File};
use std::io::{self, Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use zip::ZipArchive;

pub static EMBEDDED_PAYLOAD: &[u8] = include_bytes!("../payload.zip");

/// Attempts to create or overwrite a file, retrying if it is locked by another process
/// (e.g. ERROR_SHARING_VIOLATION / ERROR_ACCESS_DENIED during process teardown or antivirus scan).
fn create_file_with_retry(path: &Path) -> io::Result<File> {
    const MAX_RETRIES: usize = 25;
    const RETRY_DELAY: Duration = Duration::from_millis(200);

    let mut last_error = None;

    for attempt in 1..=MAX_RETRIES {
        match File::create(path) {
            Ok(file) => return Ok(file),
            Err(e) => {
                let raw_os = e.raw_os_error();
                // 32 = ERROR_SHARING_VIOLATION, 5 = ERROR_ACCESS_DENIED
                let is_transient = raw_os == Some(32) || raw_os == Some(5) || e.kind() == io::ErrorKind::PermissionDenied;

                if is_transient && attempt < MAX_RETRIES {
                    // If locked after several retries, attempt another process kill pass
                    if attempt == 5 || attempt == 15 {
                        let _ = crate::process::kill_holad_process();
                    }
                    last_error = Some(e);
                    std::thread::sleep(RETRY_DELAY);
                    continue;
                }
                return Err(e);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| {
        io::Error::new(io::ErrorKind::Other, "Failed to create file after retries")
    }))
}

/// Extracts a ZipArchive to the target installation directory with progress callbacks
fn extract_from_reader<R: Read + io::Seek, F>(
    mut archive: ZipArchive<R>,
    target_dir: &Path,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(f64, &str),
{
    let total_files = archive.len();
    if total_files == 0 {
        return Ok(());
    }

    for i in 0..total_files {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read archive entry #{}: {}", i, e))?;

        let raw_name = file.name().to_string();
        // Prevent path traversal attacks
        let enclosed = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };

        // Normalize path components to strip leading "./" or relative prefixes
        let mut clean_rel = PathBuf::new();
        for component in enclosed.components() {
            if let Component::Normal(c) = component {
                clean_rel.push(c);
            }
        }

        if clean_rel.as_os_str().is_empty() {
            continue;
        }

        let out_path = target_dir.join(&clean_rel);

        let percent = ((i as f64) / (total_files as f64)) * 100.0;
        on_progress(percent, &raw_name);

        if file.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory {:?}: {}", out_path, e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent dir {:?}: {}", parent, e))?;
                }
            }

            let mut outfile = create_file_with_retry(&out_path)
                .map_err(|e| format!("Failed to create output file {:?}: {}", out_path, e))?;

            io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write data to {:?}: {}", out_path, e))?;
        }
    }

    on_progress(100.0, "Complete");
    Ok(())
}

/// Unpacks the Holad payload into the specified directory.
/// Prefers external payload.zip in the same directory as the installer (useful for CI/packaging),
/// or falls back to the embedded payload archive.
pub fn unpack_payload<F>(target_dir: &Path, on_progress: F) -> Result<(), String>
where
    F: FnMut(f64, &str),
{
    fs::create_dir_all(target_dir)
        .map_err(|e| format!("Failed to create target install directory: {}", e))?;

    // Check if an external payload.zip is present next to the installer binary
    let external_payload = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|dir| dir.join("payload.zip")))
        .filter(|p| p.is_file());

    if let Some(ext_path) = external_payload {
        let f = File::open(&ext_path)
            .map_err(|e| format!("Failed to open external payload {:?}: {}", ext_path, e))?;
        let archive = ZipArchive::new(f)
            .map_err(|e| format!("Failed to parse external zip archive: {}", e))?;
        extract_from_reader(archive, target_dir, on_progress)
    } else {
        let cursor = Cursor::new(EMBEDDED_PAYLOAD);
        let archive = ZipArchive::new(cursor)
            .map_err(|e| format!("Failed to parse embedded zip archive: {}", e))?;
        extract_from_reader(archive, target_dir, on_progress)
    }
}
