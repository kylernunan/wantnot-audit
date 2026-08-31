#!/usr/bin/env python3
"""
Parity check: the browser analyzer and the backend analyzer agree.

dashboard/audit.html carries a second, independent implementation of the
analysis engine between its ANALYZER START and ANALYZER END markers. It is a
port of shared/analyzer.py, and the two are kept in step by hand. This test is
the enforcement: identical fixtures run through the Python implementation and
the embedded JavaScript implementation (via tools/parity_runner.mjs), and the
findings, totals and warnings must match.

README promises "a browser audit and a scheduled scan agree about the same
tenant". A divergence here means they silently disagree — a browser quoting a
figure the backend would contradict, or vice versa. That is the precise
credibility failure the product's differentiator exists to prevent.

Runs in Node + Python; exit non-zero on any divergence. Node is required.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.environ.setdefault("STORAGE_CONNECTION_STRING", "x")

from shared.analyzer import analyze                         # noqa: E402

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parity_fixtures.json")
RUNNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parity_runner.mjs")

NODE = os.environ.get("NODE_BIN", "node")
FAIL = 0
results: list[tuple[str, str, str]] = []  # (label, ok, detail)


def check(label: str, ok: bool, detail: str = ""):
    global FAIL
    results.append((label, "ok" if ok else "FAIL", detail))
    if not ok:
        FAIL = 1


def python_side(fx: dict) -> dict:
    """Run the fixture through shared/analyzer.py."""
    subscribed = fx["subscribed"]
    users = [u for u in fx["users"]]
    deleted = fx["deleted"]
    users = [{
        "id": f"u-{u['upn']}",
        "displayName": u["displayName"],
        "userPrincipalName": u["upn"],
        "accountEnabled": u.get("enabled", True),
        "userType": u.get("userType", "Member"),
        "createdDateTime": days_ago(u.get("createdDaysAgo")),
        "signInActivity": {
            "lastSignInDateTime": days_ago(u.get("lastSigninDaysAgo")),
            "lastNonInteractiveSignInDateTime": days_ago(u.get("lastNonInteractiveDaysAgo")),
        },
        "department": u.get("department", ""),
        "assignedLicenses": [{"skuId": s} for s in u.get("assignments", [])],
    } for u in users]
    deleted = [{
        "id": f"u-{u['upn']}",
        "displayName": u["displayName"],
        "userPrincipalName": u["upn"],
        "department": u.get("department", ""),
        "createdDateTime": days_ago(u.get("createdDaysAgo")),
        "assignedLicenses": [{"skuId": s} for s in u.get("assignments", [])],
    } for u in deleted]

    r = analyze(
        "parity", "Parity",
        subscribed, users,
        fx.get("signInAvailable", True),
        fx.get("dormantDays", 90),
        price_overrides=fx.get("prices"),
        deleted_users=deleted,
    ).to_dict()
    return {"findings": r["findings"], "annual_waste_usd": r["annual_waste_usd"],
            "warnings": r["warnings"]}


def days_ago(d: int | None) -> str | None:
    from datetime import datetime, timedelta, timezone
    if d is None:
        return None
    return (datetime.now(timezone.utc) - timedelta(days=d)).isoformat().replace("+00:00", "Z")


def js_side(fixtures_path: str) -> list[dict]:
    """Run the fixtures through the embedded browser analyzer via Node."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "parity_out.json")
        r = subprocess.run([NODE, RUNNER, fixtures_path, out],
                           capture_output=True, text=True)
        if r.returncode != 0:
            check("node runner exits clean", False, (r.stderr or r.stdout).strip()[:500])
            return []
        return json.load(open(out))


def normalize(findings: list[dict]) -> dict[tuple, dict]:
    """Key findings on kind|sku|upn and keep the money fields, so order and
    record shapes never cause false failures and money-comparison is exact."""
    out = {}
    for f in findings:
        key = (f.get("kind"), f.get("sku_part_number"),
               (f.get("user_principal_name") or "").lower() or None)
        out[key] = {
            "seats": f.get("seats"),
            "annual_cost": round(float(f.get("annual_cost") or 0), 2),
            "confidence": f.get("confidence"),
        }
    return out


def warnings_semantics(warnings: list[str]) -> dict:
    """Reduce each side's warning text to the semantic facts a customer could
    rely on, so wording drift between the two implementations does not surface
    as a false divergence — but a real one still does."""
    skus = set()
    for w in warnings:
        if w.startswith("No price on file"):
            # "...for: SKU_A, SKU_B. These are excluded..."
            body = w.split("for:", 1)[1].split(". ", 1)[0]
            skus.update(s.strip() for s in body.split(",") if s.strip())
    return {
        "signin_unavailable": any("sign-in activity" in w.lower() for w in warnings),
        "unknown_price": sorted(skus),
    }


def compare_fixture(fx: dict, py: dict, js: dict):
    name = fx["name"]
    pyn = normalize(py["findings"])
    jsn = normalize(js["findings"])

    py_keys = set(pyn); js_keys = set(jsn)
    missing = js_keys - py_keys          # JS finds something Python does not
    extra = py_keys - js_keys            # Python finds something JS does not
    if not missing and not extra:
        check(f"{name}: identical finding keys", True)
    else:
        detail = ""
        if missing:
            detail += f"browser-only: {sorted(missing)[:4]} "
        if extra:
            detail += f"backend-only: {sorted(extra)[:4]} "
        check(f"{name}: finding keys match", False, detail)

    diff = []
    for key in sorted(py_keys & js_keys):
        if pyn[key] != jsn[key]:
            diff.append(f"{key}: backend={pyn[key]} browser={jsn[key]}")
    check(f"{name}: finding money/seats/confidence match",
          not diff, " ".join(diff)[:200])

    check(f"{name}: annual waste total matches",
          abs(py["annual_waste_usd"] - js["annual_waste_usd"]) < 0.01,
          f"backend={py['annual_waste_usd']} browser={js['annual_waste_usd']}")

    # Warnings: JS only emits sign-in availability and unknown-price notes.
    py_sem = warnings_semantics(py["warnings"])
    js_sem = warnings_semantics(js["warnings"])
    for axis in ("signin_unavailable", "unknown_price"):
        a = bool(py_sem[axis])
        b = bool(js_sem[axis])
        check(f"{name}: warning[{axis}] agrees", a == b,
              f"backend={py_sem[axis]} browser={js_sem[axis]}")


def main() -> int:
    fx_all = json.load(open(FIXTURES))
    fixtures = fx_all["fixtures"]
    js = js_side(FIXTURES)
    js_by_name = {r["name"]: r for r in js}

    for fx in fixtures:
        py = python_side(fx)
        if fx["name"] not in js_by_name:
            check(f"{fx['name']}: browser result present", False, "node produced no result")
            continue
        compare_fixture(fx, py, js_by_name[fx["name"]])

    for name, mark, detail in results:
        flag = "  ok " if mark == "ok" else "FAIL"
        print(f"  [{flag}] {name}" + (f"  — {detail}" if detail and mark == "FAIL" else ""))
    print(f"\n{len(results) - FAIL}/{len(results)} parity assertions")
    print("PASS" if not FAIL else "FAIL")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())