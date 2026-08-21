const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Usage: node build_all.js [--no-archive | --skip-archive] [--skip-client] [--skip-server] [--skip-tauri] [--skip-android]

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node build_all.js [options]

Options:
  --skip-client    Skip building the web client
  --skip-server    Skip building the server
  --skip-tauri     Skip building Tauri desktop app
  --skip-android   Skip building Capacitor Android app
  --skip-archive   Skip creating web server .tar.gz archive (alias: --no-archive)
  --help, -h       Show this help message
`);
  process.exit(0);
}

const createArchive = !args.includes('--no-archive') && !args.includes('--skip-archive');
const skipClient = args.includes('--skip-client');
const skipServer = args.includes('--skip-server');
const skipTauri = args.includes('--skip-tauri');
const skipAndroid = args.includes('--skip-android');

const ROOT_DIR = __dirname;
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');
const RELEASE_DIR = path.join(ARTIFACTS_DIR, 'holad-release');

// Version injection
const rawVersion = process.env.GITHUB_REF_NAME || process.env.RELEASE_VERSION;
if (rawVersion) {
  const version = rawVersion.startsWith('v') ? rawVersion.substring(1) : rawVersion;
  console.log(`Injecting version ${version} into project files...`);
  
  [
    path.join(ROOT_DIR, 'client', 'package.json'),
    path.join(ROOT_DIR, 'server', 'package.json'),
    path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'tauri.conf.json'),
    path.join(ROOT_DIR, 'Capacitor', 'package.json')
  ].forEach(file => {
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        data.version = version;
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
        console.log(`Updated version in ${path.basename(path.dirname(file))}/${path.basename(file)} to ${version}`);
      } catch (e) {
        console.warn(`Could not update version in ${file}:`, e.message);
      }
    }
  });

  // Update Cargo.toml
  const cargoTomlPath = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(cargoTomlPath)) {
    try {
      let cargoContent = fs.readFileSync(cargoTomlPath, 'utf8');
      cargoContent = cargoContent.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
      fs.writeFileSync(cargoTomlPath, cargoContent);
      console.log(`Updated version in Tauri/src-tauri/Cargo.toml to ${version}`);
    } catch (e) {
      console.warn(`Could not update version in Cargo.toml:`, e.message);
    }
  }

  // Update Capacitor build.gradle
  const buildGradlePath = path.join(ROOT_DIR, 'Capacitor', 'android', 'app', 'build.gradle');
  if (fs.existsSync(buildGradlePath)) {
    try {
      let gradleContent = fs.readFileSync(buildGradlePath, 'utf8');
      gradleContent = gradleContent.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
      fs.writeFileSync(buildGradlePath, gradleContent);
      console.log(`Updated versionName in Capacitor/android/app/build.gradle to ${version}`);
    } catch (e) {
      console.warn(`Could not update versionName in build.gradle:`, e.message);
    }
  }
}

function getEnv(envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'PATH';
  
  // Ensure cargo is in PATH for Tauri build
  const cargoPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cargo', 'bin');
  if (fs.existsSync(cargoPath)) {
    if (env[pathKey] && !env[pathKey].includes(cargoPath)) {
      env[pathKey] = `${cargoPath}${path.delimiter}${env[pathKey]}`;
    } else if (!env[pathKey]) {
      env[pathKey] = cargoPath;
    }
  }
  
  // Ensure JAVA_HOME is set for Capacitor build
  if (!env.JAVA_HOME) {
    const defaultJavaPaths = [
      'C:\\Program Files\\Microsoft\\jdk-21.0.11.10-hotspot',
      'C:\\Program Files\\Java\\jdk-21',
      'C:\\Program Files\\Android\\Android Studio\\jbr',
      'C:\\Program Files\\Eclipse Adoptium\\jdk-21',
      '/usr/lib/jvm/java-21-openjdk-amd64',
      '/usr/lib/jvm/default-java',
      '/usr/lib/jvm/java-17-openjdk-amd64',
      '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home',
      '/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home'
    ];
    for (const jPath of defaultJavaPaths) {
      if (fs.existsSync(jPath)) {
        env.JAVA_HOME = jPath;
        break;
      }
    }
  }

  // Prepend JAVA_HOME/bin to PATH if JAVA_HOME exists
  if (env.JAVA_HOME) {
    const javaBin = path.join(env.JAVA_HOME, 'bin');
    if (fs.existsSync(javaBin) && env[pathKey] && !env[pathKey].includes(javaBin)) {
      env[pathKey] = `${javaBin}${path.delimiter}${env[pathKey]}`;
    }
  }

  // Ensure ANDROID_HOME / ANDROID_SDK_ROOT is set if available
  if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
    const defaultAndroidPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
      path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk'),
      path.join(process.env.HOME || '', 'Android', 'Sdk'),
      path.join(process.env.HOME || '', 'Library', 'Android', 'sdk'),
      '/usr/lib/android-sdk'
    ];
    for (const aPath of defaultAndroidPaths) {
      if (aPath && fs.existsSync(aPath)) {
        env.ANDROID_HOME = aPath;
        env.ANDROID_SDK_ROOT = aPath;
        break;
      }
    }
  }

  return env;
}

function runCommand(taskName, command, cwd, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    if (!process.env.GITHUB_ACTIONS) {
      console.log(`[${taskName}] ⏳ Started: ${command}`);
    }
    
    const env = getEnv(envOverrides);
    
    const child = spawn(command, { cwd, env, shell: true });
    
    let output = '';
    
    child.stdout.on('data', data => {
      output += data.toString();
    });
    
    child.stderr.on('data', data => {
      output += data.toString();
    });
    
    child.on('close', code => {
      if (code === 0) {
        if (process.env.GITHUB_ACTIONS) {
          console.log(`::group::${taskName}`);
          console.log(output);
          console.log(`::endgroup::`);
        } else {
          console.log(`[${taskName}] ✔ Finished: ${command}`);
        }
        resolve();
      } else {
        console.error(`\n[ERROR] Task "${taskName}" failed: ${command}`);
        if (process.env.GITHUB_ACTIONS) {
          console.log(`::group::${taskName} (FAILED)`);
        }
        console.error(output);
        if (process.env.GITHUB_ACTIONS) {
          console.log(`::endgroup::`);
        }
        reject(new Error(`Command failed with code ${code}: ${command}`));
      }
    });

    child.on('error', err => {
      console.error(`\n[ERROR] Task "${taskName}" failed to start: ${command}`);
      console.error(err);
      reject(err);
    });
  });
}

function checkCommand(command, envOverrides = {}) {
  return new Promise(resolve => {
    const env = getEnv(envOverrides);
    const child = spawn(command, { env, shell: true, stdio: 'ignore' });
    child.on('close', code => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function isJavaAvailable(env) {
  if (env.JAVA_HOME) {
    const javaExe = path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (fs.existsSync(javaExe)) return true;
  }
  return await checkCommand('java -version', env);
}

function isAndroidSdkAvailable(env) {
  if (env.ANDROID_HOME && fs.existsSync(env.ANDROID_HOME)) return true;
  if (env.ANDROID_SDK_ROOT && fs.existsSync(env.ANDROID_SDK_ROOT)) return true;
  const localProps = path.join(ROOT_DIR, 'Capacitor', 'android', 'local.properties');
  if (fs.existsSync(localProps)) {
    try {
      const content = fs.readFileSync(localProps, 'utf8');
      if (content.includes('sdk.dir')) return true;
    } catch (e) {}
  }
  return false;
}

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function main() {
  console.log("Starting unified Holad release build process...");

  // Clean up previous builds and artifacts
  console.log("Cleaning up previous builds and artifacts...");
  try {
    if (fs.existsSync(ARTIFACTS_DIR)) {
      fs.rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn("Warning: Could not completely remove previous artifacts (they might be in use):", e.message);
  }
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const webTasks = [];

  // 1. Build Client (Base: /Holad/ for Web Release)
  if (!skipClient) {
    console.log("\n--- Scheduling Web Client Build (Base: /Holad/) ---");
    webTasks.push((async () => {
      await runCommand('Web Client Install', 'npx pnpm@10.28.2 install --reporter=silent', path.join(ROOT_DIR, 'client'));
      await runCommand('Web Client Build', 'npx pnpm@10.28.2 run build', path.join(ROOT_DIR, 'client'), { VITE_APP_BASE: '/Holad/' });
    })());
  }

  // 2. Build Server
  if (!skipServer) {
    console.log("\n--- Scheduling Server Build ---");
    webTasks.push((async () => {
      await runCommand('Server Install', 'npx pnpm@10.28.2 install --reporter=silent', path.join(ROOT_DIR, 'server'));
      await runCommand('Server Build', 'npx pnpm@10.28.2 run build', path.join(ROOT_DIR, 'server'));
    })());
  }

  if (webTasks.length > 0) {
    await Promise.all(webTasks);
  }

  // Copy to release folder (Server + Web Client bundle)
  if (!skipClient || !skipServer) {
    console.log("\n--- Preparing Web Release Bundle ---");
    fs.mkdirSync(path.join(RELEASE_DIR, 'client'), { recursive: true });
    fs.mkdirSync(path.join(RELEASE_DIR, 'server'), { recursive: true });

    if (fs.existsSync(path.join(ROOT_DIR, 'client', 'dist'))) {
      copyRecursiveSync(path.join(ROOT_DIR, 'client', 'dist'), path.join(RELEASE_DIR, 'client', 'dist'));
    }
    if (fs.existsSync(path.join(ROOT_DIR, 'server', 'dist'))) {
      copyRecursiveSync(path.join(ROOT_DIR, 'server', 'dist'), path.join(RELEASE_DIR, 'server', 'dist'));
      fs.copyFileSync(path.join(ROOT_DIR, 'server', 'package.json'), path.join(RELEASE_DIR, 'server', 'package.json'));
    }

    // Create .env.example
    fs.writeFileSync(path.join(RELEASE_DIR, 'server', '.env.example'), `PORT=4000
