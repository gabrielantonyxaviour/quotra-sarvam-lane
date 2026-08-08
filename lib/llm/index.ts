// Quotra lib/llm — public surface. Every intelligent feature imports from
// "@/lib/llm" and nowhere else. complete()/completeJSON() dispatch to the
// active provider (Anthropic today, Sarvam when the v2 lane lands T1); the
// strict-JSON contract loop is shared, so every provider inherits
// citation-or-flag enforcement and the one-corrective-retry rule unchanged.

import {
  complete as anthropicComplete,
  completeJSONWith,
  type CompleteArgs,
  type CompleteResult,
  type CompleteJsonArgs,
  type CompleteJsonResult,
} from "./client";
import { sarvamComplete } from "./sarvam";
import { activeProviderId, type LlmProviderId } from "./provider";

const PROVIDERS: Record<LlmProviderId, (args: CompleteArgs) => Promise<CompleteResult>> = {
  anthropic: anthropicComplete,
  sarvam: sarvamComplete,
};

/** One model call via the active provider. Transcript recording happens inside the provider. */
export async function complete(args: CompleteArgs): Promise<CompleteResult> {
  return PROVIDERS[activeProviderId()](args);
}

/** Strict-JSON call via the active provider — shared schema/retry contract. */
export async function completeJSON<T>(args: CompleteJsonArgs): Promise<CompleteJsonResult<T>> {
  return completeJSONWith<T>(complete, args);
}

export {
  API_URL,
  ANTHROPIC_VERSION,
  KEY_STORAGE_KEY,
  MODEL_ID,
  modelFor,
  MissingKeyError,
  RateLimitError,
  ApiError,
  ContractError,
  completeJSONWith,
} from "./client";
export type {
  ChatMessage,
  CompleteArgs,
  CompleteResult,
  JsonSchema,
  CompleteJsonArgs,
  CompleteJsonResult,
} from "./client";
export {
  PROVIDER_STORAGE_KEY,
  SARVAM_KEY_STORAGE_KEY,
  activeProviderId,
  setActiveProviderId,
} from "./provider";
export type { LlmProviderId } from "./provider";
export { SarvamNotImplementedError } from "./sarvam";
export {
  TRANSCRIPTS_KEY,
  TRANSCRIPT_CAP,
  fnv1a,
  computePromptHash,
  makeTranscript,
  recordTranscript,
  listTranscripts,
  clearTranscripts,
  exportTranscripts,
} from "./transcripts";
export type { Transcript } from "./transcripts";
