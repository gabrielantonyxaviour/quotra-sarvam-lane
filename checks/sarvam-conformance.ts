// checks/sarvam-conformance.ts — S2 deliverable (SARVAM-LANE-TASKS.md).
//
// Runs the REAL production path (buildVerdictPrompt -> completeJSONWith(sarvamComplete)
// -> verdictSchema, the same one-corrective-retry contract every feature gets via
// lib/llm/index.ts) against every fixture tender, live, against sarvam-105b. Scores
// citation fidelity: does each reason's cited text actually ground in the tender's own
// rawText, or is the model inventing/paraphrasing beyond what's there?
//
// Live-only — requires NEXT_PUBLIC_SARVAM_API_KEY; SKIPs cleanly without it (house
// style, see checks/sarvam-spike.ts). Results belong in MERGE-NOTES.md per
// SARVAM-LANE-TASKS.md's S2 success criteria.
//
// KNOWN LIVE FINDING (see MERGE-NOTES.md S2 block): sarvam-105b's thinking mode
// occasionally consumes the ENTIRE max_tokens budget (4096, Starter-plan hard cap —
// confirmed by testing 8192, which the API rejects outright) on short/sparse tender
// listings, returning finish_reason:"length" with EMPTY content. This is NOT
// deterministic — the same prompt succeeds on one call and empties out on the next.
// completeJSONWith's existing one-corrective-retry (shared, provider-agnostic,
// lib/llm/client.ts) already covers this: an empty/unparseable first reply triggers
// exactly the same retry path as a schema violation. This suite runs through that
// real path (not a raw single-shot call) so its pass rate reflects production
// behavior, not a worst-case single attempt.

import { loadCompany, loadExperience, loadProducts, loadTenders } from "../fixtures/load";
import { buildVerdictPrompt } from "../lib/verdict/prompt";
import { validateVerdictOutput, verdictSchema, type VerdictModelOutput } from "../lib/verdict/engine";
import { completeJSONWith, ContractError } from "../lib/llm/client";
import { sarvamComplete } from "../lib/llm/sarvam";
import type { BrainProduct, Company, ExperienceRecord, Tender } from "../lib/tenders/types";

const MIN_WORD_LEN = 4;
const GROUND_RATIO_PASS = 0.5; // fraction of a reason's significant words that must appear in rawText

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= MIN_WORD_LEN);
}

/** Citation fidelity for one reason: what fraction of its significant words
 *  ground in the FULL prompt content the model actually saw (tender.rawText's
 *  quoted listing PLUS the structured tender/company/product-master/experience
 *  summary buildVerdictPrompt also feeds it — legitimate citations reference
 *  any of these, e.g. "Udyam/MSE registered: yes" comes from the company
 *  summary, not the raw listing quote). Word-overlap, not exact-substring —
 *  the model paraphrases, so exact quoting isn't the bar; inventing content
 *  the source never mentioned is. */
function groundingRatio(reasonText: string, promptContent: string): number {
  const sourceWords = new Set(normalizeWords(promptContent));
  const reasonWords = normalizeWords(reasonText);
  if (reasonWords.length === 0) return 1; // nothing to ground (shouldn't happen, schema requires non-empty)
  const grounded = reasonWords.filter((w) => sourceWords.has(w)).length;
  return grounded / reasonWords.length;
}

type TenderResult = {
  id: string;
  ok: boolean;
  verdict?: string;
  reasonCount?: number;
  groundedReasons?: number;
  minRatio?: number;
  durationMs: number;
  error?: string;
};

async function runOne(tender: Tender, company: Company | null, products: BrainProduct[], experience: ExperienceRecord[]): Promise<TenderResult> {
  const { system, messages } = buildVerdictPrompt({ tender, company, products, experience });
  const started = Date.now();
  try {
    const { data } = await completeJSONWith<VerdictModelOutput>(sarvamComplete, {
      feature: "verdict",
      system,
      messages,
      maxTokens: 4096,
      schema: verdictSchema,
    });
    const durationMs = Date.now() - started;

    // completeJSONWith already ran validateVerdictOutput via verdictSchema; re-run
    // here only to surface the exact problem strings if something slipped through.
    const problems = validateVerdictOutput(data);
    if (problems.length > 0) return { id: tender.id, ok: false, durationMs, error: `schema invalid: ${problems.join("; ")}` };

    const promptContent = messages[0].content;
    const ratios = data.reasons.map((r) => groundingRatio(r.text, promptContent));
    const groundedReasons = ratios.filter((r) => r >= GROUND_RATIO_PASS).length;
    const minRatio = Math.min(...ratios);

    return {
      id: tender.id,
      ok: groundedReasons === data.reasons.length,
      verdict: data.verdict,
      reasonCount: data.reasons.length,
      groundedReasons,
      minRatio,
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - started;
    if (e instanceof ContractError) {
      return { id: tender.id, ok: false, durationMs, error: `failed contract after 1 corrective retry: ${e.message}` };
    }
    return { id: tender.id, ok: false, durationMs, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const key = process.env.NEXT_PUBLIC_SARVAM_API_KEY?.trim();
  if (!key) {
    console.log("SKIP  all fixture tenders — no NEXT_PUBLIC_SARVAM_API_KEY set, live conformance not run");
    console.log("sarvam-conformance check: 0/0 passed — SKIPPED (live-only)");
    process.exit(0);
  }

  const tenders = loadTenders<Tender[]>();
  const company = loadCompany<Company>();
  const products = loadProducts<BrainProduct[]>();
  const experience = loadExperience<ExperienceRecord[]>();

  console.log(`Running conformance against ${tenders.length} fixture tender(s), live, sarvam-105b, via completeJSONWith (real retry contract)...`);
  console.log("");

  const results: TenderResult[] = [];
  for (const tender of tenders) {
    const r = await runOne(tender, company, products, experience);
    results.push(r);
    if (r.ok) {
      console.log(
        `PASS  ${r.id} — verdict=${r.verdict}, ${r.groundedReasons}/${r.reasonCount} reasons grounded ` +
          `(min ratio ${r.minRatio?.toFixed(2)}), ${r.durationMs}ms`,
      );
    } else {
      console.log(`FAIL  ${r.id} — ${r.error ?? `${r.groundedReasons}/${r.reasonCount} reasons grounded (min ratio ${r.minRatio?.toFixed(2)})`}, ${r.durationMs}ms`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const totalReasons = results.reduce((s, r) => s + (r.reasonCount ?? 0), 0);
  const totalGrounded = results.reduce((s, r) => s + (r.groundedReasons ?? 0), 0);

  console.log("");
  console.log("Record this block in MERGE-NOTES.md:");
  results.forEach((r) =>
    console.log(
      `  - ${r.id}: ${r.ok ? "PASS" : "FAIL"}${r.verdict ? `, verdict=${r.verdict}` : ""}${
        r.reasonCount !== undefined ? `, ${r.groundedReasons}/${r.reasonCount} reasons grounded` : ""
      }${r.error ? `, error: ${r.error}` : ""}, ${r.durationMs}ms`,
    ),
  );
  console.log(`  - citation fidelity overall: ${totalGrounded}/${totalReasons} reasons grounded (>=${GROUND_RATIO_PASS} word-overlap with source rawText)`);

  console.log(`sarvam-conformance check: ${passed}/${results.length} tenders fully conformant — ${passed === results.length ? "PASS" : "FAIL"}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("sarvam-conformance check crashed:", e);
  process.exit(1);
});
