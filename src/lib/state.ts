import type { DocumentMetadata, FileTreeNode } from './tauri';

export type EditorMode = 'wysiwyg' | 'source';
export type Theme = 'light' | 'dark' | 'system';
export type SidebarView = 'tree' | 'articles' | 'recent';
export type OutlineMode = 'nested' | 'flat';
export type HtmlExportTheme = 'current' | 'light' | 'dark';
export type ExportProfile =
  | 'html'
  | 'html-no-style'
  | 'pdf'
  | 'docx'
  | 'epub'
  | 'latex'
  | 'opendocument'
  | 'mediawiki';

export type DocumentState = {
  path: string | null;
  name: string;
  markdown: string;
  savedMarkdown: string;
  metadata: DocumentMetadata | null;
};

export type EditorSettings = {
  mode: EditorMode;
  theme: Theme;
  showLeftPanel: boolean;
  showRightPanel: boolean;
  sidebarView: SidebarView;
  sidebarWidth: number;
  outlineMode: OutlineMode;
  searchCaseSensitive: boolean;
  showSyntaxOnFocus: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  focusModeNoticeSeen: boolean;
  typewriterModeNoticeSeen: boolean;
  defaultImageCopyTarget: string;
  htmlExportTheme: HtmlExportTheme;
};

export type WorkspaceState = {
  tree: FileTreeNode | null;
  recentFiles: string[];
};
