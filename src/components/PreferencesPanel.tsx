import { useState } from 'react';
import type { EditorSettings, HtmlExportTheme, OutlineMode, Theme } from '../lib/state';

type PreferencesPanelProps = {
  settings: EditorSettings;
  onChangeSettings: (settings: EditorSettings) => void;
  onClose: () => void;
};

type PreferenceTab = 'general' | 'editor' | 'markdown' | 'image' | 'export' | 'appearance';

export function PreferencesPanel({ settings, onChangeSettings, onClose }: PreferencesPanelProps) {
  const [tab, setTab] = useState<PreferenceTab>('general');
  const update = (patch: Partial<EditorSettings>) => onChangeSettings({ ...settings, ...patch });

  return (
    <div className="preferences-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="preferences-panel" role="dialog" aria-modal="true" aria-label="Preferences" onMouseDown={(event) => event.stopPropagation()}>
        <header className="preferences-header">
          <strong>Preferences</strong>
          <button type="button" aria-label="Close preferences" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="preferences-body">
          <nav className="preferences-tabs" aria-label="Preference sections">
            {[
              ['general', 'General'],
              ['editor', 'Editor'],
              ['markdown', 'Markdown'],
              ['image', 'Image'],
              ['export', 'Export'],
              ['appearance', 'Appearance'],
            ].map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id as PreferenceTab)}>
                {label}
              </button>
            ))}
          </nav>

          <div className="preferences-content">
            {tab === 'general' && (
              <div className="preferences-section">
                <label className="preference-toggle">
                  <input
                    type="checkbox"
                    checked={settings.showLeftPanel}
                    onChange={(event) => update({ showLeftPanel: event.target.checked })}
                  />
                  <span>Show sidebar</span>
                </label>
                <label className="preference-toggle">
                  <input
                    type="checkbox"
                    checked={settings.showRightPanel}
                    onChange={(event) => update({ showRightPanel: event.target.checked })}
                  />
                  <span>Show outline</span>
                </label>
                <label className="preference-field">
                  <span>Sidebar width</span>
                  <input
                    type="number"
                    min={220}
                    max={420}
                    value={settings.sidebarWidth}
                    onChange={(event) => update({ sidebarWidth: clampNumber(event.target.valueAsNumber, 220, 420, 278) })}
                  />
                </label>
              </div>
            )}

            {tab === 'editor' && (
              <div className="preferences-section">
                <label className="preference-toggle">
                  <input
                    type="checkbox"
                    checked={settings.mode === 'source'}
                    onChange={(event) => update({ mode: event.target.checked ? 'source' : 'wysiwyg' })}
                  />
                  <span>Source code mode</span>
                </label>
                <label className="preference-toggle">
                  <input
                    type="checkbox"
                    checked={settings.focusMode}
                    onChange={(event) => update({ focusMode: event.target.checked })}
                  />
                  <span>Focus mode</span>
                </label>
                <label className="preference-toggle">
                  <input
                    type="checkbox"
                    checked={settings.typewriterMode}
                    onChange={(event) => update({ typewriterMode: event.target.checked })}
                  />
                  <span>Typewriter mode</span>
                </label>
              </div>
            )}

            {tab === 'markdown' && (
              <div className="preferences-section">
                <label className="preference-toggle">
                  <input
                    type="checkbox"
                    checked={settings.showSyntaxOnFocus}
                    onChange={(event) => update({ showSyntaxOnFocus: event.target.checked })}
                  />
                  <span>Reveal Markdown syntax near cursor</span>
                </label>
                <label className="preference-toggle">
                  <input
                    type="checkbox"
                    checked={settings.searchCaseSensitive}
                    onChange={(event) => update({ searchCaseSensitive: event.target.checked })}
                  />
                  <span>Case-sensitive search</span>
                </label>
                <div className="preference-choice" role="radiogroup" aria-label="Outline mode">
                  {[
                    ['nested', 'Nested outline'],
                    ['flat', 'Flat outline'],
                  ].map(([mode, label]) => (
                    <label key={mode}>
                      <input
                        type="radio"
                        name="outlineMode"
                        value={mode}
                        checked={settings.outlineMode === mode}
                        onChange={() => update({ outlineMode: mode as OutlineMode })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {tab === 'image' && (
              <div className="preferences-section">
                <label className="preference-field">
                  <span>Default image folder</span>
                  <input
                    value={settings.defaultImageCopyTarget}
                    placeholder="assets"
                    onChange={(event) => update({ defaultImageCopyTarget: normalizeAssetTarget(event.target.value) })}
                  />
                </label>
              </div>
            )}

            {tab === 'export' && (
              <div className="preferences-section">
                <div className="preference-choice" role="radiogroup" aria-label="HTML export theme">
                  {[
                    ['current', 'Current theme'],
                    ['light', 'Light HTML'],
                    ['dark', 'Dark HTML'],
                  ].map(([theme, label]) => (
                    <label key={theme}>
                      <input
                        type="radio"
                        name="htmlExportTheme"
                        value={theme}
                        checked={settings.htmlExportTheme === theme}
                        onChange={() => update({ htmlExportTheme: theme as HtmlExportTheme })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <p className="preferences-note">HTML and PDF export are built in. DOCX, EPUB, LaTeX, OpenDocument, and MediaWiki use Pandoc when available.</p>
              </div>
            )}

            {tab === 'appearance' && (
              <div className="preferences-section">
                <div className="preference-choice" role="radiogroup" aria-label="Theme">
                  {[
                    ['light', 'Light'],
                    ['dark', 'Dark'],
                    ['system', 'System'],
                  ].map(([theme, label]) => (
                    <label key={theme}>
                      <input
                        type="radio"
                        name="theme"
                        value={theme}
                        checked={settings.theme === theme}
                        onChange={() => update({ theme: theme as Theme })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function normalizeAssetTarget(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}
