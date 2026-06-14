import { invoke } from '@tauri-apps/api/core';

type LogFunction = (message: string) => Promise<void>;

export async function installRuntimeLogging() {
  if (!isTauriRuntime()) {
    return;
  }

  const { attachConsole, error, info } = await import('@tauri-apps/plugin-log');
  await attachConsole().catch(() => undefined);
  await info('MarkWisely webview ready').catch(() => undefined);

  window.addEventListener('error', (event) => {
    void writeLog(error, `webview error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    void writeLog(error, `webview unhandled rejection: ${stringifyError(event.reason)}`);
  });
}

export async function checkForUpdates(): Promise<string> {
  if (!isTauriRuntime()) {
    return 'Update checks are available in the desktop app.';
  }

  const [{ check }, { ask, message }, { relaunch }, { error, info, warn }] = await Promise.all([
    import('@tauri-apps/plugin-updater'),
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-process'),
    import('@tauri-apps/plugin-log'),
  ]);

  try {
    await info('checking for updates');
    const update = await check({ timeout: 20000 });
    if (!update) {
      await info('no update available');
      await message('MarkWisely is up to date.', { title: 'MarkWisely', kind: 'info' });
      return 'MarkWisely is up to date.';
    }

    const confirmed = await ask(
      `Version ${update.version} is available. Install it now and relaunch MarkWisely?`,
      {
        title: 'MarkWisely Update',
        kind: 'info',
        okLabel: 'Install and Relaunch',
        cancelLabel: 'Later',
      },
    );
    if (!confirmed) {
      await warn(`update ${update.version} deferred`);
      return `Update ${update.version} is available.`;
    }

    let downloaded = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        void info(`update download started: ${event.data.contentLength ?? 'unknown'} bytes`);
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
      } else {
        void info(`update download finished: ${downloaded} bytes`);
      }
    });
    await info(`update ${update.version} installed; relaunching`);
    await relaunch();
    return `Update ${update.version} installed. Relaunching.`;
  } catch (caught) {
    const reason = stringifyError(caught);
    await error(`update check failed: ${reason}`).catch(() => undefined);
    await message(`Update check failed.\n\n${reason}`, { title: 'MarkWisely Update', kind: 'error' }).catch(() => undefined);
    return 'Update check failed.';
  }
}

export async function openDiagnosticsDirectory(): Promise<string> {
  if (!isTauriRuntime()) {
    return 'Logs are available in the desktop app.';
  }

  const [{ openPath }, { info, error }] = await Promise.all([
    import('@tauri-apps/plugin-opener'),
    import('@tauri-apps/plugin-log'),
  ]);

  try {
    const path = await invoke<string>('app_log_dir');
    await info(`opening log directory: ${path}`);
    await openPath(path);
    return 'Opened logs folder.';
  } catch (caught) {
    const reason = stringifyError(caught);
    await error(`open log directory failed: ${reason}`).catch(() => undefined);
    return 'Could not open logs folder.';
  }
}

function isTauriRuntime() {
  return '__TAURI_INTERNALS__' in window;
}

async function writeLog(fn: LogFunction, message: string) {
  try {
    await fn(message);
  } catch {
    // Logging must never crash the editor.
  }
}

function stringifyError(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
