# phone-agent — T6 workspace

Standalone Python service (Pipecat + Twilio + Sarvam) — the phone line you call and talk
to about live tenders, in Tamil/Hindi/English. Build per `TASKS/T6-phone-agent.md`;
blueprint: docs.sarvam.ai/api/integration/build-voice-agent-with-twilio.md.

**INBOUND ONLY** (product law — the agent answers calls, never places them).

Deliverables in this folder: the agent, `brain_context.py` (system prompt from
`../fixtures/` via the same prefer-real rule as fixtures/load.ts), `requirements.txt`
pinned, and a README with zero-to-running instructions (venv, env vars, ngrok, Twilio
console webhook) that Gabriel can follow in 10 minutes tonight.
