import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

import {
  copyAllImagesTo,
  documentMetadata,
  downloadRemoteImage,
  exportPdf,
  exportWithPandoc,
  moveImageTo,
  savePastedImage,
  searchDirectory,
  writeDocument,
} from './tauri';

describe('tauri command bridge', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue('ok');
  });

  it('passes conflict metadata when saving documents', async () => {
    await writeDocument('/tmp/note.md', '# Note', 123, false, 'abc123');

    expect(invokeMock).toHaveBeenCalledWith('write_document', {
      path: '/tmp/note.md',
      markdown: '# Note',
      expectedModifiedMs: 123,
      expectedHash: 'abc123',
      overwrite: false,
    });
  });

  it('reads document metadata through the dedicated command', async () => {
    await documentMetadata('/tmp/note.md');

    expect(invokeMock).toHaveBeenCalledWith('document_metadata', {
      path: '/tmp/note.md',
    });
  });

  it('searches a folder through the explicit command', async () => {
    await searchDirectory('/tmp/workspace', 'needle', { caseSensitive: true, maxResults: 25 });

    expect(invokeMock).toHaveBeenCalledWith('search_directory', {
      rootPath: '/tmp/workspace',
      query: 'needle',
      options: { caseSensitive: true, maxResults: 25 },
    });
  });

  it('routes PDF export to the structured Typst command', async () => {
    await exportPdf('# Note', '/tmp/note.pdf', 'Note');

    expect(invokeMock).toHaveBeenCalledWith('export_pdf_typst', {
      markdown: '# Note',
      outputPath: '/tmp/note.pdf',
      title: 'Note',
    });
  });

  it('sends pasted image bytes and Pandoc exports through explicit commands', async () => {
    await savePastedImage('/tmp/note.md', 'shot.png', [1, 2, 3], 'media/images');
    await downloadRemoteImage('/tmp/note.md', 'https://example.com/shot.png', 'media/images');
    await exportWithPandoc('# Note', '/tmp/note.docx', 'docx', '/tmp/note.md', 'Note');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'save_pasted_image', {
      documentPath: '/tmp/note.md',
      fileName: 'shot.png',
      bytes: [1, 2, 3],
      copyTo: 'media/images',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'download_remote_image', {
      documentPath: '/tmp/note.md',
      url: 'https://example.com/shot.png',
      copyTo: 'media/images',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'export_with_pandoc', {
      markdown: '# Note',
      outputPath: '/tmp/note.docx',
      format: 'docx',
      documentPath: '/tmp/note.md',
      title: 'Note',
    });
  });

  it('routes image relocation commands through Rust', async () => {
    await moveImageTo('/tmp/note.md', 'assets/a.png', '/tmp/media');
    await copyAllImagesTo('/tmp/note.md', '![A](a.png)', '/tmp/media');

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'move_image_to', {
      documentPath: '/tmp/note.md',
      imagePath: 'assets/a.png',
      targetDir: '/tmp/media',
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'copy_all_images_to', {
      documentPath: '/tmp/note.md',
      markdown: '![A](a.png)',
      targetDir: '/tmp/media',
    });
  });
});
