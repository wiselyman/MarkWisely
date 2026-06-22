import {
  Suspense,
  forwardRef,
  lazy,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
  type NodeViewProps,
} from '@tiptap/react';
import {
  Extension,
  InputRule,
  Node,
  nodeInputRule,
  type JSONContent,
  type MarkdownParseHelpers,
  type MarkdownToken,
} from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { CodeBlock } from '@tiptap/extension-code-block';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';

const SourceCodeEditor = lazy(() => import('./SourceCodeEditor'));

type EditorWithMarkdown = Editor & {
  getMarkdown: () => string;
};

export type EditorCommand =
  | 'focus-editor'
  | 'format-paragraph'
  | 'format-heading-1'
  | 'format-heading-2'
  | 'format-heading-3'
  | 'format-heading-4'
  | 'format-heading-5'
  | 'format-heading-6'
  | 'format-bullet-list'
  | 'format-ordered-list'
  | 'format-task-list'
  | 'format-blockquote'
  | 'format-code-block'
  | 'toggle-bold'
  | 'toggle-italic'
  | 'toggle-strike'
  | 'toggle-inline-code'
  | 'clear-format'
  | 'insert-link'
  | 'insert-image'
  | 'insert-table'
  | 'table-add-row-before'
  | 'table-add-row'
  | 'table-add-column-before'
  | 'table-delete-row'
  | 'table-add-column'
  | 'table-delete-column'
  | 'table-align-left'
  | 'table-align-center'
  | 'table-align-right'
  | 'table-merge-split'
  | 'table-toggle-header-row'
  | 'table-toggle-header-column'
  | 'table-delete'
  | 'insert-horizontal-rule'
  | 'insert-toc'
  | 'insert-inline-math'
  | 'insert-math-block'
  | 'insert-mermaid-block';

export type MarkdownEditorHandle = {
  focus: () => void;
  runCommand: (command: EditorCommand, payload?: string) => boolean;
  insertMarkdown: (markdown: string) => void;
};

type SavedAssetReference = {
  markdownPath: string;
  name: string;
};

type LinkPopoverState = {
  href: string;
  from: number;
  to: number;
  top: number;
  left: number;
};

type ImagePopoverState = {
  src: string;
  alt: string;
  width: string;
  pos: number | null;
  top: number;
  left: number;
};

type InlineSourcePopoverState = {
  markName: InlineSourceMarkName | 'mixed';
  source: string;
  from: number;
  to: number;
  top: number;
  left: number;
};

type InlineSourceMarkName = 'bold' | 'italic' | 'strike' | 'code';

