// Vault v2 compatibility: Argon2id (128 MiB, 3 iterations), AES-256-GCM, BIP39.
// Preserve this encoding so existing encrypted vaults remain readable.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{password_hash::rand_core::OsRng, Argon2};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use bip39::Mnemonic;
use rand::RngCore;
use zeroize::Zeroizing;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self},
    io::Write,
    path::{Path, PathBuf},
};

const MAX_VAULT_FILE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_VAULT_ITEMS: usize = 10_000;

// --- DATA STRUCTURES ---

#[derive(Serialize, Deserialize)]
struct VaultFile {
    version: u32,
    salt: String,
    nonce_seed: String,
    encrypted_seed: String,
    nonce_vault: String,
    ciphertext: String,
    params: KdfParams,
}

#[derive(Serialize, Deserialize)]
struct KdfParams {
    memory: u32,
    iterations: u32,
    parallelism: u32,
}

#[derive(Serialize)]
struct CreateResponse {
    mnemonic: String,
    vault_file: String,
}

// --- CONFIGURATION ---

const VAULT_VERSION: u32 = 2;
const ARGON_MEMORY: u32 = 131072;
const ARGON_ITERATIONS: u32 = 3;
const ARGON_PARALLELISM: u32 = 1;

// --- CRITICAL HELPERS (Restored) ---

fn derive_key_from_password(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    if password.len() > 1024 || salt.len() != 16 { return Err("Invalid password or salt size".into()); }
    let params = argon2::Params::new(ARGON_MEMORY, ARGON_ITERATIONS, ARGON_PARALLELISM, Some(32))
        .map_err(|e| e.to_string())?;

    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut output_key = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut output_key)
        .map_err(|e| e.to_string())?;
    Ok(output_key)
}

fn derive_key_from_mnemonic(mnemonic_str: &str) -> Result<[u8; 32], String> {
    let mnemonic = Mnemonic::parse(mnemonic_str).map_err(|_| "Invalid Mnemonic".to_string())?;

    let seed = mnemonic.to_seed("");
    let mut hasher = Sha256::new();
    hasher.update(seed);
    Ok(hasher.finalize().into())
}

fn encrypt_bytes(key: &[u8; 32], data: &[u8], nonce: &[u8; 12]) -> Result<Vec<u8>, String> {
    let key_obj = aes_gcm::Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(key_obj);
    let nonce_obj = Nonce::from_slice(nonce);
    cipher.encrypt(nonce_obj, data).map_err(|e| e.to_string())
}

fn decrypt_bytes(key: &[u8; 32], data: &[u8], nonce: &[u8; 12]) -> Result<Vec<u8>, String> {
    let key_obj = aes_gcm::Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(key_obj);
    let nonce_obj = Nonce::from_slice(nonce);
    cipher
        .decrypt(nonce_obj, data)
        .map_err(|_| "Decryption Failed".to_string())
}

fn decode_nonce(value: &str, label: &str) -> Result<[u8; 12], String> {
    let decoded = BASE64
        .decode(value)
        .map_err(|_| format!("Invalid {label}"))?;
    decoded
        .try_into()
        .map_err(|_| format!("Invalid {label} length"))
}

fn validate_vault_header(vault: &VaultFile) -> Result<(), String> {
    if vault.version != VAULT_VERSION {
        return Err("Unsupported vault version".to_string());
    }
    if vault.params.memory != ARGON_MEMORY
        || vault.params.iterations != ARGON_ITERATIONS
        || vault.params.parallelism != ARGON_PARALLELISM
    {
        return Err("Unsupported vault KDF parameters".to_string());
    }
    if BASE64.decode(&vault.salt).map_err(|_| "Invalid salt")?.len() != 16
        || BASE64.decode(&vault.encrypted_seed).map_err(|_| "Invalid encrypted seed")?.len() > 512
        || vault.ciphertext.len() as u64 > MAX_VAULT_FILE_BYTES {
        return Err("Invalid vault field size".into());
    }
    decode_nonce(&vault.nonce_seed, "seed nonce")?;
    decode_nonce(&vault.nonce_vault, "vault nonce")?;
    Ok(())
}

