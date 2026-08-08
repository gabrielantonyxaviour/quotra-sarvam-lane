# Quotra phone-agent — talk to the Brain by calling a phone number

T6 deliverable (`TASKS/T6-phone-agent.md`). A sales rep calls a phone number and talks to
Quotra in Tamil/Hindi/English about live tenders — no app, no smartphone. Built on
[Pipecat](https://github.com/pipecat-ai/pipecat)'s Twilio Media Streams blueprint with
Sarvam's first-class services (Saaras STT → Sarvam-105B → Bulbul TTS).

**PRODUCT LAW — INBOUND ONLY.** This agent answers calls. It never places one or messages
anyone. Do not add outbound calling "just to demo it" — vetoed twice already.

> **Not run in this environment.** This was written and reviewed against
> `docs.sarvam.ai/api/integration/build-voice-agent-with-twilio.md`'s blueprint, but there
> was no Python interpreter, no Twilio account, and no phone/microphone available here to
> actually run or call it. Follow the steps below from a real machine — that's the first
> time this code will execute.

## Setup (from zero)

### 1. Accounts (do these first — they have queues)

- **Twilio**: sign up for a trial account at [twilio.com/try-twilio](https://www.twilio.com/try-twilio),
  buy/claim a voice-capable trial number (any international/US number is fine — call it
  from the Twilio Console's "Call" button or via international dialing; don't fight Indian
  DLT/regulatory paperwork today). Note the **Account SID** and **Auth Token** from the
  Console dashboard.
- **Sarvam**: you already have a key from T1 (`dashboard.sarvam.ai`).
- **ngrok**: sign up free at [ngrok.com](https://ngrok.com), install the CLI.

### 2. Python environment

```bash
cd phone-agent
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip freeze > requirements.lock.txt   # do this once, commit it — see requirements.txt's note
```

### 3. Environment variables

```bash
cp .env.example .env
# then edit .env and fill in SARVAM_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
```

### 4. Run the agent

```bash
python agent.py --transport twilio
```

This starts a local FastAPI server on **port 7860** with a WebSocket endpoint at `/ws`.

### 5. Expose it with ngrok

In a second terminal:

```bash
ngrok http 7860
```

Copy the `https://xxxx.ngrok-free.app` URL ngrok prints.

### 6. Point Twilio at it

In the Twilio Console, open your phone number's configuration → **Voice Configuration** →
**A call comes in** → **TwiML Bin**, and create/assign a TwiML Bin with:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://xxxx.ngrok-free.app/ws" />
  </Connect>
</Response>
```

(swap `xxxx.ngrok-free.app` for your actual ngrok host, and use `wss://` not `https://`).

### 7. Call it

Call your Twilio number from your phone. You should hear Quotra greet you, then be able to
ask about a fixture tender in Tamil, Hindi, English, or code-mixed speech.

## What's in here

- `agent.py` — the Pipecat pipeline: Twilio transport → Saaras STT (auto-detect,
  `mode="transcribe"`) → Sarvam-105B → Bulbul TTS → Twilio transport. Entry point is
  Pipecat's own dev runner (`pipecat.runner.run.main()`), not a custom server.
- `brain_context.py` — builds the system prompt from `fixtures/*.json` (company, products,
  the 3 sample tenders), preferring `*.real.json` when present, exactly like
  `fixtures/load.ts` does for the Node side. Run `python brain_context.py` standalone to
  print the built prompt and eyeball it.
- `requirements.txt` — package names/extras only, not version-pinned (see its header
  comment for why, and what to do about it).

## Known limitation — TTS language is fixed at startup, not per-turn

The Brain replies in the caller's detected language (the system prompt asks for this), but
`SarvamTTSService`'s voice/`language_code` are configured once when the pipeline starts
(`QUOTRA_PHONE_TTS_LANGUAGE` / `QUOTRA_PHONE_TTS_VOICE` env vars, default `en-IN`/`anushka`)
— they don't dynamically switch per-utterance based on what the caller actually spoke.
Practically: if you call and speak Tamil, the LLM's text reply may itself be in Tamil, but
it'll be spoken back in the configured TTS language/voice unless that's fixed. Making this
track per-turn needs either a Pipecat processor that reads STT's detected language and
reconfigures TTS mid-pipeline, or confirming Sarvam's TTS service supports a per-call
language override — neither was verified against the real API here. **First thing to check
once this is actually running.**

## Deployment honesty

Laptop + ngrok is fine for **today's dev and a live in-room demo**. It is **not**
acceptable for the submission if judges may call async — a tunnel 530'ing mid-review has
burned this team before. **Phone agent needs a real host before submission** (Fly.io /
Cloudflare container / small VPS) — decision + deploy tonight/tomorrow morning.
