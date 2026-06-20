import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ask, open, save } from '@tauri-apps/plugin-dialog';
import { FileText } from 'lucide-react';
import { MarkdownEditor, type EditorCommand, type MarkdownEditorHandle } from './components/MarkdownEditor';
import { FileTree } from './components/FileTree';
import { FindReplacePanel } from './components/FindReplacePanel';
import { OutlinePanel } from './components/OutlinePanel';
import { PreferencesPanel } from './components/PreferencesPanel';
import { RecentFiles } from './components/RecentFiles';
import { WordStatsPanel } from './components/WordStatsPanel';
import { useMenuEvents } from './hooks/useMenuEvents';
import {
  type DocumentPayload,
  type FileTreeNode,
  copyAllImagesTo,
  copyImageTo,
  detectPandoc,
  documentMetadata,
  downloadRemoteImage,
  exportHtml,
  exportPdf,
  exportWithPandoc,
  listDirectory,
  moveAllImagesTo,
  moveImageTo,
  readDocument,
  savePastedImage,
  takePendingOpenPaths,
  writeDocument,
} from './lib/tauri';
import {
  createWelcomeMarkdown,
  deriveNameFromPath,
  getCopyImagesTarget,
  getDefaultExportName,
  getRootUrl,
  updateRecentFiles,
} from './lib/document';
import { getOutline, getStats } from './lib/markdown';
import { checkForUpdates, installRuntimeLogging, openDiagnosticsDirectory } from './lib/release';
import type { DocumentState, EditorSettings, ExportProfile, SidebarView, Theme } from './lib/state';

const emptyDocument: DocumentState = {
  path: null,
  name: 'Untitled.md',
  markdown: createWelcomeMarkdown(),
  savedMarkdown: createWelcomeMarkdown(),
  metadata: null,
};

const initialSettings: EditorSettings = loadEditorSettings();

const editorCommands = new Set<string>([
  'format-paragraph',
  'format-heading-1',
  'format-heading-2',
  'format-heading-3',
  'format-heading-4',
  'format-heading-5',
  'format-heading-6',
  'format-bullet-list',
  'format-ordered-list',
  'format-task-list',
  'format-blockquote',
  'format-code-block',
  'toggle-bold',
  'toggle-italic',
  'toggle-strike',
  'toggle-inline-code',
  'clear-format',
  'insert-link',
  'insert-table',
  'insert-horizontal-rule',
  'insert-toc',
  'insert-inline-math',
  'insert-math-block',
  'insert-mermaid-block',
]);

