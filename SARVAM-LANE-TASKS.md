# Sarvam Lane — Task Spec S1–S7 (for Jenine)

> **Status: DRAFT for Gabriel's review — not yet pushed to the lane repo.**
> Companion to `SARVAM-LANE-CONTRACT.md` (the binding agreement). This file is the work
> breakdown: what "done" means, per task, in testable terms. Supersedes `TASKS/T1–T7.md`
> in the lane repo once approved.
>
> **Division of labor (locked):** Jenine owns everything Sarvam-flavored, end-to-end,
> live-tested. Gabriel owns the main app's UX flows and all merge-time mounts into main-app
> screens. The lane repo stays a plugin package (drop-in files + MERGE-NOTES), never a fork.

## Global success criteria (apply to every task)

1. **Live-fire or it isn't done.** Every task ships an offline check (stubbed fetch, fixtures
   only — house style per `checks/README.md`) AND a live check run against the real Sarvam
   API with the run output committed. A task that has only passed mocks is "built", not "done".
2. **Truth disciplines, no exceptions:** the model never does arithmetic (₹/GST/dates/deadlines
   pass through digit-exact); every technical claim cites its source document or renders
   "needs confirmation"; transcripts recorded on success AND failure via `lib/llm/transcripts.ts`.
3. **Current model IDs only.** `sarvam-m` is dead. Anything not verified in S1 does not get used.
4. **Public repo hygiene:** sanitized fixtures only, no RAX data, no keys, ever.
5. **MERGE-NOTES.md updated as you go** — what landed, what's verified (offline/live), known
   gaps, merge-time instructions for Gabriel. It is the merge runbook, not a diary.

---

## S1 — Live model & endpoint audit (BLOCKS EVERYTHING — do first, ~half a day)

**Goal:** Replace every guessed fact in the lane with a live-verified one.

**Scope:** `SARVAM-API-NOTES.md`, `checks/sarvam-spike.ts`, one real API key (Gabriel provides,
topped up — the ₹100 free tier will not survive the week).

**Do:**
- Verify chat model IDs against the live API: `sarvam-105b`, `sarvam-30b`,
  `sarvam-105b-conversations` (lane notes and Sarvam's official changelog **contradict each
  other** on 30b and on whether the conversations variant exists — resolve with real calls).
- Verify response field names: `/translate` (`translated_text` vs `output`), `/speech-to-text`
  (`transcript`), chat (`choices[0].message.content` + `finish_reason`).
- Verify `response_format: json_schema` works on 105b (server-enforced schema) — if yes, it
  replaces `json_object` for verdict/eligibility/bidpack/constraints calls in S2.
- Verify thinking-mode behavior: `reasoning_effort` values, how reasoning tokens bill against
  `max_tokens`, and the minimum safe `max_tokens` for a large JSON verdict response.
- Verify Document Digitization access path (REST endpoint or JS SDK, auth, page limit,
  per-page price) — this de-risks S4 before any code is written for it.

**Success criteria:**
- `checks/sarvam-spike.ts` runs green **with the live key**, output committed to the lane repo.
- `SARVAM-API-NOTES.md` rewritten so every line is marked ✅ live-verified or ❌ removed.
- A one-line ruling per disputed fact (30b status, conversations variant, json_schema support).

---

## S2 — Sarvam-105B as the reasoning engine (the full provider swap)

**Goal:** `lib/llm/sarvam.ts` becomes a production-grade adapter so `localStorage
quotra_llm_provider = "sarvam"` runs **every** AI inference in the product — verdicts,
eligibility matrices, bid packs, constraint compilation, Ask Quotra — on 105b.

**Scope:** `lib/llm/sarvam.ts` (harden), `checks/sarvam-llm.ts`, new `checks/sarvam-conformance.ts`.

**Do:**
- Adopt `json_schema` response_format for the heavy JSON features if S1 proves it (keep
  `json_object` + the upstream `completeJSONWith` retry as the net regardless).
- Correct model routing per S1's rulings (ask-quotra → conversations variant only if real).
- Explicit `reasoning_effort` + `max_tokens` per feature class; never rely on defaults
  (April 2026 changelog changed them once already).
- Build `checks/sarvam-conformance.ts`: runs the main repo's own harness — constraint-engine
  (30 checks), verdict-engine, eligibility, bid-pack, llm-client — against 105b via the
  provider seam, and scores **citation fidelity**: every citation must be verbatim from the
  fixture tender, every "needs confirmation" preserved, zero invented numbers.

**Success criteria:**
- Conformance suite runs and its results are committed, pass OR fail, honestly.
- **Pass bar for full swap:** citation fidelity 100% on fixtures, no schema failures after
  the single built-in retry, verdicts on the fixture set identical in kind (GO/NO-GO/FIXABLE)
  to the Anthropic baseline.
