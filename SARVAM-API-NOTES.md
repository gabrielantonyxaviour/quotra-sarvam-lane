# Sarvam API surface — verified 2026-08-08

Researched against docs.sarvam.ai (live) on 2026-08-08. **Model IDs below are current;
several older ones are dead — do not use anything a generic LLM "remembers" about Sarvam.**
Deprecated: `sarvam-m`, `sarvam-2b`, `sarvam-30b` (all superseded), `saarika` (legacy),
`saaras:v2.5` (old endpoint), `bulbul:v2` (legacy).

Auth for every REST call: header `api-subscription-key: $SARVAM_API_KEY`.
Base URL: `https://api.sarvam.ai`. Docs MCP server: `https://docs.sarvam.ai/_mcp/server`.
JS SDK exists (`sarvamai` on npm) but app-side code uses plain `fetch` (house rule).

## Chat — Sarvam-105B (the flagship, launched Feb 2026 at India AI Impact Summit)

- **Endpoint:** `POST /v1/chat/completions` — OpenAI-compatible (messages, temperature,
  top_p, max_tokens, stream, tools, response_format).
- **Model IDs:** `sarvam-105b` (reasoning/agentic — use for verdict, eligibility, bid pack,
  Ask Quotra) · `sarvam-105b-conversations` (post-trained for real-time dialogue — use for
  the phone agent and optionally chat).
- 105B MoE (~9B active), **128K context**, 10 Indian languages + English, native script,
  romanized, and code-mixed input.
- **Structured outputs are native:** `response_format` supports **`json_schema`** and
  `json_object`. Tool calling also works as a schema mechanism. This is the single most
  important fact for T1 — the verdict contract can be enforced server-side AND by our
  validator.
- **⚠ Thinking mode is ON by default** (`reasoning_effort`, default `low`) and reasoning
  tokens count toward `max_tokens` (default 2048). A small `max_tokens` gets entirely
  consumed by reasoning → `finish_reason: "length"` with EMPTY `content`. For JSON tasks
  send `max_tokens: 4096`+ (Starter-plan cap is 4096; Pro 16384).
- Temperature 0–2 (default 0.5 with reasoning on). Response shape: standard OpenAI
  `choices[0].message.content`.

## Speech-to-Text — Saaras v3

- **Endpoint:** `POST /speech-to-text` (multipart form: `file`, `model`, `mode`,
  optional `language_code`). Model ID **`saaras:v3`**.
- **Five modes:** `transcribe` (native script) · `translate` (**always English out** —
  the mode that makes Indic speech LLM-comprehensible) · `verbatim` · `translit`
  (romanized) · `codemix` (English words in English, Indic words in native script —
  matches how reps actually speak: "32 zone panel wireless ah?").
- 23 languages (22 Indic + English), auto-detect via `language="unknown"`, telephony-grade
  (8 kHz) support, intelligent entity preservation (model numbers, phone numbers).
- **⚠ 30-second limit per REST request.** Formats: WAV, MP3, OGG/Opus, WebM (browser
  MediaRecorder output works directly), FLAC, and more. Longer audio → Batch STT API.
- **Streaming:** `saaras:v3-realtime` over WebSocket (true partials, VAD tuning) — for
  the phone agent path; REST is fine for push-to-talk UI.

## Text-to-Speech — Bulbul v3

- **Endpoint:** `POST /text-to-speech` (JSON: `text`, `language_code` BCP-47, `model`,
  `speaker`, optional `pace`, `speech_sample_rate`). Model ID **`bulbul:v3`**.
- 30+ speakers (seen in docs: anushka, shubh, priya, simran, ishita, kavya, aditya, anand,
  rohan — full list + audio previews on the docs "Voices" page), 11 languages
  (10 Indic + English).
- **⚠ 2,500 characters per request.** `pace` 0.5–2.0. Sample rates 8k–48k (default 24k).
  Response carries base64 audio (`audios[]` in the SDK shape) — decode to a Blob.
- Also HTTP-streaming and WebSocket variants for low-latency playback.

## Translation — Sarvam Translate

- **Endpoint:** `POST /translate` (JSON: `input`, `source_language_code`,
  `target_language_code`, `model`, optional `numerals_format`).
  Model ID **`sarvam-translate:v1`** — formal register, all 22 scheduled languages + English.
- **⚠ 2,000 characters per request** → chunk on sentence boundaries.
- `numerals_format: "international"` keeps 0-9 digits — REQUIRED for us (money/dates must
  pass through byte-identical; they're computed by code, never restyled by a model).
- (Legacy `mayura:v1` exists for colloquial register + `output_script` control — not needed v2.)

## Document intelligence — Sarvam Vision / Doc Agents ("Doc AI")

- Product docs: docs.sarvam.ai/docai — **Sarvam Vision** (3B doc-intelligence model, SOTA
  on 22 Indian languages + English) powers two flows: **Extract** (structured fields you
  define, reusable configs, CSV/Excel out) and **Digitise** (every page → accurate
  structured text).
- Exactly our tender-PDF problem (scanned government PDFs, bilingual). **The precise REST
  endpoints/job API are NOT pinned here** — first step of T5 is pulling them from the docs
  MCP (`docs.sarvam.ai/docai/how-to/digitise-a-document.md`). If API access turns out to be
  dashboard-only or gated, record the finding and stop T5 — the finding itself is valuable.

## Voice agents — the Samvaad platform + integrations

- Sarvam runs a full **Voice Agents platform** (platform.sarvam.ai/samvaad): author an
  agent, deploy on telephony/web/API, 10 Indian languages + English, entire stack
  self-hosted by Sarvam (data residency in India). Enterprise-flavored; for tomorrow the
  self-built path below is more demoable code.
- **Official Twilio guide** (the T6 blueprint):
  `docs.sarvam.ai/api/integration/build-voice-agent-with-twilio.md` — a Pipecat-based
  pipeline with first-class Sarvam services: `SarvamSTTService` (saaras:v3, mode
  transcribe/translate, language or auto-detect), `SarvamLLMService` (model sarvam-105b),
  `SarvamTTSService` (bulbul:v3, voice + language_code + pace). Same doc has a WhatsApp-bot
  variant (voice notes arrive as OGG/Opus, STT accepts directly; >30 s fails REST → batch).
- LiveKit/Pipecat production tuning guides exist under the same integration section
  (VAD, endpointing, barge-in) — consult when latency feels wrong.

## Pricing/limits reality check

Free signup credits at dashboard.sarvam.ai; a hackathon day fits comfortably. Rate-limit
and `max_tokens` tiers vary by plan (Starter caps chat `max_tokens` at 4096) — design
prompts to fit, don't assume Pro limits.
