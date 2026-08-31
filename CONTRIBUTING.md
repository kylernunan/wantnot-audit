# Contributing

This repo is **MIT for code, proprietary for brand** (`LICENSE` vs `BRAND_LICENSE.md`). Do not submit brand asset changes without permission.

## Price / SKU changes

- Edit `skus.json` only (single source). Do not hand-edit `catalog.js`, `kinds.js`, or `palette.css`.
- After editing, regenerate:
  ```bash
  python tools/sync_catalog.py
  ```
- CI enforces `python tools/sync_catalog.py --check` — a PR with a `skus.json` bump but stale derived files will fail.
- Source of truth for list prices is Microsoft's published pricing; the private repo's `shared/skus.py` carries `(v)`/`(u)` provenance — mirror that in the `skus.json` PR description.

## Analyzer changes

- `audit_logic.js` is a port of the backend `shared/analyzer.py`. Changes here must be coordinated with the private repo's parity fixtures.
- If you add a finding type, add its `KINDS` entry in `skus.json` **and** a `--kN` in `palette` (both light and dark). A missing `--kN` renders an invisible bar segment and a short bar (`kVar()` returns unresolved `var()`).
- `downgrade_candidate` is intentionally absent — do not add it without discussing (it requires `Reports.Read.All` and a different Graph data shape).

## Parity contract

- `fixtures/parity_fixtures.json` + `fixtures/parity_expected.json` are the cross-repo handshake, synced nightly from `kylernunan/wantnot` by `.github/workflows/sync-catalog.yml`. Do not edit either here — change them in the private repo and let the sync PR bring them.
- Run locally:
  ```bash
  python tools/parity_check.py    # browser analyzer vs backend snapshot (30 assertions)
  ```
- CI runs the same command in `deploy.yml` before any deploy; a browser-side analyzer change that diverges from the backend fails there.

## Configuration

- `config.js` in the repo is a **placeholder** (empty client ID) so forks and `file://` previews land in the setup state instead of erroring. The production value is injected at deploy time from the `AUDIT_CLIENT_ID` secret. Never commit a real client ID — CI rejects a GUID-shaped value in `config.js`.

## Importer changes

- `readProjected()` is an allowlist — widening it is a privacy decision (`index.html:539`). Object ids must never be read (findings are keyed on UPN + SKU).
