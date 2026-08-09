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

## T1 — LLM adapter (Sarvam) · done, spike LIVE-RUN 2026-08-09 · ~1h

- Landed: `lib/llm/sarvam.ts` (real `sarvamComplete`), `checks/sarvam-spike.ts`,
  `checks/sarvam-llm.ts`.
- Check: `npx tsx checks/sarvam-llm.ts` → **17/17 offline PASS**.
  `npx tsx checks/sarvam-spike.ts` (LIVE, real key, real verdict fixture
  `cppp-2026-drdo-921134-1`) → **3/3 PASS**:
  - `plain` (no response_format): PASS in 1 attempt, 4361ms
  - `json_object`: PASS in 1 attempt, 26370ms (**much slower — avoid for latency-sensitive
    calls**)
  - `json_schema` (verdict shape): PASS in 1 attempt, 3299ms (**fastest AND schema-enforced
    server-side — this is the mode to use**)

  `npm run check` (tsc) → clean.
- **Decision locked in from live data**: `lib/llm/sarvam.ts` now sends
  `response_format: { type: "json_schema" }` with a concrete `VERDICT_JSON_SCHEMA` for
  the `verdict` feature (mirrors `lib/verdict/engine.ts`'s `validateVerdictOutput` —
  keep in sync). `eligibility`/`bidpack` stay on `json_object` — they're named in
  `JSON_MODE_FEATURES` (mirroring `client.ts`'s `OPUS_FEATURES`) but have no concrete
  prompt/schema in this trimmed lane, so switching them would be guessing a schema shape
  that's never been proven.
- **Bug found and fixed in `checks/sarvam-llm.ts`**: the offline test suite clobbered
  `NEXT_PUBLIC_SARVAM_API_KEY` for isolation (`delete process.env...`) but never restored
  it before `liveTests()` ran — so the live half silently SKIPPED even with a real key
  set. Fixed to stash/restore the real key. With that fixed and a real key:
  `npx tsx checks/sarvam-llm.ts` → **19/19 PASS live** (was 17/17 offline-only) — real
  verdict call on fixture tender `[0]` passes `validateVerdictOutput`, real Tanglish
  Ask-Quotra call returns non-empty cited English text. **T1's LLM adapter is now fully
  live-verified end to end, not just offline-proven.**
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

## S2 — Live conformance suite (sarvam-105b verdicts) · done, HONEST partial pass · ~1h

- Landed: `checks/sarvam-conformance.ts` — runs the REAL production path
  (`buildVerdictPrompt` → `completeJSONWith(sarvamComplete)` → `verdictSchema`, the
  same one-corrective-retry contract every feature gets) against all 3 fixture
  tenders, live, and scores citation fidelity (word-overlap of each reason's text
  against the FULL prompt content the model saw — not just `tender.rawText`, since
  legitimate citations also reference the company profile / product master /
  structured tender fields `buildVerdictPrompt` includes).
- Check: `NEXT_PUBLIC_SARVAM_API_KEY=... npx tsx checks/sarvam-conformance.ts` → run
  **twice** for a consistency read. Run 1: 1/3 tenders fully conformant (8/9 reasons
  grounded, 89%). Run 2: 0/3 fully conformant (5/8 grounded, 63%). **Not
  deterministic** — same prompts, same schema, materially different outcomes
  run-to-run. `npm run check` (tsc) → clean.
- **Real live finding (the actual point of S1/S2 — "live-fire or it isn't done"):**
  `gem-9679256` hard-failed **both** runs — sarvam-105b's thinking mode consumed the
  ENTIRE 4096-token budget (Starter-plan HARD cap, confirmed: a `max_tokens: 8192`
  probe got HTTP 400 `"exceeds the maximum allowed for sarvam-105b for your
  subscription tier (starter): 4096"`) on the ORIGINAL call AND the one corrective
  retry, both times returning `finish_reason: "length"` with EMPTY content. No
  `reasoning_effort` value below the documented default `"low"` exists (`"minimal"`
  was rejected: API only accepts `low`/`medium`/`high`) — there is no way to force
  less thinking. Root cause looks content-dependent, not size-dependent: the tender
  that reliably fails has one of the SHORTEST `rawText`s (307 chars) of the three
  fixtures — a sparser listing seems to make the model reason longer about what it
  can't determine, not less.
- **This is flaky, not broken**: manually re-running the exact same `cppp-28403`
  call twice (outside the check) got `finish_reason: "length"` (empty) once and
  `finish_reason: "stop"` (clean 703-token answer, well-cited) the next — pure
  run-to-run variance at `temperature: 0.2`. `completeJSONWith`'s existing
  one-corrective-retry (shared, provider-agnostic, `lib/llm/client.ts` — nothing S2
  needed to add) already covers this most of the time; it just isn't a 100%
  guarantee against two unlucky draws in a row, which is exactly what happened to
  `gem-9679256`.
- **Honest verdict against S2's pass bar** ("100% citation fidelity on fixtures, no
  schema failures after single retry"): **not met.** Citation fidelity on the
  reasons that DO land is strong (63-89% of individual reasons grounded across two
  runs — most misses are borderline ~0.4 ratio, not fabrication), but one fixture
  tender is a real, reproducible reliability risk for the demo. Per the project's
  own rule ("hybrid fallback allowed — if a feature fails, it stays Anthropic;
  hiding failure is the only real failure"), **not silently shipping this as
  "done."**
- Needs Gabriel / next steps if time allows:
  1. **Demo risk mitigation**: avoid `gem-9679256` specifically as a live demo
     example (or re-roll if it happens to fail on stage — the corrective retry
     means a second attempt is likely to work). Prefer `cppp-2026-drdo-921134-1`
     (passed cleanly, 4/4 grounded) as the safe demo fixture.
  2. **Real fix, if there's time later today**: add a second-tier retry
     specifically for `finish_reason: "length"` with empty content (distinct from
     `completeJSONWith`'s schema-validation retry, which already fires on this but
     only once) — e.g. a short "answer more concisely" nudge in the correction
     message to bias the model away from long internal reasoning. Not attempted
     here — S3 (Voice Mode) is the priority for today's remaining hours per product
     decision, and this is a pre-existing Sarvam-platform behavior, not a broken
     Quotra feature.
  3. **json_schema decision from S1 stands** — this suite ran through it and the
     schema-valid outputs were clean every time; the failures are 100% the
     empty-content/thinking-budget issue, never a malformed JSON that passed schema
     validation.

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

## S3 — Voice Mode full-loop live proof · done, PASS · ~30min

- Landed: `checks/sarvam-voice-e2e.ts` — proves the FULL loop (Saaras STT →
  sarvam-105b Ask-Quotra → Sarvam Translate → Bulbul TTS) live, end-to-end,
  **without a physical microphone** (this build environment still has none — same
  gap T2/T3 below already flag). Substitute: synthesize the SPOKEN QUESTION with
  Bulbul TTS first, then feed that audio into the exact same `transcribe()` the
  playground page calls. This exercises every real wire call in the pipeline; it
  does NOT replace a human recording for the demo video (synthetic TTS audio can't
  prove human-speech STT accuracy) but DOES prove the mechanics work live before
  anyone touches a mic on stage.
- Check: `NEXT_PUBLIC_SARVAM_API_KEY=... npx tsx checks/sarvam-voice-e2e.ts` →
  **2/2 scenarios PASS live**:
  - **Tamil** ("இந்த வாரத்தில் என்ன புதிய டெண்டர்கள் வந்திருக்கு?" — S3 spec
    scenario 1's intent): STT correctly detected `ta-IN`, transcribed cleanly,
    105b answered in English citing all 3 fixture tenders, translated back to
    Tamil, spoke it — 21.3s total.
  - **Hindi** ("इस टेंडर में EMD कितना है?" — S3 spec scenario 3's intent): STT
    detected `hi-IN`, 105b correctly said EMD is "not exposed in the listing"
    (an honest unknown, not a guess — the truth-discipline rule holding under
    real load), 1 citation, 13.1s total.
  - `npm run check` (tsc) → clean.
- **Verified in the live browser** (`npm run dev`, `/playground/voice`): page
  loads clean, no console errors; saving a key to `localStorage.quotra_sarvam_key`
  correctly hides the key-entry card; language toggle (EN/த/हி) and the spoken-
  language picker (Auto/EN/த/हி) both render and are clickable. **Could not
  exercise "Hold to talk" itself** — this sandboxed browser has no microphone
  hardware to grant `getUserMedia` against, so the actual push-to-talk recording
  path is untested by me. The E2E script above proves everything downstream of
  the mic (STT→LLM→translate→TTS) already works; only the literal
  browser-mic-permission-and-record step needs a human.
- **Latency note against S3's success bar** ("speech-out starts ≤4s after end of
  user speech"): the FULL round trip (STT + LLM + translate + TTS all four calls)
  took 13-21s in these two runs — well over 4s. Breaking that down, the 105b call
  itself was 5.5-8.2s of that (consistent with S1/S2's finding that reasoning-mode
  latency varies a lot run to run). **This is a real risk to flag before the demo**:
  either the 4s bar needs to be read as "time-to-first-audio-byte with streaming"
  (not implemented here — this playground awaits the full answer before speaking)
  or the bar itself needs resetting against what Starter-tier `sarvam-105b`
  actually delivers under `reasoning_effort: low`.
- Needs Gabriel / next steps:
  1. **Human demo recording still the one gap** — someone with a real microphone
     needs to actually hold-to-talk on `/playground/voice` at least once for the
     genuine human-speech proof (`fixtures/playground-voice-demo.mp4`). Everything
     the recording would exercise downstream of the mic is now proven live.
  2. **Decide how to handle the latency gap** before the demo — either narrate
     "thinking..." explicitly during the wait (the UI already shows this via
     `phase === "thinking"`), or don't promise sub-4s in the pitch.

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
  - **UPDATE (live-testing feedback): dropped the "show English + translated-alongside"
    design entirely.** The task brief said render both, "never replacing" the English —
    that shipped and was tested live, but the two-block layout read as confusing/redundant
    in an actual conversational voice UI (you asked in Tamil, why is there still an English
    paragraph?). Changed to: ONE answer, in whatever language was spoken — English stays
    English, Tamil/Hindi input gets the LLM's English answer translated once and THAT is
    the only text shown and spoken. This is a deliberate deviation from T3's literal brief,
    made on direct product feedback during live testing, not a bug fix. `answer.citations`
    stay language-agnostic (kind/ref ids) so citation chips render unchanged either way —
    only the prose answer text is now single-language. **This does NOT change T4's
    `bilingual.ts` library itself** (`translateVerdictReasons`/`translateMatrixRows`/
    `translateBidPackChecklist` still render-alongside-never-replace, per the real product
    law for verdicts/matrices/bid packs) — this UX simplification is scoped to the T3
    playground's conversational Q&A only, where the "citation is evidence, never replace
    it" rule doesn't apply the same way (a spoken answer isn't a quoted clause).
  - **UPDATE #2: added an explicit language picker (Auto/EN/த/हि) next to the record
    button.** Continued live testing kept showing Tamil speech coming back English —
    plausibly Sarvam's auto-detect misfiring on short or code-mixed clips, which is
    inherently probabilistic (confidence-based) and not something a code fix can guarantee
    against. Rather than keep chasing detection accuracy blind across several rounds of
    "send me the network response," added a picker: when the rep picks a specific
    language, it's passed straight to `transcribe()` (also improves raw STT accuracy vs.
    blind auto-detect) AND used directly as the answer language — no response-language
    parsing involved at all when a language is explicitly chosen. Auto-detect is still the
    default and unchanged for reps who don't specify. **This makes "Tamil in → Tamil out"
    deterministic** regardless of how confident Sarvam's own detector is on any given
    clip — the actual thing being asked for. The `[debug] codemix=..., translate=...`
    line (still present) now also shows `forced by language picker → ta-IN` when a
    language is explicitly selected, so it's obvious which path was taken.
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

## S4 — Vision Document Digitization · CUT for today · confirmed 2026-08-09

Re-confirming the T5 finding below under the new S-numbering (SARVAM-LANE-TASKS.md S1
called for a "1-hour spike FIRST; if blocked, report finding same day" — that already
happened, see T5 below). **No new access materialized** — still dashboard-only, still
needs a Gabriel-owned dashboard login to even attempt the fallback. Given the compressed
today-only timeline (buildathon submission 7pm, not the doc's original multi-day plan),
**formally cutting S4 from today's scope** rather than burning time waiting on Gabriel's
dashboard login. If Gabriel logs in and finds API access mid-afternoon, `lib/docai/
sarvam.ts`'s stub is exactly where to drop in a real client — nothing else blocks it.

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

## T6 — Phone agent (Twilio + Pipecat + Sarvam) · scaffolded, not run · ~1h

- Landed: `phone-agent/agent.py`, `phone-agent/brain_context.py`, `phone-agent/README.md`,
  `phone-agent/requirements.txt`, `phone-agent/.env.example`, `phone-agent/.gitignore`.
- **Verified as far as this environment allows**: no Python interpreter was available at
  first (`python3`/`python` both hit the Windows Store stub), but `py` (the Python launcher)
  turned out to have a real Python 3.14.3 registered — `py -m py_compile agent.py
  brain_context.py` passes (both files are syntactically valid), and **`py
  brain_context.py` actually runs and produces a correct, well-grounded system prompt from
  the real fixtures** (company, all 12 sample products, all 3 sample tenders — output
  checked by eye, looks right). That's the one piece of T6 genuinely exercised here.
  **`agent.py` itself was never run** — no `pipecat-ai` install, no Twilio/ngrok accounts,
  no phone, no microphone in this environment.
- Built from the real blueprint doc (`docs.sarvam.ai/api/integration/
  build-voice-agent-with-twilio.md`), fetched and read directly — not guessed. Pipecat's
  exact service construction (`SarvamSTTService`/`SarvamLLMService`/`SarvamTTSService`,
  `.Settings` sub-objects, `create_transport`, the `pipecat.runner.run.main()` entrypoint,
  TwiML Bin pointing at `wss://.../ws`) all comes straight from that doc.
- Decisions made:
  - **STT language auto-detect** (`language="unknown"`, `mode="transcribe"`) exactly as
    T6's own task brief snippet specifies.
  - **`brain_context.py` mirrors `fixtures/load.ts`'s real-fixture-preference pattern** in
    Python rather than importing anything from the Node side (no cross-language import
    possible) — same fixtures, same "prefer *.real.json" rule, kept in sync by convention
    not by code sharing.
  - **`requirements.txt` is NOT version-pinned to exact numbers** — task brief asks for
    "requirements pinned," but pinning honestly requires an actual `pip install` +
    `pip freeze`, which never happened here. Package names/extras are exact (from the
    blueprint doc); the file's header comment tells Gabriel to `pip freeze` after the
    first real install and commit that.
  - **Known gap, flagged prominently in `phone-agent/README.md`**: Bulbul TTS
    voice/language is set ONCE at pipeline startup (`QUOTRA_PHONE_TTS_LANGUAGE`/
    `QUOTRA_PHONE_TTS_VOICE` env vars), not switched per-turn based on what the caller
    actually spoke — so a Tamil-speaking caller may get an LLM reply written in Tamil but
    voiced in the default TTS language/voice. Fixing this needs either a Pipecat processor
    that reads STT's detected language and reconfigures TTS mid-call, or confirmed
    per-utterance language override support in `SarvamTTSService` — neither could be
    checked against the real API here. **This is the single most important thing to test
    and likely fix before a real bilingual demo call.**
- Needs Gabriel (this task needs the most hands-on work of all seven):
  1. **Everything in the README's Setup section, in order** — Twilio trial account +
     number, ngrok account, `pip install`, fill `.env`, run `python agent.py --transport
     twilio`, tunnel it, wire the TwiML Bin, then actually call it. None of this has
     executed anywhere yet.
  2. **Test and likely fix the TTS-language-per-turn gap** above — this is the deciding
     factor for whether the phone demo's bilingual story actually works or just always
     answers in English.
  3. **The recorded real call** (`fixtures/phone-agent-demo.mp4`) — Tamil question about
     the Samba CCTV fixture tender, then a code-mixed follow-up — is the actual T6
     acceptance bar and can only happen once the above is running.
  4. **Deployment before submission**: laptop + ngrok is fine for tonight's demo, not for
     async judge review (a dropped tunnel mid-review has burned this team before per the
     task brief) — decide on Fly.io / Cloudflare container / small VPS and deploy.

## Live fix — T2 STT rejected browser audio (found by Gabriel testing the real key)

First real live signal from a real key: `/playground/voice` hold-to-talk failed with
`Sarvam speech-to-text error (HTTP 400): Invalid file type: audio/webm;codecs=opus`.
Root cause: Chrome's `MediaRecorder` defaults to MIME type `audio/webm;codecs=opus`;
`FormData` uses a Blob's own `.type` as the multipart part's Content-Type; Sarvam's STT
allowlist matches by exact string and only has bare `audio/webm` (no codec parameter) —
so the real browser recording never had a chance. Fixed in `lib/voice/sarvam.ts`:
`transcribe()` now strips codec parameters before upload (`forUpload()` helper,
constructs a fresh Blob with the bare MIME type when needed). Added a regression
assertion to `checks/sarvam-voice.ts` (now 23/23). This is exactly the kind of bug that
can't be caught offline — the stubbed-fetch tests all used clean `"audio/webm"` Blobs, so
the bug only surfaced against the real API's exact-string validation. **If STT still
fails after this fix, the next thing to check is whether Sarvam's allowlist accepts
`audio/ogg;codecs=opus` browsers either — same fix pattern applies.**

## Live fix #2 — T2 TTS speaker "anushka" invalid for bulbul:v3

Same live-testing session, one step further: STT → LLM worked correctly (real cited
answer, e.g. "RAX Tech International is Udyam/MSE registered and offers products like
the RT-RC01-W controller..." with citations `company: RAX Tech International`,
`product: RT-RC01-W`, `product: RT-DFI-W`, `tender: cppp-28403` — the ask-quotra contract
is working end-to-end against the real API). TTS then failed: `HTTP 400: Speaker
'anushka' is not compatible with model bulbul:v3`. **The error response itself gave the
real speaker allowlist** — recorded in `lib/voice/sarvam.ts`'s `DEFAULT_SPEAKER` comment
now. Only `anushka` (the en-IN pick from SARVAM-API-NOTES.md's Voices-page name list) was
actually invalid; `priya`/`anand`/`kavya`/`rohan`/`aditya` were all already valid.
Swapped en-IN's default to `neha`. Also fixed the same stale value in
`phone-agent/agent.py`'s `DEFAULT_TTS_VOICE`. **Still not manually A/B'd for voice
quality** — just confirmed to not 400 anymore. `checks/sarvam-voice.ts` still 23/23 (the
speaker assertion reads the constant, not a hardcoded literal, so it covered this
automatically once fixed).

## Live fix #3 — auto-detect language never came back, so bilingual/Tamil-voice path never fired

Third live-testing find: asking a Tamil question through the full loop produced a
correct-looking ENGLISH answer with no Tamil translation card and no Tamil audio — the
app was silently treating every input as English. Root cause: `transcribe()` omitted the
`language_code` request field entirely for auto-detect (`args.language === "unknown"`),
following `TASKS/T2-voice-core.md`'s paraphrase "omit → auto-detect". **Fetched the actual
API reference** (`docs.sarvam.ai/api-reference/speech-to-text/transcribe`) instead of
guessing again: it documents `language_code: "unknown"` as a valid, literal request value
you're meant to SEND, not omit — and confirms the response's `language_code` field only
reliably comes back populated with the detected language when you do. Fixed
`lib/voice/sarvam.ts` to always send `language_code` (including the literal string
`"unknown"`). Updated `checks/sarvam-voice.ts`'s matching assertion (it previously
asserted the old, wrong behavior) — still 23/23.

This is the pattern worth remembering for the rest of this lane: **task-brief paraphrases
of the API aren't the API** — SARVAM-API-NOTES.md and the task briefs were written without
live verification, and this is the second real behavioral gap they've had (after the TTS
speaker list) between "what the docs/briefs implied" and "what the API actually does".
Anything still unverified live (T1's response_format modes, T4's `/translate` response
field, T5's whole Doc AI gating) should be treated as equally suspect until proven.
