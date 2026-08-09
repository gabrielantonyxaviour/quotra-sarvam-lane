// checks/sarvam-voice.ts — T2 acceptance (TASKS/T2-voice-core.md).
//
// Offline (house style): key resolution, the 30s audio-size guard, the
// 2,500-char TTS split/truncation behavior, request shape. No network, no key.
//
// Live (key set): for each fixture in fixtures/audio/ — mode "translate"
// returns non-empty English text mentioning the subject; mode "codemix"
// returns mixed-script text; auto-detect identifies a language. Then
// speak() round-trips one Tamil and one English sentence, saved to
// fixtures/audio/out-*.wav for a human to listen. SKIPs cleanly without a
// key OR without recorded fixtures (this environment has no microphone —
// see MERGE-NOTES).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AudioTooLongError,
  DEFAULT_SPEAKER,
  MAX_AUDIO_BYTES,
  STT_API_URL,
  TTS_API_URL,
  VoiceMissingKeyError,
  speak,
  transcribe,
} from "../lib/voice/sarvam";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(HERE, "..", "fixtures", "audio");

let passed = 0;
let total = 0;
let liveSkipped = false;

function check(name: string, cond: boolean, detail?: string): void {
  total++;
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function stubFetch(
  handler: (url: string, init: RequestInit) => { status: number; body: unknown } | { networkError: string },
): { calls: { url: string; init: RequestInit }[]; restore: () => void } {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const result = handler(call.url, call.init);
    if ("networkError" in result) throw new Error(result.networkError);
    return new Response(JSON.stringify(result.body), { status: result.status });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

/* ---------- offline ---------- */

async function offlineKeyResolution(): Promise<void> {
  delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
  const audio = new Blob([new Uint8Array(100)], { type: "audio/webm" });
  try {
    await transcribe({ audio, language: "unknown", mode: "codemix" });
    check("transcribe() throws VoiceMissingKeyError when no key anywhere", false, "did not throw");
  } catch (e) {
    check("transcribe() throws VoiceMissingKeyError when no key anywhere", e instanceof VoiceMissingKeyError, String(e));
  }
  try {
    await speak({ text: "hello", language: "en-IN" });
    check("speak() throws VoiceMissingKeyError when no key anywhere", false, "did not throw");
  } catch (e) {
    check("speak() throws VoiceMissingKeyError when no key anywhere", e instanceof VoiceMissingKeyError, String(e));
  }
}

async function offlineAudioSizeGuard(): Promise<void> {
  process.env.NEXT_PUBLIC_SARVAM_API_KEY = "test-key";
  const restore = stubFetch(() => ({ status: 200, body: { transcript: "should not be reached" } }));

  const tooLong = new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)], { type: "audio/wav" });
  try {
    await transcribe({ audio: tooLong, language: "unknown", mode: "codemix" });
    check("transcribe() rejects audio over the 30s size heuristic before calling the API", false, "did not throw");
  } catch (e) {
    check("transcribe() rejects audio over the 30s size heuristic before calling the API", e instanceof AudioTooLongError, String(e));
  }
  check("no network call was made for the oversized clip", restore.calls.length === 0);
  restore.restore();

  const restore2 = stubFetch(() => ({ status: 200, body: { transcript: "ok" } }));
  const fine = new Blob([new Uint8Array(1000)], { type: "audio/webm" });
  await transcribe({ audio: fine, language: "unknown", mode: "codemix" });
  check("transcribe() accepts audio under the size heuristic", restore2.calls.length === 1);
  restore2.restore();
  delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
}

