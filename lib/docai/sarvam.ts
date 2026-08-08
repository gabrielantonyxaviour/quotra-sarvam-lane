// Quotra lib/docai — Sarvam Doc AI (Vision) client (T5, TASKS/T5-doc-digitisation.md).
//
// STATUS: gated, per TASKS/T5's own Step 0 research instruction ("if gated:
// write the finding in MERGE-NOTES, skip to the fallback, move on — do not
// burn hours on access"). Findings (checked 2026-08-08 against four docs
// pages — docai/getting-started/overview.md, docai/how-to/digitise-a-
// document.md, docai/how-to/extract-fields-from-a-document/
// extract-structured-fields.md, and the docai landing page):
//
//   - ZERO REST endpoints are documented anywhere in Doc AI's docs. Every
//     page describes the dashboard workflow only (upload → configure →
//     process → edit → download at dashboard.sarvam.ai).
//   - The digitise how-to page states dashboard limits explicitly: "50 MB
//     per file", "10 pages per project", PDF/JPEG/PNG only — but these are
//     UI constraints, not API parameters; no auth header, no job/poll
//     shape, no response schema is documented.
//   - The docai landing page's own words: "Every workflow is one dashboard
//     click at dashboard.sarvam.ai. No code required." That's a strong
//     signal this is a dashboard-only product today, not an oversight in
//     the docs.
//
// The task's own fallback (digitise ONE page manually via the dashboard UI,
// save the output as fixtures/docai-sample-output.json) ALSO needs a Sarvam
// dashboard account — unavailable in this environment. So neither the API
// path nor its fallback could be completed here. What COULD be done:
// fixtures/tender-gem-9679256.pdf is a real, public, bilingual GeM tender
// PDF (CCTV AMC — matches fixture tender "gem-9679256"), downloaded and
// committed so whoever has dashboard/API access can digitise it directly
// without another PDF hunt.
//
// digestTenderPdf() below is intentionally a clear "not available" stub
// (same pattern lib/llm/sarvam.ts used before T1 landed) rather than a
// speculative implementation against undocumented endpoints — calling
// made-up endpoints with fabricated request/response shapes would produce
// code that looks done but silently fails, which is worse than an honest
// stub. If Sarvam ships (or already has, gated behind enterprise access) a
// REST API for this, replace the throw below with a real implementation;
// the DigitisedPage return shape is what the rest of the app should expect.

export type DigitisedPage = { page: number; text: string };

export class DocAiNotAvailableError extends Error {
  constructor() {
    super(
      "Sarvam Doc AI (digitise/extract) has no documented REST API as of 2026-08-08 — " +
        "every docs.sarvam.ai/docai page describes dashboard-only access (dashboard.sarvam.ai). " +
        "Digitise fixtures/tender-gem-9679256.pdf manually via the dashboard UI and save the " +
        "result as fixtures/docai-sample-output.json, or check with Sarvam whether enterprise/API " +
        "access exists before replacing this stub with a real implementation.",
    );
    this.name = "DocAiNotAvailableError";
  }
}

/**
 * Thin client over Sarvam's document-digitise flow — turns a tender PDF into
 * per-page structured text. NOT IMPLEMENTED: see DocAiNotAvailableError and
 * the file header above for why, and MERGE-NOTES.md for the research trail.
 */
export async function digestTenderPdf(_file: Blob | Buffer): Promise<{ pages: DigitisedPage[] }> {
  throw new DocAiNotAvailableError();
}
