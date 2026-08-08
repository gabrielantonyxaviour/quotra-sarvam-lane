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
