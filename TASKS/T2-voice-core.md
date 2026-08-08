# T2 — Voice core: Saaras STT + Bulbul TTS modules

**Deliverable:** `lib/voice/sarvam.ts` implementing the frozen `VoiceProvider`
interface in `lib/voice/types.ts` (transcribe + speak), plus recorded audio fixtures
and a check. This is the module tonight's merge wires into the real Ask Quotra dialog —
keep it UI-free (pure functions over Blobs).

## Implement

**`transcribe(args)`** → `POST https://api.sarvam.ai/speech-to-text`
- multipart form: `file` (the Blob — browser `MediaRecorder` webm/opus is accepted
  directly), `model: "saaras:v3"`, `mode: args.mode`, and `language_code` when
  `args.language !== "unknown"` (omit → auto-detect).
- Map the response to `{ text, detectedLanguage?, requestId? }`.
- **⚠ 30 s per REST request** — reject longer Blobs client-side with a clear error rather
  than letting the API 4xx (`audio.size` heuristic or duration if available).
- Key resolution identical to T1 (`quotra_sarvam_key` → `NEXT_PUBLIC_SARVAM_API_KEY` →
  named error). Share a tiny internal helper; do NOT import from `lib/llm/sarvam.ts`
  (keep the modules independently mergeable).

**`speak(args)`** → `POST https://api.sarvam.ai/text-to-speech`
- JSON: `text`, `language_code`, `model: "bulbul:v3"`, `speaker`, `pace`.
- **Default speakers per language** — pick from the docs Voices page (audio previews),
  one male/female pair you actually like per en-IN/ta-IN/hi-IN; hardcode the defaults in
  a `DEFAULT_SPEAKER` map with a comment naming the alternatives.
- **⚠ 2,500-char limit** — if text is longer, split on sentence boundaries, synthesize
  sequentially, concatenate (or return the first chunk + a truncation flag; document
  whichever you choose).
- Response audio is base64 — decode to a Blob, return `{ audio, mimeType }` playable via
  `new Audio(URL.createObjectURL(blob))`.

## Fixtures you create (commit them)

`fixtures/audio/` — record on your machine, ≤15 s each, 16 kHz WAV or
webm:
- `ta-tender-question.wav` — Tamil: "இந்த டெண்டருக்கு EMD எவ்வளவு? கடைசி தேதி எப்போ?"
- `codemix-panel-question.wav` — Tanglish: "32 zone panel wireless ah? CMS integrate aaguma?"
- `hi-tender-question.wav` — Hindi, any tender question.

## Acceptance — `checks/sarvam-voice.ts`

Live (needs key): for each fixture — `mode: "translate"` returns non-empty ENGLISH text
mentioning the subject (EMD/panel/date); `mode: "codemix"` returns mixed-script text;
auto-detect (`language: "unknown"`) identifies the language. Then `speak()` round-trips
one Tamil and one English sentence → non-empty audio Blob with a sane mimeType, saved to
`fixtures/audio/out-*.wav` so a human can listen. Stubbed-fetch tests for
key resolution, the 30 s guard, and the 2,500-char split. Exit 0 = done → commit +
MERGE-NOTES line (include which speakers you chose and why).