- If a suite fails the bar: report per-feature, and that feature stays Anthropic behind the
  same dispatcher — hybrid is the designed fallback, hiding a failure is the only real failure.

---

## S3 — Voice Mode (the centerpiece): fullscreen conversational voice agent

**Goal:** A ChatGPT-voice-mode experience inside Quotra — tap the mic, the app goes into a
fullscreen voice state (orb/center-stage), and the MD **talks to the product like a person**
in Tamil / Tanglish / Hindi / English. The agent answers with voice AND renders real product
data on screen in realtime — verdict cards, tender lists, eligibility matrices — using
**predefined UI components fed by structured data, never generative UI/code**.

**Scope (new drop-in package, built + proven in the lane playground):**
- `lib/voiceagent/` — session state machine (`idle → listening → thinking → speaking → showing`),
  audio pipeline (Saaras v3 `codemix` STT → intent → tools → Bulbul v3 TTS), intent contract,
  tool layer.
- `components/voice-mode/` — the overlay: orb animation, live transcript, and a **card slot**
  that renders predefined components from the agent's structured payloads.
- `checks/sarvam-voiceagent.ts` — offline (stubbed audio + fixtures) + live scripted run.

**Architecture (fixed, do not improvise around it):**
- STT: Saaras v3, `mode: "codemix"`, `language_code: "unknown"` (auto-detect; this is
  live-proven in T2). 25s recording cap, client-side size backstop (both exist in T2).
