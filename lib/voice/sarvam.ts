// Quotra lib/voice — Sarvam voice provider (T2 deliverable,
// TASKS/T2-voice-core.md). Implements the frozen VoiceProvider contract in
// ./types.ts. Pure functions over Blobs — no UI, no store, independently
// mergeable (deliberately does NOT import lib/llm/sarvam.ts even though the
// key-resolution logic is duplicated — see that file's header for why).
//
//   - transcribe(): POST /speech-to-text, multipart (file, model: saaras:v3,
//     mode, language_code omitted for auto-detect). 30s REST limit — audio
//     over a conservative byte threshold is rejected client-side (see
//     MAX_AUDIO_BYTES) rather than let the API 4xx; the real enforcement is
//     T3's 25s recorder hard-cap, this is a backstop.
//   - speak(): POST /text-to-speech, JSON (text, language_code, model:
//     bulbul:v3, speaker, pace). 2,500-char limit — text is chunked at
//     sentence boundaries; ONLY THE FIRST CHUNK is synthesized and the
//     result carries `truncated: true` + `charsSpoken` (documented choice:
//     concatenating WAV/opus byte streams across separate API calls is
//     fragile — header/duration fields don't just concatenate cleanly —
//     so the honest behavior is speak what fits, flag what didn't).
//
// NOTE on response shapes: /text-to-speech's `audios[]` (base64 array) is
// pinned in SARVAM-API-NOTES.md and used directly. /speech-to-text's exact
// response field is NOT pinned there — this reads `transcript` (Sarvam's
// documented STT convention) falling back to `text`. Unverified against the
// live API in this environment (no key) — flagged in MERGE-NOTES.

import type {
  QuotraLanguageCode,
  SpeakArgs,
  SpeakResult,
  TranscribeArgs,
  TranscribeResult,
  VoiceProvider,
} from "./types";

export const STT_API_URL = "https://api.sarvam.ai/speech-to-text";
export const TTS_API_URL = "https://api.sarvam.ai/text-to-speech";
const STT_MODEL = "saaras:v3";
const TTS_MODEL = "bulbul:v3";

/** 16kHz 16-bit mono WAV worst case (~256kbps) × 30s — the largest common
 *  fixture format this repo uses. Compressed formats (webm/opus) are much
 *  smaller for the same duration and will rarely trip this; it's a
 *  backstop, not a precise duration check (Blobs don't carry duration). */
export const MAX_AUDIO_BYTES = 30 * 32_000;

const TTS_MAX_CHARS = 2500;

/** Female/male pair per language. `primary` is the default `speak()` uses
 *  when `args.speaker` is omitted. VALIDATED against a real bulbul:v3 call
 *  (2026-08-08): "anushka" is NOT a valid bulbul:v3 speaker despite being
 *  named on the docs Voices page — the API's actual error message gave the
 *  real allowlist: aditya, ritu, ashutosh, priya, neha, rahul, pooja,
 *  rohan, simran, kavya, amit, dev, ishita, shreya, ratan, varun, manan,
 *  sumit, roopa, kabir, aayan, shubh, advait, anand, tanya, tarun, sunny,
 *  mani, gokul, vijay, shruti, suhani, mohit, kavitha, rehan, soham,
 *  rupali, niharika. Swapped to "neha" for en-IN; the rest were already
 *  on this list. */
export const DEFAULT_SPEAKER: Record<"en-IN" | "ta-IN" | "hi-IN", { primary: string; female: string; male: string }> = {
  "en-IN": { primary: "neha", female: "neha", male: "aditya" },
  "ta-IN": { primary: "priya", female: "priya", male: "anand" },
  "hi-IN": { primary: "kavya", female: "kavya", male: "rohan" },
};

export class VoiceMissingKeyError extends Error {
  constructor() {
    super(
      "No Sarvam API key found. Paste your key in Settings → Sarvam API key " +
        "(stored in this browser as localStorage key 'quotra_sarvam_key'), or set " +
        "NEXT_PUBLIC_SARVAM_API_KEY in app/.env.local and restart the app.",
    );
    this.name = "VoiceMissingKeyError";
  }
}

export class AudioTooLongError extends Error {
  constructor(sizeBytes: number) {
    super(
      `Audio clip is ${Math.round(sizeBytes / 1024)}KB — over the ~30s REST limit for ` +
        "Sarvam speech-to-text. Record a shorter clip (the playground caps recording at 25s).",
    );
    this.name = "AudioTooLongError";
  }
}

