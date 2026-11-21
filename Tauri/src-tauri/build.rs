fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new().plugin(
      "mediaSession",
      tauri_build::InlinedPlugin::new()
        .commands(&[
          "setMetadata",
          "set_metadata",
          "setPlaybackState",
          "set_playback_state",
          "stop",
        ])
        .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
    ),
  )
  .expect("failed to run tauri-build");
}
