> ⚠️ **SUPERSEDED 2026-08-09** — the executable spec is now **`SARVAM-LANE-TASKS.md`** (repo root, tasks S1–S7). This brief is kept for history; where the two disagree, S1–S7 wins. Note: T6 (phone agent) is **cut** — do not work on it.

# T6 — The phone line to the company Brain (Twilio + Pipecat + Sarvam)

**Deliverable:** `phone-agent/` — a standalone Python service where a sales rep **calls a
phone number and talks to Quotra** in Tamil/Hindi/English about live tenders. The
showstopper demo: no app, no smartphone needed — a feature phone reaches the Brain.

**⚠ PRODUCT LAW — INBOUND ONLY.** The agent answers calls. It never places calls, never
messages anyone. Outbound contact to clients has been vetoed twice by the design partner.
Do not build outbound "just to demo it".

## Blueprint (follow the official guide, don't improvise the plumbing)

`docs.sarvam.ai/api/integration/build-voice-agent-with-twilio.md` — Pipecat pipeline with
Sarvam's first-class services:

```python
stt = SarvamSTTService(settings=Settings(model="saaras:v3", language="unknown"), mode="transcribe")  # auto-detect, code-mix OK
llm = SarvamLLMService(settings=Settings(model="sarvam-105b"))          # try sarvam-105b-conversations too — tuned for dialogue
tts = SarvamTTSService(settings=Settings(model="bulbul:v3", voice=..., language_code=...))
```

## Steps

1. **Accounts (human tasks, do these first — they have queues):** Twilio trial account +
   a voice-capable number (an international/US trial number is FINE — inbound from your
   phone via the Twilio app or international dialing; do NOT fight Indian-number
   regulatory paperwork today). Sarvam key you already have.
2. Scaffold per the guide: Python 3.11+, venv, pipecat + the Sarvam plugin deps, a
   webhook server for Twilio Media Streams; expose dev server with `ngrok`.
3. **The Brain system prompt:** generate from fixtures — company identity, top products
   with 2–3 capability lines each, and the 3 sample tenders (title, org, closing date,
   EMD, key eligibility lines). One compact builder in `phone-agent/brain_context.py`
   reading `fixtures/*.json` directly. The laws apply on the phone:
   cite what you know ("as per the tender listing…"), say "needs confirmation" for what
   you don't, never compute new numbers (quote only figures present in the fixtures).
4. Language behavior: reply in the caller's language (auto-detected); keep answers ≤2
   sentences per turn (phone pacing); barge-in on if the guide's defaults allow.
5. `phone-agent/README.md`: exact run instructions from zero (venv, env vars, ngrok,
   Twilio console webhook URL) — Gabriel must be able to bring it up tonight in 10 min.

## Deployment honesty (flag, don't solve today)

Laptop + ngrok is fine for TODAY'S DEV and a live in-room demo. It is **not** acceptable
for the submission if judges may call async (house rule: published endpoints live on real
hosts — a tunnel 530'ing mid-review has burned us before). Put a line in MERGE-NOTES:
"phone agent needs a real host before submission (Fly.io / Cloudflare container / small
VPS) — decision + deploy tonight/tomorrow morning."

## Acceptance

A **recorded real call** (phone on speaker, screen-record the terminal too):
you ask in Tamil about a fixture tender ("Samba CCTV tender pathi sollu — EMD evlo,
eppo close aagum?"), the agent answers in Tamil with that tender's real facts, then
handles one code-mixed follow-up ("32 zone panel CMS integrate aaguma?") citing a real
product capability. Save as `fixtures/phone-agent-demo.mp4`. Plus:
`phone-agent/` committed with README + requirements pinned, and the MERGE-NOTES line
(latency per turn, deployment flag, Twilio number + console login handoff for Gabriel).
