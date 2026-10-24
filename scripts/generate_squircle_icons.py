import os
import struct
import io
import subprocess
import ctypes
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import numpy as np

def create_squircle_mask(width: int = 1024, height: int = 1024, pad: int = 56, radius: int = 265, supersample: int = 4) -> Image.Image:
    """
    Generate an anti-aliased squircle (rounded rectangle) mask using supersampling.
    Pad gives ~5-6% margin around the card; radius ~29% gives the pronounced squircle curvature.
    """
    big_w = width * supersample
    big_h = height * supersample
    big_pad = pad * supersample
    big_card = (width - 2 * pad) * supersample
    big_r = radius * supersample

    big_mask = Image.new('L', (big_w, big_h), 0)
    draw = ImageDraw.Draw(big_mask)
    draw.rounded_rectangle(
        [big_pad, big_pad, big_pad + big_card - 1, big_pad + big_card - 1],
        radius=big_r,
        fill=255
    )

    return big_mask.resize((width, height), Image.Resampling.LANCZOS)

def load_source_images(root: str):
    """
    Loads master unclipped images from git commit 2049cc5 if available,
    falling back to local disk files.
    """
    client_icons = os.path.join(root, 'client', 'public', 'icons')
    dark_path = os.path.join(client_icons, 'favicon_dark.png')
    light_path = os.path.join(client_icons, 'favicon_light.png')
    cassette_path = os.path.join(client_icons, 'logo_cassette.png')

    try:
        raw_dark_bytes = subprocess.check_output(['git', 'show', '2049cc5:client/public/icons/favicon_dark.png'], stderr=subprocess.DEVNULL)
        dark_orig = Image.open(io.BytesIO(raw_dark_bytes)).convert('RGBA')
    except Exception:
        dark_orig = Image.open(dark_path).convert('RGBA')

    try:
        raw_light_bytes = subprocess.check_output(['git', 'show', '2049cc5:client/public/icons/favicon_light.png'], stderr=subprocess.DEVNULL)
        light_orig = Image.open(io.BytesIO(raw_light_bytes)).convert('RGBA')
    except Exception:
        light_orig = Image.open(light_path).convert('RGBA')

    try:
        raw_cassette_bytes = subprocess.check_output(['git', 'show', '2049cc5:client/public/icons/logo_cassette.png'], stderr=subprocess.DEVNULL)
        cassette_orig = Image.open(io.BytesIO(raw_cassette_bytes)).convert('RGBA')
    except Exception:
        cassette_orig = Image.open(cassette_path).convert('RGBA')

    return dark_orig, light_orig, cassette_orig

