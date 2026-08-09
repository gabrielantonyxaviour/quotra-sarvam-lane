// checks/sarvam-docai.ts — S4 acceptance (SARVAM-LANE-TASKS.md).
//
// CORRECTION 2026-08-09: S4 was previously reported gated (no REST API).
// That was accurate for docs.sarvam.ai at the time; Sarvam has since
// relaunched as "Indus" (indus.sarvam.ai) with a real, documented Doc AI
// REST API. See lib/docai/sarvam.ts's header for the full correction and
// the confirmed endpoint contract. This check now live-digitises the real
// fixture GeM tender PDF end to end.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { digestTenderPdf, DocAiMissingKeyError } from "../lib/docai/sarvam";

const HERE = dirname(fileURLToPath(import.meta.url));
const PDF_PATH = join(HERE, "..", "fixtures", "tender-gem-9679256.pdf");

let passed = 0;
let total = 0;

function check(name: string, cond: boolean, detail?: string): void {
  total++;
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  check("fixtures/tender-gem-9679256.pdf exists (a real, public, bilingual GeM tender PDF)", existsSync(PDF_PATH));
  if (existsSync(PDF_PATH)) {
    const size = statSync(PDF_PATH).size;
    check("the fixture PDF is non-trivially sized (not an empty/error placeholder)", size > 10_000, `${size} bytes`);
  }

  const key = process.env.NEXT_PUBLIC_SARVAM_API_KEY?.trim();
  if (!key) {
    console.log("SKIP  live digitise-the-real-PDF assertions — no NEXT_PUBLIC_SARVAM_API_KEY set");
    try {
      await digestTenderPdf(Buffer.alloc(0));
      check("digestTenderPdf() throws DocAiMissingKeyError with no key", false, "did not throw");
    } catch (e) {
      check("digestTenderPdf() throws DocAiMissingKeyError with no key", e instanceof DocAiMissingKeyError, String(e));
    }
    console.log(`sarvam-docai check: ${passed}/${total} passed — ${passed === total ? "PASS" : "FAIL"} (live half SKIPPED)`);
    process.exit(passed === total ? 0 : 1);
  }

  console.log("Digitising fixtures/tender-gem-9679256.pdf live via Sarvam Doc AI (this can take up to ~2 minutes)...");
  const pdfBuffer = readFileSync(PDF_PATH);
  const started = Date.now();
  try {
    const result = await digestTenderPdf(pdfBuffer, { filename: "tender-gem-9679256.pdf", language: "en-IN" });
    const durationMs = Date.now() - started;

    console.log(`  job ${result.jobId} -> status "${result.status}", ${result.pages.length} page(s), ${durationMs}ms`);

    check("digitise job reached a terminal, non-failed status", result.status === "completed" || result.status === "partially_completed", result.status);
    check("at least one page was returned", result.pages.length > 0);

    const nonEmptyPages = result.pages.filter((p) => p.text.trim().length > 0);
    check(
      `>=80% of pages have non-empty text (${nonEmptyPages.length}/${result.pages.length})`,
      result.pages.length > 0 && nonEmptyPages.length / result.pages.length >= 0.8,
    );

    const fullText = result.pages.map((p) => p.text).join("\n").toLowerCase();
    check("digitised text mentions EMD or a security-deposit term (real tender content, not noise)", /emd|earnest money|security deposit/.test(fullText));
    check("digitised text mentions CCTV or surveillance (matches this fixture's known subject)", /cctv|surveillance|camera/i.test(fullText));

    console.log("");
    console.log("First page excerpt (first 400 chars):");
    console.log(result.pages[0]?.text.slice(0, 400));
  } catch (e) {
    check("live digitise of the fixture PDF completes without throwing", false, e instanceof Error ? e.message : String(e));
  }

  console.log("");
  console.log(`sarvam-docai check: ${passed}/${total} passed — ${passed === total ? "PASS" : "FAIL"}`);
  process.exit(passed === total ? 0 : 1);
}

main();
