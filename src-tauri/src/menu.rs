use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, Runtime};

pub fn install(app: &mut tauri::App) -> tauri::Result<()> {
    let handle = app.app_handle();
    let file_menu = Submenu::with_items(
        handle,
        "File",
        true,
        &[
            &MenuItem::with_id(handle, "new-document", "New", true, Some("CmdOrCtrl+N"))?,
            &MenuItem::with_id(handle, "open-file", "Open...", true, Some("CmdOrCtrl+O"))?,
            &MenuItem::with_id(
                handle,
                "open-folder",
                "Open Folder...",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "save-document", "Save", true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(
                handle,
                "save-document-as",
                "Save As...",
                true,
                Some("CmdOrCtrl+Shift+S"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(
                handle,
                "close-document",
                "Close Document",
                true,
                Some("CmdOrCtrl+W"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::close_window(handle, None)?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(handle, None)?,
            &PredefinedMenuItem::redo(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "show-find", "Find...", true, Some("CmdOrCtrl+F"))?,
            &MenuItem::with_id(
                handle,
                "show-preferences",
                "Preferences...",
                true,
                Some("CmdOrCtrl+,"),
            )?,
        ],
    )?;

    let paragraph_menu = Submenu::with_items(
        handle,
        "Paragraph",
        true,
        &[
            &MenuItem::with_id(
                handle,
                "format-paragraph",
                "Paragraph",
                true,
                Some("CmdOrCtrl+0"),
            )?,
            &MenuItem::with_id(
                handle,
                "format-heading-1",
                "Heading 1",
                true,
                Some("CmdOrCtrl+1"),
            )?,
            &MenuItem::with_id(
                handle,
                "format-heading-2",
                "Heading 2",
                true,
                Some("CmdOrCtrl+2"),
            )?,
            &MenuItem::with_id(
                handle,
                "format-heading-3",
                "Heading 3",
                true,
                Some("CmdOrCtrl+3"),
            )?,
            &MenuItem::with_id(
                handle,
                "format-heading-4",
                "Heading 4",
                true,
                Some("CmdOrCtrl+4"),
            )?,
            &MenuItem::with_id(
                handle,
                "format-heading-5",
                "Heading 5",
                true,
                Some("CmdOrCtrl+5"),
            )?,
            &MenuItem::with_id(
                handle,
                "format-heading-6",
                "Heading 6",
                true,
                Some("CmdOrCtrl+6"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(
                handle,
                "format-bullet-list",
                "Bullet List",
                true,
                Some("CmdOrCtrl+Shift+8"),
            )?,
            &MenuItem::with_id(
                handle,
                "format-ordered-list",
                "Ordered List",
                true,
                Some("CmdOrCtrl+Shift+7"),
            )?,
            &MenuItem::with_id(handle, "format-task-list", "Task List", true, None::<&str>)?,
            &MenuItem::with_id(
                handle,
                "format-blockquote",
                "Quote",
                true,
                Some("CmdOrCtrl+Shift+Q"),
            )?,
            &MenuItem::with_id(
                handle,
                "format-code-block",
                "Code Block",
                true,
                Some("CmdOrCtrl+Shift+K"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "insert-table", "Table", true, Some("CmdOrCtrl+T"))?,
            &MenuItem::with_id(
                handle,
                "insert-toc",
                "Table of Contents",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "insert-horizontal-rule",
                "Horizontal Rule",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "insert-inline-math",
                "Inline Math",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "insert-math-block",
                "Math Block",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "insert-mermaid-block",
                "Mermaid Diagram",
                true,
                None::<&str>,
            )?,
        ],
    )?;

    let format_menu = Submenu::with_items(
        handle,
        "Format",
        true,
        &[
            &MenuItem::with_id(handle, "toggle-bold", "Bold", true, Some("CmdOrCtrl+B"))?,
            &MenuItem::with_id(handle, "toggle-italic", "Italic", true, Some("CmdOrCtrl+I"))?,
            &MenuItem::with_id(
                handle,
                "toggle-strike",
                "Strikethrough",
                true,
                Some("CmdOrCtrl+Shift+X"),
            )?,
            &MenuItem::with_id(
                handle,
                "toggle-inline-code",
                "Code",
                true,
                Some("CmdOrCtrl+Shift+C"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "insert-link", "Link...", true, Some("CmdOrCtrl+K"))?,
            &MenuItem::with_id(
                handle,
                "insert-image",
                "Image...",
                true,
                Some("CmdOrCtrl+Shift+I"),
            )?,
            &MenuItem::with_id(
                handle,
                "copy-all-images-to",
                "Copy All Images To...",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "move-all-images-to",
                "Move All Images To...",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "download-remote-images",
                "Download Remote Images",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(
                handle,
                "clear-format",
                "Clear Format",
                true,
                Some(r"CmdOrCtrl+\"),
            )?,
        ],
    )?;

    let export_menu = Submenu::with_items(
        handle,
        "Export",
        true,
        &[
            &MenuItem::with_id(handle, "export-html", "HTML...", true, None::<&str>)?,
            &MenuItem::with_id(
                handle,
                "export-html-no-style",
                "HTML without Styles...",
                true,
                None::<&str>,
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "export-pdf", "PDF...", true, Some("CmdOrCtrl+E"))?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "export-docx", "Word (.docx)...", true, None::<&str>)?,
            &MenuItem::with_id(handle, "export-epub", "EPUB...", true, None::<&str>)?,
            &MenuItem::with_id(handle, "export-latex", "LaTeX...", true, None::<&str>)?,
            &MenuItem::with_id(
                handle,
                "export-opendocument",
                "OpenDocument...",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "export-mediawiki",
                "MediaWiki...",
                true,
                None::<&str>,
            )?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        handle,
        "View",
        true,
        &[
            &MenuItem::with_id(
                handle,
                "toggle-source-mode",
                "Source Code Mode",
                true,
                Some("CmdOrCtrl+/"),
            )?,
            &MenuItem::with_id(
                handle,
                "toggle-file-panel",
                "File Sidebar",
                true,
                Some("CmdOrCtrl+Shift+L"),
            )?,
            &MenuItem::with_id(
                handle,
                "toggle-articles-panel",
                "Articles Sidebar",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "toggle-outline",
                "Outline",
                true,
                Some("CmdOrCtrl+Shift+H"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "toggle-focus-mode", "Focus Mode", true, Some("F8"))?,
            &MenuItem::with_id(
                handle,
                "toggle-typewriter-mode",
                "Typewriter Mode",
                true,
                Some("F9"),
            )?,
            &MenuItem::with_id(
                handle,
                "toggle-theme",
                "Toggle Light/Dark Theme",
                true,
                Some("CmdOrCtrl+Shift+D"),
            )?,
            &MenuItem::with_id(
                handle,
                "show-word-count",
                "Word Count",
                true,
                Some("CmdOrCtrl+Shift+W"),
            )?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(handle)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::fullscreen(handle, None)?,
        ],
    )?;

    let themes_menu = Submenu::with_items(
        handle,
        "Themes",
        true,
        &[
            &MenuItem::with_id(handle, "theme-light", "Light", true, None::<&str>)?,
            &MenuItem::with_id(handle, "theme-dark", "Dark", true, None::<&str>)?,
            &MenuItem::with_id(handle, "theme-system", "System", true, None::<&str>)?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        handle,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(handle, None)?,
            &PredefinedMenuItem::maximize(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::close_window(handle, None)?,
        ],
    )?;

    let help_menu = Submenu::with_items(
        handle,
        "Help",
        true,
        &[
            &MenuItem::with_id(
                handle,
                "check-for-updates",
                "Check for Updates...",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "open-log-directory",
                "Open Logs Folder",
                true,
                None::<&str>,
            )?,
        ],
    )?;

    let menu = Menu::with_items(
        handle,
        &[
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                handle,
                "MarkWisely",
                true,
                &[
                    &PredefinedMenuItem::about(handle, None, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::services(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?,
            &file_menu,
            &edit_menu,
            &paragraph_menu,
            &format_menu,
            &view_menu,
            &themes_menu,
            &export_menu,
            &window_menu,
            &help_menu,
        ],
    )?;

    app.set_menu(menu)?;

    Ok(())
}

pub fn dispatch_menu_command<R: Runtime>(app_handle: &tauri::AppHandle<R>, id: &str) {
    let _ = app_handle.emit("markwisely-menu", id);
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("markwisely-menu", id);
        if let Ok(payload) = serde_json::to_string(id) {
            let _ = window.eval(format!(
                "window.dispatchEvent(new CustomEvent('markwisely-menu-command', {{ detail: {payload} }}));"
            ));
        }
    }
}
