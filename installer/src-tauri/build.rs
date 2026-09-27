fn main() {
    let payload_path = std::path::Path::new("payload.zip");
    if !payload_path.exists() {
        // Standard 22-byte End of Central Directory record for an empty ZIP
        const EMPTY_ZIP: [u8; 22] = [
            0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        let _ = std::fs::write(payload_path, &EMPTY_ZIP);
    }
    println!("cargo:rerun-if-changed=payload.zip");
    tauri_build::build()
}
