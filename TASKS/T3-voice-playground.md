> ⚠️ **SUPERSEDED 2026-08-09** — the executable spec is now **`SARVAM-LANE-TASKS.md`** (repo root, tasks S1–S7). This brief is kept for history; where the two disagree, S1–S7 wins. Note: T6 (phone agent) is **cut** — do not work on it.

# T3 — Ask Quotra by voice: the playground page

**Deliverable:** `app/playground/voice/page.tsx` (+ any components under
`app/playground/`) — a standalone page proving the full Sarvam loop end to end:

> rep speaks Tamil/Tanglish → Saaras hears → Sarvam-105B answers **with citations** →
> Bulbul speaks the answer back in the rep's language.

This is the signature Sarvam-hackathon demo beat. It lives at `/playground/voice`
(reachable at /playground/voice in this repo's Next app — a stub page already exists). Tonight
its pieces get wired into the real Ask Quotra dialog; build it so that wiring is
copy-paste (logic in `lib/`, page is thin).

## The loop

1. **Capture:** push-to-talk button — `MediaRecorder`, stop at 25 s hard cap (Saaras REST
   limit is 30 s). Show a live recording state (this repo ships a minimal dark base in app/globals.css — keep styling simple
   and legible; the product's real design system is applied at merge).
2. **Hear:** call `transcribe()` twice from your T2 module — `mode: "codemix"` (display
   "what you said" honestly, mixed script) and `mode: "translate"` (English, feeds the LLM).
3. **Think:** `completeJSON` from `@/lib/llm` (active provider = sarvam after T1) with an
   Ask-Quotra-style contract: `{ answer: string, citations: [{kind: "tender"|"company"|
   "product", ref: string}] }` — schema-validate, render citation chips. Ground the
   system prompt with fixture data (`fixtures/*.json`): company, products,
   the 3 sample tenders. Uncited claims render prefixed "needs confirmation" (product law).
4. **Answer bilingually:** show cited English text; if the detected input language was
   ta/hi, also call your T4 `translate()` for a Tamil/Hindi text rendering alongside
   (never replacing) the English.
5. **Speak:** `speak()` the answer in the rep's language via Bulbul; autoplay + replay
   button. Keep spoken text ≤2 sentences (summarize the answer field, cap 2,400 chars).

## Constraints

- Page is client-only (`"use client"`), no server routes, no store writes — a playground,
  not a feature. All state local to the page.
- Handle the three failure modes visibly: no mic permission, no API key (named error from
  your modules — render its message), API failure (show transcript-recorded error).
- BYOK field: a small input writing `localStorage.quotra_sarvam_key` so the page works on
  any machine without env vars (mirror what Settings does for the Anthropic key).

## Acceptance — `checks/sarvam-playground.ts` + a recording

- Check script: page compiles (`next build` passes), the ask-contract schema validator
  rejects an uncited answer and accepts a cited one (unit-level, stubbed fetch).
- **Human proof (commit to `fixtures/`):** a screen recording
  (`playground-voice-demo.mp4`, QuickTime is fine) of one full loop: you ask the Tamil
  fixture question aloud, the page shows the codemix transcript, the cited English answer,
  the Tamil rendering, and speaks Tamil audio. This recording is also tomorrow's demo
  rehearsal — do it once seriously.
- MERGE-NOTES line: what to lift into the real Ask Quotra dialog and any latency numbers.
