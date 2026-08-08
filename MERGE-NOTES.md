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

## T2 — Voice core (Saaras STT + Bulbul TTS) · done, audio fixtures missing · ~1h

- Landed: `lib/voice/sarvam.ts` (real `transcribe`/`speak`), `checks/sarvam-voice.ts`,
  `fixtures/audio/README.md` (recording instructions, no audio committed).
- Check: `npx tsx checks/sarvam-voice.ts` → **22/22 offline PASS**; live half (STT fixture
  round-trips + `speak()` round-trip) **SKIPPED — no `NEXT_PUBLIC_SARVAM_API_KEY` AND no
  recorded audio fixtures.** `npm run check` (tsc) → clean.
- Wire-up tonight: `sarvamVoiceProvider` (id: "sarvam") satisfies `lib/voice/types.ts`'s
  frozen `VoiceProvider` exactly — `transcribe()`/`speak()` are pure functions over Blobs,
  no UI/store coupling. Deliberately does NOT import `lib/llm/sarvam.ts` (duplicates key
  resolution) so this module stays independently mergeable per the task brief.
- Decisions made:
  - **Audio fixtures were NOT recorded** — this build environment has no microphone.
    `fixtures/audio/README.md` has exact recording instructions (3 files, ≤15s,
    16kHz WAV/webm) for whoever has a mic. **This is the one T2 acceptance item that
    genuinely cannot be done here — needs a human.**
  - **30s guard is a byte-size heuristic**, not a real duration check (Blobs don't carry
    duration): `MAX_AUDIO_BYTES` assumes worst-case 16kHz/16-bit mono WAV (~256kbps) ×
    30s ≈ 960KB. Compressed formats (webm/opus) will rarely trip this — the real
    enforcement is T3's 25s recorder hard-cap; this is a backstop only.
  - **2,500-char TTS limit: chose "speak the first chunk + `truncated` flag" over
    concatenation** (the task explicitly offered both options) — naively concatenating
    separate WAV/opus API responses is fragile (headers/duration fields don't just
    byte-concat), so the honest behavior is speaking what fits and flagging the rest.
    `SarvamSpeakResult` extends the frozen `SpeakResult` with `truncated`/`charsSpoken`
    (extra fields — structurally still satisfies `VoiceProvider.speak()`'s `Promise<
    SpeakResult>` contract).
  - **Default speakers** (`DEFAULT_SPEAKER`): en-IN → anushka(f)/aditya(m), ta-IN →
    priya(f)/anand(m), hi-IN → kavya(f)/rohan(m), primary = female voice per language.
    **Picked from the documented Voices-page name list, not A/B'd against real audio** (no
    live key here) — listen to `fixtures/audio/out-ta.wav`/`out-en.wav` once the live
    check runs and swap if a different voice reads better for the demo.
  - **STT response field is a guess** (`transcript`, falling back to `text`) — TTS's
    `audios[]` field IS pinned in SARVAM-API-NOTES.md and used directly with confidence,
    but the STT response shape isn't documented there. Same category of risk as T4's
    `/translate` response-field guess.
- Needs Gabriel:
  1. **Record the three audio fixtures** (see `fixtures/audio/README.md`) — this is a
     hard blocker for T2's live acceptance and for T3's human-proof demo recording.
  2. Real `NEXT_PUBLIC_SARVAM_API_KEY` to run the live half and confirm the STT response
     field-name guess above.
  3. A quick listen to `out-ta.wav`/`out-en.wav` once live, to sanity-check the
     `DEFAULT_SPEAKER` picks.

## T3 — Ask Quotra by voice playground · done, human demo recording missing · ~1.5h

- Landed: `app/playground/voice/page.tsx`, `lib/askquotra/contract.ts` (the ask-quotra
  JSON contract + schema validator), `lib/askquotra/prompt.ts` (fixture-grounded prompt
  builder), `checks/sarvam-playground.ts`. Also extended `lib/i18n/dictionaries/{en,ta,hi}
  .ts` with 15 new `voice.*` keys (additive only — no existing English values touched;
  `checks/sarvam-i18n.ts` still 10/10, both new languages at 15/15 on the new keys).
- Check: `npx tsx checks/sarvam-playground.ts` → **8/8 PASS** — schema validator rejects
  uncited/malformed answers and accepts well-formed ones (7 assertions), and a real
  `next build` of the page passes (1 assertion). `npm run check` (tsc) → clean.
- **Manually verified in a live browser** (not just `next build`): loaded
  `/playground/voice`, confirmed the BYOK key field appears when no key is set, saving a
  key to `localStorage.quotra_sarvam_key` makes the field disappear, and the
  `LanguageToggle` live-switches ALL page chrome (title, key prompt, button labels) between
  EN/Tamil/Hindi via `t()` — the page dogfoods the i18n seam as instructed. No console
  errors. Could not exercise the actual voice loop (mic → STT → LLM → translate → TTS) —
  no microphone and no real Sarvam key in this environment.
- Wire-up tonight: the four pieces to lift into the real Ask Quotra dialog are (1)
  `lib/askquotra/contract.ts` + `prompt.ts` as-is — provider-agnostic, works with either
  Anthropic or Sarvam through `@/lib/llm`'s dispatch; (2) the push-to-talk `MediaRecorder`
  pattern in `page.tsx` (pointer-down/up hold-to-talk, 25s hard-cap timer, `onstop` →
  handler) — copy the handlers, not the JSX; (3) the `handleRecordingComplete` state
  machine (transcribe×2 → completeJSON → conditional translate → speak → autoplay) is the
  actual product flow, page markup around it is throwaway; (4) mount `LanguageToggle` per
  T7's note (Settings or app header).
- Decisions made:
  - **`lib/askquotra/` is a new lib folder**, not reusing `lib/verdict/` — the ask-quotra
    contract (`{ answer, citations[] }`) is a different, simpler shape than the verdict
    contract (`{ verdict, reasons[], requirements[], ... }`), and T3's brief describes it
    as its own contract. If the real product already has an Ask-Quotra contract type
    elsewhere, this may need reconciling at merge — same caveat as T4's eligibility/bidpack
    type mismatch.
  - **Push-to-talk implemented as true hold** (Pointer Events: `onPointerDown` starts,
    `onPointerUp`/`onPointerLeave` stops) rather than a click-to-toggle button, matching
    the brief's literal "push-to-talk" wording. `onPointerLeave` guards against a stuck
    "recording" state if the pointer is released off the button.
  - **Speech summarization** (`summarizeForSpeech`): first 2 sentences (split on
    `.!?।。`) capped at 2400 chars, matching the brief's "≤2 sentences, cap 2400 chars"
    instruction literally.
  - **Bilingual rendering only triggers for ta/hi** detected input — an English question
    just shows the English answer once (no redundant self-translation), matching "never
    replacing" the English but not manufacturing a translation nobody asked for.
- Needs Gabriel:
  1. **The human-proof screen recording is missing** (`fixtures/playground-voice-demo.mp4`)
     — this needs a real microphone, a real Sarvam key, and a human speaking the Tamil
     fixture question. This is also explicitly "tomorrow's demo rehearsal" per the task
     brief — genuinely worth doing once, seriously, by a person.
  2. Everything upstream (T1 live spike, T2 audio fixtures, T4 live translate) needs to be
     verified live before this page's full loop can be trusted end-to-end — right now every
     piece has passed its OFFLINE contract tests but none have run against the real Sarvam
     API together in sequence.
  3. Sanity-check whether `lib/askquotra/`'s contract should actually just be folded into
     `lib/verdict/` or kept separate — a real product decision, not mine to make blind.

## T5 — Doc AI digitisation · GATED at Step 0 · ~30min (timeboxed research, as instructed)

- Landed: `lib/docai/sarvam.ts` (honest "not available" stub, not a speculative
  implementation), `checks/sarvam-docai.ts`, **`fixtures/tender-gem-9679256.pdf`** — a
  real, public, bilingual (Hindi/English) GeM tender PDF, 7 pages, downloaded directly
  from `bidplus.gem.gov.in/showbidDocument/9679256` (the `sourceUrl` on fixture tender
  `gem-9679256` in `fixtures/tenders.sample.json`) — no CAPTCHA/login needed for this one,
  unlike the two CPPP fixture tenders. It's CCTV AMC for CSIR Pusa, contains exactly the
  kind of content T5 wants to prove digitisation on (EMD detail, turnover eligibility,
  technical specs table, bilingual text throughout).
- Check: `npx tsx checks/sarvam-docai.ts` → **3/3 PASS** (fixture PDF exists and is
  non-trivial; the stub fails loudly with a named error rather than silently). No live
  half — there is no REST API to call. `npm run check` (tsc) → clean.
- **Research finding (the actual T5 deliverable here): Sarvam Doc AI has NO documented
  REST API.** Checked four docs.sarvam.ai/docai pages (`getting-started/overview.md`,
  `how-to/digitise-a-document.md`, `how-to/extract-fields-from-a-document/
  extract-structured-fields.md`, and the docai landing page) via the docs MCP-equivalent
  fetch. Every page describes the dashboard workflow ONLY — upload, configure, process,
  edit, download at `dashboard.sarvam.ai`. The landing page's own words: **"Every workflow
  is one dashboard click at dashboard.sarvam.ai. No code required."** No endpoint paths,
  no auth header, no job/poll shape, no response schema anywhere. Dashboard limits ARE
  documented (50MB/file, 10 pages/project, PDF/JPEG/PNG) but those are UI constraints, not
  API parameters.
- **The task's own fallback also blocked**: "digitise ONE page manually via the dashboard
  UI, save as `fixtures/docai-sample-output.json`" needs a Sarvam dashboard login —
  unavailable in this environment. So both the primary path and its documented fallback
  were gated here; per the task brief's own instruction ("do not burn hours on access"),
  I stopped at the research finding rather than guessing at undocumented endpoints or
  fabricating fixture output.
- Decision made: **`digestTenderPdf()` throws a clear `DocAiNotAvailableError` instead of
  calling speculative/made-up endpoints.** Writing code against an undocumented API would
  produce something that LOOKS finished but silently fails or does the wrong thing —
  worse than an honest stub (same pattern the original `lib/llm/sarvam.ts` stub used
  before T1 landed). The `DigitisedPage` return shape (`{ page: number; text: string }[]`)
  is there so a real implementation has a target to fill in.
- Needs Gabriel (this is the task most worth 10 minutes of your direct attention):
  1. **Log into dashboard.sarvam.ai and check**: (a) whether an API/enterprise tier for
     Doc AI exists that just isn't in the public docs, and (b) if not, manually digitise
     `fixtures/tender-gem-9679256.pdf` (or even just its first page) through the dashboard
     UI and save the output as `fixtures/docai-sample-output.json` — this alone would
     satisfy the task's fallback and give a real quality data point for the demo
     narrative.
  2. If real API access turns out to exist, `lib/docai/sarvam.ts`'s stub is exactly where
     to drop in the real client — the file header documents what's known and unknown.
