import { invoke } from '@tauri-apps/api/core';

export type DocumentMetadata = {
  path: string;
  name: string;
  modifiedMs: number;
  size: number;
  hash: string;
};

export type DocumentPayload = {
  path: string;
  name: string;
  markdown: string;
  metadata: DocumentMetadata;
};

export type FileTreeNode = {
  path: string;
  name: string;
  isDir: boolean;
  children: FileTreeNode[];
};

export type SavedAsset = {
  path: string;
  markdownPath: string;
  name: string;
};

export type ImageBatchResult = {
  markdown: string;
  assets: SavedAsset[];
};

export type DirectorySearchOptions = {
  caseSensitive?: boolean;
  maxResults?: number;
};

export type DirectorySearchHit = {
  path: string;
  name: string;
  lineNumber: number;
  column: number;
  preview: string;
};

export async function readDocument(path: string): Promise<DocumentPayload> {
  return invoke<DocumentPayload>('read_document', { path });
}

export async function takePendingOpenPaths(): Promise<string[]> {
  return invoke<string[]>('take_pending_open_paths');
}

export async function documentMetadata(path: string): Promise<DocumentMetadata> {
  return invoke<DocumentMetadata>('document_metadata', { path });
}

export async function writeDocument(
  path: string,
  markdown: string,
  expectedModifiedMs?: number | null,
  overwrite = false,
  expectedHash?: string | null,
): Promise<DocumentMetadata> {
  return invoke<DocumentMetadata>('write_document', {
    path,
    markdown,
    expectedModifiedMs: expectedModifiedMs ?? null,
    expectedHash: expectedHash ?? null,
    overwrite,
  });
}

export async function listDirectory(path: string): Promise<FileTreeNode> {
  return invoke<FileTreeNode>('list_directory', { path });
}

export async function searchDirectory(
  rootPath: string,
  query: string,
  options: DirectorySearchOptions = {},
): Promise<DirectorySearchHit[]> {
  return invoke<DirectorySearchHit[]>('search_directory', { rootPath, query, options });
}

export async function readAsset(documentPath: string, assetPath: string): Promise<number[]> {
  return invoke<number[]>('read_asset', { documentPath, assetPath });
}

export async function savePastedImage(
  documentPath: string | null,
  fileName: string,
  bytes: number[],
  copyTo?: string | null,
): Promise<SavedAsset> {
  return invoke<SavedAsset>('save_pasted_image', { documentPath, fileName, bytes, copyTo: copyTo ?? null });
}

export async function downloadRemoteImage(
  documentPath: string,
  url: string,
  copyTo?: string | null,
): Promise<SavedAsset> {
  return invoke<SavedAsset>('download_remote_image', { documentPath, url, copyTo: copyTo ?? null });
}

export async function copyImageTo(documentPath: string, imagePath: string, targetDir: string): Promise<SavedAsset> {
  return invoke<SavedAsset>('copy_image_to', { documentPath, imagePath, targetDir });
}

export async function moveImageTo(documentPath: string, imagePath: string, targetDir: string): Promise<SavedAsset> {
  return invoke<SavedAsset>('move_image_to', { documentPath, imagePath, targetDir });
}

export async function copyAllImagesTo(
  documentPath: string,
  markdown: string,
  targetDir: string,
): Promise<ImageBatchResult> {
  return invoke<ImageBatchResult>('copy_all_images_to', { documentPath, markdown, targetDir });
}

export async function moveAllImagesTo(
  documentPath: string,
  markdown: string,
  targetDir: string,
): Promise<ImageBatchResult> {
  return invoke<ImageBatchResult>('move_all_images_to', { documentPath, markdown, targetDir });
}

export async function exportHtml(
  markdown: string,
  outputPath: string,
  theme: string,
  includeStyles = true,
  documentPath?: string | null,
): Promise<string> {
  return invoke<string>('export_html', {
    markdown,
    outputPath,
    theme,
    includeStyles,
    documentPath: documentPath ?? null,
  });
}

export async function exportPdf(markdown: string, outputPath: string, title: string): Promise<string> {
  return invoke<string>('export_pdf_typst', { markdown, outputPath, title });
}

export async function detectPandoc(): Promise<string> {
  return invoke<string>('detect_pandoc');
}

export async function exportWithPandoc(
  markdown: string,
  outputPath: string,
  format: string,
  documentPath?: string | null,
  title?: string | null,
): Promise<string> {
  return invoke<string>('export_with_pandoc', {
    markdown,
    outputPath,
    format,
    documentPath: documentPath ?? null,
    title: title ?? null,
  });
}
