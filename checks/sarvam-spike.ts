// checks/sarvam-spike.ts — T1 Hour 1 spike: can sarvam-105b hold the verdict
// JSON contract on a real tender? Tries three response modes (plain,
// json_object, json_schema) against the real buildVerdictPrompt() output and
// validates each with validateVerdictOutput. Live-only — requires
// NEXT_PUBLIC_SARVAM_API_KEY; SKIPs cleanly without it (house style, see
// checks/README.md). Results belong in MERGE-NOTES.md per TASKS/T1.

import { loadCompany, loadExperience, loadProducts, loadTenders } from "../fixtures/load";
import { buildVerdictPrompt } from "../lib/verdict/prompt";
import { validateVerdictOutput } from "../lib/verdict/engine";
import type { BrainProduct, Company, ExperienceRecord, Tender } from "../lib/tenders/types";

const API_URL = "https://api.sarvam.ai/v1/chat/completions";
const MODEL = "sarvam-105b";
const MAX_TOKENS = 4096;

type Mode = { id: string; label: string; responseFormat?: Record<string, unknown> };

const VERDICT_JSON_SCHEMA = {
  type: "object",
  required: ["verdict", "reasons", "requirements", "eligibilityClauses", "disqualificationRisks", "unknowns"],
  properties: {
    verdict: { type: "string", enum: ["GO", "NO-GO", "FIXABLE"] },
    reasons: {
      type: "array",
      items: {
        type: "object",
        required: ["clause", "page", "text"],
        properties: {
          clause: { type: "string" },
          page: { type: ["number", "null"] },
          text: { type: "string" },
        },
      },
    },
    requirements: { type: "array", items: { type: "string" } },
    eligibilityClauses: { type: "array", items: { type: "string" } },
    disqualificationRisks: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
  },
};

const MODES: Mode[] = [
  { id: "plain", label: "(a) plain prompt, no response_format" },
  { id: "json_object", label: "(b) response_format: json_object", responseFormat: { type: "json_object" } },
  {
    id: "json_schema",
    label: "(c) response_format: json_schema (verdict shape)",
    responseFormat: { type: "json_schema", json_schema: { name: "verdict", schema: VERDICT_JSON_SCHEMA } },
  },
];

/** Extract the first balanced {...} block — mirrors lib/llm/client.ts's tolerant parse. */
function extractJsonBlock(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

type CallResult = { ok: true; durationMs: number } | { ok: false; durationMs: number; error: string };

async function callMode(key: string, system: string, user: string, mode: Mode): Promise<CallResult> {
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (mode.responseFormat) body.response_format = mode.responseFormat;

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, durationMs: Date.now() - started, error: `network failure: ${e instanceof Error ? e.message : String(e)}` };
  }
  const durationMs = Date.now() - started;
  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, durationMs, error: `HTTP ${res.status}: ${raw.slice(0, 300)}` };
  }

  let text = "";
  try {
    const parsed = JSON.parse(raw) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    text = parsed.choices?.[0]?.message?.content ?? "";
    if (!text) {
      return { ok: false, durationMs, error: `empty content, finish_reason=${parsed.choices?.[0]?.finish_reason ?? "unknown"} (thinking mode likely ate max_tokens)` };
    }
  } catch (e) {
    return { ok: false, durationMs, error: `response body not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  const block = extractJsonBlock(text);
  if (block === null) return { ok: false, durationMs, error: "no JSON object found in model text" };

  let data: unknown;
  try {
    data = JSON.parse(block);
  } catch (e) {
    return { ok: false, durationMs, error: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  const problems = validateVerdictOutput(data);
  if (problems.length > 0) return { ok: false, durationMs, error: `schema invalid: ${problems.join("; ")}` };
  return { ok: true, durationMs };
}

async function main() {
  const total = MODES.length;
  let passed = 0;
  const summaryLines: string[] = [];

  const tenders = loadTenders<Tender[]>();
  const company = loadCompany<Company>();
  const products = loadProducts<BrainProduct[]>();
  const experience = loadExperience<ExperienceRecord[]>();
  const { system, messages } = buildVerdictPrompt({ tender: tenders[0], company, products, experience });
  const userText = messages[0].content;

  console.log(`Spiking ${MODEL} against tender fixture [0]: ${tenders[0].id} (${tenders[0].title.slice(0, 60)}...)`);

  const key = process.env.NEXT_PUBLIC_SARVAM_API_KEY?.trim();
  if (!key) {
    for (const mode of MODES) {
      console.log(`SKIP  ${mode.label} — no NEXT_PUBLIC_SARVAM_API_KEY set, live spike not run`);
    }
    console.log(`sarvam-spike check: 0/${total} passed — SKIPPED (no NEXT_PUBLIC_SARVAM_API_KEY; this check is live-only)`);
    process.exit(0);
  }

  for (const mode of MODES) {
    const attempt1 = await callMode(key, system, userText, mode);
    if (attempt1.ok) {
      passed++;
      console.log(`PASS  ${mode.label} — schema-valid in 1 attempt, ${attempt1.durationMs}ms`);
      summaryLines.push(`${mode.id}: PASS in 1 attempt, ${attempt1.durationMs}ms`);
      continue;
    }
    const attempt2 = await callMode(key, system, userText, mode);
    if (attempt2.ok) {
      passed++;
      console.log(`PASS  ${mode.label} — schema-valid in 2 attempts (1st failed: ${attempt1.error}), ${attempt2.durationMs}ms`);
      summaryLines.push(`${mode.id}: PASS in 2 attempts, ${attempt2.durationMs}ms (1st failed: ${attempt1.error})`);
    } else {
      console.log(`FAIL  ${mode.label} — failed twice. 1st: ${attempt1.error} | 2nd: ${attempt2.error}`);
      summaryLines.push(`${mode.id}: FAIL both attempts — 1st: ${attempt1.error}; 2nd: ${attempt2.error}`);
    }
  }

  console.log("");
  console.log("Record this block in MERGE-NOTES.md:");
  summaryLines.forEach((l) => console.log(`  - ${l}`));

  console.log(`sarvam-spike check: ${passed}/${total} passed — ${passed > 0 ? "PASS" : "FAIL"}`);
  process.exit(passed > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("sarvam-spike check crashed:", e);
  process.exit(1);
});