type MarkdownEditorProps = {
  markdown: string;
  mode: 'wysiwyg' | 'source';
  theme: 'light' | 'dark';
  documentPath: string | null;
  rootUrl: string | null;
  showSyntaxOnFocus: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  onChange: (markdown: string) => void;
  onSaveImage?: (fileName: string, bytes: number[]) => Promise<{ markdownPath: string; name: string }>;
  onRelocateImage?: (imagePath: string, mode: 'copy' | 'move') => Promise<SavedAssetReference | null>;
};

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({
  markdown,
  mode,
  theme,
  documentPath,
  rootUrl,
  showSyntaxOnFocus,
  focusMode,
  typewriterMode,
  onChange,
  onSaveImage,
  onRelocateImage,
}: MarkdownEditorProps, ref) {
  const readyForUserUpdates = useRef(false);
  const sourceView = useRef<any>(null);
  const editorForEvents = useRef<Editor | null>(null);
  const typewriterModeRef = useRef(typewriterMode);
  const showSyntaxOnFocusRef = useRef(showSyntaxOnFocus);
  const [tableControlsVisible, setTableControlsVisible] = useState(false);
  const [tableAlign, setTableAlign] = useState<'left' | 'center' | 'right' | null>(null);
  const [linkPopover, setLinkPopover] = useState<LinkPopoverState | null>(null);
  const [imagePopover, setImagePopover] = useState<ImagePopoverState | null>(null);
  const [inlineSourcePopover, setInlineSourcePopover] = useState<InlineSourcePopoverState | null>(null);
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: false,
      }),
      PreviewCodeBlock,
      FrontMatterBlock,
      MathBlock,
      InlineMath,
      TocBlock,
      MarkdownInputShortcuts,
      ActiveSyntaxMarks,
      Markdown,
      Link.configure({ openOnClick: false, autolink: true }),
      MarkdownImage,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: markdown,
    contentType: 'markdown',
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'prose-editor',
        spellcheck: 'true',
      },
      handleDOMEvents: {
        click: (view, event) => {
          if (!showSyntaxOnFocusRef.current) {
            return false;
          }
          markInlineSyntaxFromMouseEvent(view.dom, event);
          return false;
        },
        mousemove: (view, event) => {
          if (!showSyntaxOnFocusRef.current) {
            return false;
          }
          markInlineSyntaxFromMouseEvent(view.dom, event);
          return false;
        },
        mouseleave: (view) => {
          clearActiveInlineSyntax(view.dom);
          return false;
        },
      },
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement | null;
        const pointTarget = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
        const preciseTarget = pointTarget && view.dom.contains(pointTarget) ? pointTarget : target;
        const image = preciseTarget?.closest('img');
        if (image && view.dom.contains(image)) {
          event.preventDefault();
          const editorInstance = editorForEvents.current;
          const original = image.dataset.markwiselySrc ?? image.getAttribute('src') ?? '';
          const selectedPos = selectNodeNear(view, pos);
          if (editorInstance) {
            editorInstance.commands.focus();
          }
          setLinkPopover(null);
          setInlineSourcePopover(null);
          setImagePopover({
            src: original,
            alt: image.alt || '',
            width: image.getAttribute('width') ?? '',
            pos: selectedPos,
            ...getPopoverPosition(image.getBoundingClientRect(), 390),
          });
          scheduleActiveSyntaxRefresh(editorInstance, preciseTarget);
          return true;
        }

        const anchor = preciseTarget?.closest('a[href]');
        if (anchor && view.dom.contains(anchor)) {
          event.preventDefault();
          const href = anchor.getAttribute('href') ?? '';
          if (event.metaKey || event.ctrlKey) {
            window.open(href, '_blank', 'noopener,noreferrer');
            return true;
          }

          const editorInstance = editorForEvents.current;
          if (!editorInstance) {
            return true;
          }
          editorInstance.chain().focus().setTextSelection(pos).extendMarkRange('link').run();
          const selection = editorInstance.state.selection;
          setImagePopover(null);
          setInlineSourcePopover(null);
          setLinkPopover({
            href,
            from: selection.from,
            to: selection.to,
            ...getPopoverPosition(anchor.getBoundingClientRect(), 360),
          });
          scheduleActiveSyntaxRefresh(editorInstance, preciseTarget);
          return true;
        }

        setLinkPopover(null);
        setImagePopover(null);
        scheduleActiveSyntaxRefresh(editorForEvents.current, preciseTarget);
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (!readyForUserUpdates.current) {
        return;
      }
      const nextMarkdown = (editor as EditorWithMarkdown).getMarkdown();
      queueMicrotask(() => onChange(nextMarkdown));
    },
  });

  useEffect(() => {
    readyForUserUpdates.current = true;
    return () => {
      readyForUserUpdates.current = false;
    };
  }, []);

  useEffect(() => {
    editorForEvents.current = editor;
  }, [editor]);

  useEffect(() => {
    typewriterModeRef.current = typewriterMode;
  }, [typewriterMode]);

  useEffect(() => {
    showSyntaxOnFocusRef.current = showSyntaxOnFocus;
    if (!showSyntaxOnFocus && editor) {
      clearActiveInlineSyntax(editor.view.dom);
      setInlineSourcePopover(null);
    }
  }, [editor, showSyntaxOnFocus]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLinkPopover(null);
        setImagePopover(null);
        setInlineSourcePopover(null);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  useEffect(() => {
    if (!editor || mode !== 'wysiwyg') {
      return;
    }

    const syncActiveBlock = () => {
      window.requestAnimationFrame(() => {
        markActiveBlock(editor);
        if (showSyntaxOnFocusRef.current) {
          markActiveInlineSyntax(editor);
          setInlineSourcePopover(buildInlineSourcePopover(editor));
        } else {
          clearActiveInlineSyntax(editor.view.dom);
          setInlineSourcePopover(null);
        }
        setTableControlsVisible(editor.isActive('table'));
        setTableAlign(getActiveTableCellAlign(editor));
        if (typewriterModeRef.current) {
          scrollActiveBlockToCenter(editor);
        }
      });
    };

    editor.on('selectionUpdate', syncActiveBlock);
    editor.on('update', syncActiveBlock);
    syncActiveBlock();

    return () => {
      editor.off('selectionUpdate', syncActiveBlock);
      editor.off('update', syncActiveBlock);
    };
  }, [editor, mode]);

  useEffect(() => {
    if (!editor || mode !== 'wysiwyg') {
      return;
    }
    const current = (editor as EditorWithMarkdown).getMarkdown();
    if (current !== markdown) {
      editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
    }
  }, [editor, markdown, mode]);

  useEffect(() => {
    if (!editor || mode !== 'wysiwyg') {
      return;
    }
    const timer = window.setTimeout(() => editor.commands.focus('end'), 80);
    return () => window.clearTimeout(timer);
  }, [editor, mode]);

  useEffect(() => {
    if (!editor || mode !== 'wysiwyg' || !('__TAURI_INTERNALS__' in window)) {
      return;
    }

    let cancelled = false;
    const resolveImages = async () => {
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      if (cancelled) {
        return;
      }
      document.querySelectorAll<HTMLImageElement>('.ProseMirror img[src]').forEach((image) => {
        const original = image.dataset.markwiselySrc ?? image.getAttribute('src') ?? '';
        const previewSrc = resolveImagePreviewSource(original, documentPath, rootUrl, convertFileSrc);
        if (!previewSrc) {
          return;
        }
        image.dataset.markwiselySrc = original;
        image.src = previewSrc;
      });
    };

    void resolveImages().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [documentPath, editor, markdown, mode, rootUrl]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (mode === 'source') {
          sourceView.current?.focus();
          return;
        }
        editor?.commands.focus('end');
      },
      runCommand: (command, payload) => runEditorCommand(command, payload),
      insertMarkdown: (value) => insertMarkdown(value),
    }),
    [editor, markdown, mode],
  );

  const insertMarkdown = (value: string) => {
    if (mode === 'source') {
      insertIntoSource(value);
      return;
    }
    editor?.chain().focus().insertContent(value, { contentType: 'markdown', parseOptions: { preserveWhitespace: false } }).run();
  };

  const runEditorCommand = (command: EditorCommand, payload?: string): boolean => {
    if (mode === 'source') {
      return runSourceCommand(command, payload);
    }
    if (!editor) {
      return false;
    }

    const chain = editor.chain().focus();
    if (command.startsWith('format-heading-')) {
      const level = Number(command.replace('format-heading-', '')) as 1 | 2 | 3 | 4 | 5 | 6;
      return chain.toggleHeading({ level }).run();
    }

    switch (command) {
      case 'focus-editor':
        return editor.commands.focus();
      case 'format-paragraph':
        return chain.setParagraph().run();
      case 'format-bullet-list':
        return chain.toggleBulletList().run();
      case 'format-ordered-list':
        return chain.toggleOrderedList().run();
      case 'format-task-list':
        return chain.toggleTaskList().run();
      case 'format-blockquote':
        return chain.toggleBlockquote().run();
      case 'format-code-block':
        return chain.toggleCodeBlock().run();
      case 'toggle-bold':
        return chain.toggleBold().run();
      case 'toggle-italic':
        return chain.toggleItalic().run();
      case 'toggle-strike':
        return chain.toggleStrike().run();
      case 'toggle-inline-code':
        return chain.toggleCode().run();
      case 'clear-format':
        return chain.unsetAllMarks().clearNodes().run();
      case 'insert-link': {
        if (!payload) {
          return showLinkPopoverForSelection();
        }
        return chain.extendMarkRange('link').setLink({ href: payload }).run();
      }
      case 'insert-image': {
        if (!payload) {
          return showImagePopoverForInsertion();
        }
        return chain.setImage({ src: payload }).run();
      }
      case 'insert-table':
        return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      case 'table-add-row-before':
        return chain.addRowBefore().run();
      case 'table-add-row':
        return chain.addRowAfter().run();
      case 'table-add-column-before':
        return chain.addColumnBefore().run();
      case 'table-delete-row':
        return chain.deleteRow().run();
      case 'table-add-column':
        return chain.addColumnAfter().run();
      case 'table-delete-column':
        return chain.deleteColumn().run();
      case 'table-align-left':
        return chain.setCellAttribute('align', 'left').run();
      case 'table-align-center':
        return chain.setCellAttribute('align', 'center').run();
      case 'table-align-right':
        return chain.setCellAttribute('align', 'right').run();
      case 'table-merge-split':
        return chain.mergeOrSplit().run();
      case 'table-toggle-header-row':
        return chain.toggleHeaderRow().run();
      case 'table-toggle-header-column':
        return chain.toggleHeaderColumn().run();
      case 'table-delete':
        return chain.deleteTable().run();
      case 'insert-horizontal-rule':
        return chain.setHorizontalRule().run();
      case 'insert-toc':
        return chain.insertContent({ type: 'tocBlock' }).run();
      case 'insert-inline-math': {
        const source = payload?.trim() || 'x^2';
        return chain.insertContent({ type: 'inlineMath', attrs: { source } }).run();
      }
      case 'insert-math-block':
        return chain
          .insertContent({
            type: 'mathBlock',
            content: [{ type: 'text', text: 'a^2 + b^2 = c^2' }],
          })
          .run();
      case 'insert-mermaid-block':
        return chain
          .insertContent({
            type: 'codeBlock',
            attrs: { language: 'mermaid' },
            content: [{ type: 'text', text: 'graph TD\n  A[Start] --> B[Write]' }],
          })
          .run();
      default:
        return false;
    }
  };

  const runSourceCommand = (command: EditorCommand, payload?: string): boolean => {
    if (command.startsWith('format-heading-')) {
      const level = Number(command.replace('format-heading-', ''));
      insertIntoSource(`${'#'.repeat(level)} `);
      return true;
    }
    switch (command) {
      case 'focus-editor':
        sourceView.current?.focus();
        return true;
      case 'toggle-bold':
        wrapSourceSelection('**');
        return true;
      case 'toggle-italic':
        wrapSourceSelection('*');
        return true;
      case 'toggle-strike':
        wrapSourceSelection('~~');
        return true;
      case 'toggle-inline-code':
        wrapSourceSelection('`');
        return true;
      case 'format-bullet-list':
        insertIntoSource('- ');
        return true;
      case 'format-ordered-list':
        insertIntoSource('1. ');
        return true;
      case 'format-task-list':
        insertIntoSource('- [ ] ');
        return true;
      case 'format-blockquote':
        insertIntoSource('> ');
        return true;
      case 'format-code-block':
        insertIntoSource('\n```\n\n```\n');
        return true;
      case 'insert-link': {
        const href = payload?.trim() || 'https://';
        insertIntoSource(`[link](${href})`);
        return true;
      }
      case 'insert-image': {
        const src = payload?.trim() || 'image.png';
        insertIntoSource(`![image](${src})`);
        return true;
      }
      case 'insert-table':
        insertIntoSource('\n| Column | Column |\n| --- | --- |\n|  |  |\n');
        return true;
      case 'table-add-row':
      case 'table-add-row-before':
      case 'table-delete-row':
      case 'table-add-column':
      case 'table-add-column-before':
      case 'table-delete-column':
      case 'table-align-left':
      case 'table-align-center':
      case 'table-align-right':
      case 'table-merge-split':
      case 'table-toggle-header-row':
      case 'table-toggle-header-column':
      case 'table-delete':
        return false;
      case 'insert-horizontal-rule':
        insertIntoSource('\n---\n');
        return true;
      case 'insert-toc':
        insertIntoSource('\n[TOC]\n');
        return true;
      case 'insert-inline-math':
        insertIntoSource(`$${payload ?? 'x^2'}$`);
        return true;
      case 'insert-math-block':
        insertIntoSource('\n$$\na^2 + b^2 = c^2\n$$\n');
        return true;
      case 'insert-mermaid-block':
        insertIntoSource('\n```mermaid\ngraph TD\n  A[Start] --> B[Write]\n```\n');
        return true;
      default:
        return false;
    }
  };

  const insertIntoSource = (value: string) => {
    const view = sourceView.current;
    if (!view) {
      onChange(`${markdown}${value}`);
      return;
    }
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: value },
      selection: { anchor: selection.from + value.length },
    });
    view.focus();
  };

  const wrapSourceSelection = (marker: string) => {
    const view = sourceView.current;
    if (!view) {
      onChange(`${markdown}${marker}${marker}`);
      return;
    }
    const selection = view.state.selection.main;
    const selected = view.state.doc.sliceString(selection.from, selection.to);
    const insert = `${marker}${selected}${marker}`;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: {
        anchor: selection.from + marker.length,
        head: selection.from + marker.length + selected.length,
      },
    });
    view.focus();
  };

  const showLinkPopoverForSelection = (): boolean => {
    if (!editor) {
      return false;
    }
    const href = String(editor.getAttributes('link').href ?? '');
    editor.chain().focus().extendMarkRange('link').run();
    const selection = editor.state.selection;
    const coords = editor.view.coordsAtPos(selection.to);
    setImagePopover(null);
    setLinkPopover({
      href,
      from: selection.from,
      to: selection.to,
      ...getPopoverPositionFromPoint(coords.left, coords.bottom, 360),
    });
    return true;
  };

  const showImagePopoverForInsertion = (): boolean => {
    if (!editor) {
      return false;
    }
    editor.commands.focus();
    const coords = editor.view.coordsAtPos(editor.state.selection.to);
    setLinkPopover(null);
    setImagePopover({
      src: '',
      alt: '',
      width: '',
      pos: null,
      ...getPopoverPositionFromPoint(coords.left, coords.bottom, 390),
    });
    return true;
  };

  const applyLinkEdit = (href: string) => {
    if (!editor || !linkPopover) {
      return;
    }
    const next = href.trim();
    const { from, to } = linkPopover;
    if (!next) {
      editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('link').unsetLink().run();
      setLinkPopover(null);
      return;
    }
    if (from === to) {
      editor
        .chain()
        .focus()
        .setTextSelection(from)
        .insertContent({
          type: 'text',
          text: next,
          marks: [{ type: 'link', attrs: { href: next } }],
        })
        .run();
      setLinkPopover(null);
      return;
    }
    editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('link').setLink({ href: next }).run();
    setLinkPopover(null);
  };

  const removeLinkEdit = () => {
    if (!editor || !linkPopover) {
      return;
    }
    editor
      .chain()
      .focus()
      .setTextSelection({ from: linkPopover.from, to: linkPopover.to })
      .extendMarkRange('link')
      .unsetLink()
      .run();
    setLinkPopover(null);
  };

  const applyImageEdit = (src: string, alt: string, width = '') => {
    if (!editor || !imagePopover) {
      return;
    }
    const nextSrc = src.trim();
    const imageAttrs = {
      src: nextSrc,
      alt: alt.trim() || null,
      width: normalizeImageWidthValue(width),
    };
    if (!nextSrc) {
      return;
    }
    if (imagePopover.pos === null) {
      editor.chain().focus().setImage(imageAttrs as { src: string; alt?: string | null; width?: string | null }).run();
      setImagePopover(null);
      return;
    }
    try {
      editor.view.dispatch(editor.view.state.tr.setSelection(NodeSelection.create(editor.view.state.doc, imagePopover.pos)));
      editor.chain().focus().updateAttributes('image', imageAttrs).run();
    } catch {
      editor.chain().focus().setImage(imageAttrs as { src: string; alt?: string | null; width?: string | null }).run();
    }
    setImagePopover(null);
  };

  const removeImageEdit = () => {
    if (!editor || !imagePopover || imagePopover.pos === null) {
      setImagePopover(null);
      return;
    }
    try {
      editor.view.dispatch(editor.view.state.tr.setSelection(NodeSelection.create(editor.view.state.doc, imagePopover.pos)));
      editor.chain().focus().deleteSelection().run();
    } catch {
      editor.commands.focus();
    }
    setImagePopover(null);
  };

  const relocateImageEdit = async (mode: 'copy' | 'move') => {
    if (!imagePopover || !onRelocateImage) {
      return;
    }
    const saved = await onRelocateImage(imagePopover.src.trim(), mode);
    if (saved) {
      applyImageEdit(saved.markdownPath, imagePopover.alt || saved.name, imagePopover.width);
    }
  };

  const applyInlineSourceEdit = (source: string) => {
    if (!editor || !inlineSourcePopover) {
      return;
    }
    editor
      .chain()
      .focus()
      .deleteRange({ from: inlineSourcePopover.from, to: inlineSourcePopover.to })
      .insertContent(source, { contentType: 'markdown' })
      .run();
    setInlineSourcePopover(null);
  };

  const handlePaste = async (event: ClipboardEvent) => {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      return;
    }
    event.preventDefault();
    await insertImageFiles(imageFiles);
  };

  const handleDrop = async (event: DragEvent) => {
    const imageFiles = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      return;
    }
    event.preventDefault();
    await insertImageFiles(imageFiles);
  };

  const insertImageFiles = async (files: File[]) => {
    for (const file of files) {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const saved = onSaveImage
        ? await onSaveImage(file.name || 'image.png', bytes)
        : { markdownPath: URL.createObjectURL(file), name: file.name || 'image' };
      if (mode === 'source') {
        insertMarkdown(`![${saved.name}](${saved.markdownPath})`);
      } else {
        runEditorCommand('insert-image', saved.markdownPath);
      }
    }
  };

  const revealInlineSyntaxFromPointer = (target: EventTarget | null) => {
    if (!showSyntaxOnFocusRef.current || !editor || !(target instanceof HTMLElement) || !editor.view.dom.contains(target)) {
      return;
    }
    clearActiveInlineSyntax(editor.view.dom);
    markInlineSyntaxFromElement(editor.view.dom, target);
  };

  return (
    <section
      className="editor-surface"
      aria-label="Markdown editor"
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()}
      data-testid="markdown-editor"
    >
      {mode === 'source' ? (
        <Suspense fallback={null}>
          <SourceCodeEditor
            value={markdown}
            theme={theme}
            onChange={onChange}
            onCreateEditor={(view) => {
              sourceView.current = view;
            }}
          />
        </Suspense>
      ) : (
        <div
          className="wysiwyg-scroll"
          data-focus-mode={focusMode ? 'true' : 'false'}
          data-theme={theme}
          onMouseMove={(event) => revealInlineSyntaxFromPointer(event.target)}
          onMouseLeave={() => editor && clearActiveInlineSyntax(editor.view.dom)}
        >
          <EditorContent editor={editor} />
          {tableControlsVisible && (
            <div className="table-context-menu" aria-label="Table controls">
              <button type="button" title="Add row before" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-add-row-before')}>
                R+
              </button>
              <button type="button" title="Add row" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-add-row')}>
                +R
              </button>
              <button type="button" title="Delete row" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-delete-row')}>
                -R
              </button>
              <button type="button" title="Add column before" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-add-column-before')}>
                C+
              </button>
              <button type="button" title="Add column" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-add-column')}>
                +C
              </button>
              <button type="button" title="Delete column" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-delete-column')}>
                -C
              </button>
              <button type="button" className={tableAlign === 'left' ? 'active' : ''} title="Align left" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-align-left')}>
                L
              </button>
              <button type="button" className={tableAlign === 'center' ? 'active' : ''} title="Align center" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-align-center')}>
                C
              </button>
              <button type="button" className={tableAlign === 'right' ? 'active' : ''} title="Align right" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-align-right')}>
                R
              </button>
              <button type="button" title="Merge or split cells" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-merge-split')}>
                M/S
              </button>
              <button type="button" title="Toggle header row" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-toggle-header-row')}>
                HR
              </button>
              <button type="button" title="Toggle header column" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-toggle-header-column')}>
                HC
              </button>
              <button type="button" title="Delete table" onMouseDown={(event) => event.preventDefault()} onClick={() => runEditorCommand('table-delete')}>
                Del
              </button>
            </div>
          )}
          {linkPopover && (
            <LinkEditPopover
              state={linkPopover}
              onApply={applyLinkEdit}
              onRemove={removeLinkEdit}
              onOpen={(href) => window.open(href, '_blank', 'noopener,noreferrer')}
              onClose={() => setLinkPopover(null)}
            />
          )}
          {imagePopover && (
            <ImageEditPopover
              state={imagePopover}
              canRelocate={Boolean(onRelocateImage && imagePopover.src.trim() && !isExternalOrDataUrl(imagePopover.src))}
              onApply={applyImageEdit}
              onRemove={removeImageEdit}
              onRelocate={relocateImageEdit}
              onClose={() => setImagePopover(null)}
            />
          )}
          {inlineSourcePopover && !linkPopover && !imagePopover && (
            <InlineSourcePopover
              state={inlineSourcePopover}
              onApply={applyInlineSourceEdit}
              onClose={() => setInlineSourcePopover(null)}
            />
          )}
        </div>
      )}
    </section>
  );
});