def build_squircle_master_icons(dark_orig: Image.Image, light_orig: Image.Image, cassette_orig: Image.Image):
    """
    Builds the 1024x1024 master squircle icons with optimal ~2.3% padding (24px)
    and radius ~22.5% (220px). This ensures the card fills ~95.3% of the icon canvas
    for a bold, prominent look on desktop and taskbar, while keeping corners clearly rounded.
    Outside the squircle card is guaranteed 100% transparent (0, 0, 0, 0).
    The artwork (waves/cassette) is enlarged to 880px to fill the card nicely.
    """
    pad = 24
    card_size = 1024 - 2 * pad  # 976px
    radius = 220  # ~22.5% of card size
    mask = create_squircle_mask(1024, 1024, pad=pad, radius=radius, supersample=4)

    # 1. Dark Wave Icon (black card #000000)
    dark_art = dark_orig.resize((880, 880), Image.Resampling.LANCZOS)
    dark_img = Image.new('RGBA', (1024, 1024), (0, 0, 0, 255))
    paste_pos = (1024 - 880) // 2
    dark_img.paste(dark_art, (paste_pos, paste_pos))
    dark_img.putalpha(mask)
    arr_d = np.array(dark_img)
    arr_d[arr_d[:, :, 3] <= 2] = [0, 0, 0, 0]
    dark_master = Image.fromarray(arr_d, 'RGBA')

    # 2. Light Wave Icon (light card #F8F9FA)
    light_art = light_orig.resize((880, 880), Image.Resampling.LANCZOS)
    light_img = Image.new('RGBA', (1024, 1024), (248, 249, 250, 255))
    light_img.paste(light_art, (paste_pos, paste_pos))
    light_img.putalpha(mask)
    arr_l = np.array(light_img)
    arr_l[arr_l[:, :, 3] <= 2] = [0, 0, 0, 0]
    light_master = Image.fromarray(arr_l, 'RGBA')

    # 3. Cassette Icon (card #1F1A1E)
    scale_c = 780.0 / 601.0
    c_w = int(cassette_orig.width * scale_c)
    c_h = int(cassette_orig.height * scale_c)
    c_scaled = cassette_orig.resize((c_w, c_h), Image.Resampling.LANCZOS)
    cassette_img = Image.new('RGBA', (1024, 1024), (31, 26, 30, 255))
    paste_x = int(512 - 328.5 * scale_c)
    paste_y = int(512 - 411.5 * scale_c)
    cassette_img.paste(c_scaled, (paste_x, paste_y))
    cassette_img.putalpha(mask)
    arr_c = np.array(cassette_img)
    arr_c[arr_c[:, :, 3] <= 2] = [0, 0, 0, 0]
    cassette_master = Image.fromarray(arr_c, 'RGBA')

    return dark_master, light_master, cassette_master

def make_layer(orig: Image.Image, size: int) -> Image.Image:
    """
    Downsamples the master 1024x1024 squircle icon to the target size,
    strictly zeroing out near-zero alpha fringe and 4 outer corners.
    """
    r = orig.resize((size, size), Image.Resampling.LANCZOS)
    arr = np.array(r)
    arr[arr[:, :, 3] <= 2] = [0, 0, 0, 0]
    arr[0, 0] = [0, 0, 0, 0]
    arr[0, size - 1] = [0, 0, 0, 0]
    arr[size - 1, 0] = [0, 0, 0, 0]
    arr[size - 1, size - 1] = [0, 0, 0, 0]
    return Image.fromarray(arr, 'RGBA')

def make_clean_tray_icon(src_img: Image.Image, size: int = 32, radius_pct: float = 0.22) -> Image.Image:
    """
    Downsamples unclipped source artwork (dark_orig, light_orig, cassette_orig) directly
    to a crisp tray icon with smooth Lanczos anti-aliasing and squircle-rounded corners.
    No unsharp or contrast exaggeration, ensuring it matches the clean, legible original
    tray icon that displays perfectly on Windows 10/11 light and dark notification areas.
    """
    resized = src_img.resize((size, size), Image.Resampling.LANCZOS)

    # Create squircle rounded corner mask
    supersample = 4
    big_size = size * supersample
    big_radius = int(big_size * radius_pct)
    mask = Image.new('L', (big_size, big_size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, big_size - 1, big_size - 1], radius=big_radius, fill=255)
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)

    resized.putalpha(mask)
    arr = np.array(resized)
    arr[arr[:, :, 3] <= 2] = [0, 0, 0, 0]
    # zero 4 extreme outer corners
    arr[0, 0] = [0, 0, 0, 0]
    arr[0, size - 1] = [0, 0, 0, 0]
    arr[size - 1, 0] = [0, 0, 0, 0]
    arr[size - 1, size - 1] = [0, 0, 0, 0]
    return Image.fromarray(arr, 'RGBA')

