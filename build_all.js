const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Usage: node build_all.js [--no-archive] [--skip-client] [--skip-server] [--skip-tauri] [--skip-android]

const args = process.argv.slice(2);
const createArchive = !args.includes('--no-archive');
const skipClient = args.includes('--skip-client');
const skipServer = args.includes('--skip-server');
const skipTauri = args.includes('--skip-tauri');
const skipAndroid = args.includes('--skip-android');

const ROOT_DIR = __dirname;
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');
const RELEASE_DIR = path.join(ARTIFACTS_DIR, 'holad-release');

// Version injection
const rawVersion = process.env.GITHUB_REF_NAME || process.env.RELEASE_VERSION;
if (rawVersion && rawVersion.startsWith('v')) {
  const version = rawVersion.substring(1);
  console.log(`Injecting version ${version} into project files...`);
  
  [
    path.join(ROOT_DIR, 'client', 'package.json'),
    path.join(ROOT_DIR, 'server', 'package.json'),
    path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'tauri.conf.json')
  ].forEach(file => {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      data.version = version;
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      console.log(`Updated version in ${path.basename(path.dirname(file))}/${path.basename(file)} to ${version}`);
    }
  });
}

function runCommand(command, cwd, envOverrides = {}) {
  console.log(`\n> Running: ${command} in ${cwd}`);
  
  // Inject environment variables to avoid needing to pass them manually via batch script
  const env = { ...process.env, ...envOverrides };
  
  // Ensure cargo is in PATH for Tauri build
  const cargoPath = path.join(process.env.USERPROFILE || '', '.cargo', 'bin');
  const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'PATH';
  if (env[pathKey] && !env[pathKey].includes(cargoPath)) {
    env[pathKey] = `${env[pathKey]};${cargoPath}`;
  } else if (!env[pathKey]) {
    env[pathKey] = cargoPath;
  }
  
  // Ensure JAVA_HOME is set for Capacitor build
  if (!env.JAVA_HOME) {
    const defaultJavaPaths = [
      'C:\\Program Files\\Microsoft\\jdk-21.0.11.10-hotspot',
      'C:\\Program Files\\Java\\jdk-21'
    ];
    for (const jPath of defaultJavaPaths) {
      if (fs.existsSync(jPath)) {
        env.JAVA_HOME = jPath;
        break;
      }
    }
  }

  execSync(command, { cwd, stdio: 'inherit', env });
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

console.log("Starting unified Holad release build process...");

// Clean up previous builds
console.log("Cleaning up previous builds and artifacts...");
try {
  if (fs.existsSync(RELEASE_DIR)) fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
  if (fs.existsSync(ARTIFACTS_DIR)) fs.rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
} catch (e) {
  console.warn("Warning: Could not completely remove previous artifacts (they might be in use).", e.message);
}
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

// Create release dirs
fs.mkdirSync(path.join(RELEASE_DIR, 'client'), { recursive: true });
fs.mkdirSync(path.join(RELEASE_DIR, 'server'), { recursive: true });

// 1. Build Client
if (!skipClient) {
  console.log("\n--- Building Web Client (Base: /Holad/) ---");
  runCommand('npx pnpm install', path.join(ROOT_DIR, 'client'));
  runCommand('npx pnpm run build', path.join(ROOT_DIR, 'client'), { VITE_APP_BASE: '/Holad/' });
}

// 2. Build Server
if (!skipServer) {
  console.log("\n--- Building Server ---");
  runCommand('npx pnpm install', path.join(ROOT_DIR, 'server'));
  runCommand('npx pnpm run build', path.join(ROOT_DIR, 'server'));
}

// Copy to release folder (Server + Web Client bundle)
if (!skipClient || !skipServer) {
  console.log("\n--- Preparing Web Release Bundle ---");
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
cd server
if not exist "node_modules" (
    echo Installing production dependencies...
    call npm install --production
)
node dist\\index.js
pause
`);

  fs.writeFileSync(path.join(RELEASE_DIR, 'start.sh'), `#!/bin/bash
cd server
if [ ! -d "node_modules" ]; then
    echo "Installing production dependencies..."
    npm install --production
fi
node dist/index.js
`);
  try {
    fs.chmodSync(path.join(RELEASE_DIR, 'start.sh'), 0o755);
  } catch (e) {}

  // Archive the Web Server Release
  if (createArchive) {
    console.log("\n--- Creating Archive ---");
    const platformName = process.platform === 'win32' ? 'windows' : 'linux';
    const archiveName = `holad-${platformName}-release.tar.gz`;
    runCommand(`tar -czf ${archiveName} holad-release`, ARTIFACTS_DIR);
    console.log(`Web server release archive is at artifacts/${archiveName}`);
  }
}

if (!skipTauri || !skipAndroid) {
  console.log("\n--- Rebuilding Client for Native Apps (Base: ./) ---");
  runCommand('npx pnpm run build', path.join(ROOT_DIR, 'client'), { VITE_APP_BASE: './' });
}

// 3. Build Tauri Desktop Apps (if running on Windows or if rust is installed)
if (!skipTauri) {
  try {
  // Check if cargo is installed
  const env = { ...process.env };
  const cargoPath = path.join(process.env.USERPROFILE || '', '.cargo', 'bin');
  const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'PATH';
  if (env[pathKey] && !env[pathKey].includes(cargoPath)) {
    env[pathKey] = `${env[pathKey]};${cargoPath}`;
  } else if (!env[pathKey]) {
    env[pathKey] = cargoPath;
  }

  execSync('cargo --version', { stdio: 'ignore', env });
  console.log("\n--- Building Tauri (Desktop App) ---");
  runCommand('npx @tauri-apps/cli build', path.join(ROOT_DIR, 'Tauri'));
  
  // Copy Tauri binaries to artifacts
  const tauriReleaseDir = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'target', 'release');
  const bundlesDir = path.join(tauriReleaseDir, 'bundle');
  
  // 1. Windows Executables
  const exeFile = path.join(tauriReleaseDir, 'app.exe');
  if (fs.existsSync(exeFile)) {
    console.log(`Windows exe generated at ${exeFile}`);
  }
  
  // 2. Linux/Mac Executables
  const linuxExe = path.join(tauriReleaseDir, 'holad');
  if (fs.existsSync(linuxExe)) {
    console.log(`Copying Linux/Mac executable to artifacts...`);
    fs.copyFileSync(linuxExe, path.join(ARTIFACTS_DIR, 'Holad-Linux'));
  }

  // 3. Bundles (MSI, NSIS, AppImage, DEB, RPM)
  if (fs.existsSync(bundlesDir)) {
    ['msi', 'nsis', 'appimage', 'deb', 'rpm'].forEach(ext => {
      const dir = path.join(bundlesDir, ext);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          if (f.endsWith(`.${ext}`) || f.endsWith('.exe')) {
            console.log(`Copying installer ${f} to artifacts...`);
            fs.copyFileSync(path.join(dir, f), path.join(ARTIFACTS_DIR, f));
          }
        }
      }
    });
  }
} catch (err) {
  console.log("\n[SKIP] Skipping Tauri build (Rust/Cargo is not available or build failed)");
}
}

// 4. Build Capacitor Android App
if (!skipAndroid) {
  try {
  if (fs.existsSync(path.join(ROOT_DIR, 'Capacitor', 'android'))) {
    console.log("\n--- Building Capacitor (Android App) ---");
    // Install dependencies first
    runCommand('npx pnpm install', path.join(ROOT_DIR, 'Capacitor'));
    
    // Sync
    runCommand('npx @capacitor/cli sync', path.join(ROOT_DIR, 'Capacitor'));
    
    // Build APK
    const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
    if (process.platform !== 'win32') {
      try { fs.chmodSync(path.join(ROOT_DIR, 'Capacitor', 'android', 'gradlew'), 0o755); } catch(e) {}
    }
    runCommand(`${gradlew} assembleDebug --no-daemon`, path.join(ROOT_DIR, 'Capacitor', 'android'));
    
    // Copy APK
    const apkFile = path.join(ROOT_DIR, 'Capacitor', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    if (fs.existsSync(apkFile)) {
      console.log(`Copying Android APK to artifacts...`);
      fs.copyFileSync(apkFile, path.join(ARTIFACTS_DIR, 'Holad-Android-Debug.apk'));
    }
    }
  } catch (err) {
    console.error("\n[ERROR] Capacitor Android build failed!");
    console.error(err.message || err);
    process.exit(1);
  }
}

console.log("\n--- Build Complete! ---");
