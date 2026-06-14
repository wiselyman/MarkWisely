use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadata {
    pub path: String,
    pub name: String,
    pub modified_ms: u128,
    pub size: u64,
    pub hash: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub children: Vec<DirectoryEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPayload {
    pub path: String,
    pub name: String,
    pub markdown: String,
    pub metadata: DocumentMetadata,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedAsset {
    pub path: String,
    pub markdown_path: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySearchOptions {
    pub case_sensitive: Option<bool>,
    pub max_results: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySearchHit {
    pub path: String,
    pub name: String,
    pub line_number: usize,
    pub column: usize,
    pub preview: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageBatchResult {
    pub markdown: String,
    pub assets: Vec<SavedAsset>,
}

pub fn read_markdown_file(path: impl AsRef<Path>) -> Result<DocumentPayload, String> {
    let path = normalize_existing_path(path)?;
    let markdown =
        fs::read_to_string(&path).map_err(|err| format!("Failed to read file: {err}"))?;
    let metadata = metadata_for_path(&path)?;
    Ok(DocumentPayload {
        path: path_to_string(&path),
        name: file_name(&path),
        markdown,
        metadata,
    })
}

pub fn write_markdown_file(
    path: impl AsRef<Path>,
    markdown: &str,
    expected_modified_ms: Option<u128>,
    expected_hash: Option<String>,
    overwrite: bool,
) -> Result<DocumentMetadata, String> {
    let path = normalize_output_path(path)?;
    if path.exists() && !overwrite {
        let current = metadata_for_path(&path)?;
        let modified_changed = expected_modified_ms
            .map(|expected| current.modified_ms != expected)
            .unwrap_or(false);
        let hash_changed = expected_hash
            .as_deref()
            .map(|expected| current.hash != expected)
            .unwrap_or(false);
        if modified_changed || hash_changed {
            return Err("File changed on disk. Save again to overwrite.".to_string());
        }
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create parent directory: {err}"))?;
    }
    fs::write(&path, markdown).map_err(|err| format!("Failed to write file: {err}"))?;
    metadata_for_path(&path)
}

pub fn metadata_for_path(path: impl AsRef<Path>) -> Result<DocumentMetadata, String> {
    let path = normalize_existing_path(path)?;
    let metadata = fs::metadata(&path).map_err(|err| format!("Failed to stat file: {err}"))?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let bytes = fs::read(&path).map_err(|err| format!("Failed to hash file: {err}"))?;
    Ok(DocumentMetadata {
        path: path_to_string(&path),
        name: file_name(&path),
        modified_ms,
        size: metadata.len(),
        hash: hash_bytes(&bytes),
    })
}

pub fn list_markdown_tree(root: impl AsRef<Path>) -> Result<DirectoryEntry, String> {
    let root = normalize_existing_path(root)?;
    if !root.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }
    build_directory_entry(&root, 0)
}

pub fn search_markdown_directory(
    root: impl AsRef<Path>,
    query: &str,
    options: DirectorySearchOptions,
) -> Result<Vec<DirectorySearchHit>, String> {
    let root = normalize_existing_path(root)?;
    if !root.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }

    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let case_sensitive = options.case_sensitive.unwrap_or(false);
    let needle = if case_sensitive {
        query.to_string()
    } else {
        query.to_lowercase()
    };
    let max_results = options.max_results.unwrap_or(200).clamp(1, 1000);
    let mut hits = Vec::new();

    for entry in WalkDir::new(&root).into_iter().filter_entry(|entry| {
        let path = entry.path();
        entry.depth() == 0 || !entry.file_type().is_dir() || !should_skip_dir(path)
    }) {
        let entry = entry.map_err(|err| format!("Failed to inspect directory: {err}"))?;
        let path = entry.path();
        if !entry.file_type().is_file() || !is_supported_markdown(path) {
            continue;
        }

        let Ok(markdown) = fs::read_to_string(path) else {
            continue;
        };
        for (line_index, line) in markdown.lines().enumerate() {
            let haystack = if case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };
            let Some(column) = haystack.find(&needle) else {
                continue;
            };

            hits.push(DirectorySearchHit {
                path: path_to_string(path),
                name: file_name(path),
                line_number: line_index + 1,
                column: column + 1,
                preview: line.trim().to_string(),
            });

            if hits.len() >= max_results {
                return Ok(hits);
            }
        }
    }

    Ok(hits)
}

pub fn read_relative_asset(
    base_document_path: impl AsRef<Path>,
    asset_path: &str,
) -> Result<Vec<u8>, String> {
    if asset_path.trim().is_empty() {
        return Err("Asset path is empty".to_string());
    }
    let base_document_path = normalize_existing_path(base_document_path)?;
    let base_dir = base_document_path
        .parent()
        .ok_or_else(|| "Document has no parent directory".to_string())?;
    let resolved = normalize_joined_path(base_dir, asset_path)?;
    if !resolved.starts_with(base_dir) {
        return Err("Asset path escapes the document directory".to_string());
    }
    fs::read(resolved).map_err(|err| format!("Failed to read asset: {err}"))
}

pub fn save_pasted_image_file(
    document_path: Option<String>,
    incoming_file_name: String,
    bytes: Vec<u8>,
    copy_to: Option<String>,
) -> Result<SavedAsset, String> {
    if bytes.is_empty() {
        return Err("Image data is empty".to_string());
    }

    let original_name = sanitize_file_name(&incoming_file_name);
    let extension = Path::new(&original_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .filter(|ext| !ext.is_empty())
        .unwrap_or("png");
    let stem = Path::new(&original_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("image");

    let (asset_dir, markdown_prefix) = match document_path {
        Some(path) if !path.trim().is_empty() => {
            let document = normalize_output_path(path)?;
            let parent = document
                .parent()
                .ok_or_else(|| "Document has no parent directory".to_string())?
                .to_path_buf();
            let markdown_prefix = normalize_asset_target(copy_to.as_deref())?;
            let asset_dir = if markdown_prefix.is_empty() {
                parent
            } else {
                parent.join(&markdown_prefix)
            };
            (asset_dir, markdown_prefix)
        }
        _ => {
            let dir = std::env::temp_dir().join("markwisely-assets");
            (dir, String::new())
        }
    };

    fs::create_dir_all(&asset_dir)
        .map_err(|err| format!("Failed to create image asset directory: {err}"))?;

    let mut candidate = asset_dir.join(format!("{stem}.{extension}"));
    let mut index = 1;
    while candidate.exists() {
        candidate = asset_dir.join(format!("{stem}-{index}.{extension}"));
        index += 1;
    }

    fs::write(&candidate, bytes).map_err(|err| format!("Failed to save pasted image: {err}"))?;
    let name = file_name(&candidate);
    let markdown_path = if markdown_prefix.is_empty() {
        path_to_string(&candidate)
    } else {
        format!("{markdown_prefix}/{name}")
    };

    Ok(SavedAsset {
        path: path_to_string(&candidate),
        markdown_path,
        name,
    })
}

pub fn download_remote_image_file(
    document_path: String,
    url: String,
    copy_to: Option<String>,
) -> Result<SavedAsset, String> {
    let trimmed_url = url.trim();
    if !trimmed_url.to_ascii_lowercase().starts_with("http://")
        && !trimmed_url.to_ascii_lowercase().starts_with("https://")
    {
        return Err("Only HTTP(S) image URLs can be downloaded.".to_string());
    }

    let response = ureq::get(trimmed_url)
        .call()
        .map_err(|err| format!("Failed to download image: {err}"))?;
    let status = response.status();
    if !(200..300).contains(&status) {
        return Err(format!("Image download failed with HTTP {status}."));
    }

    let content_type = response.header("content-type").unwrap_or("").to_string();
    if !content_type.is_empty() && !content_type.to_ascii_lowercase().starts_with("image/") {
        return Err(format!("Remote URL is not an image ({content_type})."));
    }

    const MAX_IMAGE_BYTES: u64 = 50 * 1024 * 1024;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_IMAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|err| format!("Failed to read downloaded image: {err}"))?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("Downloaded image is larger than 50 MB.".to_string());
    }

    let file_name = file_name_from_remote_url(trimmed_url, &content_type);
    save_pasted_image_file(Some(document_path), file_name, bytes, copy_to)
}

pub fn copy_image_to(
    document_path: impl AsRef<Path>,
    image_path: &str,
    target_dir: impl AsRef<Path>,
) -> Result<SavedAsset, String> {
    relocate_image(document_path, image_path, target_dir, false)
}

pub fn move_image_to(
    document_path: impl AsRef<Path>,
    image_path: &str,
    target_dir: impl AsRef<Path>,
) -> Result<SavedAsset, String> {
    relocate_image(document_path, image_path, target_dir, true)
}

pub fn copy_all_images_to(
    document_path: impl AsRef<Path>,
    markdown: &str,
    target_dir: impl AsRef<Path>,
) -> Result<ImageBatchResult, String> {
    relocate_all_images(document_path, markdown, target_dir, false)
}

pub fn move_all_images_to(
    document_path: impl AsRef<Path>,
    markdown: &str,
    target_dir: impl AsRef<Path>,
) -> Result<ImageBatchResult, String> {
    relocate_all_images(document_path, markdown, target_dir, true)
}

fn relocate_image(
    document_path: impl AsRef<Path>,
    image_path: &str,
    target_dir: impl AsRef<Path>,
    move_file: bool,
) -> Result<SavedAsset, String> {
    if is_external_image_ref(image_path) {
        return Err("Remote images must be downloaded before relocation.".to_string());
    }

    let document_path = normalize_existing_path(document_path)?;
    let source = resolve_document_image(&document_path, image_path)?;
    let target_dir = resolve_image_target_dir(&document_path, target_dir)?;
    let destination = copy_file_unique(&source, &target_dir)?;

    if move_file && source != destination {
        fs::remove_file(&source)
            .map_err(|err| format!("Failed to remove original image: {err}"))?;
    }

    let document_dir = document_path
        .parent()
        .ok_or_else(|| "Document has no parent directory".to_string())?;
    Ok(SavedAsset {
        path: path_to_string(&destination),
        markdown_path: markdown_path_for_asset(document_dir, &destination),
        name: file_name(&destination),
    })
}

fn relocate_all_images(
    document_path: impl AsRef<Path>,
    markdown: &str,
    target_dir: impl AsRef<Path>,
    move_file: bool,
) -> Result<ImageBatchResult, String> {
    let image_regex = Regex::new(r#"!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)"#)
        .map_err(|err| format!("Failed to build image matcher: {err}"))?;
    let document_path = normalize_existing_path(document_path)?;
    let target_dir = resolve_image_target_dir(&document_path, target_dir)?;
    let mut rewritten = String::with_capacity(markdown.len());
    let mut last_index = 0;
    let mut assets = Vec::new();

    for captures in image_regex.captures_iter(markdown) {
        let Some(path_match) = captures.get(1) else {
            continue;
        };
        let image_path = path_match.as_str();
        if is_external_image_ref(image_path) {
            continue;
        }

        let source = resolve_document_image(&document_path, image_path)?;
        let destination = copy_file_unique(&source, &target_dir)?;
        if move_file && source != destination {
            fs::remove_file(&source)
                .map_err(|err| format!("Failed to remove original image: {err}"))?;
        }

        let document_dir = document_path
            .parent()
            .ok_or_else(|| "Document has no parent directory".to_string())?;
        let asset = SavedAsset {
            path: path_to_string(&destination),
            markdown_path: markdown_path_for_asset(document_dir, &destination),
            name: file_name(&destination),
        };

        rewritten.push_str(&markdown[last_index..path_match.start()]);
        rewritten.push_str(&asset.markdown_path);
        last_index = path_match.end();
        assets.push(asset);
    }

    rewritten.push_str(&markdown[last_index..]);
    Ok(ImageBatchResult {
        markdown: rewritten,
        assets,
    })
}

fn build_directory_entry(path: &Path, depth: usize) -> Result<DirectoryEntry, String> {
    let name = if depth == 0 {
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Workspace")
            .to_string()
    } else {
        file_name(path)
    };

    let mut children = Vec::new();
    let entries = WalkDir::new(path)
        .min_depth(1)
        .max_depth(1)
        .sort_by_file_name()
        .into_iter();

    for entry in entries {
        let entry = entry.map_err(|err| format!("Failed to inspect directory: {err}"))?;
        let entry_path = entry.path();
        let file_type = entry.file_type();

        if file_type.is_dir() {
            if should_skip_dir(entry_path) {
                continue;
            }
            children.push(build_directory_entry(entry_path, depth + 1)?);
            continue;
        }

        if file_type.is_file() && is_supported_markdown(entry_path) {
            children.push(DirectoryEntry {
                path: path_to_string(entry_path),
                name: file_name(entry_path),
                is_dir: false,
                children: Vec::new(),
            });
        }
    }

    Ok(DirectoryEntry {
        path: path_to_string(path),
        name,
        is_dir: true,
        children,
    })
}

fn should_skip_dir(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|name| name.to_str()),
        Some(".git" | "node_modules" | "target" | "dist")
    )
}

fn is_supported_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_ascii_lowercase()),
        Some(ext) if matches!(ext.as_str(), "md" | "markdown" | "mdown" | "mkd")
    )
}