export class UnknownLanguageForSpeechError extends Error {
  constructor() {
    super('speak() requires an explicit language (en-IN/ta-IN/hi-IN) — "unknown" is only valid for transcribe() auto-detect.');
    this.name = "UnknownLanguageForSpeechError";
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
  const fromStore = browserStorage()?.getItem("quotra_sarvam_key")?.trim();
  if (fromStore) return fromStore;
  const fromEnv =
    typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_SARVAM_API_KEY?.trim() : undefined;
  if (fromEnv) return fromEnv;
  throw new VoiceMissingKeyError();
}

/* ---------- transcribe (Saaras STT) ---------- */

/** Sarvam's STT allowlist matches MIME types by exact string — it accepts
 *  "audio/webm" but rejects "audio/webm;codecs=opus", which is exactly what
 *  browser MediaRecorder produces by default. FormData uses a Blob's own
 *  `.type` as the multipart part's Content-Type, so the codec parameter
 *  leaks straight through unless stripped first. */
function stripCodecParams(mimeType: string): string {
  return mimeType.split(";")[0].trim();
}

function forUpload(audio: Blob): Blob {
  const bareType = stripCodecParams(audio.type || "audio/webm");
  return audio.type === bareType ? audio : new Blob([audio], { type: bareType });
}

export async function transcribe(args: TranscribeArgs): Promise<TranscribeResult> {
  const key = resolveSarvamKey();
  if (args.audio.size > MAX_AUDIO_BYTES) {
    throw new AudioTooLongError(args.audio.size);
  }

  const form = new FormData();
  form.append("file", forUpload(args.audio), "clip.webm");
  form.append("model", STT_MODEL);
  form.append("mode", args.mode);
  // Always send language_code, including the literal string "unknown" for
  // auto-detect — per the real API reference (docs.sarvam.ai/api-reference/
  // speech-to-text/transcribe), "unknown" is a valid explicit value, not
  // something to omit. Omitting it (the original implementation, following
  // TASKS/T2's paraphrase "omit → auto-detect") left response.language_code
  // empty in live testing — the docs confirm sending "unknown" explicitly is
  // what actually populates response.language_code with the detected language.
  form.append("language_code", args.language);

  let res: Response;
  try {
    res = await fetch(STT_API_URL, {
      method: "POST",
      headers: { "api-subscription-key": key },
      body: form,
    });
  } catch (e) {
    throw new Error(`network failure calling Sarvam speech-to-text: ${e instanceof Error ? e.message : String(e)}`);
  }

  const raw = await res.text();
  if (res.status === 429) {
    throw new Error("Sarvam speech-to-text rate limit hit (HTTP 429). Wait a moment and retry.");
  }
  if (!res.ok) {
    throw new Error(`Sarvam speech-to-text error (HTTP ${res.status}): ${raw.slice(0, 500)}`);
  }

  let body: { transcript?: string; text?: string; language_code?: string; request_id?: string };
  try {
    body = JSON.parse(raw);
  } catch (e) {
    throw new Error(`could not parse Sarvam speech-to-text response body: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    text: body.transcript ?? body.text ?? "",
    detectedLanguage: body.language_code,
    requestId: body.request_id,
  };
}

/* ---------- speak (Bulbul TTS) ---------- */

const TTS_BOUNDARY_CHARS = new Set([".", "!", "?", "।", "。"]);

/** First chunk ≤ maxChars, breaking only at a sentence boundary when
 *  possible (falls back to a hard cut if the first sentence itself is
 *  longer than maxChars). Returns { chunk, charsSpoken, truncated }. */
function firstSpeakableChunk(text: string, maxChars: number): { chunk: string; truncated: boolean } {
  if (text.length <= maxChars) return { chunk: text, truncated: false };
  let lastBoundary = -1;
  for (let i = 0; i < maxChars; i++) {
    if (TTS_BOUNDARY_CHARS.has(text[i])) lastBoundary = i + 1;
  }
  const cut = lastBoundary > 0 ? lastBoundary : maxChars;
  return { chunk: text.slice(0, cut), truncated: true };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  if (typeof Buffer !== "undefined") {
    return new Blob([Buffer.from(base64, "base64")], { type: mimeType });
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export type SarvamSpeakResult = SpeakResult & { truncated: boolean; charsSpoken: number };

export async function speak(args: SpeakArgs): Promise<SarvamSpeakResult> {
  const key = resolveSarvamKey();
  if (args.language === "unknown") throw new UnknownLanguageForSpeechError();

  const { chunk, truncated } = firstSpeakableChunk(args.text, TTS_MAX_CHARS);
  const speaker = args.speaker ?? DEFAULT_SPEAKER[args.language].primary;

  let res: Response;
  try {
    res = await fetch(TTS_API_URL, {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: chunk,
        language_code: args.language,
        model: TTS_MODEL,
        speaker,
        pace: args.pace ?? 1.0,
      }),
    });
  } catch (e) {
    throw new Error(`network failure calling Sarvam text-to-speech: ${e instanceof Error ? e.message : String(e)}`);
  }

  const raw = await res.text();
  if (res.status === 429) {
    throw new Error("Sarvam text-to-speech rate limit hit (HTTP 429). Wait a moment and retry.");
  }
  if (!res.ok) {
    throw new Error(`Sarvam text-to-speech error (HTTP ${res.status}): ${raw.slice(0, 500)}`);
  }

  let body: { audios?: string[]; request_id?: string };
  try {
    body = JSON.parse(raw);
  } catch (e) {
    throw new Error(`could not parse Sarvam text-to-speech response body: ${e instanceof Error ? e.message : String(e)}`);
  }
  const b64 = body.audios?.[0];
  if (!b64) throw new Error("Sarvam text-to-speech response carried no audio (empty audios[])");

  const mimeType = "audio/wav";
  return { audio: base64ToBlob(b64, mimeType), mimeType, truncated, charsSpoken: chunk.length };
}

export const sarvamVoiceProvider: VoiceProvider = {
  id: "sarvam",
  transcribe,
  speak,
};

export type { QuotraLanguageCode };
