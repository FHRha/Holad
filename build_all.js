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
  --skip-android   Skip building Tauri Android app
  --skip-archive   Skip creating web server .tar.gz archive (alias: --no-archive)
  --force-install  Force re-running pnpm install even if node_modules exists
  --help, -h       Show this help message
`);
  process.exit(0);
}

const createArchive = !args.includes('--no-archive') && !args.includes('--skip-archive');
const skipClient = args.includes('--skip-client');
const skipServer = args.includes('--skip-server');
const skipTauri = args.includes('--skip-tauri');
const skipAndroid = args.includes('--skip-android');
const forceInstall = args.includes('--force-install') || args.includes('--install');

let pnpmCmd = 'pnpm';
try {
  const { execSync } = require('child_process');
  execSync('pnpm --version', { stdio: 'ignore' });
} catch {
  pnpmCmd = 'npx pnpm@10.28.2';
}

const ROOT_DIR = __dirname;
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');
const RELEASE_DIR = path.join(ARTIFACTS_DIR, 'holad-release');

// Version injection
function toValidSemver(v) {
  const clean = (v || '').replace(/^v/i, '').trim();
  const [core, ...preParts] = clean.split('-');
  if (preParts.length === 0) return core;
  // In SemVer 2.0.0, numeric identifiers in pre-release must not have leading zeroes.
  // Rust semver crate (used by Tauri and Cargo) enforces this strictly.
  const preCleaned = preParts.join('-').split('.').map(part => {
    if (/^\d+$/.test(part)) {
      return parseInt(part, 10).toString();
    }
    return part;
  }).join('.');
  return `${core}-${preCleaned}`;
}

// Local builds default to 2.0.0-localtest unless in CI or explicitly overridden
const isCi = !!(process.env.GITHUB_ACTIONS || process.env.CI);
const rawVersion = process.env.GITHUB_REF_NAME || process.env.RELEASE_VERSION || (isCi ? null : '2.0.0-localtest');
let appVersion = null;
if (rawVersion) {
  const version = rawVersion.startsWith('v') ? rawVersion.substring(1) : rawVersion;
  const semverVersion = toValidSemver(version);
  appVersion = version;
  process.env.RELEASE_VERSION = version;
  console.log(`Injecting version ${version} (SemVer: ${semverVersion}) into project files...`);
  
  [
    path.join(ROOT_DIR, 'client', 'package.json'),
    path.join(ROOT_DIR, 'server', 'package.json'),
    path.join(ROOT_DIR, 'Tauri', 'package.json'),
    path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'tauri.conf.json'),
    path.join(ROOT_DIR, 'installer', 'package.json'),
    path.join(ROOT_DIR, 'installer', 'src-tauri', 'tauri.conf.json')
  ].forEach(file => {
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (file.endsWith('tauri.conf.json')) {
          data.version = semverVersion;
          const coreParts = version.split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
          while (coreParts.length < 3) coreParts.push(0);
          const [wMaj, wMin, wPat] = coreParts;
          // Windows WiX MSI requires ProductVersion maj <= 255, min <= 255, build <= 65535
          const wixVersion = `${Math.min(wMaj, 255)}.${Math.min(wMin, 255)}.${Math.min(wPat, 65535)}`;
          if (!data.bundle) data.bundle = {};
          if (!data.bundle.windows) data.bundle.windows = {};
          if (!data.bundle.windows.wix) data.bundle.windows.wix = {};
          data.bundle.windows.wix.version = wixVersion;
        } else {
          data.version = version;
        }
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
        console.log(`Updated version in ${path.basename(path.dirname(file))}/${path.basename(file)} to ${file.endsWith('tauri.conf.json') ? semverVersion : version}`);
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
      cargoContent = cargoContent.replace(/^version\s*=\s*"[^"]*"/m, `version = "${semverVersion}"`);
      fs.writeFileSync(cargoTomlPath, cargoContent);
      console.log(`Updated version in Tauri/src-tauri/Cargo.toml to ${semverVersion}`);
    } catch (e) {
      console.warn(`Could not update version in Cargo.toml:`, e.message);
    }
  }

  // Update Cargo.lock
  const cargoLockPath = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'Cargo.lock');
  if (fs.existsSync(cargoLockPath)) {
    try {
      let lockContent = fs.readFileSync(cargoLockPath, 'utf8');
      lockContent = lockContent.replace(/(\[\[package\]\]\r?\nname\s*=\s*"holad"\r?\nversion\s*=\s*)"[^"]*"/, `$1"${semverVersion}"`);
      fs.writeFileSync(cargoLockPath, lockContent);
      console.log(`Updated version in Tauri/src-tauri/Cargo.lock to ${semverVersion}`);
    } catch (e) {
      console.warn(`Could not update version in Cargo.lock:`, e.message);
    }
  }

  // Update installer Cargo.toml
  const installerCargoTomlPath = path.join(ROOT_DIR, 'installer', 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(installerCargoTomlPath)) {
    try {
      let cargoContent = fs.readFileSync(installerCargoTomlPath, 'utf8');
      cargoContent = cargoContent.replace(/^version\s*=\s*"[^"]*"/m, `version = "${semverVersion}"`);
      fs.writeFileSync(installerCargoTomlPath, cargoContent);
      console.log(`Updated version in installer/src-tauri/Cargo.toml to ${semverVersion}`);
    } catch (e) {
      console.warn(`Could not update version in installer/src-tauri/Cargo.toml:`, e.message);
    }
  }

  // Update installer Cargo.lock
  const installerCargoLockPath = path.join(ROOT_DIR, 'installer', 'src-tauri', 'Cargo.lock');
  if (fs.existsSync(installerCargoLockPath)) {
    try {
      let lockContent = fs.readFileSync(installerCargoLockPath, 'utf8');
      lockContent = lockContent.replace(/(\[\[package\]\]\r?\nname\s*=\s*"holad-installer"\r?\nversion\s*=\s*)"[^"]*"/, `$1"${semverVersion}"`);
      fs.writeFileSync(installerCargoLockPath, lockContent);
      console.log(`Updated version in installer/src-tauri/Cargo.lock to ${semverVersion}`);
    } catch (e) {
      console.warn(`Could not update version in installer/src-tauri/Cargo.lock:`, e.message);
    }
  }

  // Update Tauri Android tauri.properties
  const tauriAndroidPropsPath = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'gen', 'android', 'app', 'tauri.properties');
  if (fs.existsSync(path.dirname(tauriAndroidPropsPath))) {
    try {
      const coreParts = version.split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
      while (coreParts.length < 3) coreParts.push(0);
      const [maj, min, pat] = coreParts;
      let testNum = 999;
      if (version.includes('-')) {
        const pre = version.split('-')[1];
        const preMatch = pre ? pre.match(/\d+/) : null;
        if (preMatch) {
          testNum = Math.min(parseInt(preMatch[0], 10), 998);
        } else {
          testNum = 0;
        }
      }
      const rawVCode = maj * 10000000 + min * 100000 + pat * 1000 + testNum;
      const vCode = Math.min(Math.max(1, rawVCode), 2147483647);

      const propsContent = [
        '// THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.',
        `tauri.android.versionName=${version}`,
        `tauri.android.versionCode=${vCode}`,
        ''
      ].join('\n');
      fs.writeFileSync(tauriAndroidPropsPath, propsContent);
      console.log(`Updated versionName in Tauri/src-tauri/gen/android/app/tauri.properties to ${version} (versionCode ${vCode})`);
    } catch (e) {
      console.warn(`Could not update tauri.properties:`, e.message);
    }
  }
}

function getAppVersion() {
  if (appVersion) return appVersion;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'client', 'package.json'), 'utf8'));
    if (pkg.version) return pkg.version;
  } catch (e) {}
  try {
    const tauriConfig = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'tauri.conf.json'), 'utf8'));
    if (tauriConfig.version) return tauriConfig.version;
  } catch (e) {}
  return '2.0.0-localtest';
}

function getEnv(envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'PATH';
  
  // Ensure CARGO_HOME / RUSTUP_HOME are set on Windows if C:\rust exists
  if (process.platform === 'win32') {
    if (!env.CARGO_HOME && fs.existsSync('C:\\rust\\cargo')) {
      env.CARGO_HOME = 'C:\\rust\\cargo';
    }
    if (!env.RUSTUP_HOME && fs.existsSync('C:\\rust\\rustup')) {
      env.RUSTUP_HOME = 'C:\\rust\\rustup';
    }
  }

  // Ensure cargo is in PATH for Tauri build
  const cargoPath = env.CARGO_HOME
    ? path.join(env.CARGO_HOME, 'bin')
    : path.join(process.env.USERPROFILE || process.env.HOME || '', '.cargo', 'bin');
  if (fs.existsSync(cargoPath)) {
    if (env[pathKey] && !env[pathKey].includes(cargoPath)) {
      env[pathKey] = `${cargoPath}${path.delimiter}${env[pathKey]}`;
    } else if (!env[pathKey]) {
      env[pathKey] = cargoPath;
    }
  }

  // Ensure JAVA_HOME is set for Android build
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

  // Ensure NDK_ROOT and its LLVM bin are in PATH for cargo Android cross-compilation
  const sdkRoot = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!env.NDK_ROOT && !env.ANDROID_NDK_HOME && sdkRoot && fs.existsSync(path.join(sdkRoot, 'ndk'))) {
    try {
      const ndkDirs = fs.readdirSync(path.join(sdkRoot, 'ndk')).sort().reverse();
      if (ndkDirs.length > 0) {
        env.NDK_ROOT = path.join(sdkRoot, 'ndk', ndkDirs[0]);
        env.ANDROID_NDK_HOME = env.NDK_ROOT;
      }
    } catch (e) {}
  }
  const ndkRoot = env.NDK_ROOT || env.ANDROID_NDK_HOME;
  if (ndkRoot) {
    const prebuiltHost = process.platform === 'win32' ? 'windows-x86_64' : (process.platform === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64');
    const ndkBin = path.join(ndkRoot, 'toolchains', 'llvm', 'prebuilt', prebuiltHost, 'bin');
    if (fs.existsSync(ndkBin)) {
      if (env[pathKey] && !env[pathKey].includes(ndkBin)) {
        env[pathKey] = `${ndkBin}${path.delimiter}${env[pathKey]}`;
      }
      const clangExt = process.platform === 'win32' ? '.cmd' : '';
      const arExt = process.platform === 'win32' ? '.exe' : '';
      const androidClang = path.join(ndkBin, `aarch64-linux-android24-clang${clangExt}`);
      const androidAr = path.join(ndkBin, `llvm-ar${arExt}`);
      if (fs.existsSync(androidClang)) {
        if (!env.CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER) {
          env.CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = androidClang;
        }
        if (!env.CC_aarch64_linux_android) {
          env.CC_aarch64_linux_android = androidClang;
        }
      }
      if (fs.existsSync(androidAr) && !env.AR_aarch64_linux_android) {
        env.AR_aarch64_linux_android = androidAr;
      }
    }
  }

  return env;
}

function runCommand(taskName, command, cwd, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    if (!process.env.GITHUB_ACTIONS) {
      console.log(`[${taskName}] ⏳ Started: ${command}`);
    }
    
    const env = getEnv(envOverrides);
    
    const child = spawn(command, { cwd, env, shell: true });
    
    let output = '';
    
    child.stdout.on('data', data => {
      output += data.toString();
      if (!process.env.GITHUB_ACTIONS && (taskName.includes('Tauri') || taskName.includes('Android') || taskName.includes('Installer') || taskName.includes('Cargo'))) {
        process.stdout.write(data);
      }
    });
    
    child.stderr.on('data', data => {
      output += data.toString();
      if (!process.env.GITHUB_ACTIONS && (taskName.includes('Tauri') || taskName.includes('Android') || taskName.includes('Installer') || taskName.includes('Cargo'))) {
        process.stderr.write(data);
      }
    });
    
    child.on('close', code => {
      const durationMs = performance.now() - startTime;
      const durationSec = (durationMs / 1000).toFixed(2);
      
      if (code === 0) {
        if (process.env.GITHUB_ACTIONS) {
          console.log(`::group::${taskName} (Took ${durationSec}s)`);
          console.log(output);
          console.log(`::endgroup::`);
        } else {
          console.log(`[${taskName}] ✔ Finished in ${durationSec}s: ${command}`);
        }
        resolve();
      } else {
        console.error(`\n[ERROR] Task "${taskName}" failed in ${durationSec}s: ${command}`);
        if (process.env.GITHUB_ACTIONS) {
          console.log(`::group::${taskName} (FAILED)`);
          console.log(output);
          console.log(`::endgroup::`);
          const lines = output.trim().split('\n');
          const tail = lines.slice(-40).join('\n');
          console.error('\n--- Failure Summary (Last 40 lines) ---');
          console.error(tail);
        } else {
          console.error(output);
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

async function ensureDependencies(taskName, dir) {
  const nodeModulesPath = path.join(dir, 'node_modules');
  if (!forceInstall && fs.existsSync(nodeModulesPath)) {
    console.log(`[${taskName}] ✔ Dependencies already installed in ${path.basename(dir)}/node_modules, skipping install.`);
    return;
  }
  await runCommand(taskName, `${pnpmCmd} install`, dir);
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
  const localProps = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'gen', 'android', 'local.properties');
  if (fs.existsSync(localProps)) {
    try {
      const content = fs.readFileSync(localProps, 'utf8');
      if (content.includes('sdk.dir')) return true;
    } catch (e) {}
  }
  return false;
}

function copyRecursiveSync(src, dest, ignoreExt = ['.sqlite', '.sqlite-wal', '.sqlite-shm']) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName), ignoreExt);
    });
  } else {
    if (ignoreExt.some(ext => src.toLowerCase().endsWith(ext))) {
      return;
    }
    fs.copyFileSync(src, dest);
  }
}

async function main() {
  console.log("Starting unified Holad release build process...");

  // Clean up previous builds and artifacts
  console.log("Cleaning up previous builds and artifacts...");
  try {
    if (fs.existsSync(ARTIFACTS_DIR)) {
      fs.rmSync(ARTIFACTS_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
  } catch (e) {
    console.warn("Warning: Could not completely remove previous artifacts (they might be in use):", e.message);
  }
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  // Also clean up stale Tauri bundle and Android APK directories to avoid copying obsolete versions
  const tauriBundleDir = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'target', 'release', 'bundle');
  if (fs.existsSync(tauriBundleDir)) {
    try {
      fs.rmSync(tauriBundleDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch (e) {
      console.warn("Warning: Could not clear previous Tauri bundles directory:", e.message);
    }
  }

  const androidApkDir = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk');
  if (fs.existsSync(androidApkDir)) {
    try {
      fs.rmSync(androidApkDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch (e) {
      console.warn("Warning: Could not clear previous Android APK directory:", e.message);
    }
  }

  // 1. Ensure dependencies sequentially (avoids concurrent pnpm store lock deadlocks)
  if (!skipClient) {
    console.log("\n--- Checking Web Client Dependencies ---");
    await ensureDependencies('Web Client Install', path.join(ROOT_DIR, 'client'));
  }

  if (!skipServer) {
    console.log("\n--- Checking Server Dependencies ---");
    await ensureDependencies('Server Install', path.join(ROOT_DIR, 'server'));
  }

  // 2. Build Client and Server in parallel
  const webTasks = [];
  const currentBuildVersion = appVersion || getAppVersion() || process.env.RELEASE_VERSION || '2.0.6';
  if (!skipClient) {
    const clientBase = process.env.VITE_APP_BASE || './';
    console.log(`\n--- Scheduling Web Client Build (Base: ${clientBase}) ---`);
    webTasks.push(runCommand('Web Client Build', `${pnpmCmd} run build`, path.join(ROOT_DIR, 'client'), { 
      VITE_APP_BASE: clientBase,
      RELEASE_VERSION: currentBuildVersion
    }));
  }

  if (!skipServer) {
    console.log("\n--- Scheduling Server Build ---");
    webTasks.push(runCommand('Server Build', `${pnpmCmd} run build`, path.join(ROOT_DIR, 'server'), {
      RELEASE_VERSION: currentBuildVersion
    }));
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
      if (fs.existsSync(path.join(ROOT_DIR, 'server', 'migrate.js'))) {
        fs.copyFileSync(path.join(ROOT_DIR, 'server', 'migrate.js'), path.join(RELEASE_DIR, 'server', 'migrate.js'));
      }
    }

    // Save .version file in release directory
    fs.writeFileSync(path.join(RELEASE_DIR, '.version'), `${currentBuildVersion}\n`);

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

  // Ensure Client for Native Apps (Base: ./) if Tauri or Android is enabled
  const clientAlreadyBuiltForNative = !skipClient && (!process.env.VITE_APP_BASE || process.env.VITE_APP_BASE === './') && fs.existsSync(path.join(ROOT_DIR, 'client', 'dist'));
  const nativePrepTasks = [];

  if ((!skipTauri || !skipAndroid) && !clientAlreadyBuiltForNative) {
    nativePrepTasks.push((async () => {
      console.log("\n--- Building Client for Native Apps (Base: ./) ---");
      await ensureDependencies('Native Client Install', path.join(ROOT_DIR, 'client'));
      await runCommand('Native Client Build', `${pnpmCmd} run build`, path.join(ROOT_DIR, 'client'), { 
        VITE_APP_BASE: './',
        RELEASE_VERSION: currentBuildVersion
      });
    })());
  } else if (!skipTauri || !skipAndroid) {
    console.log("\n[Native Client] ✔ Client already built with base './', skipping redundant rebuild.");
  }

  // Pre-build installer frontend concurrently on Windows
  const installerDir = path.join(ROOT_DIR, 'installer');
  if (process.platform === 'win32' && !skipTauri && fs.existsSync(installerDir)) {
    nativePrepTasks.push((async () => {
      console.log("\n--- Pre-building Custom Installer Frontend ---");
      await ensureDependencies('Installer Dependencies', installerDir);
      await runCommand('Installer Frontend Build', `${pnpmCmd} run build`, installerDir);
    })());
  }

  if (nativePrepTasks.length > 0) {
    await Promise.all(nativePrepTasks);
  }

  // 3. Build Tauri Desktop Apps and Tauri Android App in parallel
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
        const tauriTargetDir = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'target');
        if (fs.existsSync(tauriTargetDir)) {
          try {
            const buildDir = path.join(tauriTargetDir, 'release', 'build');
            if (fs.existsSync(buildDir)) {
              const dirs = fs.readdirSync(buildDir);
              let needsClean = false;
              for (const d of dirs) {
                const dPath = path.join(buildDir, d);
                if (fs.statSync(dPath).isDirectory()) {
                  const depFiles = fs.readdirSync(dPath).filter(f => f.endsWith('.d'));
                  for (const df of depFiles) {
                    const content = fs.readFileSync(path.join(dPath, df), 'utf8');
                    if (content.includes(':\\') && !content.toLowerCase().includes(ROOT_DIR.toLowerCase())) {
                      needsClean = true;
                      break;
                    }
                  }
                }
                if (needsClean) break;
              }
              if (needsClean) {
                console.log('[Tauri] Stale Cargo target artifacts from previous drive/folder detected. Running cargo clean...');
                await runCommand('Cargo Clean', 'cargo clean', path.join(ROOT_DIR, 'Tauri', 'src-tauri'), env);
              }
            }
          } catch (e) {}
        }

        let tauriBuildCmd = 'npx --yes @tauri-apps/cli build';
        const currentVer = getAppVersion();
        if (process.env.TAURI_BUNDLES) {
          tauriBuildCmd = `npx --yes @tauri-apps/cli build --bundles ${process.env.TAURI_BUNDLES}`;
        } else if (process.platform === 'win32') {
          if (currentVer && currentVer.includes('-')) {
            console.log(`[Tauri] Pre-release version detected (${currentVer}). Building application binary (custom installer will package setup.exe).`);
            tauriBuildCmd = 'npx --yes @tauri-apps/cli build --no-bundle';
          } else {
            console.log(`[Tauri] Stable release detected (${currentVer}). Packaging WiX MSI bundle (custom installer will package setup.exe).`);
            tauriBuildCmd = 'npx --yes @tauri-apps/cli build --bundles msi';
          }
        } else if (process.platform === 'linux') {
          if (currentVer && currentVer.includes('-')) {
            console.log(`[Tauri] Pre-release version detected (${currentVer}). Packaging deb and appimage bundles (skipping rpm which forbids hyphens in version).`);
            tauriBuildCmd = 'npx --yes @tauri-apps/cli build --bundles deb,appimage';
          } else {
            tauriBuildCmd = 'npx --yes @tauri-apps/cli build --bundles deb,appimage';
          }
        }
        await runCommand('Tauri Build', tauriBuildCmd, path.join(ROOT_DIR, 'Tauri'));
        
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
              if (['.msi', '.exe', '.deb', '.appimage', '.rpm', '.dmg', '.pkg', '.zip', '.sig', '.gz'].includes(ext)) {
                // Ignore internal Debian package intermediate archives
                if (entry.name === 'control.tar.gz' || entry.name === 'data.tar.gz' || entry.name.endsWith('.tar.gz.gz')) {
                  continue;
                }
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

        // Build Custom Windows Installer from installer/
        if (process.platform === 'win32') {
          const holadExe = path.join(tauriReleaseDir, 'Holad.exe');
          const installerDir = path.join(ROOT_DIR, 'installer');
          if (fs.existsSync(holadExe) && fs.existsSync(installerDir)) {
            console.log("\n--- Packaging Custom Windows Installer ---");
            // 1. Stage payload files (Holad.exe + resources)
            const stagingDir = path.join(installerDir, 'payload-staging');
            if (fs.existsSync(stagingDir)) {
              fs.rmSync(stagingDir, { recursive: true, force: true });
            }
            fs.mkdirSync(stagingDir, { recursive: true });

            fs.copyFileSync(holadExe, path.join(stagingDir, 'Holad.exe'));

            const iconsDir = path.join(ROOT_DIR, 'client', 'public', 'icons');
            if (fs.existsSync(iconsDir)) {
              copyRecursiveSync(iconsDir, path.join(stagingDir, 'icons'));
            }
            const tauriIconsDir = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'icons');
            if (fs.existsSync(tauriIconsDir)) {
              const icoFiles = fs.readdirSync(tauriIconsDir).filter(f => f.endsWith('.ico'));
              const destIcons = path.join(stagingDir, 'icons');
              if (!fs.existsSync(destIcons)) fs.mkdirSync(destIcons, { recursive: true });
              for (const f of icoFiles) {
                fs.copyFileSync(path.join(tauriIconsDir, f), path.join(destIcons, f));
              }
              const tauriTaskbarDir = path.join(tauriIconsDir, 'taskbar');
              if (fs.existsSync(tauriTaskbarDir)) {
                copyRecursiveSync(tauriTaskbarDir, path.join(destIcons, 'taskbar'));
              }
            }

            // 2. Create payload.zip for installer embedding
            const payloadZip = path.join(installerDir, 'src-tauri', 'payload.zip');
            if (fs.existsSync(payloadZip)) {
              try { fs.unlinkSync(payloadZip); } catch (e) {}
            }

            console.log("[Installer] Creating payload.zip from staged application files...");
            let packed = false;
            try {
              await runCommand(
                'Pack Installer Payload (tar)',
                `tar -a -c -f "${payloadZip}" -C "${stagingDir}" .`,
                ROOT_DIR
              );
              if (fs.existsSync(payloadZip)) packed = true;
            } catch (err) {
              console.warn("[Installer] tar command failed, trying PowerShell Compress-Archive:", err.message);
            }

            if (!packed) {
              await runCommand(
                'Pack Installer Payload (PowerShell)',
                `powershell -NoProfile -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${payloadZip}' -Force"`,
                ROOT_DIR
              );
            }

            // Clean staging directory
            try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (e) {}

            // 3. Ensure installer dependencies & build frontend (if not pre-built)
            if (!fs.existsSync(path.join(installerDir, 'dist', 'index.html'))) {
              console.log("\n--- Building Installer Frontend ---");
              await ensureDependencies('Installer Dependencies', installerDir);
              await runCommand('Installer Frontend Build', `${pnpmCmd} run build`, installerDir);
            } else {
              console.log("\n[Installer] ✔ Frontend already pre-built, skipping rebuild.");
            }

            // 4. Build custom installer binary
            console.log("\n--- Building Custom Installer Binary ---");
            await runCommand('Installer Binary Build', 'cargo build --release', path.join(installerDir, 'src-tauri'), env);

            const builtInstaller = path.join(installerDir, 'src-tauri', 'target', 'release', 'holad-installer.exe');
            if (fs.existsSync(builtInstaller)) {
              const cleanVer = (currentVer || getAppVersion() || '2.0.0').replace(/^v/i, '');
              const targetSetupName = `Holad_${cleanVer}_x64-setup.exe`;
              console.log(`Copying custom installer to artifacts/${targetSetupName}...`);
              fs.copyFileSync(builtInstaller, path.join(ARTIFACTS_DIR, targetSetupName));
              console.log(`[Installer] Setup installer successfully created at artifacts/${targetSetupName}`);
            } else {
              console.warn("Warning: Built installer executable not found at", builtInstaller);
            }
          }
        }
      } catch (err) {
        console.error("\n[ERROR] Tauri build workflow failed!");
        throw err;
      }
    })());
  }

  if (!skipAndroid) {
    nativeTasks.push((async () => {
      const tauriAndroidDir = path.join(ROOT_DIR, 'Tauri', 'src-tauri', 'gen', 'android');
      if (fs.existsSync(tauriAndroidDir)) {
        const env = getEnv();
        const javaOk = await isJavaAvailable(env);
        const sdkOk = isAndroidSdkAvailable(env);
        const cargoOk = await checkCommand('cargo --version', env);

        if (!javaOk || !sdkOk || !cargoOk) {
          const missing = [];
          if (!javaOk) missing.push("Java/JDK");
          if (!sdkOk) missing.push("Android SDK");
          if (!cargoOk) missing.push("Rust/Cargo");
          console.log(`\n[SKIP] Skipping Tauri Android build (${missing.join(', ')} not found)`);
          return;
        }

        console.log("\n--- Scheduling Tauri Android Build (arm64-v8a) ---");
        try {
          // 1. Sync latest client/dist into Android assets (if client was built)
          const clientDistDir = path.join(ROOT_DIR, 'client', 'dist');
          const androidAssetsDir = path.join(tauriAndroidDir, 'app', 'src', 'main', 'assets');
          if (fs.existsSync(clientDistDir)) {
            console.log("[Android] Syncing client/dist into Tauri Android assets...");
            if (fs.existsSync(androidAssetsDir)) {
              fs.rmSync(androidAssetsDir, { recursive: true, force: true });
            }
            copyRecursiveSync(clientDistDir, androidAssetsDir);
          }

          // 2. Build Rust native library (aarch64-linux-android) and copy to jniLibs
          const tauriRustDir = path.join(ROOT_DIR, 'Tauri', 'src-tauri');
          await runCommand(
            'Android Rust Native Build',
            'cargo build --release --target aarch64-linux-android --features custom-protocol -j 4',
            tauriRustDir,
            env
          );

          const builtSo = path.join(tauriRustDir, 'target', 'aarch64-linux-android', 'release', 'libholad_lib.so');
          const jniLibsDir = path.join(tauriAndroidDir, 'app', 'src', 'main', 'jniLibs', 'arm64-v8a');
          if (!fs.existsSync(builtSo)) {
            throw new Error(`Built native library not found at ${builtSo}`);
          }
          if (!fs.existsSync(jniLibsDir)) {
            fs.mkdirSync(jniLibsDir, { recursive: true });
          }
          fs.copyFileSync(builtSo, path.join(jniLibsDir, 'libholad_lib.so'));
          console.log("[Android] Copied libholad_lib.so to jniLibs/arm64-v8a/");

          // 3. Build APK via Gradle (skipping Gradle's rustBuild task since we just built it)
          const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
          if (process.platform !== 'win32') {
            try { fs.chmodSync(path.join(tauriAndroidDir, 'gradlew'), 0o755); } catch (e) {}
          }
          const keystorePath = process.env.ANDROID_KEYSTORE_FILE
            ? path.resolve(tauriAndroidDir, 'app', process.env.ANDROID_KEYSTORE_FILE)
            : null;
          const hasKeystore = !!(keystorePath && fs.existsSync(keystorePath));
          const gradleTask = hasKeystore
            ? 'assembleArm64Release -x rustBuildArm64Release'
            : 'assembleArm64Debug -x rustBuildArm64Debug';
          const daemonFlag = '--no-daemon';
          await runCommand('Android APK Build', `${gradlew} ${gradleTask} ${daemonFlag} -q`.trim(), tauriAndroidDir, env);
          // Ensure Gradle daemon doesn't linger in RAM
          await runCommand('Stop Gradle Daemon', `${gradlew} --stop`, tauriAndroidDir, env).catch(() => {});

          // 4. Copy APK to artifacts/
          const apkDir = path.join(tauriAndroidDir, 'app', 'build', 'outputs', 'apk');
          const debugApk = path.join(apkDir, 'arm64', 'debug', 'app-arm64-debug.apk');
          const releaseApk = path.join(apkDir, 'arm64', 'release', 'app-arm64-release.apk');
          const releaseUnsignedApk = path.join(apkDir, 'arm64', 'release', 'app-arm64-release-unsigned.apk');

          let copiedApk = false;
          const targetApk = hasKeystore
            ? (fs.existsSync(releaseApk) ? releaseApk : releaseUnsignedApk)
            : debugApk;

          const currentVersion = getAppVersion();
          const artifactName = currentVersion
            ? `Holad-Android-${currentVersion}.apk`
            : (hasKeystore ? 'Holad-Android-Release.apk' : 'Holad-Android-Debug.apk');

          if (fs.existsSync(targetApk)) {
            console.log(`Copying Android APK to artifacts/${artifactName}...`);
            fs.copyFileSync(targetApk, path.join(ARTIFACTS_DIR, artifactName));
            copiedApk = true;
          } else if (fs.existsSync(apkDir)) {
            function findAndCopyApk(dir) {
              const files = fs.readdirSync(dir, { withFileTypes: true });
              for (const file of files) {
                const full = path.join(dir, file.name);
                if (file.isDirectory()) {
                  findAndCopyApk(full);
                } else if (file.isFile() && file.name.endsWith('.apk')) {
                  console.log(`Copying Android APK ${file.name} to artifacts/${artifactName}...`);
                  fs.copyFileSync(full, path.join(ARTIFACTS_DIR, artifactName));
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
          console.error("\n[ERROR] Tauri Android build workflow failed!");
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