fn normalize_existing_path(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    path.as_ref()
        .canonicalize()
        .map_err(|err| format!("Invalid path: {err}"))
}

fn normalize_output_path(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let path = path.as_ref();
    if path.as_os_str().is_empty() {
        return Err("Path is empty".to_string());
    }
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|err| format!("Failed to resolve current directory: {err}"))
    }
}

fn normalize_joined_path(base_dir: &Path, child: &str) -> Result<PathBuf, String> {
    let joined = base_dir.join(child);
    joined
        .canonicalize()
        .map_err(|err| format!("Invalid asset path: {err}"))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled.md")
        .to_string()
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() || matches!(char, '.' | '-' | '_') {
                char
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('-').trim_matches('.');
    if trimmed.is_empty() {
        "image.png".to_string()
    } else {
        trimmed.to_string()
    }
}

fn file_name_from_remote_url(url: &str, content_type: &str) -> String {
    let without_fragment = url.split('#').next().unwrap_or(url);
    let without_query = without_fragment
        .split('?')
        .next()
        .unwrap_or(without_fragment);
    let candidate = sanitize_file_name(without_query.rsplit('/').next().unwrap_or("image"));
    if Path::new(&candidate).extension().is_some() {
        return candidate;
    }

    let extension = image_extension_from_content_type(content_type).unwrap_or("png");
    if candidate == "image.png" {
        candidate
    } else {
        format!("{candidate}.{extension}")
    }
}

fn image_extension_from_content_type(content_type: &str) -> Option<&'static str> {
    let media_type = content_type.split(';').next()?.trim().to_ascii_lowercase();
    match media_type.as_str() {
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/avif" => Some("avif"),
        _ => None,
    }
}

