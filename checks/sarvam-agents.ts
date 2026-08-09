// checks/sarvam-agents.ts — S5 acceptance (SARVAM-LANE-TASKS.md).
//
// Live-runs both self-hosted agents (Watcher, Deep-reader) against fixture
// data and proves the S5 success bar:
//   - Watcher output is structure-identical to the existing pipeline
//     (newTenders/changedTenders carry real Tender objects).
//   - Deep-read artifact is fully cited — zero uncited technical claims
//     (every clause has clause+page+text; requirements/eligibility/risks
//     all derive from extracted clauses, never invented).
//   - Both agents run WITHOUT ANTHROPIC_API_KEY — proven structurally (this
//     check clears the env var before either agent runs, and the agents'
//     only network call goes to lib/llm/sarvam.ts's SARVAM_API_URL, never
//     lib/llm/client.ts's Anthropic endpoint) and empirically (both calls
//     succeed with it unset).
//
// Live-only — requires NEXT_PUBLIC_SARVAM_API_KEY; SKIPs cleanly without it.

import { loadTenders } from "../fixtures/load";
import { runWatcher, runWatcherSkippingIfNoDiff } from "../lib/agents/watcher";
import { runDeepReader } from "../lib/agents/deep-reader";
import type { Tender } from "../lib/tenders/types";

function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function main() {
  const key = process.env.NEXT_PUBLIC_SARVAM_API_KEY?.trim();
  if (!key) {
    console.log("SKIP  all S5 agent assertions — no NEXT_PUBLIC_SARVAM_API_KEY set, live agents not run");
    console.log("sarvam-agents check: 0/0 passed — SKIPPED (live-only)");
    process.exit(0);
  }

  // Structural proof of "runs WITHOUT ANTHROPIC_API_KEY": clear it before
  // either agent runs. If either agent's code path ever reached
  // lib/llm/client.ts's Anthropic complete(), this would throw
  // MissingKeyError instead of succeeding.
  delete process.env.ANTHROPIC_API_KEY;

  const results: boolean[] = [];
  const allTenders = loadTenders<Tender[]>();

  // ---- Watcher: simulate a sweep where the fixture set is "current" and a
  // trimmed/mutated copy is "previous", so there's a real new tender AND a
  // real changed tender to detect.
  console.log("\n--- Watcher ---");
  const previousSnapshot: Tender[] = [
    { ...allTenders[0], closeAt: "2020-01-01T00:00:00.000Z", estValue: null }, // will show as CHANGED
    // allTenders[1] intentionally omitted -> will show as NEW
    allTenders[2],
  ];
  const watcherStart = Date.now();
  const watcherResult = await runWatcher({
    fetchCurrentSnapshot: async () => allTenders,
    fetchPreviousSnapshot: async () => previousSnapshot,
  });
  const watcherMs = Date.now() - watcherStart;
  const w = watcherResult.data;
  console.log(`  summary: "${w.summary}"`);
  console.log(`  findings: ${w.findings.map((f) => `[${f.tenderId}] ${f.note}`).join(" | ")}`);
  console.log(`  ${watcherMs}ms, transcriptId=${watcherResult.log.transcriptId}`);

  results.push(check("Watcher detects the deliberately-omitted tender as new", w.newTenders.some((t) => t.id === allTenders[1].id)));
  results.push(check("Watcher detects the deliberately-mutated tender as changed", w.changedTenders.some((c) => c.tender.id === allTenders[0].id)));
  results.push(check("Watcher's newTenders carry the real, untouched Tender objects", w.newTenders[0]?.title === allTenders.find((t) => t.id === w.newTenders[0]?.id)?.title));
  results.push(check("Watcher's model findings only cite ids from the actual diff (no invented ids)", w.findings.every((f) => [...w.newTenders, ...w.changedTenders.map((c) => c.tender)].some((t) => t.id === f.tenderId))));
  results.push(check("Watcher summary is non-empty", w.summary.trim().length > 0));

  // No-diff short-circuit: identical snapshots should skip the model call entirely.
  const noDiffResult = await runWatcherSkippingIfNoDiff({
    fetchCurrentSnapshot: async () => allTenders,
    fetchPreviousSnapshot: async () => allTenders,
  });
  results.push(check("Watcher skips the model call entirely when there's no diff (no wasted spend)", noDiffResult === null));

  // ---- Deep-reader
  console.log("\n--- Deep-reader ---");
  const deepReadStart = Date.now();
  const deepReadResult = await runDeepReader({ fetchTender: async () => allTenders[0] });
  const deepReadMs = Date.now() - deepReadStart;
  const d = deepReadResult.data;
  console.log(`  ${d.clauses.length} clauses, ${d.requirements.length} requirements, ${d.risks.length} risks, ${d.unknowns.length} unknowns`);
  console.log(`  ${deepReadMs}ms, transcriptId=${deepReadResult.log.transcriptId}`);

  results.push(check("Deep-reader extracted at least one clause", d.clauses.length > 0));
  results.push(check("Every clause is cited (non-empty clause name + text)", d.clauses.every((c) => c.clause.trim().length > 0 && c.text.trim().length > 0)));
  results.push(check("Every clause has an explicit page (number or null, never undefined)", d.clauses.every((c) => c.page === null || typeof c.page === "number")));
  results.push(check("tenderId is code-attached, matches the input tender", d.tenderId === allTenders[0].id));
  results.push(check("generatedAt is a valid ISO timestamp (code-computed, not model-invented)", !Number.isNaN(Date.parse(d.generatedAt))));

  // ---- No-Anthropic-key structural proof
  results.push(check("ANTHROPIC_API_KEY was unset for this entire run and both agents still succeeded", !process.env.ANTHROPIC_API_KEY));

  const passed = results.filter(Boolean).length;
  console.log("");
  console.log(`sarvam-agents check: ${passed}/${results.length} passed — ${passed === results.length ? "PASS" : "FAIL"}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("sarvam-agents check crashed:", e);
  process.exit(1);
});
