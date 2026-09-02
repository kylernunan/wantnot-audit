# Wanda — Running Registry (wantnot-audit mirror)

> Public mirror of `kylernunan/wantnot:docs/runbooks/wanda.md` — the living index of every file, route, prompt, and invariant touching **Wanda** (QBR Copilot) across both repos. Canonical is `wantnot:docs/runbooks/wanda.md`; this file is the audit-repo view. Keep them in sync.

**Last updated:** 2026-09-02 — initial registry.  
**Live audit:** `https://audit.wantnot.nunan.com` (`brave-ground-0ca79031e.7.azurestaticapps.net`, `CNAME audit → azurestaticapps.net`; `https://wantnot.nunan.com/audit` 301 here). Full product: `https://wantnot.nunan.com`.

---

## What Wanda is on this repo

- **Point-in-time, not continuous.** The audit runs entirely in the browser (`audit_logic.js` — port of `wantnot:shared/analyzer.py`, parity `tools/parity_runner.mjs` + `fixtures/parity_expected.json`). Wanda here is the **optional, email-gated** AI narrative over *anonymized aggregates only* — no names ever leave the browser without explicit consent.
- **UX:** panel `index.html:1243` `#wanda` — pill `index.html:1245`, form `index.html:1250` (`#wandaEmail` `index.html:1252` + marketing `index.html:1254` + `#wandaGo` `index.html:1256`), output `index.html:1261` `#wandaOut`, meta `index.html:1262` `#wandaMeta`.
- **Privacy line:** `index.html:1247` "no names leave your browser without consent" + `index.html:1259` "No UPNs, display names, or findings are sent — only aggregates."

## Files in this repo

| Component | File | Note |
|---|---|---|
| Wanda panel | `index.html:1243` | `#wanda` → `#wandaForm` → `#wandaOut`/`#wandaMeta` |
| Client logic | `index.html:1285` | `apiBase` `index.html:1295` (`WANTNOT_API_BASE` → `https://func-wantnot-4dc52f.azurewebsites.net`), `buildSummary()` `index.html:1298` aggregates only, `fetch /api/audit/insights` `index.html:1331` body `{email, marketingConsent, summary}` |
| Result tag | `index.html:1343` | `Wanda (AI)` vs `Wanda (deterministic)` + `grounded` badge |
| Analyzer (feeds summary) | `index.html:286` + `audit_logic.js` + `kinds.js` | Port of `wantnot:shared/analyzer.py`; `KINDS` `index.html:292` via `kinds.js` |
| Security posture | `SECURITY.md:5` | Static-only, no backend/db/queue, delegated PKCE, `sessionStorage` |
| CSP / API base | `staticwebapp.config.json:6` + `config.js:4` | `connect-src` lists `func-*` + `wantnot.nunan.com`; `WANTNOT_API_BASE` fallback |
| Nightly cross-repo sync | `.github/workflows/sync-catalog.yml` | Pulls `skus.json` + parity contract from `wantnot@main` — keeps prices + analyzer in step |

## What gets sent (and what never does)

**Sent on unlock** (`index.html:1298` → `wantnot:routes/audit_insights.py:78`):

```json
{
  "email": "you@company.com",
  "marketingConsent": false,
  "summary": {
    "annual_waste_usd": 12345.67,
    "annual_spend_usd": 98765.43,
    "monthly_waste_usd": 1028.80,
    "findings_count": 17,
    "by_kind": {"unassigned_seats": 5400.00, "disabled_user": 2100.00},
    "sku_summary": [{"skuPartNumber":"SPE_E3","displayName":"Microsoft 365 E3","purchased":100,"assigned":88,"spare":12,"monthlySpend":2640}],
    "warnings": ["…"],
    "total_users": 142, "licensed_users": 100,
    "dormant_threshold_days": 90, "sign_in_available": true,
    "imported": false, "price_as_of": "2026-08", "tenant_name": "Contoso"
  }
}
```

Rounds `by_kind` to 2dp, caps `sku_summary` to 20 client-side. Server re-clamps via `wantnot:shared/audit_insights.py:51` `build_audit_context()`.

