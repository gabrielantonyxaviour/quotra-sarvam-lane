# T4 — The translate layer: bilingual verdicts, matrices, packs

**Deliverable:** `lib/translate/sarvam.ts` implementing the frozen
`TranslateProvider` in `lib/translate/types.ts`, plus a bilingual projection helper.
This makes the product's OUTPUTS Indic — a verdict a Tamil-speaking MD reads in Tamil
with the cited English clause intact next to it.

## Implement

**`translate(args)`** → `POST https://api.sarvam.ai/translate`
- JSON: `input`, `source_language_code`, `target_language_code`,
  `model: "sarvam-translate:v1"`, **`numerals_format: "international"`** (hard
  requirement — see discipline below).
- **⚠ 2,000-char limit** → chunk on sentence boundaries (`。".!?।`+ newline), translate
  sequentially, rejoin. Never split mid-sentence.

**`translateMany(texts, source, target)`** — order-preserving, concurrency ≤3 (be polite
to rate limits), one failed row falls back to its source text with a recorded error, the
batch never throws for one bad row.

**`bilingual.ts` (same folder)** — the projection tonight's merge consumes:
```ts
translateVerdictReasons(reasons, target) →
  [{ clause, page, text, textTranslated }]        // clause/text originals UNTOUCHED
translateMatrixRows(rows, target)                  // requirement+notes translated, evidence ids untouched
translateBidPackChecklist(items, target)
```
Read the shapes in `lib/verdict/engine.ts` (VerdictReason), `lib/eligibility/
matrix.ts` (MatrixRow), `lib/bidpack/` — import their types, add `*Translated`
fields alongside, never mutate or replace source fields.

## The discipline (product law — the check enforces it)

- **Quoted evidence is never replaced.** A translated reason RENDERS ALONGSIDE the
  source-language original. Your helpers return both; they never drop the original.
- **Numbers pass through byte-identical.** ₹ figures, dates, EMD, percentages are
  computed by `lib/money` — if translation restyles "₹4,86,000" or "2026-08-21", that's
  a bug. `numerals_format: "international"` + a post-check: every digit-sequence present
  in the source appears unchanged in the translation; rows that fail fall back to source.

## Acceptance — `checks/sarvam-translate.ts`

Stubbed: chunking splits at sentence boundaries and rejoins losslessly; translateMany
preserves order and survives one failing row; digit-preservation guard catches a
deliberately-mangled fixture. Live (key set): translate a real verdict reason (take one
from `fixtures/anthropic-example-outputs.json` shape or write one against tender [0])
en→ta and en→hi — output non-empty, digits intact, INR/dates byte-identical; a matrix
row round-trips with evidence ids untouched. Exit 0 → commit + MERGE-NOTES (include one
side-by-side example so Gabriel sees the quality tonight).