function LinkEditPopover({
  state,
  onApply,
  onRemove,
  onOpen,
  onClose,
}: {
  state: LinkPopoverState;
  onApply: (href: string) => void;
  onRemove: () => void;
  onOpen: (href: string) => void;
  onClose: () => void;
}) {
  const [href, setHref] = useState(state.href);

  useEffect(() => {
    setHref(state.href);
  }, [state.href, state.from, state.to]);

  return (
    <form
      className="inline-edit-popover link-edit-popover"
      style={{ top: state.top, left: state.left }}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(href);
      }}
    >
      <div className="inline-edit-title">Link</div>
      <input
        aria-label="Link URL"
        autoFocus
        value={href}
        placeholder="https://"
        onChange={(event) => setHref(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <div className="inline-edit-actions">
        <button type="submit">Apply</button>
        <button type="button" disabled={!href.trim()} onClick={() => onOpen(href.trim())}>
          Open
        </button>
        <button type="button" onClick={onRemove}>
          Remove
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  );
}

function InlineSourcePopover({
  state,
  onApply,
  onClose,
}: {
  state: InlineSourcePopoverState;
  onApply: (source: string) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState(state.source);

  useEffect(() => {
    setSource(state.source);
  }, [state.from, state.source, state.to]);

  return (
    <form
      className="inline-source-popover"
      style={{ top: state.top, left: state.left }}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(source);
      }}
    >
      <input
        aria-label={`${state.markName} Markdown source`}
        value={source}
        onChange={(event) => setSource(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <button type="submit">Apply</button>
    </form>
  );
}

function ImageEditPopover({
  state,
  canRelocate,
  onApply,
  onRemove,
  onRelocate,
  onClose,
}: {
  state: ImagePopoverState;
  canRelocate: boolean;
  onApply: (src: string, alt: string, width: string) => void;
  onRemove: () => void;
  onRelocate: (mode: 'copy' | 'move') => Promise<void>;
  onClose: () => void;
}) {
  const [src, setSrc] = useState(state.src);
  const [alt, setAlt] = useState(state.alt);
  const [width, setWidth] = useState(state.width);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSrc(state.src);
    setAlt(state.alt);
    setWidth(state.width);
  }, [state.alt, state.pos, state.src, state.width]);

  const relocate = async (mode: 'copy' | 'move') => {
    setBusy(true);
    try {
      await onRelocate(mode);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="inline-edit-popover image-edit-popover"
      style={{ top: state.top, left: state.left }}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(src, alt, width);
      }}
    >
      <div className="inline-edit-title">Image</div>
      <label>
        <span>Path</span>
        <input
          aria-label="Image path"
          autoFocus
          value={src}
          placeholder="assets/image.png"
          onChange={(event) => setSrc(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
        />
      </label>
      <label>
        <span>Alt</span>
        <input
          aria-label="Image alt text"
          value={alt}
          placeholder="Description"
          onChange={(event) => setAlt(event.target.value)}
        />
      </label>
      <label>
        <span>Width</span>
        <input
          aria-label="Image width"
          value={width}
          placeholder="320 or 50%"
          onChange={(event) => setWidth(event.target.value)}
        />
      </label>
      <div className="inline-edit-actions">
        <button type="submit" disabled={!src.trim()}>
          Apply
        </button>
        <button type="button" disabled={!canRelocate || busy} onClick={() => void relocate('copy')}>
          Copy To
        </button>
        <button type="button" disabled={!canRelocate || busy} onClick={() => void relocate('move')}>
          Move To
        </button>
        <button type="button" onClick={onRemove}>
          Remove
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  );
}

