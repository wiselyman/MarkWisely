# MarkWisely

MarkWisely is a focused desktop Markdown editor for macOS, Windows, and Linux. It keeps the writing surface clean: one live editable document, native menu commands, optional side panels, and Markdown files saved as plain text.

## Highlights

- Live WYSIWYG Markdown editing with Markdown as the canonical file format.
- Clean default workspace with no permanent toolbar, status bar, or mode switcher.
- Native desktop workflow: New, Open, Open Folder, Save, Save As, Close, recent files, dirty-state window titles, and external-change conflict checks.
- Optional File Tree, Articles, Recent Files, and Outline panels.
- Source Code Mode powered by CodeMirror and loaded only when needed.
- Markdown shortcuts for headings, lists, task lists, block quotes, code blocks, tables, horizontal rules, links, images, math, diagrams, and table of contents blocks.
- Inline and display math rendering with KaTeX.
- Mermaid diagram preview while preserving editable source.
- Image paste/drop support, relative image paths, document-local assets, image relocation commands, and remote image download.
- Search/replace in the current document and Markdown-only folder search.
- Focus mode, typewriter mode, light/dark/system themes, and a Preferences panel.
- Built-in styled/no-style HTML export.
- Built-in structured PDF export through a local Comrak to Typst pipeline.
- Optional Pandoc-backed export for DOCX, EPUB, LaTeX, OpenDocument, and MediaWiki when Pandoc is installed.
- Local-only diagnostics logs and in-app update checks.

## Platforms

Release builds are configured for:

- macOS x64
- macOS arm64
- Windows x64
- Windows arm64
- Linux x64 `.deb`
- Linux x64 `.rpm`
- Linux arm64 `.deb`
- Linux arm64 `.rpm`

## Development

```bash
npm install
npm run dev
npm run desktop:dev
```

## Verification

```bash
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri -- build --debug
```

## Releases

GitHub Releases are configured in `.github/workflows/release.yml`. Push a tag matching `v*` or run the workflow manually to build release assets with `tauri-apps/tauri-action`.

Release hardening is tracked in `RELEASE_HARDENING.md`. The current setup includes updater wiring, local log capture, updater artifact generation when signing secrets are present, and a manual platform installer smoke workflow.

The updater signing keypair was generated locally under `.secrets/`; the private key and password are ignored by git and must be copied into GitHub Secrets before publishing updater-enabled releases.

## License

MIT
