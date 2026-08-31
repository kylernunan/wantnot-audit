# WantNot — Instant Audit (browser-only)

Free, **browser-only** Microsoft 365 licence waste audit. Sign in as a Global Reader or Global Admin, get a costed breakdown in about a minute — or import CSV exports from the Microsoft 365 admin centre with no consent at all. **Nothing is stored, anywhere**; directory data goes from Microsoft Graph to this tab and no further.

Live on **`https://audit.wantnot.nunan.com`** (production origin). The full WantNot product (continuous, multi-tenant, nightly scans, portfolio view) lives at `https://wantnot.nunan.com` — this repo is the free audit only.

**Trust model:** delegated OIDC with PKCE, public client, no secret, three **read-only** delegated scopes. See [Scopes](#scopes) and [Privacy](#privacy).

---

## What it finds

| Kind | Confidence | Basis |
|---|---|---|
| `unassigned_seats` | Certain | `prepaidUnits.enabled − consumedUnits`, collated per SKU |
| `disabled_user` | Certain | `accountEnabled = false` holding a paid licence |
| `deleted_user` | Certain | Soft-deleted account still holding a paid licence |
| `never_signed_in` | Likely | No sign-in ever, created >45 days ago |
| `dormant_user` | Likely | No interactive *or* non-interactive sign-in in 90 days |
| `redundant_sku` | Review | Service-plan set is a strict subset of another held SKU |

`downgrade_candidate` (bundle → cheaper SKU when only Exchange/Teams/etc. is used) is **backend-only** and intentionally not in this audit — see [Known limitations](#known-limitations).

Every finding carries its evidence (sku, seats, dollar figure, UPN) and a stable fingerprint `kind|SKU|upn` (or `kind|SKU` for unassigned seats).

---

## Two ways in — same engine, different trade-offs

- **Live (delegated):** `Organization.Read.All` + `User.Read.All` + `AuditLog.Read.All` via PKCE. Calls `graph.microsoft.com` directly from the browser (`index.html:271` `MSAL_CDNS`).
- **Import:** no consent, no sign-in. Drop the two admin-centre CSVs on the page; parsing happens in the tab (`index.html:513` `eachCsvRow`), only allowlisted columns are retained (`readProjected`), object ids are never read. Service plans are absent from every export, so `redundant_sku` degrades correctly (skipped when plan sets are empty) and the report says so.

---

## Scopes

| Delegated scope | Why |
|---|---|
| `Organization.Read.All` | `GET /subscribedSkus` — purchased seat counts |
| `User.Read.All` | Users, `assignedLicenses`, `accountEnabled`, `department` |
| `AuditLog.Read.All` | `signInActivity` for dormancy (also needs a directory role like Global/Reports Reader) |
| `User.Read` | Sign the admin in |

No `Reports.Read.All` on the audit app — downgrade detection is deferred. No write scopes.

---

## Privacy

- Analysis runs in the browser (`audit_logic.js:1` — port of the backend `shared/analyzer.py` logic, checked by `tools/parity_runner.mjs`).
- No backend, no database, no queue. Closing the tab ends the session (`sessionStorage` only).
- CSV import keeps only the columns a finding needs (`USER_COLS` + `LIC_COLS` inside `index.html:693`/`index.html:781`); `ignored` columns are dropped and the raw row is discarded. Object ids are never read — findings are keyed on UPN + SKU.
- The audit never fetches `id` — only `displayName,userPrincipalName,accountEnabled,createdDateTime,assignedLicenses,department` plus `signInActivity` when available (`index.html:439` `USER_SELECT`).

---

## Running locally

```bash
# file:// preview works except MSAL redirect (needs https origin)
python3 -m http.server 4280
# then open http://localhost:4280/

# with a real Entra app
cp config.js.example config.js
# edit WANTNOT_AUDIT_CLIENT_ID — see tools/create_audit_app.sh
```

No build step — `skip_app_build: true` in the deploy workflow.

## Deploying your own copy

1. Create the Entra app (delegated, public client, SPA redirect):
   ```bash
   ./tools/create_audit_app.sh          # creates WantNot Instant Audit, writes config.js locally
   # or manually: infra/05-audit-app.sh equivalent — see script header for requiredResourceAccess GUIDs
   ```
   Register your origin as SPA redirect: `https://your-host/` **and** `https://your-host/index.html` (both — MSAL derives redirect from `location.pathname` and SWA canonicalises `index.html ↔ /`).

2. Set GitHub secret `AUDIT_CLIENT_ID` to the app's client ID. The deploy workflow writes `config.js` from it at build time (forks without the secret still run parity checks — deploy just skips).

3. Push to `main` → `.github/workflows/deploy.yml` checks `tools/sync_catalog.py --check` + parity, then deploys to your Static Web App / Pages host.

---

## SKU prices & catalog

Prices are **list** (USD/user/month, annual commitment) from `skus.json:2` (snapshot of the private repo's `shared/skus.py` `CatalogVersion 2026-08`). Each entry is marked `(v)` verified or `(u)` carried-forward in the private source — the snapshot carries the same drift. A report leaning >10% on list emits a warning; enter contracted rates in the full product to make it exact.

`skus.json` is the single source for this repo. Regenerate derived files after bumping it:

```bash
python tools/sync_catalog.py          # writes catalog.js, kinds.js, palette.css
python tools/sync_catalog.py --check  # CI drift gate — fails if derived files are stale
```

Bumping prices is a PR that edits `skus.json`; derived files must be regenerated in the same PR (CI enforces).

---

## Parity — browser and backend agree

`fixtures/parity_fixtures.json` is the published contract. `tools/parity_runner.mjs` runs the browser analyzer (`audit_logic.js`) through it; the private repo's `tools/parity_check.py` runs the Python analyzer through the same fixtures. A divergence would mean the free audit quotes a figure the backend would contradict — that is the credibility failure this product exists to prevent.

```bash
node tools/parity_runner.mjs fixtures/parity_fixtures.json /tmp/out.json
```

Downgrade is exempt — the browser intentionally does not emit `downgrade_candidate`; parity tolerates that `backend-only` kind.

---

## Repository layout

```
index.html              audit shell + live Graph + CSV importer + report rendering
audit_logic.js          analysis engine (6 kinds, no downgrade)
catalog.js              generated from skus.json (SKU_CATALOG)
kinds.js                generated from skus.json (KINDS → --k1..k7)
palette.css             generated from skus.json (light + dark ramp)
sort.js                 table sorting for report tables
skus.json               snapshot of shared/skus.json (version, priceAsOf, skus, kinds, palette)
config.js               generated at deploy from AUDIT_CLIENT_ID (not committed)
config.js.example       placeholder for forks
brand/*                 proprietary — see BRAND_LICENSE.md
site.webmanifest        PWA manifest
staticwebapp.config.json SWA routing + CSP (no azurewebsites.net connect-src)
tools/
  parity_runner.mjs     browser analyzer runner for fixtures
  sync_catalog.py       skus.json → catalog.js/kinds.js/palette.css + --check
fixtures/
  parity_fixtures.json  published contract (do not edit except via PR)
.github/workflows/
  deploy.yml            parity + sync check + deploy
```

---

## Known limitations

- `downgrade_candidate` is backend-only (deferred).
- Service plans are absent from every admin-centre CSV, so `redundant_sku` cannot be detected from imports.
- Storage is `westus2` only in the full product — not relevant here (no storage).
- No SOC 2, no pen test — same posture as the full product; compliance docs live in the private repo.

---

## License

Code: **MIT** — see `LICENSE` (brand assets excluded). Brand: **proprietary** — see `BRAND_LICENSE.md`. Forks should replace `brand/*` with their own mark.

Microsoft 365 is a trademark of Microsoft. Not affiliated.