fn parse_vault(value: &str) -> Result<VaultFile, String> {
    if value.len() as u64 > MAX_VAULT_FILE_BYTES { return Err("Vault file is too large".into()); }
    let vault: VaultFile = serde_json::from_str(value).map_err(|_| "Invalid vault file")?;
    validate_vault_header(&vault)?;
    Ok(vault)
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|_| "Could not secure vault permissions".to_string())
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

// Only one expensive KDF operation at a time across IPC callers.
static CRYPTO_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
struct CryptoWork;
impl CryptoWork {
    fn begin() -> Result<Self, String> {
        if CRYPTO_BUSY.swap(true, std::sync::atomic::Ordering::AcqRel) { return Err("Vault operation busy".into()); }
        Ok(Self)
    }
}
impl Drop for CryptoWork {
    fn drop(&mut self) { CRYPTO_BUSY.store(false, std::sync::atomic::Ordering::Release); }
}

// --- COMMANDS ---

#[tauri::command]
async fn create_new_vault(
    password: String,
    initial_data: String,
) -> Result<CreateResponse, String> {
    let _work = CryptoWork::begin()?;
    if password.len() > 1024 { return Err("Password is too long".into()); }
    if password.chars().count() < 12 {
        return Err("Master password must contain at least 12 characters".to_string());
    }
    if initial_data.len() as u64 > MAX_VAULT_FILE_BYTES {
        return Err("Vault data is too large".to_string());
    }
    // 1. Generate BIP39 Seed via Entropy (Compatible with bip39 2.0)
    let mut entropy = [0u8; 16]; // 128 bits for 12 words
    OsRng.fill_bytes(&mut entropy);
    let mnemonic = Mnemonic::from_entropy(&entropy).map_err(|e| e.to_string())?;
    let mnemonic_phrase = mnemonic.to_string();

    let master_key = Zeroizing::new(derive_key_from_mnemonic(&mnemonic_phrase)?);

    // 2. Encrypt Data with Master Key
    let mut nonce_vault = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_vault);
    let ciphertext = encrypt_bytes(&master_key, initial_data.as_bytes(), &nonce_vault)?;

    // 3. Encrypt Seed with Password
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let password_key = Zeroizing::new(derive_key_from_password(&password, &salt)?);

    let mut nonce_seed = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_seed);
    let encrypted_seed = encrypt_bytes(&password_key, mnemonic_phrase.as_bytes(), &nonce_seed)?;

    // 4. Construct File
    let vault_file = VaultFile {
        version: VAULT_VERSION,
        salt: BASE64.encode(salt),
        nonce_seed: BASE64.encode(nonce_seed),
        encrypted_seed: BASE64.encode(encrypted_seed),
        nonce_vault: BASE64.encode(nonce_vault),
        ciphertext: BASE64.encode(ciphertext),
        params: KdfParams {
            memory: ARGON_MEMORY,
            iterations: ARGON_ITERATIONS,
            parallelism: ARGON_PARALLELISM,
        },
    };

    Ok(CreateResponse {
        mnemonic: mnemonic_phrase,
        vault_file: serde_json::to_string(&vault_file).map_err(|e| e.to_string())?,
    })
}

#[tauri::command]
async fn unlock_vault(password: String, vault_file_json: String) -> Result<String, String> {
    let _work = CryptoWork::begin()?;
    let vault: VaultFile =
        parse_vault(&vault_file_json)?;
    validate_vault_header(&vault)?;

    let salt = BASE64.decode(&vault.salt).map_err(|_| "Invalid Salt")?;
    let nonce_seed = decode_nonce(&vault.nonce_seed, "Nonce Seed")?;
    let encrypted_seed = BASE64
        .decode(&vault.encrypted_seed)
        .map_err(|_| "Invalid Seed Cipher")?;

    let password_key = Zeroizing::new(derive_key_from_password(&password, &salt)?);
    let mnemonic_bytes = decrypt_bytes(&password_key, &encrypted_seed, &nonce_seed)?;
    let mnemonic_str = String::from_utf8(mnemonic_bytes).map_err(|_| "Invalid Seed UTF8")?;

    let master_key = Zeroizing::new(derive_key_from_mnemonic(&mnemonic_str)?);

    let nonce_vault = decode_nonce(&vault.nonce_vault, "Nonce Vault")?;
    let ciphertext = BASE64
        .decode(&vault.ciphertext)
        .map_err(|_| "Invalid Vault Cipher")?;

    let plaintext = decrypt_bytes(&master_key, &ciphertext, &nonce_vault)?;

    String::from_utf8(plaintext).map_err(|_| "Invalid Data UTF8".to_string())
}