- Brain: 105b (via S2's adapter) with a **tool-calling contract**: the model returns an
  intent JSON — `{ answer_text, language, cards: [{type: "tender-list"|"verdict"|"matrix"|"stats",
  payload refs}] }` — deterministic code then fetches the real data (from the store/worker API)
  and the card slot renders existing components. The model never invents data and never
  computes numbers; it routes, summarizes, and speaks.
- TTS: Bulbul v3 in the **same language the user spoke** (mirror the detected language).
  Respect the 2,500-char chunk behavior — `answer_text` must be written by the prompt to fit,
  and truncation state must be visible if hit.
- Turn-taking: **push-to-talk turns for v1** (reliable). Continuous VAD/barge-in via the
  Saaras realtime WebSocket is a documented stretch, only after v1 is green end-to-end.

**Success criteria (all live, all three languages):**
- Scripted scene 1: *"இந்த வாரம் என்ன புது tenders?"* → tender-list cards render on screen +
  spoken Tamil summary, correct count.
- Scripted scene 2: *"அதுல second one — நம்மால பண்ண முடியுமா?"* (context carry-over) → verdict
  card renders with the REAL cited verdict + spoken verdict + reason.
- Scripted scene 3 (Hindi): *"इस tender की eligibility क्या missing है?"* → eligibility matrix
  renders + spoken Hindi answer naming the actual missing row.
- Error paths proven live: no key → clean named error; 429 → spoken + visible retry state;
  over-long recording → blocked client-side before the API ever sees it.
- Latency budget: speech-out starts ≤ 4s after end of user speech on a normal connection
  (measure, log, don't guess).

---

## S4 — Sarvam Vision document digitization (tender ingestion)

**Goal:** A scanned/bilingual GeM tender PDF goes in; Sarvam Vision digitizes it; the output
feeds the constraint compiler — the full "paper trail" ingestion story.

**Scope:** `lib/docai/sarvam.ts` (replace the honest stub), `checks/sarvam-docai.ts`,
fixture `tender-gem-9679256.pdf` (already in lane).

**Do:**
- 1-hour spike FIRST (part of S1's access verification): digitize the fixture PDF. If the API
  path works → build. If it's gated/dashboard-only after all → record the finding, stop, tell
  Gabriel the same day. The finding is a legitimate deliverable.
- Real implementation: 10-page batching, structured text out with **page references preserved**
  (citation-or-flag depends on page-level provenance), cost logging per document.
- Wire output shape to what `lib/constraints/compiler.ts` consumes (pull that type from the
  main repo — do not invent a parallel one).

**Success criteria:**
- The fixture GeM PDF → digitized text → compiled constraint program → verdict, end to end,
  live, with citations that trace to digitized pages.
- Bilingual/scanned pages don't silently drop content — anything unreadable is flagged, never
  smoothed over.

---

## S5 — Self-hosted agents (replacing the Claude managed agents)

**Goal:** The two Claude managed agents in `cma/` (`watcher.agent.yaml`, `deep-reader.agent.yaml`)
are replaced by **our own agents, hosted by us, powered by 105b** — Claude managed agents are
not allowed in this hackathon. These agents carry the knowledge/brain work: portal watching,
deep reads, and brain/company-memory updates.

**Scope:** new `agents/` package in the lane (runtime + the two agents), deployed so it runs
without any Claude dependency. Candidate host: the existing Cloudflare worker or a small
always-on service — **hosting decision with Gabriel before building** (open question below).

**Do:**
- Minimal agent runtime: loop (fetch → reason via S2 adapter → act → record), tool interface,
  run logs + transcripts, cron/manual trigger.
- **Watcher agent:** portal sweep → new/changed tenders → normalized into the existing tender
  shapes (`lib/tenders/types.ts` — byte-identical in both repos, keep it that way).
- **Deep-reader agent:** full tender document → cited deep read (the constraint pipeline's
  input), same output contract the current deep-read panel consumes.
- Brain activities (company-memory unify etc.) run through the same runtime, not a second one.

**Success criteria:**
- Watcher sweep on fixtures produces outputs diff-equivalent in shape to the current pipeline's
  (structure-identical; content graded by the conformance approach from S2).
- Deep-read of the fixture tender produces a fully-cited read with zero uncited technical claims.
- Both agents run on OUR infrastructure with `ANTHROPIC_API_KEY` absent — prove it by running
  with the env var unset.
- Runbook: how to start/stop/logs — one page in MERGE-NOTES.

---

## S6 — Indic UI language (setting + onboarding + dictionaries)

**Goal:** The user picks their language — English / தமிழ் / हिन्दी — during onboarding, can
change it in Settings, and the whole app UI renders in it. Choice persists.

**Scope:** `lib/i18n/dictionaries/{ta,hi}.ts` (exists — expand), `components/i18n/LanguageToggle.tsx`
(exists), new: language-selection step spec for onboarding + settings card spec, runtime
translation helper for any dynamic UI strings the static dictionaries can't cover (Sarvam
Translate, cached, digit-guarded per T4's pattern).

**Division of labor:** Jenine owns the mechanism (dictionaries, toggle, persistence, helper);
**Gabriel owns `t()` adoption in main-app screens** — he's reworking those flows this week and
screens are collision territory. Deliver him a one-page "how to adopt t()" note.

**Success criteria:**
- Dictionary coverage: 100% of keys used on the demo path (nav, tenders feed, tender detail,
  verdict, eligibility, bid pack, ask, settings) in ta + hi, fallback chain intact.
- **Native-speaker review of ta + hi copy** (Gabriel arranges reviewers; Jenine incorporates).
  "Vault"/"Brain"/GO/NO-GO stay English by design.
- Language chosen in onboarding → persists across reload → changeable in settings → entire
  demo path re-renders without a restart.

---

## S7 — Bilingual artifacts (verdict / matrix / bid pack)

**Goal:** Every generated artifact renders bilingually — English original always alongside the
Tamil/Hindi, never replaced. (The T4 layer is built; this task finishes and proves it.)

**Scope:** `lib/translate/sarvam.ts`, `lib/translate/bilingual.ts`, `checks/sarvam-translate.ts`,
plus merge-time rendering spec for Gabriel (he mounts it in tender detail).

**Do:**
- Apply S1's verified `/translate` response field; remove the guess-fallback.
- Live-run the full matrix + bid-pack fixture through `translateMany`; verify the
  digit-preservation guard on real output (₹ figures, dates, EMD, clause numbers byte-identical).
- **Design note (decision logged):** bilingual versions are produced by the Translate API
  post-hoc (deterministic digit guard), NOT by asking 105b to write artifacts twice — 105b
  generates the English artifact, translate renders the Indic twin. If you find a case where
  105b-native generation is clearly better, bring evidence before switching.

**Success criteria:**
- Live run: full fixture verdict + matrix + bid pack translated to ta AND hi, zero digit
  mutations, zero dropped rows, output committed.
- Fallback proven live: force a row failure → row falls back to English, batch completes.

---

## Timeline gates

| When | What |
|---|---|
| Day 1 | S1 done (audit + spike), S4 go/no-go finding, hosting decision for S5 |
| Mid-week | S2 conformance results in (pass or honest fail), S3 v1 scripted scenes live |
| **Wed 2026-08-12** | **Rehearsal merge** — full copy-in to a branch of `quotra-sarvam-ai`, build + harness green, then discarded |
| T-2 days before event | Final merge. Nothing new lands after this except bugfixes |

## What Gabriel owes you (unchanged from the contract)

- Sarvam API key, topped up. · Native-speaker reviewers for ta/hi. · 24h turnaround on seam
  questions (the seam doesn't change). · Merge-time mounts: Voice Mode overlay, bilingual
  rendering, LanguageToggle, `t()` adoption.

## Open questions for Gabriel (answer before Day 1 ends)

1. **S5 hosting:** Cloudflare worker vs small always-on service for the agent runtime?
2. **S3 card set:** confirm the predefined cards the voice agent may render (tender-list /
   verdict / matrix / stats — anything else? brain level? bid pack checklist?)
3. **S3 trigger UX:** where does Voice Mode launch from — global mic in the app shell, inside
   Ask Quotra, or both? (Gabriel owns the mount; the lane needs the target to design against.)
