// Quotra lib/askquotra — the Ask-Quotra-by-voice prompt (T3 deliverable,
// TASKS/T3-voice-playground.md). Grounds the model in fixture data (company,
// products, the sample tenders) so a spoken question about a live tender can
// get a cited answer. Mirrors lib/verdict/prompt.ts's truth disciplines
// (citation-or-flag, no model arithmetic, unknowns declared) at playground
// scale — this is NOT the full verdict prompt, just enough grounding for a
// conversational Q&A demo.

import type { ChatMessage } from "../llm";
import type { BrainProduct, Company, Tender } from "../tenders/types";
import { inr } from "../money";

export type AskQuotraPromptInput = {
  question: string;
  company: Company | null;
  products: BrainProduct[];
  tenders: Tender[];
};

function describeCompany(c: Company | null): string {
  if (!c) return "COMPANY: not loaded — treat every company-dependent claim as needing confirmation.";
  const certs = c.certs.map((k) => `${k.kind} (${k.status})`).join(", ") || "none on file";
  return [
    `COMPANY: ${c.name}, ${c.city}`,
    `Udyam/MSE registered: ${c.udyamRegistered ? "yes" : "no"}`,
    `Categories: ${c.categories.join(", ")}`,
    `Certifications: ${certs}`,
  ].join("\n");
}

function describeProducts(products: BrainProduct[]): string {
  if (products.length === 0) return "PRODUCTS: none loaded.";
  const lines = products.slice(0, 15).map((p) => {
    const caps: string[] = [];
    const c = p.capabilities;
    if (c.zones) caps.push(`${c.zones} zones`);
    if (c.channels) caps.push(`${c.channels} channel(s)`);
    if (c.protocols?.length) caps.push(c.protocols.join(", "));
    if (c.compatibilities?.length) caps.push(`works with: ${c.compatibilities.join(", ")}`);
    return `- ${p.name}${p.model ? ` (model ${p.model})` : ""}${caps.length ? ` — ${caps.join("; ")}` : ""}`;
  });
  return `PRODUCTS (${products.length} total, showing ${lines.length}):\n${lines.join("\n")}`;
}

function describeTenders(tenders: Tender[]): string {
  if (tenders.length === 0) return "TENDERS: none loaded.";
  const lines = tenders.map(
    (t) =>
      `- [${t.id}] ${t.title} | Org: ${t.org} | Portal: ${t.portal} Ref: ${t.ref} | ` +
      `Closes: ${t.closeAt} | EMD: ${t.emd === null ? "not exposed in listing" : inr(t.emd)} | ` +
      `Est. value: ${t.estValue === null ? "not exposed in listing" : inr(t.estValue)} | ` +
      `Listing text: "${t.rawText.slice(0, 300)}"`,
  );
  return `TENDERS (sample set):\n${lines.join("\n")}`;
}

export function buildAskQuotraPrompt(input: AskQuotraPromptInput): { system: string; messages: ChatMessage[] } {
  const system = [
    "You are Ask Quotra, a voice assistant for an Indian manufacturing MSME's tender desk.",
    "A sales rep just asked you a spoken question (transcribed to English below). Answer in",
    "ENGLISH as one strict JSON object — the app renders your English answer as text and may",
    "translate + speak it in the rep's own language separately; do not answer in any language",
    "other than English here.",
    "",
    "ABSOLUTE RULES:",
    "1. CITATION-OR-FLAG. Every factual claim about a tender, the company, or a product must",
    '   be backed by a citation in "citations" (kind: "tender"|"company"|"product", ref: an id',
    "   or short label from the data below). If you cannot back a claim with the provided data,",
    '   prefix that part of the answer with "needs confirmation" instead of stating it plainly',
    "   — never invent a fact to sound complete.",
    "2. NEVER DO ARITHMETIC. Only state money/date figures exactly as they appear in the data",
    '   below. If a figure is not present ("not exposed in listing"), say so — do not estimate.',
    "3. Keep the answer SHORT — this gets spoken aloud. Prefer 1-2 sentences; the app caps",
    "   speech at ~2400 characters and will truncate longer answers.",
    "",
    "Reply with ONLY one JSON object, no prose, no markdown fences:",
    "{",
    '  "answer": string,',
    '  "citations": [{ "kind": "tender" | "company" | "product", "ref": string }]',
    "}",
  ].join("\n");

  const user = [
    describeCompany(input.company),
    "",
    describeProducts(input.products),
    "",
    describeTenders(input.tenders),
    "",
    `QUESTION (transcribed from speech): ${input.question}`,
    "",
    "Answer now as the JSON object described above.",
  ].join("\n");

  return { system, messages: [{ role: "user", content: user }] };
}