const imageWithWidthInputRegex = /(?:^|\s)(!\[([^\]]*)]\((<[^>]+>|[^\s)]+)(?:\s+["']([^"']*)["'])?\)\{width=([0-9]+(?:px|%)?)\})$/;
const imageWithWidthTokenRegex = /^!\[([^\]]*)]\((<[^>]+>|[^\s)]+)(?:\s+["']([^"']*)["'])?\)\{width=([0-9]+(?:px|%)?)\}/;

export const MarkdownImage = Image.extend({
  addInputRules() {
    return [
      nodeInputRule({
        find: imageWithWidthInputRegex,
        type: this.type,
        getAttributes: (match) => ({
          src: unwrapMarkdownDestination(match[3]),
          alt: match[2] || null,
          title: match[4] || null,
          width: normalizeImageWidthValue(match[5]),
        }),
      }),
    ];
  },

  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) => {
    return helpers.createNode('image', {
      src: token.href,
      title: token.title || null,
      alt: token.text || null,
      width: normalizeImageWidthValue(token.width),
    });
  },

  renderMarkdown: (node: JSONContent) => {
    const src = node.attrs?.src ?? '';
    const alt = node.attrs?.alt ?? '';
    const title = node.attrs?.title ?? '';
    const width = normalizeImageWidthValue(node.attrs?.width);
    const titleSuffix = title ? ` "${title}"` : '';
    const widthSuffix = width ? `{width=${width}}` : '';
    return `![${alt}](${src}${titleSuffix})${widthSuffix}`;
  },

  markdownTokenizer: {
    name: 'image',
    level: 'inline',
    start: (src: string) => src.indexOf('!['),
    tokenize: (src: string) => {
      const match = imageWithWidthTokenRegex.exec(src);
      if (!match) {
        return undefined;
      }
      return {
        type: 'image',
        raw: match[0],
        href: unwrapMarkdownDestination(match[2]),
        title: match[3] || null,
        text: match[1] || '',
        width: normalizeImageWidthValue(match[4]),
      };
    },
  },
});

function normalizeImageWidthValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const width = String(value).trim();
  if (!width) {
    return null;
  }
  const match = /^([1-9]\d{0,3})(px|%)?$/.exec(width);
  if (!match) {
    return null;
  }
  return `${match[1]}${match[2] ?? ''}`;
}