fn normalize_asset_target(copy_to: Option<&str>) -> Result<String, String> {
    let target = copy_to
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("assets")
        .replace('\\', "/");
    if target == "." {
        return Ok(String::new());
    }

    let path = Path::new(&target);
    if path.is_absolute() {
        return Err("Image copy target must be relative to the document".to_string());
    }

    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => {
                let part = value
                    .to_str()
                    .ok_or_else(|| "Image copy target contains invalid characters".to_string())?;
                if !part.is_empty() {
                    parts.push(part.to_string());
                }
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Image copy target must stay inside the document directory".to_string());
            }
        }
    }

    if parts.is_empty() {
        Ok(String::new())
    } else {
        Ok(parts.join("/"))
    }
}

fn is_external_image_ref(image_path: &str) -> bool {
    let lower = image_path.trim().to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
        || lower.starts_with("asset:")
}

fn resolve_document_image(document_path: &Path, image_path: &str) -> Result<PathBuf, String> {
    let image_path = image_path.trim().trim_matches('<').trim_matches('>');
    if image_path.is_empty() {
        return Err("Image path is empty".to_string());
    }

    let path = Path::new(image_path);
    if path.is_absolute() {
        return normalize_existing_path(path);
    }

    let document_dir = document_path
        .parent()
        .ok_or_else(|| "Document has no parent directory".to_string())?;
    normalize_joined_path(document_dir, image_path)
}

