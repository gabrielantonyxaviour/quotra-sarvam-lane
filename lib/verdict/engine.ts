// Quotra blk_verdict_engine — the engine.
//
// This is the TRIMMED lane copy: contract + validator only. runVerdict (store-coupled)
// stays in the product repo — your T1 provider is exercised via completeJSON directly.
// completeJSON with a strict schema (a reason without a citation cannot
// survive validation), then COMPUTES all money fields via lib/money and
// attaches them. The persisted Verdict's money comes ONLY from lib/money —
// any numeric fields in the model output are discarded. The verdict is
// persisted to the store with its transcriptId for provenance.
//
// The LLM and the store are behind the deps seam so checks can run the full
// pipeline without touching the network or localStorage.

import type { JsonSchema } from "../llm";
import type { Verdict, VerdictKind, VerdictReason } from "../tenders/types";
import type { ComputedMoney } from "../money";
/* ---------- the model contract ---------- */

/** Exactly what Claude is allowed to contribute. NO numeric/money fields —
 *  if the model emits any, validation ignores them and the engine discards
 *  them; money is computed by lib/money. */
export type VerdictModelOutput = {
  verdict: VerdictKind;
  reasons: VerdictReason[];
  requirements: string[];
  eligibilityClauses: string[];
  disqualificationRisks: string[];
  unknowns: string[];
};

const VERDICT_KINDS: readonly string[] = ["GO", "NO-GO", "FIXABLE"];

const isNonEmptyStr = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;

function validateStringArray(o: Record<string, unknown>, key: string, problems: string[]): void {
  const v = o[key];
  if (!Array.isArray(v)) {
    problems.push(`"${key}" must be an array of strings`);
    return;
  }
  v.forEach((item, i) => {
    if (!isNonEmptyStr(item)) problems.push(`"${key}"[${i}] must be a non-empty string`);
  });
}

/**
 * Schema validator for the verdict contract. Returns a list of problems;
 * empty = valid. Citation discipline is enforced here: a reason without a
 * non-empty clause, an explicit page (number, or null for listing-level
 * captures) and non-empty quoted text is rejected.
 */
export function validateVerdictOutput(data: unknown): string[] {
  const problems: string[] = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["verdict output must be a JSON object"];
  }
  const o = data as Record<string, unknown>;

  if (typeof o.verdict !== "string" || !VERDICT_KINDS.includes(o.verdict)) {
    problems.push(`"verdict" must be one of ${VERDICT_KINDS.join(" | ")}`);
  }

  if (!Array.isArray(o.reasons) || o.reasons.length === 0) {
    problems.push('"reasons" must be a non-empty array — a verdict with no cited reason is not a verdict');
  } else {
    o.reasons.forEach((r, i) => {
      if (typeof r !== "object" || r === null || Array.isArray(r)) {
        problems.push(`"reasons"[${i}] must be an object { clause, page, text }`);
        return;
      }
      const rr = r as Record<string, unknown>;
      if (!isNonEmptyStr(rr.clause)) {
        problems.push(`"reasons"[${i}].clause must be a non-empty string — citation-or-flag, no uncited reasons`);
      }
      if (!("page" in rr) || !(rr.page === null || (typeof rr.page === "number" && Number.isFinite(rr.page)))) {
        problems.push(`"reasons"[${i}].page must be a page number or explicit null (listing-level captures have no pages)`);
      }
      if (!isNonEmptyStr(rr.text)) {
        problems.push(`"reasons"[${i}].text must be a non-empty string quoting/paraphrasing the cited source`);
      }
    });
  }

  validateStringArray(o, "requirements", problems);
  validateStringArray(o, "eligibilityClauses", problems);
  validateStringArray(o, "disqualificationRisks", problems);
  validateStringArray(o, "unknowns", problems);

  return problems;
}

/** The JsonSchema handed to completeJSON. */
export const verdictSchema: JsonSchema = { name: "verdict", validate: validateVerdictOutput };

/* ---------- the persisted shape ---------- */

/**
 * The verdict as persisted. Superset of lib/tenders/types Verdict: money is
 * the full ComputedMoney (per-field known flags + "needs confirmation" lines),
 * and the model's requirements / eligibility clauses / risks / unknowns ride
 * along. validateVerdict in lib/tenders accepts this (extras survive the
 * localStorage round-trip, so downstream screens can read them back).
 */
export type EngineVerdict = Omit<Verdict, "money"> & {
  money: ComputedMoney;
  requirements: string[];
  eligibilityClauses: string[];
  disqualificationRisks: string[];
  unknowns: string[];
};
