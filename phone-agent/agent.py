"""Quotra phone-agent (T6, TASKS/T6-phone-agent.md).

A sales rep calls a phone number and talks to Quotra about live tenders —
no app, no smartphone, a feature phone reaches the Brain. Built on Pipecat's
Twilio Media Streams blueprint (docs.sarvam.ai/api/integration/
build-voice-agent-with-twilio.md) with Sarvam's first-class services:
Saaras STT (auto-detect, code-mix OK) -> Sarvam-105B -> Bulbul TTS.

PRODUCT LAW — INBOUND ONLY. This agent answers calls. It never places a
call or sends a message to anyone. Outbound contact to clients has been
vetoed twice by the design partner — do not add it "just to demo it".

Run: see README.md for the full zero-to-running walkthrough (venv, ngrok,
Twilio console). Short version: `python agent.py --transport twilio`.

NOT RUN IN THIS ENVIRONMENT — no Python interpreter, no Twilio/ngrok
accounts available here. Written and reviewed against the blueprint doc,
not executed. See MERGE-NOTES.md for exactly what that means for Gabriel.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from loguru import logger
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.sarvam.llm import SarvamLLMService
from pipecat.services.sarvam.stt import SarvamSTTService
from pipecat.services.sarvam.tts import SarvamTTSService
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams

from brain_context import build_brain_system_prompt

load_dotenv()

# Twilio Media Streams are 8kHz mono, both directions — non-negotiable per the blueprint.
TWILIO_SAMPLE_RATE = 8000

# Default TTS voice/language at pipeline construction time. KNOWN SIMPLIFICATION:
# Sarvam-105B replies in whatever language the caller spoke (the system prompt asks
# for this), but SarvamTTSService's `language_code`/`voice` are set once here at
# startup, not switched per-turn — so playback stays in this one language regardless
# of what the caller actually spoke. Making TTS language track the detected input
# language per-turn needs either a Pipecat frame processor that inspects STT output
# and reconfigures TTS mid-pipeline, or per-utterance language override support in
# SarvamTTSService — neither was confirmed against the real API in this environment
# (no live testing was possible here). Flagged in MERGE-NOTES as the #1 thing to fix
# before a real bilingual demo call.
DEFAULT_TTS_LANGUAGE = os.getenv("QUOTRA_PHONE_TTS_LANGUAGE", "en-IN")
DEFAULT_TTS_VOICE = os.getenv("QUOTRA_PHONE_TTS_VOICE", "anushka")  # matches lib/voice/sarvam.ts's en-IN default


async def bot(runner_args: RunnerArguments) -> None:
    transport = await create_transport(
        runner_args,
        {
            "twilio": lambda: FastAPIWebsocketParams(audio_in_enabled=True, audio_out_enabled=True),
        },
    )

    stt = SarvamSTTService(
        api_key=os.getenv("SARVAM_API_KEY"),
        settings=SarvamSTTService.Settings(model="saaras:v3", language="unknown"),  # auto-detect, code-mix OK
        mode="transcribe",
    )

    # sarvam-105b-conversations is worth A/B'ing against sarvam-105b here — it's
    # post-trained for real-time dialogue per SARVAM-API-NOTES.md. Untested live.
    llm = SarvamLLMService(
        api_key=os.getenv("SARVAM_API_KEY"),
        settings=SarvamLLMService.Settings(model=os.getenv("QUOTRA_PHONE_LLM_MODEL", "sarvam-105b")),
    )

    tts = SarvamTTSService(
        api_key=os.getenv("SARVAM_API_KEY"),
        settings=SarvamTTSService.Settings(
            model="bulbul:v3",
            voice=DEFAULT_TTS_VOICE,
            language_code=DEFAULT_TTS_LANGUAGE,
            pace=1.0,
        ),
    )

    system_prompt = build_brain_system_prompt()
    messages = [{"role": "system", "content": system_prompt}]
    context = LLMContext(messages)
    context_aggregator = LLMContextAggregatorPair(context)

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=TWILIO_SAMPLE_RATE,
            audio_out_sample_rate=TWILIO_SAMPLE_RATE,
        ),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Caller connected")
        messages.append(
            {
                "role": "system",
                "content": (
                    "Greet the caller as Quotra in one short sentence, in whichever language "
                    "they speak first (or English if the call just connected with silence). "
                    "Ask what tender they'd like to know about."
                ),
            }
        )
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Caller disconnected")
        await task.cancel()

    runner = PipelineRunner(handle_sigint=runner_args.handle_sigint)
    await runner.run(task)


if __name__ == "__main__":
    # Pipecat's dev runner: parses --transport twilio, starts a local FastAPI
    # server on port 7860, and wires Twilio's Media Streams WebSocket at /ws
    # straight into bot() above. No manual route to write — the Twilio side
    # is a TwiML Bin pointing at wss://<your-ngrok-host>/ws (see README.md).
    from pipecat.runner.run import main

    main()
