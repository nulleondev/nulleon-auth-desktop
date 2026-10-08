use image::{GrayImage, ImageFormat};
use percent_encoding::percent_decode_str;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub(crate) struct QrScanResult {
    pub issuer: Option<String>,
    pub account: Option<String>,
    pub secret: String,
    pub digits: u32,
    pub algorithm: String,
    pub period: u32,
}

// Errors are fixed identifiers, never include decoded content or capture details.
fn normalize_secret(value: &str) -> Result<String, String> {
    let compact: String = value
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_ascii_uppercase();
    let secret = compact.trim_end_matches('=');
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    if secret.len() < 16 || secret.len() > 1024 || !secret.chars().all(|c| alphabet.contains(c)) {
        return Err("QR_INVALID_SECRET".into());
    }
    let remainder = secret.len() % 8;
    let padding = match remainder {
        0 => 0,
        2 => 6,
        4 => 4,
        5 => 3,
        7 => 1,
        _ => return Err("QR_INVALID_SECRET".into()),
    };
    let supplied_padding = compact.len() - secret.len();
    if supplied_padding != 0 && supplied_padding != padding {
        return Err("QR_INVALID_SECRET".into());
    }
    let extra_bits = (secret.len() * 5) % 8;
    let last = alphabet.find(secret.chars().last().unwrap()).unwrap();
    if last & ((1 << extra_bits) - 1) != 0 {
        return Err("QR_INVALID_SECRET".into());
    }
    Ok(secret.to_string())
}

pub(crate) fn parse_content(content: &str) -> Result<QrScanResult, String> {
    let content = content.trim();
    if content.len() > 8192 {
        return Err("QR_UNSUPPORTED".into());
    }
    if content.starts_with("otpauth-migration://") {
        return Err("QR_MIGRATION_UNSUPPORTED".into());
    }
    if !content.starts_with("otpauth://") {
        return Ok(QrScanResult {
            issuer: None,
            account: Some("Importado".into()),
            secret: normalize_secret(content)?,
            digits: 6,
            algorithm: "SHA-1".into(),
            period: 30,
        });
    }
    let url = url::Url::parse(content).map_err(|_| "QR_INVALID_URI")?;
    if url.host_str() != Some("totp") {
        return Err("QR_UNSUPPORTED_TYPE".into());
    }
    if url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("QR_INVALID_URI".into());
    }
    let label = percent_decode_str(url.path().trim_start_matches('/'))
        .decode_utf8()
        .map_err(|_| "QR_INVALID_URI")?;
    let (label_issuer, account) = match label.split_once(':') {
        Some((issuer, account)) => (Some(issuer.trim().to_string()), account.trim()),
        None => (None, label.trim()),
    };
    if account.is_empty()
        || account.len() > 120
        || account.contains(':')
        || label.chars().any(char::is_control)
    {
        return Err("QR_INVALID_URI".into());
    }
    let mut params = HashMap::new();
    for (key, value) in url.query_pairs() {
        if params
            .insert(key.into_owned(), value.into_owned())
            .is_some()
        {
            return Err("QR_INVALID_URI".into());
        }
    }
    let secret = normalize_secret(params.get("secret").ok_or("QR_INVALID_SECRET")?)?;
    let issuer = params.get("issuer").cloned().or(label_issuer.clone());
    if let Some(ref value) = issuer {
        if value.is_empty() || value.len() > 120 || value.chars().any(char::is_control) {
            return Err("QR_INVALID_URI".into());
        }
        if let Some(ref label_value) = label_issuer {
            if value != label_value {
                return Err("QR_ISSUER_MISMATCH".into());
            }
        }
    }
    let digits = params
        .get("digits")
        .map(|v| v.parse::<u32>())
        .transpose()
        .map_err(|_| "QR_UNSUPPORTED_PARAMETERS")?
        .unwrap_or(6);
    let period = params
        .get("period")
        .map(|v| v.parse::<u32>())
        .transpose()
        .map_err(|_| "QR_UNSUPPORTED_PARAMETERS")?
        .unwrap_or(30);
    if ![6, 8].contains(&digits) || !(1..=300).contains(&period) {
        return Err("QR_UNSUPPORTED_PARAMETERS".into());
    }
    let algorithm = match params
        .get("algorithm")
        .map(|v| v.to_ascii_uppercase())
        .as_deref()
        .unwrap_or("SHA1")
    {
        "SHA1" => "SHA-1",
        "SHA256" => "SHA-256",
        "SHA512" => "SHA-512",
        _ => return Err("QR_UNSUPPORTED_PARAMETERS".into()),
    };
    Ok(QrScanResult {
        issuer,
        account: Some(account.into()),
        secret,
        digits,
        algorithm: algorithm.into(),
        period,
    })
}

