# Security Policy

## What this repo does

WantNot Instant Audit (`https://audit.wantnot.nunan.com`) is **static-only**. No backend, no database, no queue, no storage. All analysis runs in the visitor's browser (`audit_logic.js`) calling Microsoft Graph directly with a delegated token. Closing the tab ends the session (`sessionStorage`).

## Threat model

- The only privileged surface is the Entra app registration (delegated, read-only, public client with no secret). Compromise of `WANTNOT_AUDIT_CLIENT_ID` is not a secret leak — it is a public identifier.
- The primary in-repo risks are XSS via CSV import or report rendering, and CSP misconfiguration. Report fields are escaped (`index.html:302` `esc()`), CSV parsing is allowlisted (`readProjected`), and `staticwebapp.config.json` carries a strict CSP (`default-src 'self'`).

## Reporting a vulnerability

Email **kyler@nunan.com** (or `admin@wantnot.nunan.com` break-glass). Include steps to reproduce, impacted route, and whether it requires a signed-in Graph session. We aim to acknowledge within 48 hours.

## Out of scope

- The full WantNot product's continuous/portfolio backend (`kylernunan/wantnot` — private) has its own Key Vault / HMAC roster storage — not in this repo.
- Brand assets (`brand/*`) are proprietary under `BRAND_LICENSE.md` — not a security issue if reused without permission, but a trademark/brand matter; contact the same address.