async function offlineRequestShape(): Promise<void> {
  process.env.NEXT_PUBLIC_SARVAM_API_KEY = "test-key";

  const restore = stubFetch((url) => {
    if (url === STT_API_URL) return { status: 200, body: { transcript: "32 zone panel wireless ah?", language_code: "ta-IN" } };
    return { status: 200, body: {} };
  });
  const audio = new Blob([new Uint8Array(100)], { type: "audio/webm" });
  const result = await transcribe({ audio, language: "ta-IN", mode: "codemix" });
  check("transcribe() posts to the STT endpoint", restore.calls[0]?.url === STT_API_URL);
  check("transcribe() sends the api-subscription-key header", (restore.calls[0]?.init.headers as Record<string, string>)?.["api-subscription-key"] === "test-key");
  check("transcribe() maps the response to { text, detectedLanguage }", result.text === "32 zone panel wireless ah?" && result.detectedLanguage === "ta-IN");
  restore.restore();

  const restoreAuto = stubFetch((_url, init) => {
    const form = init.body as FormData;
    check(
      'transcribe() sends language_code="unknown" explicitly for auto-detect (per the real API reference — omitting it left response.language_code empty in live testing)',
      form.get("language_code") === "unknown",
    );
    return { status: 200, body: { transcript: "auto-detected" } };
  });
  await transcribe({ audio, language: "unknown", mode: "translate" });
  restoreAuto.restore();

  // Regression: browser MediaRecorder defaults to "audio/webm;codecs=opus", which
  // Sarvam's STT allowlist rejects (it matches "audio/webm" by exact string only).
  const codecAudio = new Blob([new Uint8Array(100)], { type: "audio/webm;codecs=opus" });
  const restoreCodec = stubFetch((_url, init) => {
    const form = init.body as FormData;
    const file = form.get("file") as Blob;
    check('transcribe() strips codec params so Content-Type is bare "audio/webm"', file.type === "audio/webm", file.type);
    return { status: 200, body: { transcript: "ok" } };
  });
  await transcribe({ audio: codecAudio, language: "unknown", mode: "codemix" });
  restoreCodec.restore();

  delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
}

async function offlineTtsSplit(): Promise<void> {
  process.env.NEXT_PUBLIC_SARVAM_API_KEY = "test-key";
  const shortWavBase64 = Buffer.from("RIFF....WAVEfmt ").toString("base64");

  const requestBodies: Record<string, unknown>[] = [];
  const restore = stubFetch((url, init) => {
    check("speak() posts to the TTS endpoint", url === TTS_API_URL);
    const body: Record<string, unknown> = JSON.parse(String(init.body));
    requestBodies.push(body);
    check("speak() request carries model bulbul:v3", body.model === "bulbul:v3");
    check("speak() text sent is <= 2500 chars", (body.text as string).length <= 2500);
    return { status: 200, body: { audios: [shortWavBase64] } };
  });

  const shortResult = await speak({ text: "The EMD is ₹4,86,000.", language: "en-IN" });
  check("speak() uses the DEFAULT_SPEAKER primary voice when none given", requestBodies[0]?.speaker === DEFAULT_SPEAKER["en-IN"].primary);
  check("speak() returns a Blob with mimeType audio/wav for short text", shortResult.mimeType === "audio/wav" && shortResult.audio.size > 0);
  check("speak() does not mark short text as truncated", shortResult.truncated === false);

  const sentence = "This is a filler sentence about the tender. ";
  const longText = sentence.repeat(100); // > 2500 chars
  const longResult = await speak({ text: longText, language: "ta-IN", speaker: "priya" });
  check("speak() honors an explicit speaker override", requestBodies[1]?.speaker === "priya");
  check("speak() marks long text as truncated", longResult.truncated === true);
  check("speak() charsSpoken is <= 2500 for long text", longResult.charsSpoken <= 2500);
  restore.restore();
  delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
}

async function offlineUnknownLanguageGuard(): Promise<void> {
  process.env.NEXT_PUBLIC_SARVAM_API_KEY = "test-key";
  try {
    // "unknown" IS a valid QuotraLanguageCode at the type level (it's legal for
    // transcribe()'s auto-detect) — this proves speak()'s runtime guard, since the
    // type system alone doesn't stop a caller from passing it here.
    await speak({ text: "hi", language: "unknown" });
    check('speak() rejects language "unknown"', false, "did not throw");
  } catch (e) {
    check('speak() rejects language "unknown"', e instanceof Error && e.name === "UnknownLanguageForSpeechError");
  }
  delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
}

/* ---------- live ---------- */