**Never sent:** `user_principal_name` / `upn` / `displayName` / `assignedLicenses` / `fingerprint` / raw `findings` — rejected by `wantnot:routes/audit_insights.py:39` `_PII_KEY_RE` and `wantnot:routes/audit_insights.py:71` findings-array guard; 16 KB cap `wantnot:routes/audit_insights.py:55`.

**Stored:** only `wantnot:shared/leads.py` `AuditLeads` `lead` partition — `email` + bucketed `wasteHint` (nearest 5k) + `domainHint` (eTLD+1) + `ipHash[:16]` + `marketingConsent` (`wantnot:routes/audit_insights.py:141`). No directory data retained.

## Backend that serves it (in `wantnot`)

- `wantnot:shared/audit_insights.py:36` `AUDIT_SYSTEM_PROMPT` — single-snapshot, every `$` verbatim, reclaimed/absorbed N/A, warnings surfaced, no directory enumeration.
- `wantnot:shared/audit_insights.py:118` `_fallback_narrate_audit()` + `wantnot:shared/audit_insights.py:153` `generate_insights()` (LLM via `wantnot:shared/agent.py:399` `_try_llm` → `is_grounded` `wantnot:shared/agent.py:149` → fallback).
- `wantnot:routes/audit_insights.py:78` `POST /api/audit/insights` `ANONYMOUS` + `5/min/IP` `wantnot:routes/audit_insights.py:33`, rate-limited, deterministic fallback costs nothing (`AZURE_OPENAI_*` optional).
- **Stay free** (`wantnot:DECISIONS.md:291`): same Flex app `func-wantnot-4dc52f` + `AuditLeads` table; no Front Door/APIM.

## System prompt (audit variant — `wantnot:shared/audit_insights.py:36`)

```
You are Wanda, WantNot's QBR Copilot for the Instant Audit.
You narrate a SINGLE point-in-time licence waste snapshot (no history, no deltas).
Rules:
- Every dollar figure must appear verbatim in the provided tool output. Never invent a price, saving, or total.
- Never sum reclaimed + absorbed — this snapshot has neither (no deltas). If asked about them, explain point-in-time vs tracked recovery.
- Surface every warning from the source (concealed reports, >10% list, stale priceAsOf, missing sign-in data).
- No directory data was sent: you cannot enumerate users, only cite kind totals and SKU inventory already in the summary.
- Kinds: unassigned_seats/disabled_user/deleted_user/dormant_user/never_signed_in/redundant_sku. Confidence: certain/high/review.
- Be concise. One paragraph plus a short prioritized next-steps list.
```

Continuous prompt is `wantnot:shared/agent.py:26` — same grounding, but portfolio/renewal/delta-aware.

## Changelog (mirror — newest first)

| Date | Change | Files |
|---|---|---|
| 2026-09-02 | **Created registry** (this file) — indexed audit Wanda surface. | `WANDA.md:1` (new) + `wantnot:docs/runbooks/wanda.md:1` (canonical) |
| 2026-09-01 | **Wanda audit insights shipped.** Email-gated anonymized narrative. | `index.html:1243` + `:1285` + `wantnot:shared/audit_insights.py:1` + `wantnot:routes/audit_insights.py:1` |

> Next audit-side change goes at the top; then copy the row to `wantnot:docs/runbooks/wanda.md:9` §9.

## How to change Wanda on this repo

1. Edit `index.html:1298` `buildSummary()` allowlist or `index.html:1243` panel → update `WANDA.md` + canonical `wantnot:docs/runbooks/wanda.md`.
2. Keep `connect-src` `staticwebapp.config.json:6` and `config.js:4` `WANTNOT_API_BASE` in step with `wantnot:DECISIONS.md:285` (`https://func-wantnot-4dc52f.azurewebsites.net`).
3. Run `python tools/parity_check.py` (30/30) + `python tools/sync_catalog.py --check` before PR; deploy preview URL is in `gh run view … --log | grep -oE "https://[a-z0-9.-]*azurestaticapps\\.net"`.

---

*Canonical: `wantnot:docs/runbooks/wanda.md` · Hardened config: `wantnot:docs/runbooks/agent-config.md:1` · Roadmap: `wantnot:docs/agentic-roadmap.md:52`.*