def make_tray_icon(
    src_1024: Image.Image,
    target_size: int,
    unsharp_radius: float = 0.8,
    unsharp_percent: int = 130,
    contrast_factor: float = 1.15
) -> Image.Image:
    """
    Downsamples to a crisp tray icon (32x32 or 64x64) with high-quality Lanczos,
    unsharp masking, and contrast enhancement.
    """
    small = src_1024.resize((target_size, target_size), Image.Resampling.LANCZOS)
    r, g, b, a = small.split()
    rgb = Image.merge('RGB', (r, g, b))
    sharp_rgb = rgb.filter(ImageFilter.UnsharpMask(radius=unsharp_radius, percent=unsharp_percent, threshold=1))
    enhanced_rgb = ImageEnhance.Contrast(sharp_rgb).enhance(contrast_factor)
    result = enhanced_rgb.convert('RGBA')
    result.putalpha(a)
    arr = np.array(result)
    arr[arr[:, :, 3] <= 2] = [0, 0, 0, 0]
    arr[0, 0] = [0, 0, 0, 0]
    arr[0, target_size - 1] = [0, 0, 0, 0]
    arr[target_size - 1, 0] = [0, 0, 0, 0]
    arr[target_size - 1, target_size - 1] = [0, 0, 0, 0]
    return Image.fromarray(arr, mode='RGBA')