function unwrapMarkdownDestination(destination: string): string {
  return destination.startsWith('<') && destination.endsWith('>') ? destination.slice(1, -1) : destination;
}

function isExternalOrDataUrl(src: string): boolean {
  return /^(https?:|data:|blob:|asset:|file:)/i.test(src);
}

function resolveImagePreviewSource(
  src: string,
  documentPath: string | null,
  rootUrl: string | null,
  convertFileSrc: (filePath: string) => string,
): string | null {
  const original = src.trim();
  if (!original || isExternalOrDataUrl(original)) {
    return null;
  }

  if (isAbsolutePath(original)) {
    return convertFileSrc(original);
  }

  const imageRoot = rootUrl?.trim();
  if (imageRoot) {
    if (/^https?:\/\//i.test(imageRoot)) {
      return joinUrl(imageRoot, original);
    }
    if (isAbsolutePath(imageRoot)) {
      return convertFileSrc(joinPath(imageRoot, original));
    }
    if (documentPath) {
      return convertFileSrc(resolveRelativePath(documentPath, joinPath(imageRoot, original)));
    }
  }

  if (!documentPath) {
    return null;
  }
  return convertFileSrc(resolveRelativePath(documentPath, original));
}

function selectNodeNear(view: Editor['view'], pos: number): number | null {
  const candidates = [pos, pos - 1, pos + 1].filter((candidate) => candidate >= 0 && candidate <= view.state.doc.content.size);
  for (const candidate of candidates) {
    try {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, candidate)));
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function getPopoverPosition(rect: DOMRect, width: number) {
  return getPopoverPositionFromPoint(rect.left, rect.bottom, width);
}

function getPopoverPositionFromPoint(left: number, bottom: number, width: number) {
  const margin = 12;
  const availableWidth = Math.max(width, window.innerWidth - margin * 2);
  const clampedLeft = Math.min(Math.max(margin, left), availableWidth - width + margin);
  const clampedTop = Math.min(Math.max(margin, bottom + 8), Math.max(margin, window.innerHeight - 240));
  return {
    top: clampedTop,
    left: clampedLeft,
  };
}

function isAbsolutePath(src: string): boolean {
  return src.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(src);
}

function resolveRelativePath(documentPath: string, src: string): string {
  const separator = documentPath.includes('\\') ? '\\' : '/';
  const parts = documentPath.split(/[\\/]/);
  parts.pop();
  return `${parts.join(separator)}${separator}${src.replace(/[\\/]/g, separator)}`;
}

function joinUrl(base: string, child: string): string {
  return `${base.replace(/\/+$/, '')}/${child.replace(/^\/+/, '')}`;
}

function joinPath(base: string, child: string): string {
  const separator = base.includes('\\') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${separator}${child.replace(/^[\\/]+/, '').replace(/[\\/]/g, separator)}`;
}

const MarkdownInputShortcuts = Extension.create({
  name: 'markdownInputShortcuts',

  addKeyboardShortcuts() {
    return {
      Space: () => {
        const cursor = getTextBeforeCursor(this.editor);
        if (!cursor) {
          return false;
        }

        if (cursor.text === '$$') {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .setNode('mathBlock')
            .run();
        }

        if (/^\[toc\]$/i.test(cursor.text)) {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .insertContent({ type: 'tocBlock' })
            .run();
        }

        const heading = /^(#{1,6})$/.exec(cursor.text);
        if (heading) {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .setHeading({ level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6 })
            .run();
        }

        if (/^[-*+]$/.test(cursor.text)) {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .toggleBulletList()
            .run();
        }

        if (/^\d+\.$/.test(cursor.text)) {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .toggleOrderedList()
            .run();
        }

        if (/^- \[[ xX]\]$/.test(cursor.text)) {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .toggleTaskList()
            .run();
        }

        if (cursor.text === '>') {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .toggleBlockquote()
            .run();
        }

        return false;
      },
      Enter: () => {
        const cursor = getTextBeforeCursor(this.editor);
        if (!cursor) {
          return false;
        }

        const codeFence = /^(```|~~~)([a-zA-Z0-9_-]+)?$/.exec(cursor.text);
        if (codeFence) {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .setCodeBlock({ language: codeFence[2] || null })
            .run();
        }

        const tableFromParagraphs = getMarkdownTableAtCursor(this.editor);
        if (tableFromParagraphs) {
          return this.editor
            .chain()
            .deleteRange({ from: tableFromParagraphs.from, to: tableFromParagraphs.to })
            .insertContentAt(tableFromParagraphs.from, tableFromParagraphs.content)
            .run();
        }

        if (cursor.text === '---' && cursor.from === 1) {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .setNode('frontMatterBlock')
            .run();
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(cursor.text)) {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .setHorizontalRule()
            .run();
        }

        if (cursor.text === '$$') {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .setNode('mathBlock')
            .run();
        }

        if (/^\[toc\]$/i.test(cursor.text)) {
          return this.editor
            .chain()
            .deleteRange({ from: cursor.from, to: cursor.to })
            .insertContent({ type: 'tocBlock' })
            .run();
        }

        return false;
      },
    };
  },
});

const ActiveSyntaxMarks = Extension.create({
  name: 'activeSyntaxMarks',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('activeSyntaxMarks'),
        props: {
          decorations: (state) => {
            if (!state.selection.empty) {
              return DecorationSet.empty;
            }

            const decorations = [
              { markName: 'bold', className: 'markwisely-active-bold' },
              { markName: 'italic', className: 'markwisely-active-italic' },
              { markName: 'strike', className: 'markwisely-active-strike' },
              { markName: 'code', className: 'markwisely-active-code' },
              { markName: 'link', className: 'markwisely-active-link' },
            ].flatMap(({ markName, className }) => {
              const range = getActiveMarkRangeFromState(state, markName);
              if (!range) {
                return [];
              }
              return [
                Decoration.inline(
                  range.from,
                  range.to,
                  {
                    class: className,
                    ...(markName === 'link' ? { 'data-markwisely-href': String(range.attrs?.href ?? '') } : {}),
                  },
                  { inclusiveStart: true, inclusiveEnd: true },
                ),
              ];
            });

            return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

const PreviewCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({
  enableTabIndentation: true,
});

export const FrontMatterBlock = Node.create({
  name: 'frontMatterBlock',
  priority: 1000,
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="front-matter-block"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'front-matter-block' }, ['pre', ['code', 0]]];
  },

  markdownTokenName: 'frontMatterBlock',

  markdownTokenizer: {
    name: 'frontMatterBlock',
    level: 'block',
    start: '---',
    tokenize(src: string, tokens?: unknown[]) {
      if (tokens && tokens.length > 0) {
        return undefined;
      }
      const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?=\n|$)/.exec(src);
      if (!match || !looksLikeYamlFrontMatter(match[1])) {
        return undefined;
      }
      return {
        type: 'frontMatterBlock',
        raw: match[0],
        text: match[1],
      };
    },
  },

  parseMarkdown: (token: { text?: string }, helpers: { createNode: Function; createTextNode: Function }) => {
    const text = token.text ?? '';
    return helpers.createNode('frontMatterBlock', undefined, text ? [helpers.createTextNode(text)] : []);
  },

  renderMarkdown: (node: { content?: Array<{ text?: string }> }, helpers: { renderChildren: Function }) => {
    const source = node.content ? helpers.renderChildren(node.content) : '';
    return `---\n${source}\n---`;
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^---$/,
        handler: ({ state, range }) => {
          if (range.from !== 1) {
            return null;
          }
          const $start = state.doc.resolve(range.from);
          if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), this.type)) {
            return null;
          }
          state.tr.delete(range.from, range.to).setBlockType(range.from, range.from, this.type);
          return true;
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      ArrowDown: () => exitEditableBlock(this.editor, this.name),
      'Mod-Enter': () => exitEditableBlock(this.editor, this.name),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(FrontMatterBlockView);
  },
});

