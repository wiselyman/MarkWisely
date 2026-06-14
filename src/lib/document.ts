export function createWelcomeMarkdown(): string {
  return '';
}

export function deriveNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function updateRecentFiles(current: string[], path: string): string[] {
  return [path, ...current.filter((item) => item !== path)].slice(0, 10);
}

export function getDefaultExportName(documentName: string, extension: string): string {
  const base = documentName.replace(/\.(md|markdown|mdown|mkd)$/i, '') || 'Untitled';
  return `${base}.${extension}`;
}

export function getCopyImagesTarget(markdown: string): string | null {
  return getFrontMatterString(markdown, 'markwisely-copy-images-to');
}

export function getRootUrl(markdown: string): string | null {
  return getFrontMatterString(markdown, 'markwisely-root-url');
}

function getFrontMatterString(markdown: string, key: string): string | null {
  const frontMatter = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!frontMatter) {
    return null;
  }

  const keyPattern = escapeRegExp(key);
  const matcher = new RegExp(`^\\s*${keyPattern}\\s*:\\s*(.+?)\\s*$`);
  for (const line of frontMatter[1].split(/\r?\n/)) {
    const match = matcher.exec(line);
    if (!match) {
      continue;
    }
    const value = unquoteYamlScalar(match[1].trim());
    return value || null;
  }

  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unquoteYamlScalar(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim();
  }
  return value.trim();
}
