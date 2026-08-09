// Quotra lib/llm/sarvamRobust — extra resilience for sarvam-105b's thinking-
// mode token exhaustion (live-discovered in S2/S5, see MERGE-NOTES.md).
//
// Root cause (confirmed live, see MERGE-NOTES S2 block): thinking mode is on
// by default and reasoning tokens count toward max_tokens (SARVAM-API-NOTES.md).
// On the Starter tier max_tokens is HARD-CAPPED at 4096 (confirmed: an 8192
// probe got HTTP 400) — there is no way to raise the ceiling, and no
// reasoning_effort value below the documented default "low" exists (only
// low/medium/high are accepted). Occasionally the model spends the ENTIRE
// budget thinking and returns finish_reason:"length" with EMPTY content.
//
// This is NOT deterministic: manually re-running the identical prompt at the
// identical max_tokens got one empty response and one clean 703-token answer
// back to back (see MERGE-NOTES S2). completeJSONWith's existing one
// corrective retry (frozen, lib/llm/client.ts — NOT edited here) already
// covers a lot of this, but it APPENDS the failed turn + a correction message
// to the conversation before retrying, which grows the prompt rather than
// giving the model a clean shot — and it only tries once.
//
// This wrapper does NOT touch client.ts. It re-runs the WHOLE
// completeJSONWith cycle (including its own corrective retry) up to
// `freshRetries` additional times, each one a clean call with the ORIGINAL
// prompt — not a growing correction transcript. Only ContractError (the
// "failed after one corrective retry" case) triggers a fresh retry; network/
// rate-limit errors are never masked, they propagate immediately so callers
// can react to them.

import { completeJSONWith, ContractError, type CompleteJsonArgs, type CompleteJsonResult } from "./client";
import { sarvamComplete } from "./sarvam";

export async function sarvamCompleteJSONRobust<T>(
  args: CompleteJsonArgs,
  opts?: { freshRetries?: number },
): Promise<CompleteJsonResult<T>> {
  const freshRetries = opts?.freshRetries ?? 1;
  let lastError: ContractError | null = null;

  for (let attempt = 0; attempt <= freshRetries; attempt++) {
    try {
      return await completeJSONWith<T>(sarvamComplete, args);
    } catch (e) {
      if (!(e instanceof ContractError)) throw e; // network/429/parse errors: surface immediately, don't mask
      lastError = e;
      // fresh attempt next loop iteration — same args, no growing transcript
    }
  }

  throw lastError;
}
