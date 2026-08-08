// Quotra lib/llm — Sarvam provider (T1 deliverable, TASKS/T1-llm-adapter.md).
//
// Real Sarvam Chat Completions implementation with the SAME contract as
// client.ts's complete():
//   - POST https://api.sarvam.ai/v1/chat/completions, model "sarvam-105b"
//     (header: api-subscription-key). OpenAI-compatible request/response;
//     unlike Anthropic, system goes IN the messages array.
//   - Key resolution: localStorage SARVAM_KEY_STORAGE_KEY → NEXT_PUBLIC_SARVAM_API_KEY
//     → throw a named error (SarvamMissingKeyError) modeled on MissingKeyError.
//   - Records a Transcript via ./transcripts on success AND failure.
//   - Sarvam gotcha: thinking mode is ON by default and reasoning tokens count
//     toward max_tokens — default max_tokens is 4096 (Starter-plan cap) here.
//   - Returns { text, transcriptId }. completeJSON's contract/retry loop lives
//     upstream in index.ts and needs nothing from this file.
//
// Model routing: sarvam-105b for everything by default; sarvam-105b-conversations
// for the "ask-quotra" feature (post-trained for dialogue, per SARVAM-API-NOTES.md).
// response_format: json_object is applied for verdict/eligibility/bidpack features
// (mirrors client.ts's OPUS_FEATURES heavy-task routing) — the spike
// (checks/sarvam-spike.ts) is the live proof point for this choice; see
// MERGE-NOTES.md for the result once run with a real key.

import {
  Transcript,
  computePromptHash,
  makeTranscript,
  recordTranscript,
} from "./transcripts";
import { ApiError, RateLimitError, type CompleteArgs, type CompleteResult } from "./client";
import { SARVAM_KEY_STORAGE_KEY } from "./provider";

export const SARVAM_API_URL = "https://api.sarvam.ai/v1/chat/completions";
const SARVAM_105B = "sarvam-105b";
const SARVAM_105B_CONVERSATIONS = "sarvam-105b-conversations";
const DEFAULT_MAX_TOKENS = 4096; // Starter-plan cap; thinking mode eats into this — see SARVAM-API-NOTES.md

/** Features whose calls benefit from a strict verdict/eligibility/bidpack-shaped
 *  contract — mirrors client.ts's OPUS_FEATURES heavy-task list. */
const JSON_MODE_FEATURES = ["verdict", "eligibility", "bidpack", "bid-pack"];
/** Features tuned better by the dialogue-post-trained model variant. */
const CONVERSATION_FEATURES = ["ask-quotra"];

/** Task-based default model, mirroring client.ts's modelFor(). Env override:
 *  NEXT_PUBLIC_QUOTRA_SARVAM_MODEL (blanket, matches the Anthropic pattern). */
export function sarvamModelFor(feature: string): string {
  const env = typeof process !== "undefined" ? process.env : undefined;
  const blanket = env?.NEXT_PUBLIC_QUOTRA_SARVAM_MODEL;
  if (blanket) return blanket;
  const lower = feature.toLowerCase();
  if (CONVERSATION_FEATURES.some((f) => lower.startsWith(f))) return SARVAM_105B_CONVERSATIONS;
  return SARVAM_105B;
}

function wantsJsonMode(feature: string): boolean {
  const lower = feature.toLowerCase();
  return JSON_MODE_FEATURES.some((f) => lower.startsWith(f));
}

export class SarvamMissingKeyError extends Error {
  constructor() {
    super(
      "No Sarvam API key found. Paste your key in Settings → Sarvam API key " +
        `(stored in this browser as localStorage key '${SARVAM_KEY_STORAGE_KEY}'), or set ` +
        "NEXT_PUBLIC_SARVAM_API_KEY in app/.env.local and restart the app.",
    );
    this.name = "SarvamMissingKeyError";
  }
}

/** Kept only so index.ts's frozen re-export (`export { SarvamNotImplementedError }
 *  from "./sarvam"`) keeps compiling — index.ts is a frozen file for this lane.
 *  No longer thrown; sarvamComplete is a real implementation as of T1. */
export class SarvamNotImplementedError extends Error {
  constructor() {
    super("The Sarvam provider stub has been replaced by a real implementation (T1 landed).");
    this.name = "SarvamNotImplementedError";
  }
}

function browserStorage(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage };
    return typeof g.localStorage !== "undefined" && g.localStorage ? g.localStorage : null;
  } catch {
    return null;
  }
}

function resolveSarvamKey(): string {
  const fromStore = browserStorage()?.getItem(SARVAM_KEY_STORAGE_KEY)?.trim();
  if (fromStore) return fromStore;
  const fromEnv =
    typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_SARVAM_API_KEY?.trim() : undefined;
  if (fromEnv) return fromEnv;
  throw new SarvamMissingKeyError();
}

type SarvamMessage = { role: "system" | "user" | "assistant"; content: string };

/** One Sarvam call. Records a transcript whether it succeeds or fails —
 *  same discipline as client.ts's complete(). */
export async function sarvamComplete(args: CompleteArgs): Promise<CompleteResult> {
  const key = resolveSarvamKey(); // throws SarvamMissingKeyError before any call is made
  const maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS;
  const promptHash = computePromptHash(args.system, args.messages);
  const started = Date.now();
  const model = sarvamModelFor(args.feature);

  const record = (fields: Omit<Transcript, "id" | "at" | "feature" | "model" | "promptHash">): string => {
    const t = makeTranscript({ feature: args.feature, model, promptHash, ...fields });
    recordTranscript(t);
    return t.id;
  };

  const messages: SarvamMessage[] = [
    { role: "system", content: args.system },
    ...args.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.2,
  };
  if (wantsJsonMode(args.feature)) {
    body.response_format = { type: "json_object" };
  }

  let res: Response;
  try {
    res = await fetch(SARVAM_API_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": key,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const message = `network failure calling Sarvam API: ${e instanceof Error ? e.message : String(e)}`;
    record({ responseText: "", durationMs: Date.now() - started, ok: false, error: message });
    throw new ApiError(0, message);
  }

  const durationMs = Date.now() - started;
  const raw = await res.text();

  if (res.status === 429) {
    record({ responseText: raw, durationMs, ok: false, error: "HTTP 429 rate limit" });
    throw new RateLimitError("Sarvam API rate limit hit (HTTP 429). Wait a moment and retry.");
  }
  if (!res.ok) {
    const excerpt = raw.slice(0, 500);
    record({ responseText: raw, durationMs, ok: false, error: `HTTP ${res.status}: ${excerpt}` });
    throw new ApiError(res.status, excerpt);
  }

  let text = "";
  try {
    const parsed = JSON.parse(raw) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    text = parsed.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    const message = `could not parse Sarvam response body: ${e instanceof Error ? e.message : String(e)}`;
    record({ responseText: raw, durationMs, ok: false, error: message });
    throw new ApiError(res.status, message);
  }

  const transcriptId = record({ responseText: text, durationMs, ok: true });
  return { text, transcriptId };
}
