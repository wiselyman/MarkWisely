# MarkWisely Release Hardening

This document tracks the release-hardening work that sits outside the editor feature set.

## Implemented

- In-app updater bridge using Tauri updater/process plugins.
- Updater signing keypair generated locally under `.secrets/`.
- Updater public key embedded in `src-tauri/tauri.conf.json`.
- Release-only updater artifact config at `src-tauri/tauri.updater.conf.json`.
- GitHub release workflow passes updater signing and signing/notarization secrets to `tauri-apps/tauri-action`.
- Local app logging using `tauri-plugin-log`.
- Rust panic hook writes panic details through the app logger.
- Webview `error` and `unhandledrejection` events write to the app logger.
- Help menu entries:
  - `Check for Updates...`
  - `Open Logs Folder`
- Manual `Platform Installer Smoke` workflow for macOS, Windows, and Linux runner validation.

## Updater Secrets

The local updater private key and password are intentionally ignored by git:

```text
.secrets/markwisely-updater.key
.secrets/markwisely-updater-password.txt
```

Move them into GitHub Actions secrets before cutting an updater-enabled release:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < .secrets/markwisely-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD < .secrets/markwisely-updater-password.txt
```

If these values are lost, MarkWisely cannot sign updates compatible with the currently embedded updater public key.

## Update Endpoint

The current updater endpoint is:

```text
https://github.com/wiselyman/MarkWisely/releases/latest/download/latest.json
```

The release workflow builds updater artifacts when signing secrets are present:

```text
npm run tauri -- build --config src-tauri/tauri.updater.conf.json
```

## Apple Signing And Notarization

Apple signing and notarization cannot be completed without Apple Developer credentials. Configure these GitHub secrets for the macOS release job:

```text
APPLE_CERTIFICATE
APPLE_CERTIFICATE_PASSWORD
APPLE_SIGNING_IDENTITY
APPLE_ID
APPLE_PASSWORD
APPLE_TEAM_ID
```

`APPLE_PASSWORD` should be an app-specific password or CI-safe notarization credential, not the normal Apple ID password.

## Windows Signing

Windows signing needs a code-signing certificate and password. Configure:

```text
WINDOWS_CERTIFICATE
WINDOWS_CERTIFICATE_PASSWORD
```

The current workflow forwards these secrets. The exact signing command/profile may need to be tightened after the certificate format is known.

## Platform Installer Smoke

Run the manual workflow:

```text
.github/workflows/platform-smoke.yml
```

It builds on real GitHub-hosted macOS, Windows, and Linux runners, then:

- macOS: confirms `.app` and `.dmg` exist and runs `codesign --verify`.
- Windows: confirms installer bundles exist and silently installs the first MSI when available.
- Linux: confirms a `.deb` exists and installs it with `apt`.

This is runner-level validation. Final QA should still include at least one physical or VM machine per target OS before public distribution.

## Logs

Runtime logs are written to the platform app log directory by `tauri-plugin-log`. Users can open it from:

```text
Help -> Open Logs Folder
```

Current logging is local-only. No crash dumps, documents, or telemetry are uploaded to a third-party service.