#[tauri::command]
async fn restore_from_seed(mnemonic: String, vault_file_json: String) -> Result<String, String> {
    let _work = CryptoWork::begin()?;
    if mnemonic.len() > 512 { return Err("Mnemonic is too long".into()); }
    let vault: VaultFile =
        parse_vault(&vault_file_json)?;
    validate_vault_header(&vault)?;

    let master_key = Zeroizing::new(derive_key_from_mnemonic(&mnemonic)?);

    let nonce_vault = decode_nonce(&vault.nonce_vault, "Nonce Vault")?;
    let ciphertext = BASE64
        .decode(&vault.ciphertext)
        .map_err(|_| "Invalid Vault Cipher")?;

    let plaintext = decrypt_bytes(&master_key, &ciphertext, &nonce_vault)?;

    String::from_utf8(plaintext).map_err(|_| "Invalid Data UTF8".to_string())
}

#[tauri::command]
async fn save_existing_vault(
    password: String,
    data: String,
    old_vault_json: String,
) -> Result<String, String> {
    let _work = CryptoWork::begin()?;
    if data.len() as u64 > MAX_VAULT_FILE_BYTES {
        return Err("Vault data is too large".to_string());
    }

    let json_data: serde_json::Value =
        serde_json::from_str(&data).map_err(|_| "Invalid JSON Data")?;

    let items = if let Some(arr) = json_data.as_array() {
        arr
    } else if let Some(obj) = json_data.as_object() {
        if let Some(items_arr) = obj.get("items").and_then(|v| v.as_array()) {
            items_arr
        } else {
            return Err("Invalid Data Format: Object missing 'items' array".to_string());
        }
    } else {
        return Err("Invalid Data Format: Expected Array or V2 Object".to_string());
    };

    if items.len() > MAX_VAULT_ITEMS {
        return Err("Vault contains too many items".to_string());
    }

    let old_vault: VaultFile =
        parse_vault(&old_vault_json)?;
    validate_vault_header(&old_vault)?;

    let salt = BASE64.decode(&old_vault.salt).map_err(|_| "Invalid Salt")?;
    let nonce_seed = decode_nonce(&old_vault.nonce_seed, "Nonce Seed")?;
    let encrypted_seed_bytes = BASE64
        .decode(&old_vault.encrypted_seed)
        .map_err(|_| "Invalid Seed Cipher")?;

    let password_key = Zeroizing::new(derive_key_from_password(&password, &salt)?);
    let mnemonic_bytes = decrypt_bytes(&password_key, &encrypted_seed_bytes, &nonce_seed)?;
    let mnemonic_str = String::from_utf8(mnemonic_bytes).map_err(|_| "Invalid Seed UTF8")?;

    let master_key = Zeroizing::new(derive_key_from_mnemonic(&mnemonic_str)?);

    let mut new_nonce_vault = [0u8; 12];
    OsRng.fill_bytes(&mut new_nonce_vault);
    let new_ciphertext = encrypt_bytes(&master_key, data.as_bytes(), &new_nonce_vault)?;

    let new_vault_file = VaultFile {
        version: VAULT_VERSION,
        salt: old_vault.salt, // Keep salt/password link
        nonce_seed: old_vault.nonce_seed,
        encrypted_seed: old_vault.encrypted_seed,
        nonce_vault: BASE64.encode(new_nonce_vault),
        ciphertext: BASE64.encode(new_ciphertext),
        params: old_vault.params,
    };

    serde_json::to_string(&new_vault_file).map_err(|e| e.to_string())
}

