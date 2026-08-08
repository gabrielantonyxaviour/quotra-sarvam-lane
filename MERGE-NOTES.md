# MERGE-NOTES — the v2-sarvam lane's running log

**Append a block per task as you finish (or abandon) it.** This file is the script for
tonight's merge hour: Gabriel reads it top to bottom and wires the lane in. Be blunt —
"works but slow", "gated, gave up after 30 min", "chose X over Y because Z" are all
better than silence.

Template:

```
## T<N> — <name> · <done | partial | blocked> · <time spent>
- Landed: <files>
- Check: <command> → <PASS/FAIL summary>
- Wire-up tonight: <exactly what Gabriel does to integrate>
- Decisions made: <model/voice/param choices + why>
- Needs Gabriel: <decisions, accounts, deploys>
```

---

(entries start here)

## T1 — LLM adapter (Sarvam) · done, spike not yet live-run · ~1h

- Landed: `lib/llm/sarvam.ts` (real `sarvamComplete`), `checks/sarvam-spike.ts`,
  `checks/sarvam-llm.ts`.
- Check: `npx tsx checks/sarvam-llm.ts` → **17/17 offline PASS**; live half (real verdict
  + Tanglish Ask-Quotra) **SKIPPED — no `NEXT_PUBLIC_SARVAM_API_KEY` in this environment**.
  `npx tsx checks/sarvam-spike.ts` → **SKIPPED, same reason** (all 3 response-format modes
  unexercised against the real API). `npm run check` (tsc) → clean.
- Wire-up tonight: nothing extra — `lib/llm/sarvam.ts` implements the frozen `./client.ts`
  contract exactly, so flipping `localStorage.quotra_llm_provider = "sarvam"` (or
  `NEXT_PUBLIC_QUOTRA_LLM_PROVIDER=sarvam`) routes every intelligent surface through it via
  the existing `index.ts` dispatch. No other files changed.
