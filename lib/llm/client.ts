// Quotra blk_llm_client — the Claude seam. Browser-direct Anthropic client.
// Every intelligent surface in the product (verdicts, eligibility, bid packs,
// Ask Quotra) goes through complete()/completeJSON() here — this module is the
// single seam v2's Sarvam swap reimplements. No server, no API routes.
//
// Key resolution: localStorage "quotra_anthropic_key" (Settings BYOK field)
//   → process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY → MissingKeyError.
// Model: pinned MODEL_ID, overridable via NEXT_PUBLIC_QUOTRA_CLAUDE_MODEL.

import {
  Transcript,
  computePromptHash,
  makeTranscript,
  recordTranscript,
} from "./transcripts";

export const API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const KEY_STORAGE_KEY = "quotra_anthropic_key";

const SONNET_5 = "claude-sonnet-5";
const OPUS_5 = "claude-opus-5";

/**
 * Task-based default model. Deep document judgment — reading a whole tender and
 * staking a verdict on it, mapping eligibility clauses, drafting a compliance
 * table — goes to Opus 5. Conversation and everything else defaults to Sonnet 5.
 * Env overrides: NEXT_PUBLIC_QUOTRA_CLAUDE_MODEL (blanket),
 * NEXT_PUBLIC_QUOTRA_OPUS_MODEL / NEXT_PUBLIC_QUOTRA_SONNET_MODEL (per class).
 */
const OPUS_FEATURES = ["verdict", "eligibility", "bidpack", "bid-pack"];
export function modelFor(feature: string): string {
  const env = typeof process !== "undefined" ? process.env : undefined;
  const blanket = env?.NEXT_PUBLIC_QUOTRA_CLAUDE_MODEL;
  if (blanket) return blanket;
  const heavy = OPUS_FEATURES.some((f) => feature.toLowerCase().startsWith(f));
  return heavy ? env?.NEXT_PUBLIC_QUOTRA_OPUS_MODEL || OPUS_5 : env?.NEXT_PUBLIC_QUOTRA_SONNET_MODEL || SONNET_5;
}
/** The default (Sonnet 5) model id — kept for callers that label without calling. */
export const MODEL_ID: string = modelFor("default");

/* ---------- named errors ---------- */

export class MissingKeyError extends Error {
  constructor() {
    super(
      "No Anthropic API key found. Paste your key in Settings → Anthropic API key " +
        "(stored in this browser as localStorage key 'quotra_anthropic_key'), or set " +
        "NEXT_PUBLIC_ANTHROPIC_API_KEY in app/.env.local and restart the app.",
    );
    this.name = "MissingKeyError";
  }
}

export class RateLimitError extends Error {
  constructor(message = "Anthropic API rate limit hit (HTTP 429). Wait a moment and retry.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export class ApiError extends Error {
  status: number;
  bodyExcerpt: string;
  constructor(status: number, bodyExcerpt: string) {
    super(`Anthropic API error (HTTP ${status}): ${bodyExcerpt}`);
    this.name = "ApiError";
    this.status = status;
    this.bodyExcerpt = bodyExcerpt;
  }
}

export class ContractError extends Error {
  errors: string[];
  constructor(context: string, errors: string[]) {
    super(`${context} — validation errors: ${errors.join("; ")}`);
    this.name = "ContractError";
    this.errors = errors;
  }
}

/* ---------- types ---------- */

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type CompleteArgs = {
  feature: string; // which surface is calling, recorded on the transcript
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
};

export type CompleteResult = { text: string; transcriptId: string };

/** Contract for completeJSON: validate returns a list of problems; empty = valid. */
export type JsonSchema = {
  name: string;
  validate(data: unknown): string[];
};

export type CompleteJsonArgs = CompleteArgs & { schema: JsonSchema };
export type CompleteJsonResult<T> = { data: T; transcriptId: string };

/* ---------- internals ---------- */

function browserStorage(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage };
    return typeof g.localStorage !== "undefined" && g.localStorage ? g.localStorage : null;
  } catch {
    return null;
  }
}

function resolveKey(): string {
  const fromStore = browserStorage()?.getItem(KEY_STORAGE_KEY)?.trim();
  if (fromStore) return fromStore;
  const fromEnv =
    typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_ANTHROPIC_API_KEY?.trim() : undefined;
  if (fromEnv) return fromEnv;
  throw new MissingKeyError();
}

/** Extract the first balanced {...} block from arbitrary text (tolerates
 *  markdown fences and leading prose). Returns null when none is found. */