fn resolve_image_target_dir(
    document_path: &Path,
    target_dir: impl AsRef<Path>,
) -> Result<PathBuf, String> {
    let target_dir = target_dir.as_ref();
    if target_dir.as_os_str().is_empty() {
        return Err("Image target directory is empty".to_string());
    }

    let document_dir = document_path
        .parent()
        .ok_or_else(|| "Document has no parent directory".to_string())?;
    let target = if target_dir.is_absolute() {
        target_dir.to_path_buf()
    } else {
        document_dir.join(target_dir)
    };
    fs::create_dir_all(&target)
        .map_err(|err| format!("Failed to create image target directory: {err}"))?;
    target
        .canonicalize()
        .map_err(|err| format!("Invalid image target directory: {err}"))
}

fn copy_file_unique(source: &Path, target_dir: &Path) -> Result<PathBuf, String> {
    let source_name = file_name(source);
    let source_path = Path::new(&source_name);
    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty());

    let mut destination = target_dir.join(&source_name);
    let mut index = 1;
    while destination.exists() && destination != source {
        let file_name = match extension {
            Some(extension) => format!("{stem}-{index}.{extension}"),
            None => format!("{stem}-{index}"),
        };
        destination = target_dir.join(file_name);
        index += 1;
    }

    if destination != source {
        fs::copy(source, &destination).map_err(|err| format!("Failed to copy image: {err}"))?;
    }
    Ok(destination)
}

