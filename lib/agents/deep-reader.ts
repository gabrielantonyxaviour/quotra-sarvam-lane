// Quotra lib/agents/deep-reader — S5 deliverable (SARVAM-LANE-TASKS.md).
//
// Full tender document -> cited deep read -> constraint-pipeline input.
// Same citation-or-flag discipline as lib/verdict/prompt.ts (every extracted
// fact carries a clause + page + quoted text; anything the text doesn't
// state goes in "unknowns", never guessed) but scoped to EXTRACTION only —
// this agent doesn't render a verdict, it produces the cited raw material
// lib/verdict/prompt.ts (or a future constraint compiler, per S4's note in
// SARVAM-LANE-TASKS.md) would consume.
//
// Input is a single Tender's rawText today (this lane has no digitized-PDF
// pipeline — S4/Doc AI was cut, see MERGE-NOTES). fetchTender is pluggable so
// a real deployment can swap in digitized full-document text later without
// touching this agent's reasoning or schema.

import type { ChatMessage, JsonSchema } from "../llm";
import type { Tender } from "../tenders/types";
import { runAgent, type AgentResult } from "./runtime";

export type DeepReadClause = { clause: string; page: number | null; text: string };

export type DeepReadModelOutput = {
  clauses: DeepReadClause[]; // every extractable fact, cited
  requirements: string[];
  eligibilityClauses: string[];
  risks: string[];
  unknowns: string[]; // information the text does not contain
};

export type DeepReadArtifact = DeepReadModelOutput & {
  tenderId: string; // code-attached, not model-invented
  generatedAt: string; // code-computed
  transcriptId: string | null;
};

/* ---------- reason (sarvam-105b) ---------- */

const isStr = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);

export function validateDeepReadOutput(data: unknown): string[] {
  const problems: string[] = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) return ["deep-read output must be a JSON object"];
  const o = data as Record<string, unknown>;

  if (!Array.isArray(o.clauses) || o.clauses.length === 0) {
    problems.push('"clauses" must be a non-empty array — a deep read with nothing extracted is not a deep read');
  } else {
    o.clauses.forEach((c, i) => {
      const cc = c as Record<string, unknown>;
      if (!isStr(cc.clause)) problems.push(`"clauses"[${i}].clause must be a non-empty string`);
      if (!("page" in cc) || !(cc.page === null || (typeof cc.page === "number" && Number.isFinite(cc.page))))
        problems.push(`"clauses"[${i}].page must be a page number or explicit null`);
      if (!isStr(cc.text)) problems.push(`"clauses"[${i}].text must be a non-empty string quoting/paraphrasing the source`);
    });
  }
  if (!isStrArr(o.requirements)) problems.push('"requirements" must be an array of strings');
  if (!isStrArr(o.eligibilityClauses)) problems.push('"eligibilityClauses" must be an array of strings');
  if (!isStrArr(o.risks)) problems.push('"risks" must be an array of strings');
  if (!isStrArr(o.unknowns)) problems.push('"unknowns" must be an array of strings');
  return problems;
}

export const deepReadSchema: JsonSchema = { name: "deep-read", validate: validateDeepReadOutput };

function buildDeepReadPrompt(tender: Tender): { system: string; messages: ChatMessage[] } {
  const system = [
    "You are Quotra's Deep-reader agent. You extract EVERY fact from a captured tender",
    "document into a structured, cited record — you do NOT judge eligibility or render a",
    "verdict, that's a separate step downstream. Read only what's given; extract, don't opine.",
    "",
    "ABSOLUTE RULES:",
    '1. CITATION-OR-FLAG. Every entry in "clauses" MUST cite: "clause" naming the tender',
    '   clause/listing field, "page" the page number (null if this is a listing-level',
    "   capture with no pages), and \"text\" a short quote or close paraphrase.",
    "2. NEVER DO ARITHMETIC. Report money/date figures exactly as they appear; if a figure",
    "   is absent, put it in \"unknowns\" — do not estimate or compute.",
    '3. "requirements"/"eligibilityClauses"/"risks" are short labels pulled from the clauses',
    "   you already extracted — every one must trace back to a clause above, not a new claim.",
    '4. DECLARE UNKNOWNS. Anything a full read-through would need but this text doesn\'t',
    "   contain goes in \"unknowns\" as one short string per gap.",
    "",
    "Reply with ONLY one JSON object, no prose, no markdown fences:",
    "{",
    '  "clauses": [{ "clause": string, "page": number | null, "text": string }],',
    '  "requirements": string[],',
    '  "eligibilityClauses": string[],',
    '  "risks": string[],',
    '  "unknowns": string[]',
    "}",
  ].join("\n");

  const user = [
    `Portal: ${tender.portal} | Ref: ${tender.ref}`,
    `Title: ${tender.title}`,
    `Organisation: ${tender.org}`,
    `Full tender document available: ${tender.fullTextAvailable ? "yes" : "no — listing text only"}`,
    "",
    "DOCUMENT TEXT (verbatim capture — extract only from this):",
    '"""',
    tender.rawText,
    '"""',
    "",
    "Extract the deep read now as the JSON object described above.",
  ].join("\n");

  return { system, messages: [{ role: "user", content: user }] };
}

/* ---------- run ---------- */

export async function runDeepReader(opts: { fetchTender: () => Promise<Tender> }): Promise<AgentResult<DeepReadArtifact>> {
  return runAgent<Tender, DeepReadModelOutput, DeepReadArtifact>({
    agent: "deep-reader",
    fetch: opts.fetchTender,
    reason: async (tender) => ({ ...buildDeepReadPrompt(tender), schema: deepReadSchema, maxTokens: 4096 }),
    act: (tender, reasoned, transcriptId) => ({
      ...reasoned,
      tenderId: tender.id,
      generatedAt: new Date().toISOString(),
      transcriptId,
    }),
    fetchSummary: (t) => `tender ${t.id}, rawText ${t.rawText.length} chars, fullTextAvailable=${t.fullTextAvailable}`,
    actSummary: (r) => `${r.clauses.length} clauses, ${r.requirements.length} requirements, ${r.risks.length} risks, ${r.unknowns.length} unknowns`,
  });
}
