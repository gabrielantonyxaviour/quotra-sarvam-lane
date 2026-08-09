> ⚠️ **SUPERSEDED 2026-08-09** — the executable spec is now **`SARVAM-LANE-TASKS.md`** (repo root, tasks S1–S7). This brief is kept for history; where the two disagree, S1–S7 wins. Note: T6 (phone agent) is **cut** — do not work on it.

# T5 — Tender PDF digitisation via Sarvam Vision (Doc AI)

**Deliverable:** `lib/docai/sarvam.ts` + `checks/sarvam-docai.ts` — turn a real
government tender PDF into structured text with Sarvam's document-intelligence stack.

**Why it matters:** our bundled tenders carry listing-level `rawText` (300–500 chars).
The actual tender PDFs are 10–40 scanned, often bilingual pages — exactly what Sarvam
Vision (3B doc model, 22 Indian languages + English) is built for. Digitised pages mean
richer verdict grounding AND real clause/page citations instead of listing-level
`page: null`. This is also the most "Sarvam-native" story beat after voice: government
PDFs in Indian languages are their home turf.

## Step 0 — research (30 min, timeboxed)

The docs live at docs.sarvam.ai/docai (use the docs MCP or append `.md` to URLs):
`docai/how-to/digitise-a-document.md`, `docai/how-to/extract-fields-from-a-document/
extract-structured-fields.md`. Pin: the REST endpoints (likely an async job API:
upload → poll → fetch), auth, input limits, and whether API access is generally
available or dashboard/enterprise-gated. **If gated: write the finding in MERGE-NOTES
(what you tried, exact error), skip to the fallback below, move on.** Do not burn hours
on access.

## Implement (API path)

- `digestTenderPdf(file: Blob | Buffer): Promise<{ pages: {page: number, text: string}[] }>`
  — thin client over the digitise flow; keep the job-polling loop simple (interval 2 s,
  timeout 3 min, clear errors).
- Get a real PDF: the fixture tenders in `fixtures/tenders.sample.json`
  carry `sourceUrl` (and some a `docs` list) — download one tender document from CPPP/GeM.
  Government portals are flaky; if downloads fail, ANY real scanned tender PDF from
  eprocure.gov.in in the CCTV/electrical category works. Commit the PDF used to
  `fixtures/` (they're public documents).

## Fallback (if Doc AI API is gated)

Run the same PDF through Saaras?—no. The honest fallback: record the gate, and instead
digitise ONE page via the dashboard UI manually, saving the output as
`fixtures/docai-sample-output.json` — it still proves quality for the demo narrative,
and the API wiring becomes a post-hackathon task.

## Acceptance — `checks/sarvam-docai.ts`

Live: one real tender PDF in → per-page structured text out; the check asserts ≥80% of
pages return non-empty text, that at least one EMD/eligibility-related string appears
(grep for "EMD|earnest|eligib|turnover"), and saves the full output to
`fixtures/docai-<tenderRef>.json`. MERGE-NOTES: endpoint reality
(open/gated), per-page latency, output quality verdict in one sentence, and whether
tonight's merge should feed digitised text into the verdict prompt for the demo tender.
