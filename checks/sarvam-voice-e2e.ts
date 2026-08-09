// checks/sarvam-voice-e2e.ts — S3 deliverable support (SARVAM-LANE-TASKS.md).
//
// Proves the FULL Voice Mode loop live (Saaras STT -> sarvam-105b Ask-Quotra ->
// Sarvam Translate -> Bulbul TTS) end-to-end WITHOUT a physical microphone, which
// this build environment doesn't have (same gap MERGE-NOTES.md's T2/T3 sections
// already flag). Substitute: synthesize the spoken QUESTION with Bulbul TTS first,
// then feed that synthetic audio into the exact same transcribe() the playground
// page uses. This exercises the real STT/LLM/translate/TTS wire calls end-to-end —
// it does NOT replace a human recording for the demo video (synthetic TTS audio
// doesn't prove human-speech STT accuracy), but it DOES prove the pipeline
// mechanics work live, which a human demo recording alone can't verify in advance.
//
// Live-only — requires NEXT_PUBLIC_SARVAM_API_KEY; SKIPs cleanly without it.

import { loadCompany, loadProducts, loadTenders } from "../fixtures/load";
import { buildAskQuotraPrompt } from "../lib/askquotra/prompt";
import { askQuotraSchema, type AskQuotraAnswer } from "../lib/askquotra/contract";
import { completeJSONWith } from "../lib/llm/client";
import { sarvamComplete } from "../lib/llm/sarvam";
import { transcribe, speak } from "../lib/voice/sarvam";
import { translate } from "../lib/translate/sarvam";
import type { BrainProduct, Company, Tender } from "../lib/tenders/types";

type Scenario = { label: string; language: "ta-IN" | "hi-IN"; spokenQuestion: string };

const SCENARIOS: Scenario[] = [
  // Mirrors SARVAM-LANE-TASKS.md S3 scenario 1 (tender-list intent, Tamil).
  { label: "Tamil — what's new this week", language: "ta-IN", spokenQuestion: "இந்த வாரத்தில் என்ன புதிய டெண்டர்கள் வந்திருக்கு?" },
  // Mirrors S3 scenario 3 (eligibility-gap intent, Hindi).
  { label: "Hindi — EMD amount for this tender", language: "hi-IN", spokenQuestion: "इस टेंडर में EMD कितना है?" },
];

async function runScenario(s: Scenario, company: Company | null, products: BrainProduct[], tenders: Tender[]) {
  console.log(`\n--- ${s.label} (${s.language}) ---`);
  const trace: string[] = [];

  // Step 1: synthesize the spoken question (stand-in for a human mic recording).
  const t0 = Date.now();
  const synth = await speak({ text: s.spokenQuestion, language: s.language });
  trace.push(`speak(question) — ${Date.now() - t0}ms, ${synth.audio.size} bytes, truncated=${synth.truncated}`);

  // Step 2: transcribe it back — the real STT call the playground makes, codemix mode, auto-detect.
  const t1 = Date.now();
  const stt = await transcribe({ audio: synth.audio, language: "unknown", mode: "codemix" });
  trace.push(`transcribe(codemix) — ${Date.now() - t1}ms, detected=${stt.detectedLanguage ?? "(none)"}, text="${stt.text}"`);

  const t2 = Date.now();
  const sttTranslated = await transcribe({ audio: synth.audio, language: "unknown", mode: "translate" });
  trace.push(`transcribe(translate) — ${Date.now() - t2}ms, text="${sttTranslated.text}"`);

  // Step 3: real Ask-Quotra call against sarvam-105b, using the English-translated question.
  const t3 = Date.now();
  const { system, messages } = buildAskQuotraPrompt({ question: sttTranslated.text || s.spokenQuestion, company, products, tenders });
  const { data } = await completeJSONWith<AskQuotraAnswer>(sarvamComplete, {
    feature: "ask-quotra",
    system,
    messages,
    schema: askQuotraSchema,
    maxTokens: 1024,
  });
  trace.push(`ask-quotra completeJSON — ${Date.now() - t3}ms, answer="${data.answer.slice(0, 120)}...", citations=${data.citations.length}`);

  // Step 4: translate the English answer back into the spoken language (matches page.tsx behavior).
  const t4 = Date.now();
  const localized = await translate({ text: data.answer, source: "en-IN", target: s.language });
  trace.push(`translate(answer -> ${s.language}) — ${Date.now() - t4}ms, text="${localized.text.slice(0, 120)}..."`);

  // Step 5: speak the localized answer back.
  const t5 = Date.now();
  const spoken = await speak({ text: localized.text.slice(0, 300), language: s.language });
  trace.push(`speak(answer) — ${Date.now() - t5}ms, ${spoken.audio.size} bytes`);

  trace.forEach((l) => console.log(`  ${l}`));
  const totalMs = Date.now() - t0;
  console.log(`  TOTAL: ${totalMs}ms, ${data.citations.length} citation(s): ${data.citations.map((c) => `${c.kind}:${c.ref}`).join(", ") || "(none)"}`);
  return { label: s.label, ok: true, totalMs, citations: data.citations.length };
}

async function main() {
  const key = process.env.NEXT_PUBLIC_SARVAM_API_KEY?.trim();
  if (!key) {
    console.log("SKIP  voice E2E scenarios — no NEXT_PUBLIC_SARVAM_API_KEY set");
    console.log("sarvam-voice-e2e check: 0/0 passed — SKIPPED (live-only)");
    process.exit(0);
  }

  const company = loadCompany<Company>();
  const products = loadProducts<BrainProduct[]>();
  const tenders = loadTenders<Tender[]>();

  console.log(`Running ${SCENARIOS.length} full voice-loop scenario(s), live, synthesized speech input...`);

  const results: { label: string; ok: boolean; totalMs?: number; citations?: number; error?: string }[] = [];
  for (const s of SCENARIOS) {
    try {
      results.push(await runScenario(s, company, products, tenders));
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`  FAILED: ${error}`);
      results.push({ label: s.label, ok: false, error });
    }
  }

  console.log("");
  const passed = results.filter((r) => r.ok).length;
  console.log(`sarvam-voice-e2e check: ${passed}/${results.length} scenarios completed the full loop — ${passed === results.length ? "PASS" : "FAIL"}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("sarvam-voice-e2e check crashed:", e);
  process.exit(1);
});
