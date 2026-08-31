#!/usr/bin/env node
/**
 * Runs the analyzer embedded in dashboard/audit.html against the shared parity
 * fixtures. tools/parity_check.py orchestrates; this is the JS half.
 *
 * The block between the ANALYZER START and ANALYZER END markers in audit.html
 * is a self-contained port of shared/analyzer.py: it touches no DOM and ends
 * by exporting analyze() under CommonJS. We evaluate it in a fresh Function
 * scope (so node_modules, globals and state from other pages can never leak
 * in) and call analyze() directly with the fixture's Graph-shaped tenant.
 *
 * Fixtures carry prices explicitly so the comparison tests logic, not whose
 * price table is newer. We pin SKU_CATALOG to the fixture's prices before
 * each run, so a price-bump in one side cannot masquerade as an analyzer
 * divergence — and a genuine divergence cannot be hidden by coincidentally
 * matching prices.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// New repo layout: audit_logic at root + index.html; keep dashboard/ fallback for wantnot
const AUDIT = resolve(ROOT, 'index.html');
const AUDIT_DASH = resolve(ROOT, 'dashboard', 'audit.html');
const AUDIT_LOGIC = resolve(ROOT, 'audit_logic.js');
const AUDIT_LOGIC_DASH = resolve(ROOT, 'dashboard', 'audit_logic.js');
const [fixturesPath, outPath] = process.argv.slice(2);
if (!fixturesPath) {
  console.error('usage: parity_runner.mjs <fixtures.json> <out.json>');
  process.exit(2);
}

// Prefer standalone audit_logic.js (single source) over slicing HTML.
let block;
function tryRead(p) { try { return readFileSync(p, 'utf8'); } catch { return null; } }
const logicSrc = tryRead(AUDIT_LOGIC) || tryRead(AUDIT_LOGIC_DASH);
if (logicSrc && logicSrc.includes('function analyze')) {
  block = logicSrc;
} else {
  const htmlSrc = tryRead(AUDIT) || tryRead(AUDIT_DASH);
  if (!htmlSrc) throw new Error('No audit_logic.js or audit HTML found');
  block = extractAnalyzerBlock(htmlSrc);
}

function extractAnalyzerBlock(page) {
  const startMarker = page.indexOf('ANALYZER START');
  const endMarker = page.indexOf('ANALYZER END');
  if (startMarker < 0 || endMarker < 0) {
    throw new Error('audit.html is missing the ANALYZER START/END markers');
  }
  // Slice whole lines so the extracted text includes every declaration.
  const lineStart = page.lastIndexOf('\n', startMarker) + 1;
  const lineEnd = endMarker >= 0 ? page.indexOf('\n', endMarker) : page.length;
  return page.slice(lineStart, lineEnd);
}

// Evaluate the analyzer block fresh so no state leaks between fixtures.
const makeAnalyzer = (() => {
  let compiled = null;
  return function withCatalog(prices) {
    if (compiled === null) {
      compiled = new Function(block + '\nreturn { analyze, skuName, skuPrice, isPriced, SKU_CATALOG };');
    }
    const scope = compiled();
    // Pin prices to the fixture's vector, preserving embedded display names.
    for (const [part, price] of Object.entries(prices)) {
      if (scope.SKU_CATALOG[part]) {
        scope.SKU_CATALOG[part][1] = price;
      } else {
        scope.SKU_CATALOG[part] = [part, price];
      }
    }
    return scope;
  };
})();

const all = JSON.parse(readFileSync(fixturesPath, 'utf8'));
const results = [];
for (const fx of all.fixtures) {
  const { analyze, skuName, skuPrice, isPriced, SKU_CATALOG } = makeAnalyzer(fx.prices || {});
  const now = Date.now();
  const iso = (d) => d == null ? null : new Date(now - d * 864e5).toISOString();

  const userShape = (u, deleted) => ({
    id: `u-${u.upn}`,
    displayName: u.displayName,
    userPrincipalName: u.upn,
    accountEnabled: u.enabled !== false,
    userType: u.userType || 'Member',
    createdDateTime: iso(u.createdDaysAgo),
    signInActivity: {
      lastSignInDateTime: iso(u.lastSigninDaysAgo),
      lastNonInteractiveSignInDateTime: iso(u.lastNonInteractiveDaysAgo),
    },
    department: u.department || '',
    assignedLicenses: (u.assignments || []).map((skuId) => ({ skuId })),
    ...(deleted ? { isDeleted: true } : {}),
  });

  const users = [...fx.users.map((u) => userShape(u, false)),
                 ...fx.deleted.map((u) => userShape(u, true))];
  const r = analyze(fx.subscribed, users, fx.signInAvailable !== false, fx.dormantDays || 90);

  results.push({
    name: fx.name,
    annual_waste_usd: r.annual_waste_usd,
    findings: r.findings.map((f) => ({
      kind: f.kind,
      sku_part_number: f.sku_part_number,
      user_principal_name: f.user_principal_name ?? null,
      seats: f.seats,
      annual_cost: f.annual_cost,
      confidence: f.confidence,
    })),
    warnings: r.warnings,
  });
}
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`parity_runner: ${results.length} fixtures through the browser analyzer`);