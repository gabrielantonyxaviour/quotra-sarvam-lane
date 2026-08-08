// checks/sarvam-playground.ts — T3 acceptance (TASKS/T3-voice-playground.md).
//
// - Page compiles: shells out to `next build` and checks the exit code (the
//   one check in this repo that isn't instant — a real production build).
// - The ask-contract schema validator rejects an uncited answer and accepts
//   a cited one (unit-level, no network).
//
// The human-proof screen recording (playground-voice-demo.mp4) that TASKS/T3
// also asks for is NOT something this environment can produce — see
// MERGE-NOTES for why and what's needed.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAskQuotraAnswer } from "../lib/askquotra/contract";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");

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

function schemaTests(): void {
  check(
    "rejects a non-object payload",
    validateAskQuotraAnswer("just a string").length > 0,
  );
  check(
    "rejects an answer with an empty answer field",
    validateAskQuotraAnswer({ answer: "", citations: [] }).length > 0,
  );
  check(
    "rejects an answer whose citations is not an array",
    validateAskQuotraAnswer({ answer: "The EMD is ₹4,86,000.", citations: "tender-1" }).length > 0,
  );
  check(
    "rejects a citation missing kind/ref",
    validateAskQuotraAnswer({ answer: "The EMD is ₹4,86,000.", citations: [{ kind: "tender" }] }).length > 0,
  );
  check(
    "rejects a citation with an invalid kind",
    validateAskQuotraAnswer({
      answer: "The EMD is ₹4,86,000.",
      citations: [{ kind: "invoice", ref: "tender-1" }],
    }).length > 0,
  );
  check(
    "accepts a well-formed cited answer",
    validateAskQuotraAnswer({
      answer: "The EMD for this tender is ₹4,86,000, per the listing.",
      citations: [{ kind: "tender", ref: "cppp-28403" }],
    }).length === 0,
  );
  check(
    "accepts an answer with zero citations IF citations is an explicit empty array",
    validateAskQuotraAnswer({
      answer: "needs confirmation — that detail is not in the listing.",
      citations: [],
    }).length === 0,
  );
}

function buildCheck(): void {
  console.log("Running `next build` (this takes a while — proving the T3 page actually compiles)...");
  const result = spawnSync("npx", ["next", "build"], { cwd: REPO_ROOT, encoding: "utf8", shell: true });
  const ok = result.status === 0;
  check("`next build` passes (app/playground/voice/page.tsx compiles)", ok, ok ? undefined : (result.stdout + result.stderr).slice(-2000));
}

function main(): void {
  schemaTests();
  buildCheck();

  console.log("");
  console.log(
    "NOTE: TASKS/T3 also requires a human-proof screen recording (playground-voice-demo.mp4) " +
      "of a real voice loop — this environment has no microphone to record one. Not attempted here; see MERGE-NOTES.",
  );
  console.log(`sarvam-playground check: ${passed}/${total} passed — ${passed === total ? "PASS" : "FAIL"}`);
  process.exit(passed === total ? 0 : 1);
}

main();