const FIXTURES: { file: string; mustMention: RegExp }[] = [
  { file: "ta-tender-question.wav", mustMention: /emd|date|deadline|close/i },
  { file: "codemix-panel-question.wav", mustMention: /panel|zone|wireless|cms/i },
  { file: "hi-tender-question.wav", mustMention: /emd|date|deadline|close|tender/i },
];

async function liveTests(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_SARVAM_API_KEY?.trim();
  if (!key) {
    liveSkipped = true;
    console.log("SKIP  live STT fixture round-trips — no NEXT_PUBLIC_SARVAM_API_KEY set");
    console.log("SKIP  live speak() round-trip — no NEXT_PUBLIC_SARVAM_API_KEY set");
    return;
  }

  const missingFixtures = FIXTURES.filter((f) => !existsSync(join(AUDIO_DIR, f.file)));
  if (missingFixtures.length === FIXTURES.length) {
    liveSkipped = true;
    console.log(
      `SKIP  live STT fixture round-trips — no recorded audio in fixtures/audio/ (this environment has no ` +
        `microphone; fixtures must be recorded by a human — see MERGE-NOTES)`,
    );
  } else {
    for (const f of FIXTURES) {
      const path = join(AUDIO_DIR, f.file);
      if (!existsSync(path)) {
        console.log(`SKIP  ${f.file} — fixture not recorded`);
        continue;
      }
      const bytes = readFileSync(path);
      const audio = new Blob([bytes], { type: "audio/wav" });
      try {
        const translated = await transcribe({ audio, language: "unknown", mode: "translate" });
        check(`${f.file}: mode=translate returns non-empty English text mentioning the subject`, f.mustMention.test(translated.text), translated.text);
        const codemix = await transcribe({ audio, language: "unknown", mode: "codemix" });
        check(`${f.file}: mode=codemix returns non-empty mixed-script text`, codemix.text.trim().length > 0, codemix.text);
        const auto = await transcribe({ audio, language: "unknown", mode: "transcribe" });
        check(`${f.file}: auto-detect identifies a language`, !!auto.detectedLanguage, JSON.stringify(auto));
      } catch (e) {
        check(`${f.file}: live STT round-trip`, false, String(e));
      }
    }
  }

  try {
    const ta = await speak({ text: "இந்த டெண்டருக்கு EMD நாற்பத்தி ஆறு லட்சத்து எண்பத்தி ஆறாயிரம் ரூபாய்.", language: "ta-IN" });
    writeFileSync(join(AUDIO_DIR, "out-ta.wav"), Buffer.from(await ta.audio.arrayBuffer()));
    check("speak() Tamil round-trip produces a non-empty audio Blob", ta.audio.size > 0);

    const en = await speak({ text: "The EMD is four lakh eighty six thousand rupees.", language: "en-IN" });
    writeFileSync(join(AUDIO_DIR, "out-en.wav"), Buffer.from(await en.audio.arrayBuffer()));
    check("speak() English round-trip produces a non-empty audio Blob", en.audio.size > 0);
    console.log(`  saved fixtures/audio/out-ta.wav (${ta.audio.size}B), fixtures/audio/out-en.wav (${en.audio.size}B) for human listening`);
  } catch (e) {
    check("speak() live round-trip (ta + en)", false, String(e));
  }
}

async function main(): Promise<void> {
  // Stash any real key before the offline tests start clobbering
  // NEXT_PUBLIC_SARVAM_API_KEY for isolation — restored right before
  // liveTests() runs, or the live half silently skips even with a real key
  // (same bug class fixed in checks/sarvam-llm.ts).
  const realKey = process.env.NEXT_PUBLIC_SARVAM_API_KEY;

  await offlineKeyResolution();
  await offlineAudioSizeGuard();
  await offlineRequestShape();
  await offlineTtsSplit();
  await offlineUnknownLanguageGuard();

  if (realKey) process.env.NEXT_PUBLIC_SARVAM_API_KEY = realKey;
  else delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
  await liveTests();

  const summary = liveSkipped ? " (live half SKIPPED/PARTIAL — see notes above)" : "";
  console.log("");
  console.log(`sarvam-voice check: ${passed}/${total} passed — ${passed === total ? "PASS" : "FAIL"}${summary}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error("sarvam-voice check crashed:", e);
  process.exit(1);
});