fn markdown_path_for_asset(document_dir: &Path, asset_path: &Path) -> String {
    if let Ok(relative) = asset_path.strip_prefix(document_dir) {
        return relative
            .components()
            .filter_map(|component| match component {
                Component::Normal(value) => value.to_str().map(ToString::to_string),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("/");
    }
    path_to_string(asset_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_reads_markdown() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("note.md");
        let metadata = write_markdown_file(&path, "# Hello", None, None, false).unwrap();
        assert_eq!(metadata.name, "note.md");
        assert!(!metadata.hash.is_empty());

        let payload = read_markdown_file(&path).unwrap();
        assert_eq!(payload.markdown, "# Hello");
    }

    #[test]
    fn detects_conflicting_writes() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("note.md");
        let first = write_markdown_file(&path, "# Hello", None, None, false).unwrap();
        write_markdown_file(&path, "# Changed elsewhere", None, None, true).unwrap();

        let conflict = write_markdown_file(
            &path,
            "# Mine",
            Some(first.modified_ms),
            Some(first.hash),
            false,
        )
        .expect_err("stale write should fail");
        assert!(conflict.contains("changed on disk"));
    }

    #[test]
    fn saves_pasted_images_next_to_document() {
        let temp = tempfile::tempdir().unwrap();
        let doc = temp.path().join("note.md");
        fs::write(&doc, "# Note").unwrap();

        let saved = save_pasted_image_file(
            Some(doc.to_string_lossy().to_string()),
            "screen shot.png".to_string(),
            vec![1, 2, 3],
            None,
        )
        .unwrap();

        assert_eq!(saved.markdown_path, "assets/screen-shot.png");
        assert!(Path::new(&saved.path).exists());
    }

    #[test]
    fn saves_pasted_images_to_front_matter_target() {
        let temp = tempfile::tempdir().unwrap();
        let doc = temp.path().join("note.md");
        fs::write(&doc, "# Note").unwrap();

        let saved = save_pasted_image_file(
            Some(doc.to_string_lossy().to_string()),
            "diagram.png".to_string(),
            vec![1, 2, 3],
            Some("media/images".to_string()),
        )
        .unwrap();

        assert_eq!(saved.markdown_path, "media/images/diagram.png");
        assert!(Path::new(&saved.path).exists());
    }

    #[test]
    fn derives_remote_image_names_from_url_and_content_type() {
        assert_eq!(
            file_name_from_remote_url("https://example.com/screens/shot.png?token=1", "image/png"),
            "shot.png"
        );
        assert_eq!(
            file_name_from_remote_url(
                "https://example.com/render?id=42",
                "image/jpeg; charset=utf-8"
            ),
            "render.jpg"
        );
        assert_eq!(
            file_name_from_remote_url("https://example.com/", "image/webp"),
            "image.png"
        );
    }

    #[test]
    fn rejects_image_targets_that_escape_document_dir() {
        let temp = tempfile::tempdir().unwrap();
        let doc = temp.path().join("note.md");
        fs::write(&doc, "# Note").unwrap();

        let err = save_pasted_image_file(
            Some(doc.to_string_lossy().to_string()),
            "diagram.png".to_string(),
            vec![1, 2, 3],
            Some("../outside".to_string()),
        )
        .expect_err("escaping asset target should fail");

        assert!(err.contains("document directory"));
    }

    #[test]
    fn copies_and_moves_markdown_images_to_target_directory() {
        let temp = tempfile::tempdir().unwrap();
        let doc = temp.path().join("note.md");
        let image = temp.path().join("diagram.png");
        let target = temp.path().join("media");
        fs::write(&doc, "# Note").unwrap();
        fs::write(&image, vec![1, 2, 3]).unwrap();

        let copied = copy_image_to(&doc, "diagram.png", &target).unwrap();
        assert_eq!(copied.markdown_path, "media/diagram.png");
        assert!(Path::new(&copied.path).exists());
        assert!(image.exists());

        let moved = move_image_to(&doc, "diagram.png", &target).unwrap();
        assert_eq!(moved.markdown_path, "media/diagram-1.png");
        assert!(Path::new(&moved.path).exists());
        assert!(!image.exists());
    }

    #[test]
    fn copies_all_images_and_rewrites_markdown_paths() {
        let temp = tempfile::tempdir().unwrap();
        let doc = temp.path().join("note.md");
        let target = temp.path().join("assets");
        fs::write(&doc, "# Note").unwrap();
        fs::write(temp.path().join("a.png"), vec![1]).unwrap();
        fs::write(temp.path().join("b.jpg"), vec![2]).unwrap();

        let result = copy_all_images_to(
            &doc,
            "![A](a.png)\n\n![Remote](https://example.com/x.png)\n\n![B](b.jpg \"title\")",
            &target,
        )
        .unwrap();

        assert_eq!(result.assets.len(), 2);
        assert!(result.markdown.contains("![A](assets/a.png)"));
        assert!(result
            .markdown
            .contains("![Remote](https://example.com/x.png)"));
        assert!(result.markdown.contains("![B](assets/b.jpg \"title\")"));
    }

    #[test]
    fn lists_only_markdown_files() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("a.md"), "# A").unwrap();
        fs::write(temp.path().join("b.txt"), "B").unwrap();
        fs::create_dir(temp.path().join("notes")).unwrap();
        fs::write(temp.path().join("notes").join("c.markdown"), "# C").unwrap();

        let tree = list_markdown_tree(temp.path()).unwrap();
        assert_eq!(tree.children.len(), 2);
        assert!(tree.children.iter().any(|entry| entry.name == "a.md"));
        assert!(tree.children.iter().any(|entry| entry.name == "notes"));
    }

    #[test]
    fn searches_markdown_files_with_cjk_queries() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("a.md"), "# A\n\n你好 MarkWisely").unwrap();
        fs::write(temp.path().join("b.txt"), "你好 ignored").unwrap();
        fs::create_dir(temp.path().join("notes")).unwrap();
        fs::write(
            temp.path().join("notes").join("c.md"),
            "second line\nFind me",
        )
        .unwrap();

        let hits = search_markdown_directory(
            temp.path(),
            "你好",
            DirectorySearchOptions {
                case_sensitive: Some(true),
                max_results: None,
            },
        )
        .unwrap();

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "a.md");
        assert_eq!(hits[0].line_number, 3);

        let hits = search_markdown_directory(
            temp.path(),
            "find",
            DirectorySearchOptions {
                case_sensitive: Some(false),
                max_results: None,
            },
        )
        .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "c.md");
    }
}
