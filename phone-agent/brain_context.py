"""Quotra phone-agent — the Brain system prompt (T6, TASKS/T6-phone-agent.md).

Builds one compact system prompt from fixtures/*.json: company identity, top
products with 2-3 capability lines each, and the sample tenders (title, org,
closing date, EMD, key eligibility lines). Mirrors fixtures/load.ts's
"prefer *.real.json, fall back to *.sample.json" pattern so this reads
whatever the Node side reads — same fixtures, same laws, one place.

The laws apply on the phone same as everywhere else in the app:
  - cite what you know ("as per the tender listing...")
  - say "needs confirmation" for what you don't
  - never compute new numbers — quote only figures present in the fixtures
  - INBOUND ONLY — this agent answers calls, it never places one
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"

MAX_PRODUCTS = 12
MAX_TENDERS = 3


def _load_prefer_real(base: str) -> Any:
    real = FIXTURES_DIR / f"{base}.real.json"
    sample = FIXTURES_DIR / f"{base}.sample.json"
    path = real if real.exists() else sample
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _load_sample(base: str) -> Any:
    with (FIXTURES_DIR / f"{base}.sample.json").open("r", encoding="utf-8") as f:
        return json.load(f)


def _describe_company(company: dict) -> str:
    certs = ", ".join(f"{c['kind']} ({c['status']})" for c in company.get("certs", [])) or "none on file"
    return (
        f"COMPANY: {company.get('name')}, {company.get('city')}\n"
        f"Udyam/MSE registered: {'yes' if company.get('udyamRegistered') else 'no'}\n"
        f"Categories: {', '.join(company.get('categories', []))}\n"
        f"Certifications: {certs}"
    )


def _describe_products(products: list[dict]) -> str:
    if not products:
        return "PRODUCTS: none loaded."
    lines = []
    for p in products[:MAX_PRODUCTS]:
        caps = []
        c = p.get("capabilities", {})
        if c.get("zones"):
            caps.append(f"{c['zones']} zones")
        if c.get("channels"):
            caps.append(f"{c['channels']} channel(s)")
        if c.get("protocols"):
            caps.append(", ".join(c["protocols"]))
        if c.get("compatibilities"):
            caps.append(f"works with: {', '.join(c['compatibilities'])}")
        model = f" (model {p['model']})" if p.get("model") else ""
        cap_str = f" — {'; '.join(caps[:3])}" if caps else ""
        lines.append(f"- {p.get('name')}{model}{cap_str}")
    return f"PRODUCTS ({len(products)} total, showing {len(lines)}):\n" + "\n".join(lines)


def _describe_tenders(tenders: list[dict]) -> str:
    if not tenders:
        return "TENDERS: none loaded."
    lines = []
    for t in tenders[:MAX_TENDERS]:
        emd = "not exposed in listing" if t.get("emd") is None else f"₹{t['emd']}"
        est = "not exposed in listing" if t.get("estValue") is None else f"₹{t['estValue']}"
        lines.append(
            f"- [{t.get('id')}] {t.get('title')} | Org: {t.get('org')} | "
            f"Portal: {t.get('portal')} Ref: {t.get('ref')} | Closes: {t.get('closeAt')} | "
            f"EMD: {emd} | Est. value: {est} | "
            f"Listing text: \"{(t.get('rawText') or '')[:300]}\""
        )
    return f"TENDERS (sample set, top {len(lines)}):\n" + "\n".join(lines)


def build_brain_system_prompt() -> str:
    company = _load_prefer_real("company")
    tenders = _load_sample("tenders")
    products_path = FIXTURES_DIR / "products.sample.json"
    products = json.loads(products_path.read_text(encoding="utf-8")) if products_path.exists() else []

    rules = "\n".join(
        [
            "You are Quotra, a voice assistant for an Indian manufacturing MSME's tender desk, ",
            "answering an INBOUND phone call from a sales rep. You NEVER place calls or message ",
            "anyone — you only answer what's asked, on this call.",
            "",
            "RULES:",
            "1. Reply in the caller's own language (auto-detected) — Tamil, Hindi, English, or ",
            "   code-mixed speech, matching however they spoke to you.",
            "2. CITE what you know: say things like 'as per the tender listing...' when stating a ",
            "   fact from the data below. Say 'needs confirmation' for anything not in the data — ",
            "   never invent a fact to sound complete.",
            "3. NEVER compute new numbers. Only speak figures exactly as they appear below. If a ",
            "   figure is not present, say it needs confirmation.",
            "4. Keep answers to AT MOST 2 SENTENCES per turn — this is a phone call, not an essay.",
        ]
    )

    return "\n\n".join(
        [
            rules,
            _describe_company(company),
            _describe_products(products),
            _describe_tenders(tenders),
        ]
    )


if __name__ == "__main__":
    print(build_brain_system_prompt())
