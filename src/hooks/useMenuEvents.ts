import { useCallback, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

type MenuHandlers = Record<string, () => void | Promise<void>>;

export function useMenuEvents(handlers: MenuHandlers) {
  const lastRun = useRef<{ id: string; at: number } | null>(null);

  const runCommand = useCallback(
    (id: string, event?: KeyboardEvent) => {
      const handler = handlers[id];
      if (!handler) {
        return;
      }

      const now = Date.now();
      if (lastRun.current?.id === id && now - lastRun.current.at < 250) {
        event?.preventDefault();
        return;
      }

      lastRun.current = { id, at: now };
      event?.preventDefault();
      void handler();
    },
    [handlers],
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const onDomCommand = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === 'string') {
        runCommand(detail);
      }
    };

    window.addEventListener('markwisely-menu-command', onDomCommand);

    listen<string>('markwisely-menu', (event) => {
      runCommand(event.payload);
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch(() => {
        // Browser-only dev mode has no Tauri event bus.
      });

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener('markwisely-menu-command', onDomCommand);
    };
  }, [runCommand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key === 'F8') {
          runCommand('toggle-focus-mode', event);
          return;
        }
        if (event.key === 'F9') {
          runCommand('toggle-typewriter-mode', event);
          return;
        }
      }

      const command = event.metaKey || event.ctrlKey;
      if (!command || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const digit = /^Digit[0-9]$/.test(event.code) ? event.code.replace('Digit', '') : key;
      if (key === 'n' && !event.shiftKey) {
        runCommand('new-document', event);
      } else if (key === 'o' && !event.shiftKey) {
        runCommand('open-file', event);
      } else if (key === 'o' && event.shiftKey) {
        runCommand('open-folder', event);
      } else if (key === 's' && !event.shiftKey) {
        runCommand('save-document', event);
      } else if (key === 's' && event.shiftKey) {
        runCommand('save-document-as', event);
      } else if (key === 'w' && !event.shiftKey) {
        runCommand('close-document', event);
      } else if (key === 'f') {
        runCommand('show-find', event);
      } else if (key === ',') {
        runCommand('show-preferences', event);
      } else if (key === 'e' && !event.shiftKey) {
        runCommand('export-pdf', event);
      } else if (key === '/' && !event.shiftKey) {
        runCommand('toggle-source-mode', event);
      } else if (digit === '1' && event.shiftKey) {
        runCommand('toggle-outline', event);
      } else if (digit === '2' && event.shiftKey) {
        runCommand('toggle-articles-panel', event);
      } else if (digit === '3' && event.shiftKey) {
        runCommand('toggle-file-panel', event);
      } else if (key === 'l' && event.shiftKey) {
        runCommand('toggle-file-panel', event);
      } else if (key === 'h' && event.shiftKey) {
        runCommand('toggle-outline', event);
      } else if (key === 'd' && event.shiftKey) {
        runCommand('toggle-theme', event);
      } else if (key === 'b' && !event.shiftKey) {
        runCommand('toggle-bold', event);
      } else if (key === 'i' && !event.shiftKey) {
        runCommand('toggle-italic', event);
      } else if (key === 'k' && !event.shiftKey) {
        runCommand('insert-link', event);
      } else if (key === 't' && !event.shiftKey) {
        runCommand('insert-table', event);
      } else if (digit >= '0' && digit <= '6' && !event.shiftKey) {
        runCommand(digit === '0' ? 'format-paragraph' : `format-heading-${digit}`, event);
      } else if (digit === '7' && event.shiftKey) {
        runCommand('format-ordered-list', event);
      } else if (digit === '8' && event.shiftKey) {
        runCommand('format-bullet-list', event);
      } else if (key === 'w' && event.shiftKey) {
        runCommand('show-word-count', event);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [runCommand]);
}
