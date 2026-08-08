// Quotra lib/translate — bilingual projection helpers (T4 deliverable,
// TASKS/T4-translate-layer.md). Tonight's merge consumes these to render a
// verdict/matrix/bid-pack in Tamil or Hindi ALONGSIDE the English original —
// never replacing it. Source fields (clause, requirement text's evidence
// id, citation) are never mutated; each helper returns the original object
// plus new `*Translated` fields.
//
// Default source language is "en-IN": every surface these operate on
// (verdict reasons, eligibility rows, bid-pack compliance rows) is produced
// in English by lib/verdict's Claude/Sarvam prompt — see lib/verdict/prompt.ts.

import type { BidPackComplianceRow, EligibilityRow, VerdictReason } from "../tenders/types";
import { translateMany } from "./sarvam";
import type { TranslateLanguage } from "./types";

const DEFAULT_SOURCE: TranslateLanguage = "en-IN";

export type TranslatedVerdictReason = VerdictReason & { textTranslated: string };

/** clause/text originals UNTOUCHED — textTranslated rides alongside. */
export async function translateVerdictReasons(
  reasons: VerdictReason[],
  target: TranslateLanguage,
  source: TranslateLanguage = DEFAULT_SOURCE,
): Promise<TranslatedVerdictReason[]> {
  if (reasons.length === 0) return [];
  const translated = await translateMany(
    reasons.map((r) => r.text),
    source,
    target,
  );
  return reasons.map((r, i) => ({ ...r, textTranslated: translated[i] }));
}

export type TranslatedMatrixRow = EligibilityRow & {
  requirementTranslated: string;
  howToGetTranslated: string | null;
};

/** requirement + howToGet translated; clause, status, evidenceDocId untouched. */
export async function translateMatrixRows(
  rows: EligibilityRow[],
  target: TranslateLanguage,
  source: TranslateLanguage = DEFAULT_SOURCE,
): Promise<TranslatedMatrixRow[]> {
  if (rows.length === 0) return [];
  const requirements = rows.map((r) => r.requirement);
  // howToGet is nullable; translate a placeholder for null rows and discard the result
  // rather than special-casing translateMany's order-preserving contract.
  const howToGets = rows.map((r) => r.howToGet ?? "");
  const [requirementsTranslated, howToGetsTranslated] = await Promise.all([
    translateMany(requirements, source, target),
    translateMany(howToGets, source, target),
  ]);
  return rows.map((r, i) => ({
    ...r,
    requirementTranslated: requirementsTranslated[i],
    howToGetTranslated: r.howToGet === null ? null : howToGetsTranslated[i],
  }));
}

export type TranslatedBidPackItem = BidPackComplianceRow & { specTranslated: string };

/** spec translated; citation (the clause reference) untouched. */
export async function translateBidPackChecklist(
  items: BidPackComplianceRow[],
  target: TranslateLanguage,
  source: TranslateLanguage = DEFAULT_SOURCE,
): Promise<TranslatedBidPackItem[]> {
  if (items.length === 0) return [];
  const translated = await translateMany(
    items.map((i) => i.spec),
    source,
    target,
  );
  return items.map((it, i) => ({ ...it, specTranslated: translated[i] }));
}
