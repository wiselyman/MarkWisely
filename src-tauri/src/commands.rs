use crate::documents::{
    copy_all_images_to as copy_all_images_to_dir, copy_image_to as copy_image_to_dir,
    download_remote_image_file, list_markdown_tree, metadata_for_path,
    move_all_images_to as move_all_images_to_dir, move_image_to as move_image_to_dir,
    read_markdown_file, read_relative_asset, save_pasted_image_file, search_markdown_directory,
    write_markdown_file, DirectoryEntry, DirectorySearchHit, DirectorySearchOptions,
    DocumentMetadata, DocumentPayload, ImageBatchResult, SavedAsset,
};
use crate::export::{
    detect_pandoc as detect_pandoc_binary, write_html_export, write_pandoc_export,
    write_pdf_typst_export,
};
use tauri::Manager;

#[tauri::command]
pub fn read_document(path: String) -> Result<DocumentPayload, String> {
    read_markdown_file(path)
}

#[tauri::command]
pub fn write_document(
    path: String,
    markdown: String,
    expected_modified_ms: Option<u128>,
    expected_hash: Option<String>,
    overwrite: bool,
) -> Result<DocumentMetadata, String> {
    write_markdown_file(
        path,
        &markdown,
        expected_modified_ms,
        expected_hash,
        overwrite,
    )
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<DirectoryEntry, String> {
    list_markdown_tree(path)
}

#[tauri::command]
pub fn search_directory(
    root_path: String,
    query: String,
    options: DirectorySearchOptions,
) -> Result<Vec<DirectorySearchHit>, String> {
    search_markdown_directory(root_path, &query, options)
}

#[tauri::command]
pub fn document_metadata(path: String) -> Result<DocumentMetadata, String> {
    metadata_for_path(path)
}

#[tauri::command]
pub fn read_asset(document_path: String, asset_path: String) -> Result<Vec<u8>, String> {
    read_relative_asset(document_path, &asset_path)
}

#[tauri::command]
pub fn save_pasted_image(
    document_path: Option<String>,
    file_name: String,
    bytes: Vec<u8>,
    copy_to: Option<String>,
) -> Result<SavedAsset, String> {
    save_pasted_image_file(document_path, file_name, bytes, copy_to)
}

#[tauri::command]
pub fn download_remote_image(
    document_path: String,
    url: String,
    copy_to: Option<String>,
) -> Result<SavedAsset, String> {
    download_remote_image_file(document_path, url, copy_to)
}

#[tauri::command]
pub fn copy_image_to(
    document_path: String,
    image_path: String,
    target_dir: String,
) -> Result<SavedAsset, String> {
    copy_image_to_dir(document_path, &image_path, target_dir)
}

#[tauri::command]
pub fn move_image_to(
    document_path: String,
    image_path: String,
    target_dir: String,
) -> Result<SavedAsset, String> {
    move_image_to_dir(document_path, &image_path, target_dir)
}

#[tauri::command]
pub fn copy_all_images_to(
    document_path: String,
    markdown: String,
    target_dir: String,
) -> Result<ImageBatchResult, String> {
    copy_all_images_to_dir(document_path, &markdown, target_dir)
}

#[tauri::command]
pub fn move_all_images_to(
    document_path: String,
    markdown: String,
    target_dir: String,
) -> Result<ImageBatchResult, String> {
    move_all_images_to_dir(document_path, &markdown, target_dir)
}

#[tauri::command]
pub fn export_html(
    markdown: String,
    output_path: String,
    theme: String,
    include_styles: bool,
    document_path: Option<String>,
) -> Result<String, String> {
    write_html_export(
        &markdown,
        output_path,
        &theme,
        include_styles,
        document_path,
    )
}

#[tauri::command]
pub fn export_pdf_typst(
    markdown: String,
    output_path: String,
    title: String,
) -> Result<String, String> {
    write_pdf_typst_export(&markdown, output_path, &title)
}

#[tauri::command]
pub fn detect_pandoc() -> Result<String, String> {
    detect_pandoc_binary()
}

#[tauri::command]
pub fn export_with_pandoc(
    markdown: String,
    output_path: String,
    format: String,
    document_path: Option<String>,
    title: Option<String>,
) -> Result<String, String> {
    write_pandoc_export(
        &markdown,
        output_path,
        &format,
        document_path,
        title.as_deref(),
    )
}

#[tauri::command]
pub fn app_log_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}