fn decode_image(gray: GrayImage) -> (Vec<QrScanResult>, Option<String>) {
    let mut found = Vec::new();
    let mut invalid = None;
    // Decode both polarities: many providers display white QR modules in dark mode.
    for inverted in [false, true] {
        let mut pixels = gray.clone();
        if inverted {
            image::imageops::invert(&mut pixels);
        }
        let mut prepared = rqrr::PreparedImage::prepare(pixels);
        for grid in prepared.detect_grids() {
            if let Ok((_, content)) = grid.decode() {
                match parse_content(&content) {
                    Ok(item) => {
                        if !found.contains(&item) {
                            found.push(item);
                        }
                    }
                    Err(error) => {
                        if content.starts_with("otpauth") {
                            invalid = Some(error);
                        }
                    }
                }
            }
        }
    }
    (found, invalid)
}
fn select_result(
    mut found: Vec<QrScanResult>,
    invalid: Option<String>,
    capture_failed: bool,
) -> Result<QrScanResult, String> {
    if found.len() > 1 {
        return Err("QR_MULTIPLE".into());
    }
    // A failed monitor prevents knowing whether another QR is present.
    if capture_failed {
        return Err("QR_CAPTURE_FAILED".into());
    }
    found
        .pop()
        .ok_or_else(|| invalid.unwrap_or_else(|| "QR_NOT_FOUND".into()))
}

pub(crate) fn capture_and_decode() -> Result<QrScanResult, String> {
    // Portal capture can persist images to disk in some Wayland implementations.
    // Keep the no-persisted-capture guarantee; offer image import instead.
    #[cfg(target_os = "linux")]
    if std::env::var("XDG_SESSION_TYPE").unwrap_or_default() == "wayland"
        || std::env::var("WAYLAND_DISPLAY")
            .unwrap_or_default()
            .contains("wayland")
    {
        return Err("QR_WAYLAND_UNSUPPORTED".into());
    }
    let screens = xcap::Monitor::all().map_err(|_| "QR_CAPTURE_FAILED")?;
    if screens.is_empty() {
        return Err("QR_CAPTURE_FAILED".into());
    }
    let mut found = Vec::new();
    let mut invalid = None;
    let mut failed = false;
    for screen in screens {
        match screen.capture_image() {
            Ok(capture) => {
                let converted = image::RgbaImage::from_raw(capture.width(), capture.height(), capture.into_raw())
                    .ok_or("QR_CAPTURE_FAILED")?;
                let (items, error) = decode_image(image::DynamicImage::ImageRgba8(converted).to_luma8());
                for item in items {
                    if !found.contains(&item) {
                        found.push(item);
                    }
                }
                if error.is_some() {
                    invalid = error;
                }
            }
            Err(_) => failed = true,
        }
    }
    select_result(found, invalid, failed)
}

static SCANNING: AtomicBool = AtomicBool::new(false);
struct ScanGuard;
impl Drop for ScanGuard {
    fn drop(&mut self) {
        SCANNING.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub(crate) async fn scan_qr_from_screen(
    app_handle: tauri::AppHandle,
) -> Result<QrScanResult, String> {
    if SCANNING.swap(true, Ordering::AcqRel) {
        return Err("QR_BUSY".into());
    }
    let _guard = ScanGuard;
    let window = app_handle
        .get_webview_window("main")
        .ok_or("QR_WINDOW_FAILED")?;
    window.hide().map_err(|_| "QR_WINDOW_FAILED")?;
    let result = tauri::async_runtime::spawn_blocking(|| {
        std::thread::sleep(std::time::Duration::from_millis(350));
        capture_and_decode()
    })
    .await
    .map_err(|_| "QR_CAPTURE_FAILED".to_string())
    .and_then(|value| value);
    window.show().map_err(|_| "QR_WINDOW_FAILED")?;
    let _ = window.set_focus();
    result
}

pub(crate) fn decode_bytes(bytes: &[u8]) -> Result<QrScanResult, String> {
    if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 {
        return Err("QR_IMAGE_INVALID".into());
    }
    let format = image::guess_format(bytes).map_err(|_| "QR_IMAGE_INVALID")?;
    if ![ImageFormat::Png, ImageFormat::Jpeg, ImageFormat::WebP].contains(&format) {
        return Err("QR_IMAGE_INVALID".into());
    }
    let mut reader = image::ImageReader::with_format(std::io::Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| "QR_IMAGE_INVALID")?;
    let (found, invalid) = decode_image(image.to_luma8());
    select_result(found, invalid, false)
}
#[tauri::command]
pub(crate) async fn scan_qr_from_image(image_data: Vec<u8>) -> Result<QrScanResult, String> {
    if SCANNING.swap(true, Ordering::AcqRel) { return Err("QR_BUSY".into()); }
    let _guard = ScanGuard;
    tauri::async_runtime::spawn_blocking(move || decode_bytes(&image_data))
        .await
        .map_err(|_| "QR_IMAGE_INVALID".to_string())?
}

#[cfg(test)]
mod tests;
