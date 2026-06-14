import CodeMirror from '@uiw/react-codemirror';
import { markdown as markdownLanguage } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

type SourceCodeEditorProps = {
  value: string;
  theme: 'light' | 'dark';
  onChange: (value: string) => void;
  onCreateEditor: (view: unknown) => void;
};

export default function SourceCodeEditor({ value, theme, onChange, onCreateEditor }: SourceCodeEditorProps) {
  return (
    <CodeMirror
      value={value}
      height="100%"
      theme={theme === 'dark' ? oneDark : undefined}
      extensions={[markdownLanguage()]}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
      }}
      onChange={onChange}
      onCreateEditor={onCreateEditor}
      className="source-editor"
    />
  );
}