- Decisions made:
  - Model routing: `sarvam-105b` default; `sarvam-105b-conversations` for `feature ===
    "ask-quotra"` (post-trained for dialogue per SARVAM-API-NOTES.md) — **untested against
    the real API**, pick based on the live spike's Ask-Quotra output quality once run.
  - `response_format: { type: "json_object" }` applied for verdict/eligibility/bidpack
    features (mirrors `client.ts`'s `OPUS_FEATURES` heavy-task list) — **this is a guess,
    not a proven-best mode**. The spike script tests plain / `json_object` / `json_schema`
    in that order and reports pass rate + attempts + latency per mode; it has not been run
    live. **Run it first** (`NEXT_PUBLIC_SARVAM_API_KEY=... npx tsx checks/sarvam-spike.ts`)
    and switch `wantsJsonMode`'s behavior (or add `json_schema`) in `sarvam.ts` if a
    different mode wins.
  - `max_tokens` defaults to 4096 (Starter-plan cap) — thinking mode is on by default and
    reasoning tokens count toward it (SARVAM-API-NOTES.md gotcha); empty `content` with
    `finish_reason: "length"` is the tell.
  - Reused `RateLimitError`/`ApiError` from `client.ts` per the task brief rather than
    inventing parallel classes — **known wart**: `ApiError`'s message is hardcoded
    `"Anthropic API error (HTTP ...)"`, so a Sarvam HTTP failure surfaces that string even
    though it's not Anthropic. Can't fix without editing the frozen `client.ts`; flagging
    for whoever owns error-message UX downstream.
  - `SarvamNotImplementedError` kept in `sarvam.ts` (unused, never thrown) purely because
    frozen `index.ts` re-exports it by name — removing it would break the build without
    permission to edit `index.ts`.
- Needs Gabriel:
  1. A real `NEXT_PUBLIC_SARVAM_API_KEY` to run `checks/sarvam-spike.ts` and the live half
     of `checks/sarvam-llm.ts` — neither has touched the real API yet, only the offline
     stubbed-fetch contract is proven.
  2. Confirm the `response_format` / model-routing choices above once the spike has real
     latency/pass-rate numbers — right now they're the most reasonable defaults per
     SARVAM-API-NOTES.md, not measured.
  3. Real fixtures (`fixtures/company.real.json`, `fixtures/experience.real.json`) are in
     place from the zip you sent, confirmed `.gitignore`d (`git check-ignore` verified) —
     not committed, not going in this PR.

## T7 — Indic UI copy (ta/hi dictionaries + LanguageToggle) · done · ~30min

- Landed: `lib/i18n/dictionaries/ta.ts`, `lib/i18n/dictionaries/hi.ts` (23/23 seed keys,
  100% coverage both languages), `components/i18n/LanguageToggle.tsx`,
  `checks/sarvam-i18n.ts`.
- Check: `npx tsx checks/sarvam-i18n.ts` → **10/10 PASS** (no orphans, seed-hash guard on
  `en.ts`, `t()` fallback chain, coverage report). `npm run check` (tsc) → clean.
- Wire-up tonight: mount `<LanguageToggle onChange={...} />` — candidates are Settings
  (persistent per-user choice) or the app header (always visible, one tap to switch mid-
  demo for a Tamil-speaking stakeholder). Your call; it only needs `@/lib/i18n`'s
  `setActiveLanguage`/`activeLanguage`, no other wiring. Screens read via `t("key")`.
- Decisions made:
  1. **"Vault" and "Brain" stay English** in both ta/hi (`nav.vault`, `nav.brain`) — treated
     as Quotra's own product feature names (proper nouns), same tier as GO/NO-GO/FIXABLE,
     not generic nouns to translate.
  2. **Domain nouns get transliterated into native script when they take a grammatical
     case ending** — "tender" → `டெண்டர்`/`टेंडर`, "verdict" → `வெர்டிக்ட்`/similar,
     "bid pack" → `பிட் பேக்`/`बिड पैक` — matching the actual fixture example in
     `TASKS/T2-voice-core.md` ("இந்த **டெண்டருக்கு** EMD எவ்வளவு?"), which transliterates
     "tender" but keeps the acronym "EMD" in Latin script. Read literally, T7's rule 2 says
     these terms "stay English" — I followed the fixture's actual usage over the rule's
     wording since Tamil/Hindi grammar can't attach case suffixes to Latin-script text
     cleanly in a real sentence. Acronyms (EMD) stay Latin-script always.
  3. **`ask.placeholder`'s trailing hint stays multi-script in every language** — the
     English seed already ends "— English, தமிழ், हिन्दी…" to show all three scripts are
     accepted; the ta/hi translations keep that exact trailing clause verbatim (only the
     leading sentence is translated) so the hint reads the same regardless of which
     language is active.
- Needs Gabriel: **these are AI-drafted translations, not reviewed by a native Tamil/Hindi
  speaker.** UI chrome is short — get 5 minutes from a native speaker before the demo,
  especially on `verdict.run`/`verdict.running`/`tender.*` phrasing, which are judgment
  calls on register (I aimed for plain business Tamil/Hindi, not formal/literary).

## T4 — Translate layer (bilingual verdicts/matrices/packs) · done, live untested · ~1h

- Landed: `lib/translate/sarvam.ts` (real `translate`/`translateMany`), `lib/translate/
  bilingual.ts` (`translateVerdictReasons`/`translateMatrixRows`/`translateBidPackChecklist`),
  `checks/sarvam-translate.ts`.
- Check: `npx tsx checks/sarvam-translate.ts` → **21/21 offline PASS**; live half (real
  en→ta/en→hi translation + matrix row round-trip) **SKIPPED — no
  `NEXT_PUBLIC_SARVAM_API_KEY`**. `npm run check` (tsc) → clean.
- Wire-up tonight: `sarvamTranslateProvider` (id: "sarvam") satisfies `lib/translate/
  types.ts`'s frozen `TranslateProvider` interface directly. `bilingual.ts`'s three helpers
  are the ones to call from screens — each takes the *untranslated* source array + a
  `TranslateLanguage` target and returns the same objects with a new `*Translated` field;
  nothing in `lib/tenders/types.ts`'s `VerdictReason`/`EligibilityRow`/
  `BidPackComplianceRow` shapes is touched.
- Decisions made:
  - **`lib/eligibility/matrix.ts` and `lib/bidpack/` don't exist in this trimmed lane
    copy** — the task brief names them, but this repo only carries the trimmed
    `lib/tenders/types.ts`, which already has `EligibilityRow` and `BidPackComplianceRow`.
    Imported from there instead; if the real product repo's `MatrixRow`/bid-pack item
    shapes differ from `EligibilityRow`/`BidPackComplianceRow`, the `*Translated` field
    names here (`requirementTranslated`, `howToGetTranslated`, `specTranslated`) may need
    renaming at merge time — the logic (translate the free-text field, leave IDs/clauses
    untouched) carries over regardless.
  - **Response field name is a guess**: `POST /translate`'s exact response shape wasn't
    pinned in SARVAM-API-NOTES.md and I have no live key to confirm it. Coded to read
    `translated_text` (falls back to `output`) — **this is unverified against the real
    API.** First thing to check once a key is available; if the live spike/checks show a
    different field name, it's a one-line fix in `translateChunk()`.
  - Digit-preservation guard (`digitsPreserved`) is a count-preserving multiset compare
    of `\d+` sequences, not position-preserving — a translation that reorders clauses but
    keeps all the same numbers still passes, which is the correct behavior (translations
    legitimately reorder word order).
  - Reused `RateLimitError`/`ApiError` from `lib/llm/client.ts` again (same house pattern
    as T1) — same known wart applies: failures surface as "Anthropic API error" even
    though the call was to Sarvam. Visible directly in this check's own console output
    (`translateMany: row 1 failed (Anthropic API error (HTTP 500): ...)`).
- Needs Gabriel:
  1. Real `NEXT_PUBLIC_SARVAM_API_KEY` to run the live half and confirm the `/translate`
     response field name assumption above.
  2. Confirm whether the real product repo's `lib/eligibility/matrix.ts` /
     `lib/bidpack/` types match `EligibilityRow`/`BidPackComplianceRow` closely enough to
     drop `bilingual.ts` in unchanged, or whether the `*Translated` field names need a
     rename pass at merge.
