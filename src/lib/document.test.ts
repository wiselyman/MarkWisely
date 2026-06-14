import { describe, expect, it } from 'vitest';
import { deriveNameFromPath, getCopyImagesTarget, getDefaultExportName, getRootUrl, updateRecentFiles } from './document';

describe('document helpers', () => {
  it('keeps recent files unique and newest first', () => {
    expect(updateRecentFiles(['/a.md', '/b.md'], '/b.md')).toEqual(['/b.md', '/a.md']);
  });

  it('derives file names across platforms', () => {
    expect(deriveNameFromPath('/tmp/note.md')).toBe('note.md');
    expect(deriveNameFromPath('C:\\notes\\note.md')).toBe('note.md');
  });

  it('builds default export names', () => {
    expect(getDefaultExportName('Draft.markdown', 'pdf')).toBe('Draft.pdf');
  });

  it('reads image copy targets from front matter', () => {
    expect(getCopyImagesTarget('---\nmarkwisely-copy-images-to: media/images\n---\n\n# Note')).toBe('media/images');
    expect(getCopyImagesTarget('---\nmarkwisely-copy-images-to: "assets"\n---')).toBe('assets');
    expect(getCopyImagesTarget('# Note')).toBeNull();
  });

  it('reads root URLs from front matter', () => {
    expect(getRootUrl('---\nmarkwisely-root-url: /Users/me/project\n---\n\n![A](img/a.png)')).toBe('/Users/me/project');
    expect(getRootUrl("---\nmarkwisely-root-url: 'https://cdn.example.com/docs'\n---")).toBe('https://cdn.example.com/docs');
    expect(getRootUrl('---\ntitle: Note\n---')).toBeNull();
  });
});