function looksLikeYamlFrontMatter(source: string): boolean {
  const lines = source.split(/\r?\n/).map((line) => line.trim());
  const meaningfulLines = lines.filter((line) => line && !line.startsWith('#'));
  if (meaningfulLines.length === 0) {
    return false;
  }

  return meaningfulLines.some((line) => /^[A-Za-z_][\w.-]*\s*:/.test(line));
}

function FrontMatterBlockView() {
  return (
    <NodeViewWrapper className="front-matter-block-view">
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'math-block' }, ['pre', ['code', 0]]];
  },

  markdownTokenName: 'mathBlock',

  markdownTokenizer: {
    name: 'mathBlock',
    level: 'block',
    start: '$$',
    tokenize(src: string) {
      const match = /^(?:[ \t]*)\$\$[ \t]*\n([\s\S]*?)\n[ \t]*\$\$(?=\n|$)/.exec(src);
      if (!match) {
        const inline = /^(?:[ \t]*)\$\$([^\n]+?)\$\$(?=\n|$)/.exec(src);
        if (!inline) {
          return undefined;
        }
        return {
          type: 'mathBlock',
          raw: inline[0],
          text: inline[1].trim(),
        };
      }
      return {
        type: 'mathBlock',
        raw: match[0],
        text: match[1],
      };
    },
  },

  parseMarkdown: (token: { text?: string }, helpers: { createNode: Function; createTextNode: Function }) => {
    const text = token.text ?? '';
    return helpers.createNode('mathBlock', undefined, text ? [helpers.createTextNode(text)] : []);
  },

  renderMarkdown: (node: { content?: Array<{ text?: string }> }, helpers: { renderChildren: Function }) => {
    const source = node.content ? helpers.renderChildren(node.content) : '';
    return `$$\n${source}\n$$`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  addKeyboardShortcuts() {
    return {
      ArrowDown: () => exitEditableBlock(this.editor, this.name),
      'Mod-Enter': () => exitEditableBlock(this.editor, this.name),
    };
  },
});

function MathBlockView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper className="math-block-view">
      <pre>
        <NodeViewContent as="code" />
      </pre>
      <InlineMathPreview source={node.textContent} />
    </NodeViewWrapper>
  );
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-source') ?? '',
        renderHTML: (attributes: { source?: string }) => ({
          'data-source': attributes.source ?? '',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, 'data-type': 'inline-math' }];
  },

  markdownTokenName: 'inlineMath',

  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: '$',
    tokenize(src: string) {
      if (src.startsWith('$$')) {
        return undefined;
      }
      const match = /^\$((?:\\\$|[^$\n])+?)\$(?!\$)/.exec(src);
      if (!match) {
        return undefined;
      }
      return {
        type: 'inlineMath',
        raw: match[0],
        text: match[1].replace(/\\\$/g, '$'),
      };
    },
  },

  parseMarkdown: (token: { text?: string }, helpers: { createNode: Function }) => {
    return helpers.createNode('inlineMath', { source: token.text ?? '' });
  },

  renderMarkdown: (node: { attrs?: { source?: string } }) => {
    const source = (node.attrs?.source ?? '').replace(/\$/g, '\\$');
    return `$${source}$`;
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\$([^$\n]+)\$$/,
        handler: ({ range, match, chain }) => {
          chain()
            .deleteRange(range)
            .insertContent({ type: this.name, attrs: { source: match[1] } })
            .run();
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineMathNodeView);
  },
});

function InlineMathNodeView({ node, selected, updateAttributes }: NodeViewProps) {
  const source = String(node.attrs.source ?? '');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source);

  useEffect(() => {
    setDraft(source);
  }, [source]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== source) {
      updateAttributes({ source: next });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <NodeViewWrapper as="span" className="inline-math-node editing" contentEditable={false}>
        <span className="inline-math-delimiter">$</span>
        <input
          aria-label="Inline math source"
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(source);
              setEditing(false);
            }
          }}
        />
        <span className="inline-math-delimiter">$</span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`inline-math-node ${selected ? 'selected' : ''}`}
      contentEditable={false}
      title={`$${source}$`}
      onDoubleClick={() => setEditing(true)}
    >
      {selected ? <span className="inline-math-source">${source}$</span> : <InlineKatexPreview source={source} />}
    </NodeViewWrapper>
  );
}

function InlineKatexPreview({ source }: { source: string }) {
  const [html, setHtml] = useState(() => escapeHtml(source));

  useEffect(() => {
    return renderKatexAsync(source, false, setHtml);
  }, [source]);

  return <span className="inline-katex-preview" dangerouslySetInnerHTML={{ __html: html || escapeHtml(source) }} />;
}

type KatexApi = typeof import('katex')['default'];

let katexLoadPromise: Promise<KatexApi> | null = null;

function loadKatex(): Promise<KatexApi> {
  katexLoadPromise ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([module]) => module.default);
  return katexLoadPromise;
}

function renderKatexAsync(
  source: string,
  displayMode: boolean,
  onHtml: (html: string) => void,
): () => void {
  if (!source.trim()) {
    onHtml('');
    return () => undefined;
  }

  let cancelled = false;
  onHtml(escapeHtml(source));
  loadKatex()
    .then((katex) => {
      if (cancelled) {
        return;
      }
      onHtml(
        katex.renderToString(source, {
          displayMode,
          throwOnError: false,
          strict: false,
        }),
      );
    })
    .catch((error) => {
      if (!cancelled) {
        onHtml(`<span class="live-preview-error">${escapeHtml(formatError(error))}</span>`);
      }
    });

  return () => {
    cancelled = true;
  };
}

export const TocBlock = Node.create({
  name: 'tocBlock',
  group: 'block',
  atom: true,
  selectable: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="toc-block"]' }];
  },

  renderHTML() {
    return ['div', { 'data-type': 'toc-block' }];
  },

  markdownTokenName: 'tocBlock',

  markdownTokenizer: {
    name: 'tocBlock',
    level: 'block',
    start: (src: string) => {
      const match = /\[toc\]/i.exec(src);
      return match?.index ?? -1;
    },
    tokenize(src: string) {
      const match = /^\[toc\][ \t]*(?=\n|$)/i.exec(src);
      if (!match) {
        return undefined;
      }
      return {
        type: 'tocBlock',
        raw: match[0],
      };
    },
  },

  parseMarkdown: (_token: unknown, helpers: { createNode: Function }) => helpers.createNode('tocBlock'),

  renderMarkdown: () => '[TOC]',

  addInputRules() {
    return [
      new InputRule({
        find: /^\[toc\]$/i,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).insertContent({ type: this.name }).run();
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TocBlockView);
  },
});

type EditorHeading = {
  level: number;
  text: string;
  pos: number;
};

function TocBlockView({ editor }: NodeViewProps) {
  const [items, setItems] = useState<EditorHeading[]>(() => getEditorHeadings(editor));

  useEffect(() => {
    const update = () => setItems(getEditorHeadings(editor));
    editor.on('update', update);
    editor.on('selectionUpdate', update);
    update();
    return () => {
      editor.off('update', update);
      editor.off('selectionUpdate', update);
    };
  }, [editor]);

  return (
    <NodeViewWrapper className="toc-block-view" contentEditable={false}>
      {items.length === 0 ? (
        <div className="toc-empty">Table of contents</div>
      ) : (
        <nav aria-label="Table of contents">
          {items.map((item) => (
            <button
              key={`${item.pos}-${item.text}`}
              type="button"
              style={{ paddingLeft: 8 + (item.level - 1) * 14 }}
              onClick={() => {
                editor.chain().focus().setTextSelection(item.pos + 1).run();
                scrollActiveBlockToCenter(editor);
              }}
            >
              {item.text}
            </button>
          ))}
        </nav>
      )}
    </NodeViewWrapper>
  );
}

