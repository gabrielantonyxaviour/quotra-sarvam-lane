// Quotra blk_verdict_engine — the verdict prompt.
//
// Builds the Claude prompt for a GO / NO-GO / FIXABLE verdict from the tender
// (real captured listing text), the company brain, the product master
// (capability specs) and the digested order book. The prompt enforces the
// product's truth disciplines in the model's contract:
//   - citation-or-flag: every reason carries clause + page + quoted text;
//     listing-level captures have no pages → page:null with clause naming the
//     listing field, never an invented page number
//   - the model never does arithmetic: money fields are computed in code
//     (lib/money); the model is forbidden from emitting numbers as analysis
//   - unknowns[]: information the listing does not contain is declared, never
//     guessed — each entry renders downstream as "needs confirmation"

import type { ChatMessage } from "../llm";
import type { BrainProduct, Company, ExperienceRecord, Tender } from "../tenders/types";
import { classifyCategory } from "../tenders/types";
import { inr } from "../money";

export const VERDICT_FEATURE = "verdict";

const MAX_PRODUCTS = 12; // category-relevant products only, keeps the prompt honest + cheap
const MAX_EXPERIENCE = 10; // top-10 by value

export type VerdictPromptInput = {
  tender: Tender;
  company: Company | null;
  products: BrainProduct[];
  experience: ExperienceRecord[];
};

/** Products whose name/domains classify into the tender's RAX category; falls
 *  back to the full master when nothing matches (never drops silently — the
 *  prompt says which mode it is in). */
function relevantProducts(tender: Tender, products: BrainProduct[]): { list: BrainProduct[]; filtered: boolean } {
  const matched = products.filter((p) => {
    const text = `${p.name} ${p.domains.join(" ")}`;
    return classifyCategory(text) === tender.category;
  });
  if (matched.length > 0) return { list: matched.slice(0, MAX_PRODUCTS), filtered: true };
  return { list: products.slice(0, MAX_PRODUCTS), filtered: false };
}

function describeProduct(p: BrainProduct): string {
  const caps: string[] = [];
  const c = p.capabilities;
  if (c.zones) caps.push(`${c.zones} zones`);
  if (c.channels) caps.push(`${c.channels} channel(s)`);
  if (c.voltages?.length) caps.push(c.voltages.join("/"));
  if (c.protocols?.length) caps.push(c.protocols.join(", "));
  if (c.certifications?.length) caps.push(`certs: ${c.certifications.join(", ")}`);
  if (c.compatibilities?.length) caps.push(`works with: ${c.compatibilities.join(", ")}`);
  const notes = c.notes?.length ? ` [needs confirmation: ${c.notes.join("; ")}]` : "";
  const price = p.price !== null ? `price list: ${inr(p.price)}` : "price list: not on file";
  return `- ${p.name}${p.model ? ` (model ${p.model})` : ""} — ${price}` +
    (caps.length ? `; ${caps.join("; ")}` : "") + notes;
}

function describeCompany(c: Company | null): string {
  if (!c) return "COMPANY PROFILE: not loaded — treat every company-dependent claim as an unknown.";
  const certs = c.certs.map((k) => `${k.kind} (${k.status}${k.validUntil ? `, valid until ${k.validUntil}` : ", no validity date on file"})`);
  const turnover = Object.entries(c.turnoverByFY)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 3)
    .map(([fy, v]) => `${fy}: ${inr(v)}`)
    .join("; ");
  return [
    `COMPANY: ${c.name}, ${c.city}`,
    `GSTIN: ${c.gstin ?? "not on file"}`,
    `Udyam/MSE registered: ${c.udyamRegistered ? "yes" + (c.udyamNumber ? ` (${c.udyamNumber})` : "") : "no"}`,
    `Categories: ${c.categories.join(", ")}`,
    `Certifications: ${certs.length ? certs.join("; ") : "none on file"}`,
    `Turnover (recent FYs): ${turnover || "not on file"}`,
    `Standard lead time: ${c.leadWeeks !== null ? `${c.leadWeeks} weeks` : "not configured — never guess a delivery date"}`,
  ].join("\n");
}

function describeExperience(records: ExperienceRecord[]): string {
  if (records.length === 0) return "PAST ORDERS: none digested.";
  const top = [...records].sort((a, b) => b.value - a.value).slice(0, MAX_EXPERIENCE);
  const lines = top.map(
    (r) => `- ${r.buyer} — ${r.productFamily}, ${r.fy}, ${inr(r.value)} (evidence: ${r.completionEvidence.slice(0, 3).join(", ")}${r.completionEvidence.length > 3 ? ` +${r.completionEvidence.length - 3} more` : ""})`,
  );
  return `PAST ORDERS (top ${top.length} of ${records.length} by value):\n${lines.join("\n")}`;
}

