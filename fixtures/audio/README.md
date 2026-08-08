# Audio fixtures — T2 (TASKS/T2-voice-core.md)

**These need to be recorded by a human with a microphone.** This build ran in an
environment with no audio input device, so the three required fixtures below were not
created. `checks/sarvam-voice.ts`'s live STT half detects their absence and SKIPs
cleanly rather than failing — see its output.

## Record these three (≤15s each, 16kHz WAV or webm — a phone voice memo re-encoded
with `ffmpeg -i in.m4a -ar 16000 -ac 1 out.wav` works fine)

| File | Language | Say |
|---|---|---|
| `ta-tender-question.wav` | Tamil | "இந்த டெண்டருக்கு EMD எவ்வளவு? கடைசி தேதி எப்போ?" |
| `codemix-panel-question.wav` | Tanglish | "32 zone panel wireless ah? CMS integrate aaguma?" |
| `hi-tender-question.wav` | Hindi | any tender question (e.g. "is tender ki EMD kitni hai?") |

Drop the files in this folder with those exact names, then run:

```bash
NEXT_PUBLIC_SARVAM_API_KEY=... npx tsx checks/sarvam-voice.ts
```

It will run mode=translate / mode=codemix / auto-detect against each fixture and save
`out-ta.wav` / `out-en.wav` here from the `speak()` round-trip — listen to those to
confirm voice quality before the demo.