function extractJsonBlock(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

type ParsedJson = { ok: true; data: unknown } | { ok: false; error: string };

function tryParseJson(text: string): ParsedJson {
  const block = extractJsonBlock(text);
  if (block === null) return { ok: false, error: "no JSON object found in the response" };
  try {
    return { ok: true, data: JSON.parse(block) };
  } catch (e) {
    return { ok: false, error: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ---------- public API ---------- */

/** One Claude call. Records a transcript whether it succeeds or fails. */
export async function complete(args: CompleteArgs): Promise<CompleteResult> {
  const key = resolveKey(); // throws MissingKeyError before any call is made
  const maxTokens = args.maxTokens ?? 2048;
  const promptHash = computePromptHash(args.system, args.messages);
  const started = Date.now();

  const model = modelFor(args.feature);
  const record = (fields: Omit<Transcript, "id" | "at" | "feature" | "model" | "promptHash">): string => {
    const t = makeTranscript({
      feature: args.feature,
      model,
      promptHash,
      ...fields,
    });
    recordTranscript(t);
    return t.id;
  };

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: args.system,
        messages: args.messages,
      }),
    });
  } catch (e) {
    const message = `network failure calling Anthropic API: ${e instanceof Error ? e.message : String(e)}`;
    record({ responseText: "", durationMs: Date.now() - started, ok: false, error: message });
    throw new ApiError(0, message);
  }

  const durationMs = Date.now() - started;
  const raw = await res.text();

  if (res.status === 429) {
    record({ responseText: raw, durationMs, ok: false, error: "HTTP 429 rate limit" });
    throw new RateLimitError();
  }
  if (!res.ok) {
    const excerpt = raw.slice(0, 500);
    record({ responseText: raw, durationMs, ok: false, error: `HTTP ${res.status}: ${excerpt}` });
    throw new ApiError(res.status, excerpt);
  }

  let text = "";
  try {
    const body = JSON.parse(raw) as { content?: { type: string; text?: string }[] };
    text = (body.content ?? [])
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
  } catch (e) {
    const message = `could not parse Anthropic response body: ${e instanceof Error ? e.message : String(e)}`;
    record({ responseText: raw, durationMs, ok: false, error: message });
    throw new ApiError(res.status, message);
  }

  const transcriptId = record({ responseText: text, durationMs, ok: true });
  return { text, transcriptId };
}

/**
 * Strict-JSON contract loop over ANY provider's complete(). Tolerates markdown
 * fences / leading prose by extracting the first {...} block. On malformed
 * JSON or schema validation errors, makes EXACTLY ONE corrective retry with a
 * message describing the failure appended to the conversation; a second
 * failure throws ContractError listing the validation errors.
 * Provider-agnostic on purpose: index.ts runs it over the dispatched
 * complete(), so every provider (Anthropic today, Sarvam in v2) gets the same
 * contract enforcement for free.
 */
export async function completeJSONWith<T>(
  completeFn: (args: CompleteArgs) => Promise<CompleteResult>,
  args: CompleteJsonArgs,
): Promise<CompleteJsonResult<T>> {
  const first = await completeFn(args);
  const parsed = tryParseJson(first.text);
  const errors = parsed.ok ? args.schema.validate(parsed.data) : [(parsed as { error: string }).error];

  if (errors.length === 0) {
    return { data: (parsed as { data: unknown }).data as T, transcriptId: first.transcriptId };
  }

  const correction: ChatMessage = {
    role: "user",
    content:
      `Your previous reply for the "${args.schema.name}" contract was rejected:\n` +
      errors.map((e) => `- ${e}`).join("\n") +
      `\nReply again with ONLY one JSON object satisfying the contract — no prose, no markdown fences.`,
  };
  const retryMessages: ChatMessage[] = [
    ...args.messages,
    { role: "assistant", content: first.text },
    correction,
  ];

  const second = await completeFn({ ...args, messages: retryMessages });
  const parsed2 = tryParseJson(second.text);
  const errors2 = parsed2.ok ? args.schema.validate(parsed2.data) : [(parsed2 as { error: string }).error];

  if (errors2.length === 0) {
    return { data: (parsed2 as { data: unknown }).data as T, transcriptId: second.transcriptId };
  }
  throw new ContractError(
    `The model's "${args.schema.name}" response failed the contract after one corrective retry`,
    errors2,
  );
}

/** Anthropic-bound convenience — the app-facing dispatching version lives in index.ts. */
export async function completeJSON<T>(args: CompleteJsonArgs): Promise<CompleteJsonResult<T>> {
  return completeJSONWith<T>(complete, args);
}
