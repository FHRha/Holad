use std::fs::{self, File};
use std::io::{self, Cursor, Read};
use std::path::Path;
use zip::ZipArchive;

pub static EMBEDDED_PAYLOAD: &[u8] = include_bytes!("../payload.zip");

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

        let out_path = target_dir.join(enclosed);

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

            let mut outfile = File::create(&out_path)
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
