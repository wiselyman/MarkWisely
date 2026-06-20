mod commands;
mod documents;
mod export;
#[cfg(target_os = "macos")]
mod macos_open_files;
mod menu;
mod open_files;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_logging();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let paths = open_files::collect_markdown_paths_from_args(args, cwd);
            open_files::queue_open_paths(app, paths);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .on_menu_event(|app, event| {
            menu::dispatch_menu_command(app, event.id().0.as_str());
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_document,
            commands::write_document,
            commands::list_directory,
            commands::search_directory,
            commands::document_metadata,
            commands::read_asset,
            commands::save_pasted_image,
            commands::download_remote_image,
            commands::copy_image_to,
            commands::move_image_to,
            commands::copy_all_images_to,
            commands::move_all_images_to,
            commands::export_html,
            commands::export_pdf_typst,
            commands::detect_pandoc,
            commands::export_with_pandoc,
            commands::app_log_dir,
            commands::take_pending_open_paths
        ])
        .setup(|app| {
            log::info!("MarkWisely started");
            let initial_paths = open_files::collect_markdown_paths_from_args(
                std::env::args().collect(),
                std::env::current_dir().unwrap_or_default(),
            );
            app.manage(open_files::PendingOpenPaths::new(initial_paths));
            #[cfg(target_os = "macos")]
            macos_open_files::install(app.handle());
            menu::install(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building MarkWisely")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths = open_files::collect_markdown_paths_from_urls(urls);
                open_files::queue_open_paths(app, paths);
            }

            #[cfg(any(target_os = "windows", target_os = "linux"))]
            if let tauri::RunEvent::WindowEvent { label, event, .. } = event {
                if label == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                    app.exit(0);
                }
            }
        });
}

fn install_panic_logging() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        log::error!("panic: {panic_info}");
        default_hook(panic_info);
    }));
}