export function buildVerdictPrompt(input: VerdictPromptInput): { system: string; messages: ChatMessage[] } {
  const { tender, company } = input;
  const { list: products, filtered } = relevantProducts(tender, input.products);

  const system = [
    "You are Quotra's tender-verdict engine for an Indian manufacturing MSME. You read a REAL",
    "captured government tender listing and the company's real capability data, and return a",
    "GO / NO-GO / FIXABLE verdict as ONE strict JSON object.",
    "",
    "ABSOLUTE RULES (violating any of these makes the output useless):",
    "1. CITATION-OR-FLAG. Every reason MUST cite its source: \"clause\" naming the tender clause",
    "   or listing field it comes from, \"page\" the page number, and \"text\" a short quote or",
    "   close paraphrase of the source wording. This capture is listing-level:",
    tender.fullTextAvailable
      ? "   the full tender document text is available — cite real clause numbers and pages."
      : "   ONLY the portal listing text is available (no pages). Use \"page\": null and set",
      "   \"clause\" to the listing field/section name (e.g. \"Listing — Bid details\"). NEVER",
      "   invent a clause number or page that is not in the text.",
    "2. THE MODEL NEVER DOES ARITHMETIC. Do not compute, estimate or restate EMD amounts,",
    "   tender fees, estimated values, margins, percentages or dates as analysis. All money",
    "   and deadline figures are computed by deterministic code outside this call. If the",
    "   listing does not state a figure, put it in unknowns — do not infer one.",
    "3. DECLARE UNKNOWNS. Anything the provided text does not contain (EMD amount, tender fee,",
    "   estimated value, turnover requirements, experience thresholds, delivery schedule,",
    "   warranty terms, exact specifications) goes into \"unknowns\" — one short string per gap.",
    "   Never fill a gap by guessing; an honest unknown is a valid answer, a guess is a defect.",
    "4. Verdict semantics: GO = nothing in the listing disqualifies the company and no critical",
    "   unknowns block bidding; NO-GO = a stated requirement clearly disqualifies; FIXABLE = a",
    "   gap exists that the company could close before the deadline (document, registration,",
    "   clarification to the buyer) — name the fix in the reason text.",
    "",
    "Reply with ONLY one JSON object, no prose, no markdown fences:",
    "{",
    '  "verdict": "GO" | "NO-GO" | "FIXABLE",',
    '  "reasons": [{ "clause": string, "page": number | null, "text": string }],   // ≥1, every reason cited',
    '  "requirements": string[],            // eligibility/compliance requirements found in the text',
    '  "eligibilityClauses": string[],      // the clauses those requirements come from',
    '  "disqualificationRisks": string[],   // things that could get the bid rejected, cited in reasons',
    '  "unknowns": string[]                 // information the listing does NOT contain — needs confirmation',
    "}",
  ].join("\n");

  const moneyLine = (label: string, v: number | null) => `${label}: ${v === null ? "not exposed in the listing" : "as captured"}`;

  const user = [
    "TENDER (real capture):",
    `Portal: ${tender.portal} | Ref: ${tender.ref}`,
    `Title: ${tender.title}`,
    `Organisation: ${tender.org}`,
    `Category: ${tender.category}`,
    moneyLine("Estimated value", tender.estValue) + " | " + moneyLine("EMD", tender.emd) + " | " + moneyLine("Tender fee", tender.fee),
    `Published: ${tender.publishedAt} | Closes: ${tender.closeAt}`,
    `Source: ${tender.sourceUrl}`,
    `Full tender document available: ${tender.fullTextAvailable ? "yes" : "no — listing text only"}`,
    tender.docs.length ? `Documents listed: ${tender.docs.map((d) => d.name).join("; ")}` : "Documents listed: none",
    "",
    "LISTING TEXT (verbatim capture — cite only from this):",
    '"""',
    tender.rawText,
    '"""',
    "",
    describeCompany(company),
    "",
    products.length
      ? `PRODUCT MASTER (${filtered ? `products matching category "${tender.category}"` : `no category match — first ${products.length} of the master`}):\n` +
        products.map(describeProduct).join("\n")
      : "PRODUCT MASTER: empty.",
    "",
    describeExperience(input.experience),
    "",
    "Return the verdict JSON now. Remember: cite or flag, never guess, never do arithmetic.",
  ].join("\n");

  return { system, messages: [{ role: "user", content: user }] };
}