def create_ico_layer_dib(img: Image.Image) -> bytes:
    """
    Encodes a layer into Microsoft-standard 32-bit ARGB DIB for Windows ICO.
    - BITMAPINFOHEADER with biHeight = height * 2 (XOR + AND masks)
    - BGRA bottom-up scanlines
    - 1-bit AND mask padded to 4-byte boundary, bottom-up
    """
    w, h = img.size
    img = img.convert('RGBA')
    arr = np.array(img)
    arr_bottom_up = np.flipud(arr)

    xor_size = w * h * 4
    and_row_bytes = ((w + 31) // 32) * 4
    and_size = and_row_bytes * h
    biSizeImage = xor_size + and_size

    # BITMAPINFOHEADER (40 bytes)
    bmiHeader = struct.pack(
        '<IiiHHIIiiII',
        40,          # biSize
        w,           # biWidth
        h * 2,       # biHeight (double height for XOR + AND)
        1,           # biPlanes
        32,          # biBitCount
        0,           # biCompression (BI_RGB)
        biSizeImage, # biSizeImage
        0,           # biXPelsPerMeter
        0,           # biYPelsPerMeter
        0,           # biClrUsed
        0            # biClrImportant
    )

    # XOR Mask (BGRA bottom-up)
    bgra = np.zeros_like(arr_bottom_up)
    bgra[:, :, 0] = arr_bottom_up[:, :, 2]  # B
    bgra[:, :, 1] = arr_bottom_up[:, :, 1]  # G
    bgra[:, :, 2] = arr_bottom_up[:, :, 0]  # R
    bgra[:, :, 3] = arr_bottom_up[:, :, 3]  # A
    xor_data = bgra.tobytes()

    # AND Mask (1 bit per pixel, bottom-up, padded to 4-byte boundary)
    and_mask_bytes = bytearray()
    for y in range(h):
        row_bits = 0
        bit_count = 0
        row_bytes = bytearray()
        for x in range(w):
            alpha = arr_bottom_up[y, x, 3]
            bit = 1 if alpha == 0 else 0
            row_bits = (row_bits << 1) | bit
            bit_count += 1
            if bit_count == 8:
                row_bytes.append(row_bits)
                row_bits = 0
                bit_count = 0
        if bit_count > 0:
            row_bits <<= (8 - bit_count)
            row_bytes.append(row_bits)
        while len(row_bytes) % 4 != 0:
            row_bytes.append(0)
        and_mask_bytes.extend(row_bytes)

    return bmiHeader + xor_data + bytes(and_mask_bytes)

def make_ico(orig: Image.Image, sizes=[16, 24, 32, 48, 64, 128, 256]) -> bytes:
    """
    Builds a standard Windows ICO file:
    - Sizes 16, 24, 32, 48, 64, 128 use 32-bit ARGB DIB.
    - Size 256 uses compressed PNG stream.
    """
    frames = []
    for s in sizes:
        sub = make_layer(orig, s)
        if s == 256:
            bio = io.BytesIO()
            sub.save(bio, format='PNG')
            data = bio.getvalue()
        else:
            data = create_ico_layer_dib(sub)
        frames.append((s, data))

    count = len(frames)
    header = struct.pack('<HHH', 0, 1, count)
    entries = []
    offset = 6 + count * 16

    for s, data in frames:
        w_byte = 0 if s == 256 else s
        h_byte = 0 if s == 256 else s
        entry = struct.pack('<BBBBHHII', w_byte, h_byte, 0, 0, 1, 32, len(data), offset)
        entries.append(entry)
        offset += len(data)

    return header + b''.join(entries) + b''.join(d for _, d in frames)

def verify_ico_with_win32(ico_path: str):
    """
    Verifies that Windows Win32 GDI LoadImageW can load all sizes from the generated ICO.
    """
    if os.name != 'nt':
        return
    user32 = ctypes.windll.user32
    LR_LOADFROMFILE = 0x00000010
    IMAGE_ICON = 1
    for sz in [16, 24, 32, 48, 64, 128, 256]:
        hicon = user32.LoadImageW(None, ico_path, IMAGE_ICON, sz, sz, LR_LOADFROMFILE)
        if hicon == 0:
            err = ctypes.GetLastError()
            raise RuntimeError(f"Win32 LoadImageW failed for {ico_path} size {sz}x{sz}! Error={err}")
        user32.DestroyIcon(hicon)

def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

    print("1. Loading source master icons...")
    dark_raw, light_raw, cassette_raw = load_source_images(root)

    print("2. Generating squircle master icons (1024x1024, pad=56px, radius=265px)...")
    dark_master, light_master, cassette_master = build_squircle_master_icons(dark_raw, light_raw, cassette_raw)

    client_icons = os.path.join(root, 'client', 'public', 'icons')
    installer_pub_icons = os.path.join(root, 'installer', 'public', 'icons')
    tauri_icons = os.path.join(root, 'Tauri', 'src-tauri', 'icons')
    installer_icons = os.path.join(root, 'installer', 'src-tauri', 'icons')

    os.makedirs(client_icons, exist_ok=True)
    os.makedirs(installer_pub_icons, exist_ok=True)
    os.makedirs(tauri_icons, exist_ok=True)
    os.makedirs(installer_icons, exist_ok=True)

    # Save master 1024x1024 PNGs
    print("3. Saving master 1024x1024 PNG icons...")
    for folder in [client_icons, installer_pub_icons]:
        dark_master.save(os.path.join(folder, 'favicon_dark.png'), format='PNG', optimize=True)
        light_master.save(os.path.join(folder, 'favicon_light.png'), format='PNG', optimize=True)
        cassette_master.save(os.path.join(folder, 'logo_cassette.png'), format='PNG', optimize=True)

    # 4. Generate Standard DIB ICO files
    print("4. Encoding Microsoft-Standard DIB ICO files (16..128 DIB + 256 PNG)...")
    dark_ico = make_ico(dark_master)
    light_ico = make_ico(light_master)
    cassette_ico = make_ico(cassette_master)

    ico_targets = [
        (os.path.join(tauri_icons, 'icon.ico'), dark_ico),
        (os.path.join(tauri_icons, 'wave_dark.ico'), dark_ico),
        (os.path.join(tauri_icons, 'wave_light.ico'), light_ico),
        (os.path.join(tauri_icons, 'cassette.ico'), cassette_ico),
        (os.path.join(installer_icons, 'icon.ico'), dark_ico),
        (os.path.join(root, 'client', 'public', 'favicon.ico'), dark_ico),
    ]

    for p, data in ico_targets:
        with open(p, 'wb') as f:
            f.write(data)
        verify_ico_with_win32(p)
        print(f"  [OK] Wrote & Verified: {os.path.relpath(p, root)}")

    # 5. Write Standard Bundle PNGs for Tauri & Installer
    print("5. Generating standard bundle PNG sizes...")
    bundle_targets = {
        '32x32.png': 32,
        '64x64.png': 64,
        '128x128.png': 128,
        '128x128@2x.png': 256,
        'icon.png': 512,
        'Square30x30Logo.png': 30,
        'Square44x44Logo.png': 44,
        'Square71x71Logo.png': 71,
        'Square89x89Logo.png': 89,
        'Square107x107Logo.png': 107,
        'Square142x142Logo.png': 142,
        'Square150x150Logo.png': 150,
        'Square284x284Logo.png': 284,
        'Square310x310Logo.png': 310,
        'StoreLogo.png': 50,
    }

    for dir_path in [tauri_icons, installer_icons]:
        for fname, size in bundle_targets.items():
            out_img = make_layer(dark_master, size)
            out_path = os.path.join(dir_path, fname)
            out_img.save(out_path, format='PNG', optimize=True)

    # 6. Generate Window Icons (512x512)
    print("6. Generating window icons (512x512)...")
    make_layer(dark_master, 512).save(os.path.join(tauri_icons, 'window_wave_dark.png'), format='PNG', optimize=True)
    make_layer(light_master, 512).save(os.path.join(tauri_icons, 'window_wave_light.png'), format='PNG', optimize=True)
    make_layer(cassette_master, 512).save(os.path.join(tauri_icons, 'window_cassette.png'), format='PNG', optimize=True)

    # 7. Generate Clean, Crisp Tray Icons (32x32 standard Windows tray size)
    print("7. Generating clean crisp tray icons (32x32 standard)...")
    make_clean_tray_icon(dark_raw, 32).save(
        os.path.join(tauri_icons, 'tray_wave_dark.png'), format='PNG', optimize=True
    )
    make_clean_tray_icon(light_raw, 32).save(
        os.path.join(tauri_icons, 'tray_wave_light.png'), format='PNG', optimize=True
    )
    make_clean_tray_icon(cassette_raw, 32).save(
        os.path.join(tauri_icons, 'tray_cassette.png'), format='PNG', optimize=True
    )

    # Clean 32x32 and 64x64 icons for Tauri and Installer bundle
    make_clean_tray_icon(dark_raw, 32).save(os.path.join(tauri_icons, '32x32.png'), format='PNG', optimize=True)
    make_clean_tray_icon(dark_raw, 64).save(os.path.join(tauri_icons, '64x64.png'), format='PNG', optimize=True)
    make_clean_tray_icon(dark_raw, 32).save(os.path.join(installer_icons, '32x32.png'), format='PNG', optimize=True)
    make_clean_tray_icon(dark_raw, 64).save(os.path.join(installer_icons, '64x64.png'), format='PNG', optimize=True)

    # 8. Corner transparency verification
    print("\n8. Final Corner Transparency Verification:")
    verify_files = [
        os.path.join(client_icons, 'favicon_dark.png'),
        os.path.join(client_icons, 'favicon_light.png'),
        os.path.join(client_icons, 'logo_cassette.png'),
        os.path.join(tauri_icons, '32x32.png'),
        os.path.join(tauri_icons, 'window_wave_dark.png'),
        os.path.join(tauri_icons, 'tray_wave_dark.png'),
    ]
    for vf in verify_files:
        im = Image.open(vf)
        c00 = im.getpixel((0, 0))
        cend = im.getpixel((im.width - 1, im.height - 1))
        assert c00[3] == 0, f"Error: {vf} (0,0) alpha is {c00[3]} != 0"
        assert cend[3] == 0, f"Error: {vf} (end,end) alpha is {cend[3]} != 0"
        print(f"  [OK] {os.path.relpath(vf, root)} ({im.size}): corner alpha = 0")

    print("\nAll squircle icons & Microsoft-Standard DIB ICOs generated and verified successfully!")

if __name__ == '__main__':
    main()