#[tauri::command]
async fn reset_vault_password(mnemonic: String, new_password: String, vault_file_json: String) -> Result<String, String> {
    let _work = CryptoWork::begin()?;
    if mnemonic.len() > 512 || new_password.chars().count() < 12 || new_password.len() > 1024 { return Err("Invalid recovery input".into()); }
    let mut vault = parse_vault(&vault_file_json)?;
    let canonical = Mnemonic::parse(&mnemonic).map_err(|_| "Invalid mnemonic")?.to_string();
    let key = Zeroizing::new(derive_key_from_mnemonic(&canonical)?);
    let nonce = decode_nonce(&vault.nonce_vault, "vault nonce")?;
    // Prove possession of the matching recovery key before changing the password wrap.
    let _plaintext = Zeroizing::new(decrypt_bytes(&key, &BASE64.decode(&vault.ciphertext).map_err(|_| "Invalid ciphertext")?, &nonce)?);
    let mut salt = [0u8; 16]; OsRng.fill_bytes(&mut salt);
    let mut nonce_seed = [0u8; 12]; OsRng.fill_bytes(&mut nonce_seed);
    let password_key = Zeroizing::new(derive_key_from_password(&new_password, &salt)?);
    vault.encrypted_seed = BASE64.encode(encrypt_bytes(&password_key, canonical.as_bytes(), &nonce_seed)?);
    vault.salt = BASE64.encode(salt);
    vault.nonce_seed = BASE64.encode(nonce_seed);
    serde_json::to_string(&vault).map_err(|_| "Could not encode recovered vault".into())
}

mod qr;
use qr::{scan_qr_from_image, scan_qr_from_screen};

#[derive(Serialize)]
pub struct VaultReadResult {
    pub content: Option<String>,
    pub path: Option<String>,
}

fn default_app_vault_path() -> Result<PathBuf, String> {
    Ok(dirs::data_local_dir().ok_or("Could not find user data directory")?.join("com.nulleon.authenticator/vault.nauth"))
}

fn candidate_vault_paths() -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        paths.push(current_dir.join("vault.nauth"));
    }

    let home = dirs::home_dir().ok_or("Could not find user data directory")?;
    let default_path = default_app_vault_path()?;
    paths.push(default_path);
    paths.push(PathBuf::from(home).join(".local/share/nulleon-authenticator/vault.nauth"));

    let user = std::env::var("USER").unwrap_or_default();
    if !user.is_empty() {
        if let Ok(media_user_dir) = fs::read_dir(PathBuf::from("/media").join(&user)) {
            for entry in media_user_dir.flatten() {
                let candidate = entry.path().join("NULLEON_ROOT/NULLEON_AUTH/vault.nauth");
                if !paths.contains(&candidate) {
                    paths.push(candidate);
                }
            }
        }
    }

    Ok(paths)
}

fn is_allowed_vault_path(path: &Path) -> Result<bool, String> {
    if path.file_name().and_then(|name| name.to_str()) != Some("vault.nauth") {
        return Ok(false);
    }
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|_| "Could not resolve vault path".to_string())?
            .join(path)
    };
    Ok(candidate_vault_paths()?
        .iter()
        .any(|candidate| candidate == &absolute))
}

#[tauri::command]
async fn find_and_read_vault() -> Result<VaultReadResult, String> {
    for path in candidate_vault_paths()? {
        let path_str = path.to_string_lossy().to_string();
        if path.exists() {
            let metadata =
                fs::symlink_metadata(&path).map_err(|_| "Could not inspect vault".to_string())?;
            if !metadata.is_file() || metadata.file_type().is_symlink() { return Err("Vault must be a regular file".into()); }
            if metadata.len() > MAX_VAULT_FILE_BYTES {
                return Err("Vault file is too large".to_string());
            }
            let content =
                fs::read_to_string(&path).map_err(|_| "Could not read vault".to_string())?;
            let vault: VaultFile =
                serde_json::from_str(&content).map_err(|_| "Invalid Vault File")?;
            validate_vault_header(&vault)?;
            set_private_permissions(&path)?;
            return Ok(VaultReadResult {
                content: Some(content),
                path: Some(path_str),
            });
        }
    }

    Ok(VaultReadResult {
        content: None,
        path: None,
    })
}