function App() {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const externalChangeRef = useRef<string | null>(null);
  const isDirtyRef = useRef(false);
  const closeInProgressRef = useRef(false);
  const [doc, setDoc] = useState<DocumentState>(emptyDocument);
  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[]>(() => loadRecentFiles());
  const [settings, setSettings] = useState<EditorSettings>(initialSettings);
  const [message, setMessage] = useState('Ready');
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showFindPanel, setShowFindPanel] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showPandocHelp, setShowPandocHelp] = useState(false);

  const isDirty = doc.markdown !== doc.savedMarkdown;
  const outline = useMemo(() => getOutline(doc.markdown), [doc.markdown]);
  const stats = useMemo(() => getStats(doc.markdown), [doc.markdown]);
  const articles = useMemo(() => collectFiles(tree), [tree]);
  const copyImagesTo = useMemo(
    () => getCopyImagesTarget(doc.markdown) ?? normalizeAssetTargetSetting(settings.defaultImageCopyTarget),
    [doc.markdown, settings.defaultImageCopyTarget],
  );
  const rootUrl = useMemo(() => getRootUrl(doc.markdown), [doc.markdown]);
  const resolvedTheme = resolveTheme(settings.theme);

  useEffect(() => {
    void installRuntimeLogging();
  }, []);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    window.document.documentElement.dataset.theme = resolvedTheme;
    localStorage.setItem('markwisely.theme', settings.theme);
  }, [resolvedTheme, settings.theme]);

  useEffect(() => {
    localStorage.setItem('markwisely.recentFiles', JSON.stringify(recentFiles));
  }, [recentFiles]);

  useEffect(() => {
    localStorage.setItem('markwisely.editorSettings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (message === 'Ready') {
      return;
    }
    const timer = window.setTimeout(() => setMessage('Ready'), 3600);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const title = `${getWindowTitle(doc.name)}${isDirty ? ' — Edited' : ''}`;
    window.document.title = title;
    if ('__TAURI_INTERNALS__' in window) {
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
        .catch(() => undefined);
    }
  }, [doc.name, isDirty]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || closeInProgressRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        return appWindow.onCloseRequested(async (event) => {
          if (closeInProgressRef.current) {
            return;
          }

          event.preventDefault();
          if (isDirtyRef.current) {
            const confirmed = await confirmWithNativeDialog('This document has unsaved changes. Close anyway?', {
              title: 'Unsaved Changes',
              okLabel: 'Discard',
              cancelLabel: 'Cancel',
            });
            if (!confirmed) {
              return;
            }
          }

          closeInProgressRef.current = true;
          try {
            await appWindow.destroy();
          } catch {
            await appWindow.close().catch(() => undefined);
          }
        });
      })
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const updateMarkdown = useCallback((markdown: string) => {
    setDoc((current) => ({ ...current, markdown }));
  }, []);

  const openPayload = useCallback((payload: DocumentPayload) => {
    setDoc({
      path: payload.path,
      name: payload.name,
      markdown: payload.markdown,
      savedMarkdown: payload.markdown,
      metadata: payload.metadata,
    });
    setRecentFiles((current) => updateRecentFiles(current, payload.path));
    setMessage(`Opened ${payload.name}`);
    if ('__TAURI_INTERNALS__' in window) {
      void import('@tauri-apps/plugin-log')
        .then(({ info }) => info(`Opened markdown document: ${payload.path}`))
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    externalChangeRef.current = null;
  }, [doc.path, doc.metadata?.hash]);

  useEffect(() => {
    if (!doc.path || !doc.metadata) {
      return;
    }

    let disposed = false;
    const path = doc.path;
    const checkForExternalChange = async () => {
      try {
        const metadata = await documentMetadata(path);
        if (disposed) {
          return;
        }
        const changed = metadata.hash !== doc.metadata?.hash || metadata.modifiedMs !== doc.metadata?.modifiedMs;
        if (!changed) {
          return;
        }

        const changeId = `${metadata.modifiedMs}:${metadata.hash}`;
        if (externalChangeRef.current === changeId) {
          return;
        }
        externalChangeRef.current = changeId;

        if (isDirty) {
          setMessage('File changed on disk. Save will ask before overwriting.');
          return;
        }

        if (
          await confirmWithNativeDialog('This file changed on disk. Reload it?', {
            title: 'External Change',
            okLabel: 'Reload',
            cancelLabel: 'Keep Current',
          })
        ) {
          openPayload(await readDocument(path));
        } else {
          setDoc((current) => (current.path === path ? { ...current, metadata } : current));
          setMessage('Kept current document. Save will overwrite the disk copy.');
        }
      } catch (error) {
        if (!disposed) {
          const changeId = `error:${formatError(error)}`;
          if (externalChangeRef.current !== changeId) {
            externalChangeRef.current = changeId;
            setMessage(formatError(error));
          }
        }
      }
    };

    const initial = window.setTimeout(() => void checkForExternalChange(), 1500);
    const interval = window.setInterval(() => void checkForExternalChange(), 5000);
    return () => {
      disposed = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [doc.metadata?.hash, doc.metadata?.modifiedMs, doc.path, isDirty, openPayload]);

  const confirmDiscardChanges = useCallback(async () => {
    if (!isDirtyRef.current) {
      return true;
    }
    return confirmWithNativeDialog('This document has unsaved changes. Continue and discard them?', {
      title: 'Unsaved Changes',
      okLabel: 'Discard',
      cancelLabel: 'Cancel',
    });
  }, []);

  const newDocument = useCallback(async () => {
    if (!(await confirmDiscardChanges())) {
      return;
    }
    setDoc({ ...emptyDocument });
    setMessage('New document');
    window.setTimeout(() => editorRef.current?.focus(), 40);
  }, [confirmDiscardChanges]);

  const closeDocument = useCallback(async () => {
    if (!(await confirmDiscardChanges())) {
      return;
    }
    setDoc({ ...emptyDocument });
    setMessage('Closed document');
  }, [confirmDiscardChanges]);

  const openFilePath = useCallback(
    async (path: string) => {
      if (!(await confirmDiscardChanges())) {
        return;
      }
      try {
        openPayload(await readDocument(path));
      } catch (error) {
        const exportError = formatError(error);
        setMessage(exportError);
        if (/pandoc/i.test(exportError)) {
          setShowPandocHelp(true);
        }
      }
    },
    [confirmDiscardChanges, openPayload],
  );

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    let pollTimer: number | null = null;
    let pollAttempts = 0;
    const seenPaths = new Set<string>();
    const openFirstPath = (paths: string[]) => {
      const path = paths.find(
        (candidate) =>
          typeof candidate === 'string' && candidate.length > 0 && !seenPaths.has(candidate),
      );
      if (path) {
        seenPaths.add(path);
        void openFilePath(path);
        return true;
      }
      return false;
    };

    const pollPendingOpenPaths = () => {
      void takePendingOpenPaths()
        .then((paths) => {
          if (disposed) {
            return;
          }
          const opened = openFirstPath(paths);
          pollAttempts += 1;
          if (!opened && pollAttempts < 24) {
            pollTimer = window.setTimeout(pollPendingOpenPaths, 250);
          }
        })
        .catch(() => {
          if (!disposed && pollAttempts < 24) {
            pollAttempts += 1;
            pollTimer = window.setTimeout(pollPendingOpenPaths, 250);
          }
        });
    };

    pollPendingOpenPaths();

    void import('@tauri-apps/plugin-log')
      .then(({ info }) => info('MarkWisely open-file listener ready'))
      .catch(() => undefined);

    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<string[]>('markwisely-open-paths', (event) => {
          openFirstPath(event.payload);
        }),
      )
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
      }
      unlisten?.();
    };
  }, [openFilePath]);

  const openFileDialog = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] }],
      });
      if (typeof selected === 'string') {
        await openFilePath(selected);
      }
    } catch (error) {
      setMessage(formatError(error));
    }
  }, [openFilePath]);

  const openFolder = useCallback(async () => {
    try {
      const selected = await open({ multiple: false, directory: true });
      if (typeof selected === 'string') {
        const directory = await listDirectory(selected);
        setTree(directory);
        setSettings((current) => ({ ...current, showLeftPanel: true, sidebarView: 'tree' }));
        setMessage(`Opened folder ${directory.name}`);
      }
    } catch (error) {
      setMessage(formatError(error));
    }
  }, []);

  const saveAsDocument = useCallback(async () => {
    try {
      const selected = await save({
        defaultPath: doc.path ?? doc.name,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!selected) {
        return false;
      }
      const metadata = await writeDocument(selected, doc.markdown, null, true);
      setDoc((current) => ({
        ...current,
        path: metadata.path,
        name: metadata.name,
        savedMarkdown: current.markdown,
        metadata,
      }));
      setRecentFiles((current) => updateRecentFiles(current, metadata.path));
      setMessage(`Saved ${metadata.name}`);
      return true;
    } catch (error) {
      setMessage(formatError(error));
      return false;
    }
  }, [doc.markdown, doc.name, doc.path]);

  const saveDocument = useCallback(async () => {
    if (!doc.path) {
      await saveAsDocument();
      return;
    }
    try {
      const metadata = await writeDocument(
        doc.path,
        doc.markdown,
        doc.metadata?.modifiedMs ?? null,
        false,
        doc.metadata?.hash ?? null,
      );
      setDoc((current) => ({
        ...current,
        name: metadata.name,
        savedMarkdown: current.markdown,
        metadata,
      }));
      setMessage(`Saved ${metadata.name}`);
    } catch (error) {
      const message = formatError(error);
      if (
        message.includes('changed on disk') &&
        (await confirmWithNativeDialog(`${message}\n\nOverwrite the file on disk?`, {
          title: 'External Change',
          okLabel: 'Overwrite',
          cancelLabel: 'Cancel',
        }))
      ) {
        try {
          const metadata = await writeDocument(doc.path, doc.markdown, null, true);
          setDoc((current) => ({
            ...current,
            name: metadata.name,
            savedMarkdown: current.markdown,
            metadata,
          }));
          setMessage(`Overwrote ${metadata.name}`);
          return;
        } catch (overwriteError) {
          setMessage(formatError(overwriteError));
          return;
        }
      }
      setMessage(message);
    }
  }, [doc.markdown, doc.metadata?.hash, doc.metadata?.modifiedMs, doc.path, saveAsDocument]);

  const exportDocument = useCallback(
    async (profile: ExportProfile) => {
      try {
        if (profile === 'html' || profile === 'html-no-style') {
          const selected = await save({
            defaultPath: getDefaultExportName(doc.name, 'html'),
            filters: [{ name: 'HTML', extensions: ['html'] }],
          });
          if (!selected) {
            return;
          }
          await exportHtml(doc.markdown, selected, resolveHtmlExportTheme(settings.htmlExportTheme, resolvedTheme), profile === 'html', doc.path);
          setMessage(`Exported HTML to ${deriveNameFromPath(selected)}`);
          return;
        }

        if (profile === 'pdf') {
          const selected = await save({
            defaultPath: getDefaultExportName(doc.name, 'pdf'),
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
          });
          if (!selected) {
            return;
          }
          await exportPdf(doc.markdown, selected, getWindowTitle(doc.name));
          setMessage(`Exported PDF to ${deriveNameFromPath(selected)}`);
          return;
        }

        await detectPandoc();
        const extension = pandocExtension(profile);
        const selected = await save({
          defaultPath: getDefaultExportName(doc.name, extension),
          filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
        });
        if (!selected) {
          return;
        }
        await exportWithPandoc(doc.markdown, selected, pandocFormat(profile), doc.path, getWindowTitle(doc.name));
        setMessage(`Exported ${extension.toUpperCase()} to ${deriveNameFromPath(selected)}`);
      } catch (error) {
        setMessage(formatError(error));
      }
    },
    [doc.markdown, doc.name, doc.path, resolvedTheme, settings.htmlExportTheme],
  );

  const insertImageFromDialog = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
      });
      if (typeof selected === 'string') {
        editorRef.current?.runCommand('insert-image', toMarkdownAssetPath(selected, doc.path));
      }
    } catch (error) {
      setMessage(formatError(error));
    }
  }, [doc.path]);

  const relocateAllImages = useCallback(
    async (mode: 'copy' | 'move') => {
      if (!doc.path) {
        setMessage('Save the document before relocating images.');
        return;
      }
      try {
        const selected = await open({ multiple: false, directory: true });
        if (typeof selected !== 'string') {
          return;
        }
        const result =
          mode === 'copy'
            ? await copyAllImagesTo(doc.path, doc.markdown, selected)
            : await moveAllImagesTo(doc.path, doc.markdown, selected);
        setDoc((current) => (current.path === doc.path ? { ...current, markdown: result.markdown } : current));
        const action = mode === 'copy' ? 'Copied' : 'Moved';
        setMessage(`${action} ${result.assets.length} image${result.assets.length === 1 ? '' : 's'}`);
      } catch (error) {
        setMessage(formatError(error));
      }
    },
    [doc.markdown, doc.path],
  );

  const relocateImage = useCallback(
    async (imagePath: string, mode: 'copy' | 'move') => {
      if (!doc.path) {
        setMessage('Save the document before relocating images.');
        return null;
      }
      try {
        const selected = await open({ multiple: false, directory: true });
        if (typeof selected !== 'string') {
          return null;
        }
        const result =
          mode === 'copy' ? await copyImageTo(doc.path, imagePath, selected) : await moveImageTo(doc.path, imagePath, selected);
        setMessage(`${mode === 'copy' ? 'Copied' : 'Moved'} ${result.name}`);
        return result;
      } catch (error) {
        setMessage(formatError(error));
        return null;
      }
    },
    [doc.path],
  );

  const downloadRemoteImages = useCallback(async () => {
    if (!doc.path) {
      setMessage('Save the document before downloading remote images.');
      return;
    }

    const urls = collectRemoteImageUrls(doc.markdown);
    if (urls.length === 0) {
      setMessage('No remote images found.');
      return;
    }

    try {
      const replacements = new Map<string, string>();
      for (const url of urls) {
        const saved = await downloadRemoteImage(doc.path, url, copyImagesTo);
        replacements.set(url, saved.markdownPath);
      }

      setDoc((current) =>
        current.path === doc.path
          ? { ...current, markdown: replaceMarkdownImageUrls(current.markdown, replacements) }
          : current,
      );
      setMessage(`Downloaded ${replacements.size} remote image${replacements.size === 1 ? '' : 's'}`);
    } catch (error) {
      setMessage(formatError(error));
    }
  }, [copyImagesTo, doc.markdown, doc.path]);

  const showWordCount = useCallback(() => {
    setShowStatsPanel((current) => !current);
  }, []);

  const showFind = useCallback(() => {
    setShowFindPanel(true);
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    setSettings((current) => ({ ...current, theme }));
  }, []);

  const togglePanel = useCallback((view: SidebarView) => {
    setSettings((current) => ({
      ...current,
      sidebarView: view,
      showLeftPanel: current.sidebarView === view ? !current.showLeftPanel : true,
    }));
  }, []);

  useMenuEvents({
    'new-document': newDocument,
    'open-file': openFileDialog,
    'open-folder': openFolder,
    'save-document': saveDocument,
    'save-document-as': saveAsDocument,
    'close-document': closeDocument,
    'show-find': showFind,
    'export-html': () => exportDocument('html'),
    'export-html-no-style': () => exportDocument('html-no-style'),
    'export-pdf': () => exportDocument('pdf'),
    'export-docx': () => exportDocument('docx'),
    'export-epub': () => exportDocument('epub'),
    'export-latex': () => exportDocument('latex'),
    'export-opendocument': () => exportDocument('opendocument'),
    'export-mediawiki': () => exportDocument('mediawiki'),
    'show-preferences': () => setShowPreferences(true),
    'toggle-source-mode': () =>
      setSettings((current) => ({ ...current, mode: current.mode === 'source' ? 'wysiwyg' : 'source' })),
    'toggle-focus-mode': () =>
      setSettings((current) => {
        const enabled = !current.focusMode;
        if (enabled && !current.focusModeNoticeSeen) {
          setMessage('Focus mode fades surrounding blocks.');
        }
        return { ...current, focusMode: enabled, focusModeNoticeSeen: current.focusModeNoticeSeen || enabled };
      }),
    'toggle-typewriter-mode': () =>
      setSettings((current) => {
        const enabled = !current.typewriterMode;
        if (enabled && !current.typewriterModeNoticeSeen) {
          setMessage('Typewriter mode keeps the cursor near the center.');
        }
        return { ...current, typewriterMode: enabled, typewriterModeNoticeSeen: current.typewriterModeNoticeSeen || enabled };
      }),
    'toggle-file-panel': () => togglePanel('tree'),
    'toggle-articles-panel': () => togglePanel('articles'),
    'toggle-recent-panel': () => togglePanel('recent'),
    'toggle-outline': () => setSettings((current) => ({ ...current, showRightPanel: !current.showRightPanel })),
    'toggle-theme': () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    'theme-light': () => setTheme('light'),
    'theme-dark': () => setTheme('dark'),
    'theme-system': () => setTheme('system'),
    'show-word-count': showWordCount,
    'insert-image': insertImageFromDialog,
    'copy-all-images-to': () => relocateAllImages('copy'),
    'move-all-images-to': () => relocateAllImages('move'),
    'download-remote-images': downloadRemoteImages,
    'check-for-updates': async () => setMessage(await checkForUpdates()),
    'open-log-directory': async () => setMessage(await openDiagnosticsDirectory()),
    ...Object.fromEntries(
      Array.from(editorCommands).map((command) => [
        command,
        () => editorRef.current?.runCommand(command as EditorCommand),
      ]),
    ),
  });

  return (
    <div
      className={`app-shell ${settings.showLeftPanel ? 'with-left-panel' : ''} ${
        settings.showRightPanel ? 'with-right-panel' : ''
      }`}
      style={{ '--sidebar-width': `${settings.sidebarWidth}px` } as CSSProperties}
    >
      <div className="workspace">
        {settings.showLeftPanel && (
          <aside className="left-panel">
            <div className="sidebar-tabs" role="tablist" aria-label="Sidebar">
              <button
                className={settings.sidebarView === 'tree' ? 'active' : ''}
                type="button"
                onClick={() => setSettings((current) => ({ ...current, sidebarView: 'tree' }))}
              >
                Files
              </button>
              <button
                className={settings.sidebarView === 'articles' ? 'active' : ''}
                type="button"
                onClick={() => setSettings((current) => ({ ...current, sidebarView: 'articles' }))}
              >
                Articles
              </button>
              <button
                className={settings.sidebarView === 'recent' ? 'active' : ''}
                type="button"
                onClick={() => setSettings((current) => ({ ...current, sidebarView: 'recent' }))}
              >
                Recent
              </button>
            </div>

            {settings.sidebarView === 'tree' && (
              <>
                <div className="panel-header">
                  <span>Files</span>
                  <button className="ghost-button" onClick={openFolder} type="button">
                    Open Folder
                  </button>
                </div>
                <FileTree tree={tree} activePath={doc.path} onOpenFile={openFilePath} />
              </>
            )}

            {settings.sidebarView === 'articles' && (
              <section className="article-list">
                <div className="panel-header">
                  <span>Articles</span>
                </div>
                {articles.length === 0 ? (
                  <div className="empty-panel">No folder open.</div>
                ) : (
                  <div className="recent-list">
                    {articles.map((file) => (
                      <button
                        key={file.path}
                        className={`recent-row ${file.path === doc.path ? 'active' : ''}`}
                        type="button"
                        title={file.path}
                        onClick={() => void openFilePath(file.path)}
                      >
                        <FileText size={14} />
                        <span>{file.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {settings.sidebarView === 'recent' && (
              <RecentFiles files={recentFiles} activePath={doc.path} onOpenFile={openFilePath} />
            )}
          </aside>
        )}

        <main className={`editor-host ${settings.focusMode ? 'focus-mode' : ''} ${settings.typewriterMode ? 'typewriter-mode' : ''}`}>
          <MarkdownEditor
            ref={editorRef}
            key={doc.path ?? doc.name}
            markdown={doc.markdown}
            mode={settings.mode}
            theme={resolvedTheme}
            documentPath={doc.path}
            rootUrl={rootUrl}
            showSyntaxOnFocus={settings.showSyntaxOnFocus}
            onChange={updateMarkdown}
            focusMode={settings.focusMode}
            typewriterMode={settings.typewriterMode}
            onSaveImage={(fileName, bytes) => savePastedImage(doc.path, fileName, bytes, copyImagesTo)}
            onRelocateImage={relocateImage}
          />
        </main>

        {settings.showRightPanel && (
          <aside className="right-panel">
            <OutlinePanel
              outline={outline}
              mode={settings.outlineMode}
              onChangeMode={(outlineMode) => setSettings((current) => ({ ...current, outlineMode }))}
            />
          </aside>
        )}
      </div>

      <div className="sr-status" role="status" aria-live="polite">
        {message}
      </div>
      {message !== 'Ready' && (
        <div className="command-toast" role="status" aria-live="polite">
          {message}
        </div>
      )}
      {showFindPanel && (
        <FindReplacePanel
          markdown={doc.markdown}
          workspaceRoot={tree?.path ?? null}
          initialCaseSensitive={settings.searchCaseSensitive}
          onCaseSensitiveChange={(searchCaseSensitive) =>
            setSettings((current) => ({ ...current, searchCaseSensitive }))
          }
          onChange={updateMarkdown}
          onOpenFile={openFilePath}
          onClose={() => setShowFindPanel(false)}
        />
      )}
      {showStatsPanel && <WordStatsPanel stats={stats} onClose={() => setShowStatsPanel(false)} />}
      {showPreferences && (
        <PreferencesPanel
          settings={settings}
          onChangeSettings={setSettings}
          onClose={() => setShowPreferences(false)}
        />
      )}
      {showPandocHelp && <PandocHelpPanel onClose={() => setShowPandocHelp(false)} />}
    </div>
  );
}

function PandocHelpPanel({ onClose }: { onClose: () => void }) {
  const openInstallGuide = async () => {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl('https://pandoc.org/installing.html');
    } catch {
      window.open('https://pandoc.org/installing.html', '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="preferences-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="pandoc-help-panel" role="dialog" aria-modal="true" aria-label="Pandoc required" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <strong>Pandoc Required</strong>
          <button type="button" aria-label="Close Pandoc notice" onClick={onClose}>
            Close
          </button>
        </header>
        <p>DOCX, EPUB, LaTeX, OpenDocument, and MediaWiki export require Pandoc on this computer.</p>
        <div>
          <button type="button" onClick={() => void openInstallGuide()}>
            Install Pandoc
          </button>
        </div>
      </section>
    </div>
  );
}

function collectFiles(tree: FileTreeNode | null): FileTreeNode[] {
  if (!tree) {
    return [];
  }
  const files: FileTreeNode[] = [];
  const visit = (node: FileTreeNode) => {
    if (!node.isDir) {
      files.push(node);
      return;
    }
    node.children.forEach(visit);
  };
  visit(tree);
  return files;
}

function getWindowTitle(name: string): string {
  return name.replace(/\.(md|markdown|mdown|mkd)$/i, '') || 'Untitled';
}

function loadTheme(): Theme {
  const stored = localStorage.getItem('markwisely.theme');
  return stored === 'dark' || stored === 'system' ? stored : 'light';
}

function loadEditorSettings(): EditorSettings {
  const fallback: EditorSettings = {
    mode: 'wysiwyg',
    theme: loadTheme(),
    showLeftPanel: false,
    showRightPanel: false,
    sidebarView: 'tree',
    sidebarWidth: 278,
    outlineMode: 'nested',
    searchCaseSensitive: false,
    showSyntaxOnFocus: true,
    focusMode: false,
    typewriterMode: false,
    focusModeNoticeSeen: false,
    typewriterModeNoticeSeen: false,
    defaultImageCopyTarget: 'assets',
    htmlExportTheme: 'current',
  };

  try {
    const parsed = JSON.parse(localStorage.getItem('markwisely.editorSettings') ?? 'null') as Partial<EditorSettings> | null;
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }
    return {
      ...fallback,
      mode: parsed.mode === 'source' ? 'source' : fallback.mode,
      theme: parsed.theme === 'dark' || parsed.theme === 'system' || parsed.theme === 'light' ? parsed.theme : fallback.theme,
      showLeftPanel: Boolean(parsed.showLeftPanel),
      showRightPanel: Boolean(parsed.showRightPanel),
      sidebarView: parsed.sidebarView === 'articles' || parsed.sidebarView === 'recent' || parsed.sidebarView === 'tree' ? parsed.sidebarView : fallback.sidebarView,
      sidebarWidth: normalizeSidebarWidth(parsed.sidebarWidth),
      outlineMode: parsed.outlineMode === 'flat' || parsed.outlineMode === 'nested' ? parsed.outlineMode : fallback.outlineMode,
      searchCaseSensitive: Boolean(parsed.searchCaseSensitive),
      showSyntaxOnFocus: parsed.showSyntaxOnFocus === false ? false : fallback.showSyntaxOnFocus,
      focusMode: Boolean(parsed.focusMode),
      typewriterMode: Boolean(parsed.typewriterMode),
      focusModeNoticeSeen: Boolean(parsed.focusModeNoticeSeen),
      typewriterModeNoticeSeen: Boolean(parsed.typewriterModeNoticeSeen),
      defaultImageCopyTarget:
        typeof parsed.defaultImageCopyTarget === 'string'
          ? normalizeAssetTargetSetting(parsed.defaultImageCopyTarget)
          : fallback.defaultImageCopyTarget,
      htmlExportTheme:
        parsed.htmlExportTheme === 'light' || parsed.htmlExportTheme === 'dark' || parsed.htmlExportTheme === 'current'
          ? parsed.htmlExportTheme
          : fallback.htmlExportTheme,
    };
  } catch {
    return fallback;
  }
}

function normalizeSidebarWidth(value: unknown): number {
  const width = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(width) ? Math.min(420, Math.max(220, Math.round(width))) : 278;
}

function normalizeAssetTargetSetting(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized || 'assets';
}

function resolveHtmlExportTheme(setting: EditorSettings['htmlExportTheme'], currentTheme: 'light' | 'dark'): 'light' | 'dark' {
  return setting === 'current' ? currentTheme : setting;
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') {
    return theme;
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadRecentFiles(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('markwisely.recentFiles') ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function pandocExtension(profile: ExportProfile): string {
  switch (profile) {
    case 'docx':
      return 'docx';
    case 'epub':
      return 'epub';
    case 'latex':
      return 'tex';
    case 'opendocument':
      return 'odt';
    case 'mediawiki':
      return 'mediawiki';
    default:
      return 'txt';
  }
}

function pandocFormat(profile: ExportProfile): string {
  if (profile === 'opendocument') {
    return 'odt';
  }
  if (profile === 'epub') {
    return 'epub3';
  }
  return profile;
}

function toMarkdownAssetPath(path: string, documentPath: string | null): string {
  if (!documentPath) {
    return path;
  }
  const normalizedPath = path.replace(/\\/g, '/');
  const documentDir = documentPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  if (documentDir && normalizedPath.startsWith(`${documentDir}/`)) {
    return normalizedPath.slice(documentDir.length + 1);
  }
  return path;
}

function collectRemoteImageUrls(markdown: string): string[] {
  const urls = new Set<string>();
  const imagePattern = /!\[[^\]]*]\((<[^>]+>|[^\s)]+)([^)]*)\)/g;
  for (const match of markdown.matchAll(imagePattern)) {
    const url = unwrapMarkdownDestination(match[1]);
    if (/^https?:\/\//i.test(url)) {
      urls.add(url);
    }
  }
  return Array.from(urls);
}

function replaceMarkdownImageUrls(markdown: string, replacements: Map<string, string>): string {
  if (replacements.size === 0) {
    return markdown;
  }

  return markdown.replace(/!\[[^\]]*]\((<[^>]+>|[^\s)]+)([^)]*)\)/g, (full, destination: string) => {
    const url = unwrapMarkdownDestination(destination);
    const replacement = replacements.get(url);
    if (!replacement) {
      return full;
    }
    const nextDestination = destination.startsWith('<') && destination.endsWith('>') ? `<${replacement}>` : replacement;
    return full.replace(destination, nextDestination);
  });
}

function unwrapMarkdownDestination(destination: string): string {
  return destination.startsWith('<') && destination.endsWith('>') ? destination.slice(1, -1) : destination;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function confirmWithNativeDialog(
  message: string,
  options: { title: string; okLabel: string; cancelLabel: string },
): Promise<boolean> {
  if (!('__TAURI_INTERNALS__' in window)) {
    return window.confirm(message);
  }

  try {
    return await ask(message, {
      title: options.title,
      kind: 'warning',
      okLabel: options.okLabel,
      cancelLabel: options.cancelLabel,
    });
  } catch {
    return false;
  }
}

export default App;
