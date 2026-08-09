> ⚠️ **SUPERSEDED 2026-08-09** — the executable spec is now **`SARVAM-LANE-TASKS.md`** (repo root, tasks S1–S7). This brief is kept for history; where the two disagree, S1–S7 wins. Note: T6 (phone agent) is **cut** — do not work on it.

# T1 — The Sarvam LLM provider (the swap itself)

**Deliverable:** replace the stub body of `lib/llm/sarvam.ts` with a real
implementation of `sarvamComplete(args: CompleteArgs): Promise<CompleteResult>`.
When this lands, EVERY intelligent surface — verdicts, eligibility, bid packs, Ask
Quotra — runs on Sarvam-105B by flipping `localStorage.quotra_llm_provider = "sarvam"`.
Nothing else in the app changes. That is the whole point of the seam.

## Hour 1 — the spike (do this before writing production code)

Prove `sarvam-105b` can hold our strictest contract on real input:

1. Read `lib/verdict/prompt.ts` (`buildVerdictPrompt`) and `lib/verdict/engine.ts`
   (`validateVerdictOutput` — the contract).
2. Write `checks/sarvam-spike.ts`: load `fixtures/tenders.sample.json`
   [0], `company.json`, `products.sample.json`, `experience.sample.json`; build the real
   verdict prompt; POST it to `https://api.sarvam.ai/v1/chat/completions` with
   `model: "sarvam-105b"`, `max_tokens: 4096`, low temperature; run the raw text through
   `validateVerdictOutput`.
3. Try in order, record results for all three in the check output:
   a. Plain prompt (our prompt already demands bare JSON) — this is what the shared
      retry loop uses.
   b. `response_format: { type: "json_object" }`.
   c. `response_format: { type: "json_schema", json_schema: {...} }` mirroring the
      verdict shape.
4. **Record the verdict-on-the-model in `MERGE-NOTES.md`:** which mode
   produced schema-valid output, in how many attempts, with what latency. If ALL fail
   repeatedly → stop, write it up, and continue with T2–T7 (the fallback decision —
   pure-Sarvam with simplified schema vs hybrid — is Gabriel's tonight, with your data).

## The contract you implement (frozen — read, don't edit)

- `lib/llm/client.ts` — the Anthropic reference implementation. Match its semantics:
  - **Key resolution:** `localStorage["quotra_sarvam_key"]` (constant
    `SARVAM_KEY_STORAGE_KEY` in `provider.ts`) → `process.env.NEXT_PUBLIC_SARVAM_API_KEY`
    → throw a named error modeled on `MissingKeyError` (message must tell the user where
    the Settings field is and the env fallback).
  - **Transcripts on success AND failure** via `makeTranscript`/`recordTranscript` from
    `./transcripts` (`computePromptHash(system, messages)`; record model, duration, ok,
    error). Transcripts are demo provenance — non-negotiable.
  - **Named errors:** rate limit (429) → RateLimitError-alike; other HTTP → ApiError-alike
    with status + body excerpt; network failure → status 0. Reuse the classes from
    `./client` (they're exported) rather than inventing parallel ones.
  - Return `{ text, transcriptId }`.
- `completeJSON` (schema validation + exactly one corrective retry) lives upstream in
  `index.ts` and already works over your provider. Do not reimplement it.

## Implementation notes

- Plain `fetch`, browser-first (this runs in the user's browser, BYOK) — no SDK.
- Request: `POST /v1/chat/completions`, headers `api-subscription-key`, `content-type` —
  body `{ model, messages: [{role:"system"...}, ...args.messages], max_tokens, temperature }`.
  Note: unlike Anthropic, system goes IN the messages array (OpenAI shape).
- **Model routing:** default `sarvam-105b` for everything; if the spike showed
  `json_object`/`json_schema` helps, apply `response_format` when
  `args.feature` is one of verdict/eligibility/bidpack (mirror `modelFor`'s
  OPUS_FEATURES list in client.ts). Consider `sarvam-105b-conversations` for
  `feature === "ask-quotra"` — it's tuned for dialogue; test both, keep the better one.
- **max_tokens:** 4096 (Starter-plan cap). Thinking mode is on by default and eats
  tokens — if you see `finish_reason: "length"` with empty content, that's why
  (see SARVAM-API-NOTES).
- Env override hook: `NEXT_PUBLIC_QUOTRA_SARVAM_MODEL` (blanket), matching the
  Anthropic client's env-override pattern.

## Acceptance — `checks/sarvam-llm.ts`

Stubbed-fetch tests (no network, mirror `checks/` house style) proving: key resolution
order + named error when absent; request shape (endpoint, header, model, system-in-
messages); 429 → rate-limit error; transcript recorded on success and on failure; and —
live, when `NEXT_PUBLIC_SARVAM_API_KEY` is set — one real verdict on fixture tender [0]
passing `validateVerdictOutput`, and one real Ask-Quotra-style call answering a
**Tanglish** question ("intha tender ku EMD evlo?") with cited English text.
Exit 0 = T1 done. Commit + MERGE-NOTES line.