// Serialize local writes and initialization, including safety-backup replacement.
static VAULT_WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn atomic_private_write(target: &Path, content: &[u8]) -> Result<(), String> {
    let parent = target.parent().ok_or("Invalid vault path")?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|_| "Could not create temporary vault")?;
    set_private_permissions(file.path())?;
    file.write_all(content).map_err(|_| "Could not write vault")?;
    file.as_file().sync_all().map_err(|_| "Could not sync vault")?;
    file.persist(target).map_err(|_| "Could not replace vault atomically")?;
    Ok(())
}

fn write_vault(path: Option<String>, content: String, initialize: bool) -> Result<(), String> {
    let _guard = VAULT_WRITE_LOCK.lock().map_err(|_| "Vault write unavailable")?;
    parse_vault(&content)?;
    let target = path.map(PathBuf::from).map(Ok).unwrap_or_else(default_app_vault_path)?;
    if !is_allowed_vault_path(&target)? { return Err("Vault path is not allowed".into()); }
    if initialize && candidate_vault_paths()?.iter().any(|p| p.exists()) { return Err("A vault already exists".into()); }
    // Refuse symbolic links at the target and in its directory chain.
    for component in target.ancestors() {
        if let Ok(metadata) = fs::symlink_metadata(component) {
            if metadata.file_type().is_symlink() { return Err("Symbolic vault paths are not allowed".into()); }
        }
    }
    let parent = target.parent().ok_or("Invalid vault path")?;
    fs::create_dir_all(parent).map_err(|_| "Could not create vault directory")?;
    if target.exists() {
        let metadata = fs::symlink_metadata(&target).map_err(|_| "Could not inspect vault")?;
        if !metadata.is_file() || metadata.len() > MAX_VAULT_FILE_BYTES { return Err("Invalid existing vault".into()); }
        let previous = fs::read(&target).map_err(|_| "Could not read safety backup")?;
        // Atomic rename replaces a pre-existing backup symlink; never follows it.
        atomic_private_write(&parent.join("vault.nauth.bak"), &previous)?;
    }
    if initialize {
        let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|_| "Could not create vault")?;
        set_private_permissions(file.path())?;
        file.write_all(content.as_bytes()).map_err(|_| "Could not write vault")?;
        file.as_file().sync_all().map_err(|_| "Could not sync vault")?;
        file.persist_noclobber(&target).map_err(|_| "A vault already exists")?;
    } else {
        atomic_private_write(&target, content.as_bytes())?;
    }
    Ok(())
}

#[tauri::command]
async fn write_vault_file(path: Option<String>, content: String) -> Result<(), String> {
    write_vault(path, content, false)
}

