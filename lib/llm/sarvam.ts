// Quotra lib/llm — Sarvam provider (v2 lane). STUB until T1 lands.
//
// Deliverable of TASKS/T1-llm-adapter.md: replace this file's
// body with a real Sarvam Chat Completions implementation with the SAME
// contract as client.ts's complete():
//   - POST https://api.sarvam.ai/v1/chat/completions, model "sarvam-105b"
//     (header: api-subscription-key). OpenAI-compatible request/response.
//   - Key resolution: localStorage SARVAM_KEY_STORAGE_KEY → NEXT_PUBLIC_SARVAM_API_KEY
//     → throw MissingKeyError-style named error.
//   - Records a Transcript via ../llm/transcripts on success AND failure.
//   - Sarvam gotcha: thinking mode is ON by default and reasoning tokens count
//     toward max_tokens — send max_tokens ≥ 4096 for JSON tasks or you get
//     finish_reason "length" with empty content.
//   - Returns { text, transcriptId }. completeJSON's contract/retry loop lives
//     upstream in index.ts and needs nothing from this file.
//
// Everything the implementation needs (endpoints, params, gotchas, fixtures,
// acceptance) is at the repo root — read README.md first.

import type { CompleteArgs, CompleteResult } from "./client";

export class SarvamNotImplementedError extends Error {
  constructor() {
    super(
      "The Sarvam provider is not implemented yet — this stub is the T1 deliverable " +
        "(TASKS/T1-llm-adapter.md). Switch back to the Anthropic provider " +
        "(localStorage quotra_llm_provider = \"anthropic\") or land T1.",
    );
    this.name = "SarvamNotImplementedError";
  }
}

export async function sarvamComplete(_args: CompleteArgs): Promise<CompleteResult> {
  throw new SarvamNotImplementedError();
}