function getEditorHeadings(editor: Editor): EditorHeading[] {
  const headings: EditorHeading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') {
      return;
    }
    const text = node.textContent.trim();
    if (!text) {
      return;
    }
    headings.push({
      level: Number(node.attrs.level ?? 1),
      text,
      pos,
    });
  });
  return headings;
}

function InlineMathPreview({ source }: { source: string }) {
  const [html, setHtml] = useState(() => escapeHtml(source));

  useEffect(() => {
    return renderKatexAsync(source, true, setHtml);
  }, [source]);

  if (!html) {
    return null;
  }

  return <div className="inline-math-preview" aria-label="Math preview" dangerouslySetInnerHTML={{ __html: html }} />;
}

function CodeBlockView({ node }: NodeViewProps) {
  const language = String(node.attrs.language ?? '').toLowerCase();
  const source = node.textContent;
  const isMermaid = language === 'mermaid';

  return (
    <NodeViewWrapper className={`code-block-view ${isMermaid ? 'mermaid-code-block' : ''}`}>
      <pre>
        <NodeViewContent as="code" />
      </pre>
      {isMermaid && <InlineMermaidPreview source={source} />}
    </NodeViewWrapper>
  );
}

function InlineMermaidPreview({ source }: { source: string }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!source.trim()) {
      setHtml('');
      setError('');
      return;
    }

    let cancelled = false;
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';
    const id = `markwisely-inline-${Math.abs(hashText(source))}`;

    import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme,
        });
        return mermaid.render(id, source);
      })
      .then((result) => {
        if (!cancelled) {
          setHtml(result.svg);
          setError('');
        }
      })
      .catch((renderError) => {
        if (!cancelled) {
          setHtml('');
          setError(formatError(renderError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <div className="inline-mermaid-preview" aria-label="Mermaid preview">
      {error ? <pre className="live-preview-error">{error}</pre> : <div dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  );
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function exitEditableBlock(editor: Editor, nodeName: string): boolean {
  const { selection } = editor.state;
  if (!selection.empty) {
    return false;
  }
  const { $from } = selection;
  if ($from.parent.type.name !== nodeName || $from.parentOffset !== $from.parent.content.size) {
    return false;
  }
  const insertAt = $from.after();
  return editor.chain().insertContentAt(insertAt, { type: 'paragraph' }).setTextSelection(insertAt + 1).run();
}

function getTextBeforeCursor(editor: Editor): { text: string; from: number; to: number } | null {
  const { state } = editor;
  const { $from } = state.selection;
  if (!$from.parent.isTextblock) {
    return null;
  }
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
  return {
    text,
    from: $from.pos - text.length,
    to: $from.pos,
  };
}

function getMarkdownTableAtCursor(editor: Editor): { from: number; to: number; content: Record<string, unknown> } | null {
  const { state } = editor;
  const { selection } = state;
  if (!selection.empty) {
    return null;
  }

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.name !== 'paragraph') {
    return null;
  }

  const delimiter = parseTableDelimiter($from.parent.textContent);
  if (!delimiter) {
    return null;
  }

  const containerDepth = $from.depth - 1;
  const currentIndex = $from.index(containerDepth);
  if (currentIndex <= 0) {
    return null;
  }

  const previous = $from.node(containerDepth).child(currentIndex - 1);
  if (previous.type.name !== 'paragraph') {
    return null;
  }

  const headers = parseTableRow(previous.textContent);
  if (!headers || headers.length !== delimiter.alignments.length) {
    return null;
  }

  const from = $from.before($from.depth) - previous.nodeSize;
  const to = $from.after($from.depth);
  return {
    from,
    to,
    content: buildTableContent(headers, delimiter.alignments),
  };
}

function parseTableRow(source: string): string[] | null {
  const text = source.trim();
  if (!text.includes('|')) {
    return null;
  }
  const cells = text
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
  return cells.length > 1 ? cells : null;
}

function parseTableDelimiter(source: string): { alignments: Array<'left' | 'center' | 'right' | null> } | null {
  const cells = parseTableRow(source);
  if (!cells) {
    return null;
  }

  const alignments = cells.map((cell) => {
    if (!/^:?-{3,}:?$/.test(cell)) {
      return undefined;
    }
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) {
      return 'center' as const;
    }
    if (right) {
      return 'right' as const;
    }
    if (left) {
      return 'left' as const;
    }
    return null;
  });

  if (alignments.some((alignment) => alignment === undefined)) {
    return null;
  }
  return { alignments: alignments as Array<'left' | 'center' | 'right' | null> };
}

function buildTableContent(headers: string[], alignments: Array<'left' | 'center' | 'right' | null>) {
  return {
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: headers.map((header, index) => buildTableCell('tableHeader', header, alignments[index])),
      },
      {
        type: 'tableRow',
        content: headers.map((_header, index) => buildTableCell('tableCell', '', alignments[index])),
      },
    ],
  };
}

function buildTableCell(type: 'tableCell' | 'tableHeader', text: string, align: 'left' | 'center' | 'right' | null) {
  const cell: Record<string, unknown> = {
    type,
    content: [
      {
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : [],
      },
    ],
  };
  if (align) {
    cell.attrs = { align };
  }
  return cell;
}

function getActiveTableCellAlign(editor: Editor): 'left' | 'center' | 'right' | null {
  if (!editor.isActive('table')) {
    return null;
  }
  const attrs = editor.isActive('tableHeader') ? editor.getAttributes('tableHeader') : editor.getAttributes('tableCell');
  const align = attrs.align;
  return align === 'left' || align === 'center' || align === 'right' ? align : null;
}

function buildInlineSourcePopover(editor: Editor): InlineSourcePopoverState | null {
  if (!editor.view.hasFocus() || !editor.state.selection.empty) {
    return null;
  }

  const codeRange = getActiveMarkRangeFromState(editor.state, 'code');
  if (codeRange) {
    const text = editor.state.doc.textBetween(codeRange.from, codeRange.to, undefined, '\ufffc');
    if (!text) {
      return null;
    }
    const coords = editor.view.coordsAtPos(codeRange.to);
    return {
      markName: 'code',
      source: wrapInlineMarkdownSource(['code'], text),
      from: codeRange.from,
      to: codeRange.to,
      ...getPopoverPositionFromPoint(coords.left, coords.bottom, 330),
    };
  }

  const activeMarks = (['bold', 'italic', 'strike'] as const)
    .map((markName) => ({ markName, range: getActiveMarkRangeFromState(editor.state, markName) }))
    .filter((item): item is { markName: Exclude<InlineSourceMarkName, 'code'>; range: { from: number; to: number } } => Boolean(item.range));

  if (activeMarks.length === 0) {
    return null;
  }

  const from = Math.max(...activeMarks.map(({ range }) => range.from));
  const to = Math.min(...activeMarks.map(({ range }) => range.to));
  if (from >= to) {
    return null;
  }

  const marks = activeMarks
    .filter(({ range }) => range.from <= from && range.to >= to)
    .map(({ markName }) => markName);
  const text = editor.state.doc.textBetween(from, to, undefined, '\ufffc');
  if (!text || marks.length === 0) {
    return null;
  }

  const coords = editor.view.coordsAtPos(to);
  return {
    markName: marks.length === 1 ? marks[0] : 'mixed',
    source: wrapInlineMarkdownSource(marks, text),
    from,
    to,
    ...getPopoverPositionFromPoint(coords.left, coords.bottom, 330),
  };
}

function wrapInlineMarkdownSource(markNames: InlineSourceMarkName[], text: string): string {
  if (markNames.includes('code')) {
    return `\`${text.replace(/`/g, '\\`')}\``;
  }

  let source = text;
  if (markNames.includes('italic')) {
    source = `*${source}*`;
  }
  if (markNames.includes('bold')) {
    source = `**${source}**`;
  }
  if (markNames.includes('strike')) {
    source = `~~${source}~~`;
  }
  return source;
}