#[tauri::command]
async fn install_vault_file(content: String) -> Result<(), String> {
    write_vault(None, content, true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            create_new_vault,
            unlock_vault,
            restore_from_seed,
            reset_vault_password,
            save_existing_vault,
            scan_qr_from_screen,
            scan_qr_from_image,
            find_and_read_vault,
            write_vault_file,
            install_vault_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod vault_tests {
    use super::*;
    const PASSWORD: &str = "public-synthetic-qa-password";
    const DATA: &str = r#"{"vaultVersion":2,"items":[{"id":"synthetic-note","type":"note","name":"QA note","content":"Synthetic content only"}]}"#;
    #[test]
    fn encrypted_round_trip_wrong_password_recovery_and_tampering() {
        tauri::async_runtime::block_on(async {
            let created = create_new_vault(PASSWORD.into(), DATA.into())
                .await
                .unwrap();
            assert!(!created.vault_file.contains("Synthetic content"));
            assert_eq!(
                unlock_vault(PASSWORD.into(), created.vault_file.clone())
                    .await
                    .unwrap(),
                DATA
            );
            assert!(
                unlock_vault("wrong-password".into(), created.vault_file.clone())
                    .await
                    .is_err()
            );
            assert_eq!(
                restore_from_seed(created.mnemonic, created.vault_file.clone())
                    .await
                    .unwrap(),
                DATA
            );
            let updated = save_existing_vault(
                PASSWORD.into(),
                r#"{"vaultVersion":2,"items":[]}"#.into(),
                created.vault_file.clone(),
            )
            .await
            .unwrap();
            assert_ne!(updated, created.vault_file);
            assert_eq!(
                unlock_vault(PASSWORD.into(), updated).await.unwrap(),
                r#"{"vaultVersion":2,"items":[]}"#
            );
            let mut tampered: serde_json::Value =
                serde_json::from_str(&created.vault_file).unwrap();
            tampered["nonce_vault"] = serde_json::json!(BASE64.encode([1u8; 12]));
            assert!(unlock_vault(PASSWORD.into(), tampered.to_string())
                .await
                .is_err());
            tampered["nonce_seed"] = serde_json::json!(BASE64.encode([0u8; 2]));
            assert!(unlock_vault(PASSWORD.into(), tampered.to_string())
                .await
                .is_err());
            tampered["version"] = serde_json::json!(999);
            assert!(unlock_vault(PASSWORD.into(), tampered.to_string())
                .await
                .is_err());
        });
    }
    #[test]
    fn file_round_trip_backup_permissions_and_rejected_paths() {
        // Run with --test-threads=1; only our generated temporary vault is accessed.
        let previous = std::env::current_dir().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "nulleon-native-qa-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        fs::create_dir(&dir).unwrap();
        std::env::set_current_dir(&dir).unwrap();
        struct Restore(std::path::PathBuf, std::path::PathBuf);
        impl Drop for Restore {
            fn drop(&mut self) {
                let _ = std::env::set_current_dir(&self.0);
                let _ = fs::remove_dir_all(&self.1);
            }
        }
        let _restore = Restore(previous, dir.clone());
        tauri::async_runtime::block_on(async {
            let created = create_new_vault(PASSWORD.into(), DATA.into())
                .await
                .unwrap();
            let target = dir.join("vault.nauth").to_string_lossy().to_string();
            write_vault_file(Some(target.clone()), created.vault_file.clone())
                .await
                .unwrap();
            let read = find_and_read_vault().await.unwrap();
            assert_eq!(read.content.as_deref(), Some(created.vault_file.as_str()));
            let updated = save_existing_vault(
                PASSWORD.into(),
                r#"{"vaultVersion":2,"items":[]}"#.into(),
                created.vault_file.clone(),
            )
            .await
            .unwrap();
            write_vault_file(Some(target.clone()), updated.clone())
                .await
                .unwrap();
            assert_eq!(
                fs::read_to_string(dir.join("vault.nauth.bak")).unwrap(),
                created.vault_file
            );
            assert_eq!(fs::read_to_string(&target).unwrap(), updated);
            assert!(!dir.join(".vault.nauth.tmp").exists());
            assert!(write_vault_file(
                Some(dir.join("other.nauth").to_string_lossy().into()),
                created.vault_file
            )
            .await
            .is_err());
            assert!(write_vault_file(Some(target.clone()), "malformed".into())
                .await
                .is_err());
            assert_eq!(fs::read_to_string(&target).unwrap(), updated);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                for path in [
                    &target,
                    &dir.join("vault.nauth.bak").to_string_lossy().to_string(),
                ] {
                    assert_eq!(
                        fs::metadata(path).unwrap().permissions().mode() & 0o777,
                        0o600
                    );
                }
            }
        });
    }
    #[test]
    fn recovery_rewrap_preserves_data_and_original_mnemonic() {
        tauri::async_runtime::block_on(async {
            let created = create_new_vault(PASSWORD.into(), DATA.into()).await.unwrap();
            let recovered = reset_vault_password(created.mnemonic.clone(), "new-public-test-password".into(), created.vault_file.clone()).await.unwrap();
            assert_eq!(unlock_vault("new-public-test-password".into(), recovered.clone()).await.unwrap(), DATA);
            assert!(unlock_vault(PASSWORD.into(), recovered.clone()).await.is_err());
            assert_eq!(restore_from_seed(created.mnemonic, recovered.clone()).await.unwrap(), DATA);
            let wrong = create_new_vault(PASSWORD.into(), DATA.into()).await.unwrap();
            assert!(reset_vault_password(wrong.mnemonic, PASSWORD.into(), recovered).await.is_err());
        });
    }

    #[test]
    fn bounded_hostile_headers_and_passwords() {
        tauri::async_runtime::block_on(async {
            assert!(create_new_vault("x".repeat(1025), DATA.into()).await.is_err());
            assert!(unlock_vault(PASSWORD.into(), "x".repeat(MAX_VAULT_FILE_BYTES as usize + 1)).await.is_err());
            let mut value: serde_json::Value = serde_json::from_str(&create_new_vault(PASSWORD.into(), DATA.into()).await.unwrap().vault_file).unwrap();
            value["params"]["memory"] = serde_json::json!(u32::MAX);
            assert!(parse_vault(&value.to_string()).is_err());
            value["params"]["memory"] = serde_json::json!(ARGON_MEMORY);
            value["salt"] = serde_json::json!(BASE64.encode([1u8; 1024]));
            assert!(parse_vault(&value.to_string()).is_err());
        });
    }

    #[cfg(unix)]
    #[test]
    fn backup_symlink_cannot_overwrite_an_unrelated_file() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let victim = dir.path().join("unrelated.txt");
        let backup = dir.path().join("vault.nauth.bak");
        fs::write(&victim, "must remain unchanged").unwrap();
        symlink(&victim, &backup).unwrap();
        atomic_private_write(&backup, b"encrypted backup").unwrap();
        assert_eq!(fs::read_to_string(&victim).unwrap(), "must remain unchanged");
        assert!(!fs::symlink_metadata(&backup).unwrap().file_type().is_symlink());
        assert_eq!(fs::read_to_string(&backup).unwrap(), "encrypted backup");
    }

    #[test]
    #[ignore = "Writes a synthetic encrypted vault only to the explicit isolated QA directory"]
    fn write_native_fixture() {
        let directory =
            std::env::var("NULLEON_QA_PROFILE").expect("explicit QA directory required");
        let directory = std::path::PathBuf::from(directory);
        assert!(directory
            .to_string_lossy()
            .contains(".cache/security-retest"));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("vault.nauth");
        assert!(!path.exists(), "Refusing to replace any existing fixture");
        let created =
            tauri::async_runtime::block_on(create_new_vault(PASSWORD.into(), DATA.into())).unwrap();
        fs::write(&path, created.vault_file).unwrap();
        set_private_permissions(&path).unwrap();
    }
    #[test]
    #[ignore = "Verify only the isolated QA vault after real native UI save"]
    fn verify_native_saved_fixture() {
        let directory =
            std::env::var("NULLEON_QA_PROFILE").expect("explicit QA directory required");
        assert!(directory.contains(".cache/security-retest"));
        let contents = fs::read_to_string(PathBuf::from(&directory).join("vault.nauth")).unwrap();
        let plaintext =
            tauri::async_runtime::block_on(unlock_vault(PASSWORD.into(), contents)).unwrap();
        let data: serde_json::Value = serde_json::from_str(&plaintext).unwrap();
        let items = data["items"].as_array().unwrap();
        assert_eq!(items.len(), 2);
        assert!(items
            .iter()
            .any(|item| item["type"] == "note" && item["content"] == "Synthetic content only"));
        assert!(items.iter().any(|item| item["type"] == "totp"
            && item["name"] == "synthetic"
            && item["secret"] == "JBSWY3DPEHPK3PXP"
            && item["period"] == 30));
        assert!(PathBuf::from(directory).join("vault.nauth.bak").exists());
    }
}
