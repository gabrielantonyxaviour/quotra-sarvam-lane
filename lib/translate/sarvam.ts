// Quotra lib/translate — Sarvam Translate provider (T4 deliverable,
// TASKS/T4-translate-layer.md). Implements the frozen TranslateProvider
// contract in ./types.ts.
//
//   - POST https://api.sarvam.ai/translate, model "sarvam-translate:v1",
//     numerals_format: "international" (hard requirement — money/dates are
//     computed by lib/money and must pass through byte-identical).
//   - Key resolution: localStorage SARVAM_KEY_STORAGE_KEY (same BYOK field
//     as every other Sarvam feature) → NEXT_PUBLIC_SARVAM_API_KEY → throw a
//     named error.
//   - 2,000-char limit → chunkForTranslate() splits on sentence boundaries
//     (. ! ? । 。 or newline), never mid-sentence; chunks are translated
//     sequentially and rejoined.
//   - translateMany(): order-preserving, concurrency ≤3, digit-preservation
//     guard (see digitsPreserved) — a row that fails to translate OR whose
//     digit sequences don't survive translation falls back to its source
//     text; the batch never throws for one bad row.
//
// NOTE on response shape: the exact Sarvam /translate response field name
// is unverified against the live API in this environment (no key). This
// implementation reads `translated_text` (the field name used elsewhere in
// Sarvam's REST docs convention), falling back to `output` defensively.
// Flagged in MERGE-NOTES — confirm against a real response and adjust if
// the live shape differs.

import { ApiError, RateLimitError } from "../llm/client";
import { SARVAM_KEY_STORAGE_KEY } from "../llm/provider";
import type { TranslateArgs, TranslateLanguage, TranslateProvider, TranslateResult } from "./types";

export const TRANSLATE_API_URL = "https://api.sarvam.ai/translate";
const TRANSLATE_MODEL = "sarvam-translate:v1";
const MAX_CHARS = 2000;
const MAX_CONCURRENCY = 3;

export class TranslateMissingKeyError extends Error {
  constructor() {
    super(
      "No Sarvam API key found. Paste your key in Settings → Sarvam API key " +
        `(stored in this browser as localStorage key '${SARVAM_KEY_STORAGE_KEY}'), or set ` +
        "NEXT_PUBLIC_SARVAM_API_KEY in app/.env.local and restart the app.",
    );
    this.name = "TranslateMissingKeyError";
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
  throw new TranslateMissingKeyError();
}

/* ---------- chunking (2,000-char limit, sentence-boundary safe) ---------- */

const BOUNDARY_CHARS = new Set([".", "!", "?", "।", "。"]);

/** Splits text into sentences, each carrying its own trailing whitespace, so
 *  `sentences.join("")` reconstructs the original text exactly. */
function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const isBoundary = BOUNDARY_CHARS.has(c) || c === "\n";
    if (isBoundary) {
      let end = i + 1;
      if (c !== "\n") {
        while (end < text.length && /[ \t]/.test(text[end])) end++;
      }
      sentences.push(text.slice(start, end));
      start = end;
    }
  }
  if (start < text.length) sentences.push(text.slice(start));
  return sentences;
}

/** Splits text into chunks ≤ maxChars, never breaking a sentence — chunks
 *  rejoin losslessly via `.join("")`. A single sentence longer than maxChars
 *  (no boundary found) is hard-split as a documented last resort. */
export function chunkForTranslate(text: string, maxChars: number = MAX_CHARS): string[] {
  if (text.length <= maxChars) return [text];
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += maxChars) chunks.push(sentence.slice(i, i + maxChars));
      continue;
    }
    if (current.length + sentence.length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/* ---------- digit-preservation guard ---------- */

/** Every digit-sequence in `source` must appear, count-preserving, in
 *  `translated` — ₹ figures/dates/EMD are computed by lib/money and must
 *  survive translation byte-identical. Order-independent (a translated
 *  sentence may reorder clauses) but no digit sequence may be dropped,
 *  added, or altered. */
export function digitsPreserved(source: string, translated: string): boolean {
  const sourceDigits = source.match(/\d+/g) ?? [];
  if (sourceDigits.length === 0) return true;
  const remaining = [...(translated.match(/\d+/g) ?? [])];
  for (const d of sourceDigits) {
    const idx = remaining.indexOf(d);
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }
  return true;
}

/* ---------- single-chunk API call ---------- */

async function translateChunk(
  key: string,
  text: string,
  source: TranslateLanguage,
  target: TranslateLanguage,
): Promise<TranslateResult> {
  let res: Response;
  try {
    res = await fetch(TRANSLATE_API_URL, {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        input: text,
        source_language_code: source,
        target_language_code: target,
        model: TRANSLATE_MODEL,
        numerals_format: "international",
      }),
    });
  } catch (e) {
    throw new ApiError(0, `network failure calling Sarvam translate API: ${e instanceof Error ? e.message : String(e)}`);
  }

  const raw = await res.text();
  if (res.status === 429) {
    throw new RateLimitError("Sarvam translate API rate limit hit (HTTP 429). Wait a moment and retry.");
  }
  if (!res.ok) {
    throw new ApiError(res.status, raw.slice(0, 500));
  }

  let body: { translated_text?: string; output?: string; request_id?: string };
  try {
    body = JSON.parse(raw);
  } catch (e) {
    throw new ApiError(res.status, `could not parse Sarvam translate response body: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { text: body.translated_text ?? body.output ?? "", requestId: body.request_id };
}

/* ---------- public provider ---------- */

/** One translate call, transparently chunked at the 2,000-char limit. */
export async function translate(args: TranslateArgs): Promise<TranslateResult> {
  const key = resolveSarvamKey();
  const chunks = chunkForTranslate(args.text);
  if (chunks.length === 1) {
    return translateChunk(key, chunks[0], args.source, args.target);
  }
  const texts: string[] = [];
  let requestId: string | undefined;
  for (const chunk of chunks) {
    const r = await translateChunk(key, chunk, args.source, args.target);
    texts.push(r.text);
    requestId = r.requestId ?? requestId;
  }
  return { text: texts.join(""), requestId };
}

/** Order-preserving batch translate, concurrency ≤3. A row that throws OR
 *  whose digits don't survive translation falls back to its source text
 *  (logged via console.warn) — never throws for a single bad row. */
export async function translateMany(
  texts: string[],
  source: TranslateLanguage,
  target: TranslateLanguage,
): Promise<string[]> {
  const results: string[] = new Array(texts.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < texts.length) {
      const i = cursor++;
      const original = texts[i];
      try {
        const { text } = await translate({ text: original, source, target });
        if (digitsPreserved(original, text)) {
          results[i] = text;
        } else {
          console.warn(`translateMany: row ${i} dropped/altered a digit sequence — falling back to source text`);
          results[i] = original;
        }
      } catch (e) {
        console.warn(`translateMany: row ${i} failed (${e instanceof Error ? e.message : String(e)}) — falling back to source text`);
        results[i] = original;
      }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENCY, texts.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export const sarvamTranslateProvider: TranslateProvider = {
  id: "sarvam",
  translate,
  translateMany,
};