# If you want to manually bind the server, uncomment and edit the line below:
# NAVIDROME_ACCOUNTS='[{"url":"https://your-navidrome.com","user":"admin","token":"...","salt":"..."}]'
`);

    if (fs.existsSync(path.join(ROOT_DIR, 'holad_cli.sh'))) {
      fs.copyFileSync(path.join(ROOT_DIR, 'holad_cli.sh'), path.join(RELEASE_DIR, 'holad_cli.sh'));
    }

    // Startup scripts
    fs.writeFileSync(path.join(RELEASE_DIR, 'start.bat'), `@echo off
cd /d "%~dp0server"
if not exist "node_modules" (
    echo Installing production dependencies...
    call npm install --omit=dev
)
node dist\\index.js
pause
`);

    fs.writeFileSync(path.join(RELEASE_DIR, 'start.sh'), `#!/bin/bash
cd "$(dirname "$0")/server"
if [ ! -d "node_modules" ]; then
    echo "Installing production dependencies..."
    npm install --omit=dev
fi
node dist/index.js
`);
    try {
      fs.chmodSync(path.join(RELEASE_DIR, 'start.sh'), 0o755);
    } catch (e) {}

    // Archive the Web Server Release
    if (createArchive) {
      console.log("\n--- Creating Archive ---");
      const archiveName = `holad-web-release.tar.gz`;
      await runCommand('Web Release Archive', `tar -czf ${archiveName} holad-release`, ARTIFACTS_DIR);
      console.log(`Web server release archive is at artifacts/${archiveName}`);
    }
  }

  // Rebuild Client for Native Apps (Base: ./) if Tauri or Android is enabled
  if (!skipTauri || !skipAndroid) {
    console.log("\n--- Rebuilding Client for Native Apps (Base: ./) ---");
    if (!fs.existsSync(path.join(ROOT_DIR, 'client', 'node_modules'))) {
      console.log("node_modules missing, installing dependencies...");
      await runCommand('Native Client Install', 'npx pnpm@10.28.2 install --reporter=silent', path.join(ROOT_DIR, 'client'));
    }
    await runCommand('Native Client Build', 'npx pnpm@10.28.2 run build', path.join(ROOT_DIR, 'client'), { VITE_APP_BASE: './' });
  }

  // 3. Build Tauri Desktop Apps and Capacitor Android App in parallel
  const nativeTasks = [];

  if (!skipTauri) {
    nativeTasks.push((async () => {
      const env = getEnv();
      const cargoOk = await checkCommand('cargo --version', env);
      
      if (!cargoOk) {
        console.log("\n[SKIP] Skipping Tauri build (Rust/Cargo is not installed)");
        return;
      }

      console.log("\n--- Scheduling Tauri Build (Desktop App) ---");
      try {
        await runCommand('Tauri Build', 'npx @tauri-apps/cli build', path.join(ROOT_DIR, 'Tauri'));
        
        // Copy Tauri binaries and bundles to artifacts
        const tauriReleaseDir = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'target', 'release');
        const bundlesDir = path.join(tauriReleaseDir, 'bundle');
        
        // Standalone executables for Unix platforms (Linux / macOS)
        if (process.platform === 'linux') {
          const possibleLinuxBins = [
            path.join(tauriReleaseDir, 'holad'),
            path.join(tauriReleaseDir, 'Holad'),
            path.join(tauriReleaseDir, 'app')
          ];
          for (const bin of possibleLinuxBins) {
            if (fs.existsSync(bin)) {
              console.log(`Copying Linux standalone executable ${path.basename(bin)} to artifacts/Holad-Linux...`);
              fs.copyFileSync(bin, path.join(ARTIFACTS_DIR, 'Holad-Linux'));
              try { fs.chmodSync(path.join(ARTIFACTS_DIR, 'Holad-Linux'), 0o755); } catch (e) {}
              break;
            }
          }
        } else if (process.platform === 'darwin') {
          const possibleMacBins = [
            path.join(tauriReleaseDir, 'Holad'),
            path.join(tauriReleaseDir, 'holad'),
            path.join(tauriReleaseDir, 'app')
          ];
          for (const bin of possibleMacBins) {
            if (fs.existsSync(bin)) {
              console.log(`Copying macOS standalone executable ${path.basename(bin)} to artifacts/Holad-macOS...`);
              fs.copyFileSync(bin, path.join(ARTIFACTS_DIR, 'Holad-macOS'));
              try { fs.chmodSync(path.join(ARTIFACTS_DIR, 'Holad-macOS'), 0o755); } catch (e) {}
              break;
            }
          }
        }

        // Copy all bundles (MSI, NSIS setup .exe, AppImage, DEB, RPM, DMG, PKG)
        function copyBundlesRecursively(dir) {
          if (!fs.existsSync(dir)) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              // Do not recurse into macOS .app packages as directories
              if (!entry.name.endsWith('.app')) {
                copyBundlesRecursively(fullPath);
              }
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (['.msi', '.exe', '.deb', '.appimage', '.rpm', '.dmg', '.pkg', '.zip'].includes(ext)) {
                console.log(`Copying bundle installer ${entry.name} to artifacts...`);
                fs.copyFileSync(fullPath, path.join(ARTIFACTS_DIR, entry.name));

                // On Linux, CI expects *.AppImage with exact casing
                if (ext === '.appimage' && !entry.name.endsWith('.AppImage')) {
                  const upperName = entry.name.replace(/\.appimage$/i, '.AppImage');
                  fs.copyFileSync(fullPath, path.join(ARTIFACTS_DIR, upperName));
                }
              }
            }
          }
        }
        copyBundlesRecursively(bundlesDir);
      } catch (err) {
        console.error("\n[ERROR] Tauri build workflow failed!");
        throw err;
      }
    })());
  }

  if (!skipAndroid) {
    nativeTasks.push((async () => {
      if (fs.existsSync(path.join(ROOT_DIR, 'Capacitor', 'android'))) {
        const env = getEnv();
        const javaOk = await isJavaAvailable(env);
        const sdkOk = isAndroidSdkAvailable(env);

        if (!javaOk || !sdkOk) {
          const missing = [];
          if (!javaOk) missing.push("Java/JDK");
          if (!sdkOk) missing.push("Android SDK");
          console.log(`\n[SKIP] Skipping Capacitor Android build (${missing.join(' and ')} not found)`);
          return;
        }

        console.log("\n--- Scheduling Capacitor Build (Android App) ---");
        try {
          // Install dependencies first
          await runCommand('Capacitor Install', 'npx pnpm@10.28.2 install --reporter=silent', path.join(ROOT_DIR, 'Capacitor'));
          
          // Sync
          await runCommand('Capacitor Sync', 'npx @capacitor/cli sync', path.join(ROOT_DIR, 'Capacitor'));
          
          // Build APK
          const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
          if (process.platform !== 'win32') {
            try { fs.chmodSync(path.join(ROOT_DIR, 'Capacitor', 'android', 'gradlew'), 0o755); } catch(e) {}
          }
          const buildType = process.env.ANDROID_KEYSTORE_FILE ? 'assembleRelease' : 'assembleDebug';
          const daemonFlag = process.env.GITHUB_ACTIONS ? '--no-daemon' : '';
          await runCommand('Android Build', `${gradlew} ${buildType} ${daemonFlag} -q`.trim(), path.join(ROOT_DIR, 'Capacitor', 'android'));
          
          // Copy APK
          const apkDir = path.join(ROOT_DIR, 'Capacitor', 'android', 'app', 'build', 'outputs', 'apk');
          const debugApk = path.join(apkDir, 'debug', 'app-debug.apk');
          const releaseApk = path.join(apkDir, 'release', 'app-release.apk');
          const releaseUnsignedApk = path.join(apkDir, 'release', 'app-release-unsigned.apk');
          
          let copiedApk = false;
          const targetApk = process.env.ANDROID_KEYSTORE_FILE ? (fs.existsSync(releaseApk) ? releaseApk : releaseUnsignedApk) : debugApk;

          if (fs.existsSync(targetApk)) {
            const artifactName = buildType === 'assembleRelease' ? 'Holad-Android-Release.apk' : 'Holad-Android-Debug.apk';
            console.log(`Copying Android APK to artifacts/${artifactName}...`);
            fs.copyFileSync(targetApk, path.join(ARTIFACTS_DIR, artifactName));
            copiedApk = true;
          } else if (fs.existsSync(apkDir)) {
            // Fallback: search for any .apk in apkDir
            function findAndCopyApk(dir) {
              const files = fs.readdirSync(dir, { withFileTypes: true });
              for (const file of files) {
                const full = path.join(dir, file.name);
                if (file.isDirectory()) {
                  findAndCopyApk(full);
                } else if (file.isFile() && file.name.endsWith('.apk')) {
                  const name = file.name.includes('release') ? 'Holad-Android-Release.apk' : 'Holad-Android-Debug.apk';
                  console.log(`Copying Android APK ${file.name} to artifacts/${name}...`);
                  fs.copyFileSync(full, path.join(ARTIFACTS_DIR, name));
                  copiedApk = true;
                }
              }
            }
            findAndCopyApk(apkDir);
          }

          if (!copiedApk) {
            console.warn("Warning: No Android APK found in build outputs.");
          }
        } catch (err) {
          console.error("\n[ERROR] Capacitor Android build workflow failed!");
          throw err;
        }
      }
    })());
  }

  if (nativeTasks.length > 0) {
    await Promise.all(nativeTasks);
  }

  console.log("\n--- Build Complete! ---");
  console.log("Artifacts generated in artifacts/:");
  if (fs.existsSync(ARTIFACTS_DIR)) {
    const artifacts = fs.readdirSync(ARTIFACTS_DIR);
    if (artifacts.length === 0) {
      console.log("  (no artifacts found)");
    } else {
      artifacts.forEach(file => {
        const stats = fs.statSync(path.join(ARTIFACTS_DIR, file));
        const sizeStr = stats.isDirectory() ? '[DIR]' : `${(stats.size / 1024 / 1024).toFixed(2)} MB`;
        console.log(`  - ${file} (${sizeStr})`);
      });
    }
  }
}

main().catch(err => {
  console.error("Build process failed:", err);
  process.exit(1);
});
