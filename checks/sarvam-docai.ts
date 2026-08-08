// checks/sarvam-docai.ts — T5 acceptance (TASKS/T5-doc-digitisation.md).
//
// T5 is GATED (see lib/docai/sarvam.ts header for the full research trail):
// Sarvam Doc AI has no documented REST API, and its own manual-dashboard
// fallback needs a dashboard account this environment doesn't have. There is
// no live half to run and no docai-<tenderRef>.json to produce — this check
// only proves the stub fails loudly and honestly, and that the real PDF
// fixture this task WAS able to produce is actually in the repo.

import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DocAiNotAvailableError, digestTenderPdf } from "../lib/docai/sarvam";

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

  try {
    await digestTenderPdf(Buffer.alloc(0));
    check("digestTenderPdf() fails loudly (Doc AI has no documented REST API)", false, "did not throw");
  } catch (e) {
    check("digestTenderPdf() fails loudly (Doc AI has no documented REST API)", e instanceof DocAiNotAvailableError, String(e));
  }

  console.log("");
  console.log(
    "SKIP  live digitise-a-real-PDF assertions (>=80% pages non-empty text, EMD/eligibility " +
      "keyword present) — no REST API exists to call. See lib/docai/sarvam.ts and MERGE-NOTES " +
      "for the research trail and the fallback that needs a Sarvam dashboard account.",
  );
  console.log(`sarvam-docai check: ${passed}/${total} passed — ${passed === total ? "PASS" : "FAIL"} (T5 is gated — see notes above)`);
  process.exit(passed === total ? 0 : 1);
}

main();
