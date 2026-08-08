// Quotra lib/translate — the translation seam (contract only, FROZEN 2026-08-08).
//
// Implemented by the v2 Sarvam lane in lib/translate/sarvam.ts
// (handoff/sarvam/TASKS/T4-translate-layer.md).
//
// Citation discipline for translated surfaces: a translated verdict reason or
// eligibility row RENDERS ALONGSIDE its source-language original — the quoted
// clause text is evidence and is never silently replaced by a translation.
// Deterministic content (₹ figures, dates, EMD) is computed by lib/money and
// passes through translation UNTOUCHED — numerals stay international format.

export type TranslateLanguage = "en-IN" | "ta-IN" | "hi-IN";

export type TranslateArgs = {
  text: string;
  source: TranslateLanguage;
  target: TranslateLanguage;
};

export type TranslateResult = {
  text: string;
  /** Provider request id for provenance, if available. */
  requestId?: string;
};

export interface TranslateProvider {
  id: "sarvam";
  translate(args: TranslateArgs): Promise<TranslateResult>;
  /** Batch helper for row-shaped surfaces (eligibility matrix, bid pack checklist). Order-preserving. */
  translateMany(texts: string[], source: TranslateLanguage, target: TranslateLanguage): Promise<string[]>;
}