function markActiveBlock(editor: Editor) {
  const root = editor.view.dom;
  root.querySelectorAll('.markwisely-active-block').forEach((node) => node.classList.remove('markwisely-active-block'));

  let domNode: globalThis.Node | null = null;
  try {
    domNode = editor.view.domAtPos(editor.state.selection.from).node;
  } catch {
    return;
  }

  const element = domNode.nodeType === globalThis.Node.TEXT_NODE ? domNode.parentElement : (domNode as HTMLElement);
  const block = element ? getDirectEditorChild(element, root) : null;
  block?.classList.add('markwisely-active-block');
}

function scheduleActiveSyntaxRefresh(editor: Editor | null, fallbackElement?: HTMLElement | null) {
  if (!editor) {
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      markActiveBlock(editor);
      markActiveInlineSyntax(editor);
      if (
        fallbackElement &&
        editor.view.dom.querySelectorAll(
          '.markwisely-active-bold, .markwisely-active-italic, .markwisely-active-strike, .markwisely-active-code, .markwisely-active-link',
        ).length === 0
      ) {
        markInlineSyntaxFromElement(editor.view.dom, fallbackElement);
      }
    });
  });
}

function markActiveInlineSyntax(editor: Editor) {
  const root = editor.view.dom;
  clearActiveInlineSyntax(root);

  let domNode: globalThis.Node | null = null;
  try {
    domNode = editor.view.domAtPos(editor.state.selection.from).node;
  } catch {
    return;
  }

  const element = domNode.nodeType === globalThis.Node.TEXT_NODE ? domNode.parentElement : (domNode as HTMLElement);
  if (!element || !root.contains(element)) {
    return;
  }

  [
    { markName: 'bold', selector: 'strong', className: 'markwisely-active-bold' },
    { markName: 'italic', selector: 'em', className: 'markwisely-active-italic' },
    { markName: 'strike', selector: 's', className: 'markwisely-active-strike' },
    { markName: 'code', selector: 'code', className: 'markwisely-active-code' },
    { markName: 'link', selector: 'a[href]', className: 'markwisely-active-link' },
  ].forEach(({ markName, selector, className }) => {
    const range = getActiveMarkRange(editor, markName);
    if (!range) {
      return;
    }
    const target = findInlineElementForRange(editor, selector, range.from, range.to);
    if (!target || (markName === 'code' && target.closest('pre'))) {
      return;
    }
    target.classList.add(className);
  });
}

function clearActiveInlineSyntax(root: HTMLElement) {
  root
    .querySelectorAll('.markwisely-active-bold, .markwisely-active-italic, .markwisely-active-strike, .markwisely-active-code, .markwisely-active-link')
    .forEach((node) => {
      node.classList.remove(
        'markwisely-active-bold',
        'markwisely-active-italic',
        'markwisely-active-strike',
        'markwisely-active-code',
        'markwisely-active-link',
      );
    });
}

function markInlineSyntaxFromMouseEvent(root: HTMLElement, event: Event) {
  if (!(event instanceof MouseEvent)) {
    return;
  }
  const pointTarget = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
  const target = pointTarget && root.contains(pointTarget) ? pointTarget : (event.target as HTMLElement | null);
  if (!target || !root.contains(target)) {
    return;
  }
  clearActiveInlineSyntax(root);
  markInlineSyntaxFromElement(root, target);
}

function markInlineSyntaxFromElement(root: HTMLElement, element: HTMLElement): boolean {
  const activeSyntax = [
    { selector: 'strong', className: 'markwisely-active-bold' },
    { selector: 'em', className: 'markwisely-active-italic' },
    { selector: 's', className: 'markwisely-active-strike' },
    { selector: 'code', className: 'markwisely-active-code' },
    { selector: 'a[href]', className: 'markwisely-active-link' },
  ];

  let marked = false;
  activeSyntax.forEach(({ selector, className }) => {
    const target = element.closest(selector) as HTMLElement | null;
    if (!target || !root.contains(target) || (selector === 'code' && target.closest('pre'))) {
      return;
    }
    target.classList.add(className);
    marked = true;
  });
  return marked;
}

function getActiveMarkRange(editor: Editor, markName: string): { from: number; to: number } | null {
  const range = getActiveMarkRangeFromState(editor.state, markName);
  return range ? { from: range.from, to: range.to } : null;
}

function getActiveMarkRangeFromState(state: Editor['state'], markName: string): { from: number; to: number; attrs?: Record<string, unknown> } | null {
  if (!state.selection.empty) {
    return null;
  }

  const markType = state.schema.marks[markName];
  if (!markType) {
    return null;
  }

  const { from } = state.selection;
  const probes = [from, from - 1, from + 1].filter((pos) => pos > 0 && pos < state.doc.content.size);
  for (const pos of probes) {
    const range = findMarkRangeAroundPosition(state, markName, pos);
    if (range) {
      return range;
    }
  }
  return null;
}

function findMarkRangeAroundPosition(state: Editor['state'], markName: string, pos: number): { from: number; to: number; attrs?: Record<string, unknown> } | null {
  const markType = state.schema.marks[markName];
  if (!markType) {
    return null;
  }

  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.isTextblock) {
    return null;
  }

  const parentStart = $pos.start();
  const inlineNodes: Array<{ from: number; to: number; marks: readonly any[] }> = [];
  $pos.parent.forEach((node, offset) => {
    inlineNodes.push({
      from: parentStart + offset,
      to: parentStart + offset + node.nodeSize,
      marks: node.marks,
    });
  });

  const targetIndex = inlineNodes.findIndex((node) => pos >= node.from && pos <= node.to && markType.isInSet(node.marks));
  if (targetIndex < 0) {
    return null;
  }

  const activeMark = markType.isInSet(inlineNodes[targetIndex].marks);
  if (!activeMark) {
    return null;
  }

  let startIndex = targetIndex;
  let endIndex = targetIndex;
  while (startIndex > 0 && hasEquivalentMark(inlineNodes[startIndex - 1].marks, activeMark)) {
    startIndex -= 1;
  }
  while (endIndex < inlineNodes.length - 1 && hasEquivalentMark(inlineNodes[endIndex + 1].marks, activeMark)) {
    endIndex += 1;
  }

  return {
    from: inlineNodes[startIndex].from,
    to: inlineNodes[endIndex].to,
    attrs: activeMark.attrs ?? {},
  };
}

function hasEquivalentMark(marks: readonly any[], activeMark: any): boolean {
  return marks.some((mark) => mark.type === activeMark.type && JSON.stringify(mark.attrs ?? {}) === JSON.stringify(activeMark.attrs ?? {}));
}

function findInlineElementForRange(editor: Editor, selector: string, from: number, to: number): HTMLElement | null {
  const root = editor.view.dom;
  const positions = [from + 1, from, Math.max(from, to - 1), editor.state.selection.from].filter(
    (pos) => pos >= 0 && pos <= editor.state.doc.content.size,
  );

  for (const pos of positions) {
    try {
      const domNode = editor.view.domAtPos(pos).node;
      const element = domNode.nodeType === globalThis.Node.TEXT_NODE ? domNode.parentElement : (domNode as HTMLElement);
      const target = element?.closest(selector) as HTMLElement | null;
      if (target && root.contains(target)) {
        return target;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function getDirectEditorChild(element: HTMLElement, root: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current && current.parentElement && current.parentElement !== root) {
    current = current.parentElement;
  }
  return current?.parentElement === root ? current : null;
}

function scrollActiveBlockToCenter(editor: Editor) {
  const active = editor.view.dom.querySelector('.markwisely-active-block') as HTMLElement | null;
  const scroller = editor.view.dom.closest('.wysiwyg-scroll') as HTMLElement | null;
  if (!active || !scroller) {
    return;
  }

  const activeCenter = active.offsetTop + active.offsetHeight / 2;
  const targetTop = Math.max(0, activeCenter - scroller.clientHeight * 0.48);
  scroller.scrollTo({ top: targetTop, behavior: 'smooth' });
}
