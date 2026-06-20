use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{AppHandle, Emitter, Manager, Runtime, Url};

pub const OPEN_PATHS_EVENT: &str = "markwisely-open-paths";

#[derive(Default)]
pub struct PendingOpenPaths {
    paths: Mutex<Vec<String>>,
}

impl PendingOpenPaths {
    pub fn new(paths: Vec<String>) -> Self {
        Self {
            paths: Mutex::new(paths),
        }
    }

    pub fn push_many(&self, paths: Vec<String>) {
        if paths.is_empty() {
            return;
        }

        let mut pending = self.paths.lock().unwrap_or_else(|error| error.into_inner());
        pending.extend(paths);
        dedupe(&mut pending);
    }

    pub fn take(&self) -> Vec<String> {
        let mut pending = self.paths.lock().unwrap_or_else(|error| error.into_inner());
        std::mem::take(&mut *pending)
    }
}

pub fn collect_markdown_paths_from_args(args: Vec<String>, cwd: impl AsRef<Path>) -> Vec<String> {
    let cwd = cwd.as_ref();
    let mut paths = args
        .into_iter()
        .skip(1)
        .filter_map(|arg| markdown_path_from_arg(&arg, cwd))
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();
    dedupe(&mut paths);
    paths
}

#[cfg(target_os = "macos")]
pub fn collect_markdown_paths_from_urls(urls: Vec<Url>) -> Vec<String> {
    let mut paths = urls
        .into_iter()
        .filter_map(|url| {
            if url.scheme() != "file" {
                return None;
            }
            let path = url.to_file_path().ok()?;
            normalize_existing_markdown_path(path)
        })
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>();
    dedupe(&mut paths);
    paths
}

pub fn queue_open_paths<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }

    if let Some(pending) = app.try_state::<PendingOpenPaths>() {
        pending.push_many(paths.clone());
    }

    let _ = app.emit(OPEN_PATHS_EVENT, &paths);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.emit(OPEN_PATHS_EVENT, paths);
    }
}

fn markdown_path_from_arg(arg: &str, cwd: &Path) -> Option<PathBuf> {
    let trimmed = arg.trim().trim_matches('"');
    if trimmed.is_empty() || trimmed == "--" || trimmed.starts_with("-psn_") {
        return None;
    }

    let path = if let Ok(url) = Url::parse(trimmed) {
        if url.scheme() != "file" {
            return None;
        }
        url.to_file_path().ok()?
    } else {
        let path = PathBuf::from(trimmed);
        if path.is_absolute() {
            path
        } else {
            cwd.join(path)
        }
    };

    normalize_existing_markdown_path(path)
}

fn normalize_existing_markdown_path(path: PathBuf) -> Option<PathBuf> {
    if !is_markdown_path(&path) || !path.is_file() {
        return None;
    }
    path.canonicalize().ok().or(Some(path))
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "markdown" | "mdown" | "mkd")
    )
}

fn dedupe(paths: &mut Vec<String>) {
    let mut seen = HashSet::new();
    paths.retain(|path| seen.insert(path.clone()));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn collects_existing_markdown_paths_from_args() {
        let dir = tempfile::tempdir().unwrap();
        let markdown = dir.path().join("note.md");
        let ignored = dir.path().join("note.txt");
        fs::write(&markdown, "# Note").unwrap();
        fs::write(&ignored, "not markdown").unwrap();

        let paths = collect_markdown_paths_from_args(
            vec![
                "markwisely".into(),
                markdown.to_string_lossy().to_string(),
                ignored.to_string_lossy().to_string(),
                "--flag".into(),
            ],
            dir.path(),
        );

        assert_eq!(paths, vec![markdown.canonicalize().unwrap().to_string_lossy()]);
    }

    #[test]
    fn resolves_relative_markdown_paths_from_cwd() {
        let dir = tempfile::tempdir().unwrap();
        let markdown = dir.path().join("draft.markdown");
        fs::write(&markdown, "# Draft").unwrap();

        let paths =
            collect_markdown_paths_from_args(vec!["markwisely".into(), "draft.markdown".into()], dir.path());

        assert_eq!(paths, vec![markdown.canonicalize().unwrap().to_string_lossy()]);
    }
}
