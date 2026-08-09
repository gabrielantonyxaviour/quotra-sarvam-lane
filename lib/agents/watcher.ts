// Quotra lib/agents/watcher — S5 deliverable (SARVAM-LANE-TASKS.md).
//
// Sweeps a tender snapshot, diffs it against the last known snapshot in
// PLAIN CODE (new-by-id, changed-by-field — no model involved in the diff
// itself, it's deterministic), then asks sarvam-105b for a short, cited
// human-readable summary of what changed. Output is structure-identical to
// the existing pipeline: newTenders/changedTenders carry real Tender objects
// straight from the snapshot, untouched by the model.
//
// Snapshot source is PLUGGABLE (fetchCurrentSnapshot/fetchPreviousSnapshot).
// This lane wires it to the fixture tender set (see checks/sarvam-agents.ts)
// because live GeM/CPPP portal scraping is its own project (auth, CAPTCHA,
// rate limits, ToS) — out of scope for today's compressed window. The agent
// mechanism itself (diff -> reason -> normalized output) is real and
// live-tested; only the snapshot SOURCE is fixture-backed here.

import type { ChatMessage, JsonSchema } from "../llm";
import type { Tender } from "../tenders/types";
import { runAgent, type AgentResult } from "./runtime";

export type WatcherChange = { tender: Tender; previous: Tender; changedFields: string[] };

export type WatcherModelOutput = {
  summary: string; // plain-English sweep summary, must cite only ids present in the prompt
  findings: { tenderId: string; note: string }[]; // one line of color per new/changed tender
};

export type WatcherRunResult = WatcherModelOutput & {
  sweptAt: string; // code-computed, never model-invented
  newTenders: Tender[];
  changedTenders: WatcherChange[];
};

/* ---------- diff (plain code, no model) ---------- */

function fieldsThatChanged(prev: Tender, cur: Tender): string[] {
  const fields: (keyof Tender)[] = ["closeAt", "estValue", "emd", "fee", "rawText", "title"];
  return fields.filter((f) => JSON.stringify(prev[f]) !== JSON.stringify(cur[f]));
}

function diffSnapshots(previous: Tender[], current: Tender[]): { newTenders: Tender[]; changedTenders: WatcherChange[] } {
  const prevById = new Map(previous.map((t) => [t.id, t]));
  const newTenders: Tender[] = [];
  const changedTenders: WatcherChange[] = [];
  for (const t of current) {
    const prev = prevById.get(t.id);
    if (!prev) {
      newTenders.push(t);
      continue;
    }
    const changedFields = fieldsThatChanged(prev, t);
    if (changedFields.length > 0) changedTenders.push({ tender: t, previous: prev, changedFields });
  }
  return { newTenders, changedTenders };
}

/* ---------- reason (sarvam-105b) ---------- */

const isStr = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;

export function validateWatcherOutput(data: unknown, knownIds: Set<string>): string[] {
  const problems: string[] = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) return ["watcher output must be a JSON object"];
  const o = data as Record<string, unknown>;
  if (!isStr(o.summary)) problems.push('"summary" must be a non-empty string');
  if (!Array.isArray(o.findings)) {
    problems.push('"findings" must be an array');
  } else {
    o.findings.forEach((f, i) => {
      const ff = f as Record<string, unknown>;
      if (!isStr(ff.tenderId)) problems.push(`"findings"[${i}].tenderId must be a non-empty string`);
      else if (!knownIds.has(ff.tenderId as string))
        problems.push(`"findings"[${i}].tenderId "${ff.tenderId}" was not in the swept tender list — the model must not invent ids`);
      if (!isStr(ff.note)) problems.push(`"findings"[${i}].note must be a non-empty string`);
    });
  }
  return problems;
}

function buildWatcherPrompt(newTenders: Tender[], changed: WatcherChange[]): { system: string; messages: ChatMessage[] } {
  const system = [
    "You are Quotra's Watcher agent. You've been given the results of a tender-portal sweep:",
    "tenders that are NEW since the last sweep, and tenders that CHANGED. Summarize what a",
    "sales rep needs to know, in plain English, in 2-3 sentences.",
    "",
    "ABSOLUTE RULES:",
    '1. Only mention tender ids that appear in the lists below. Never invent a tender id.',
    "2. For each tender you mention in \"findings\", the note must describe what's actually",
    "   listed (new, or what field changed) — never guess a reason you weren't told.",
    "3. If both lists are empty, say so plainly — do not manufacture activity.",
    "",
    "Reply with ONLY one JSON object, no prose, no markdown fences:",
    '{ "summary": string, "findings": [{ "tenderId": string, "note": string }] }',
  ].join("\n");

  const describeNew = newTenders.map((t) => `- [${t.id}] NEW — ${t.title} | Org: ${t.org} | Closes: ${t.closeAt}`);
  const describeChanged = changed.map(
    (c) => `- [${c.tender.id}] CHANGED (${c.changedFields.join(", ")}) — ${c.tender.title} | was closeAt=${c.previous.closeAt}, estValue=${c.previous.estValue}; now closeAt=${c.tender.closeAt}, estValue=${c.tender.estValue}`,
  );

  const user = [
    `NEW TENDERS (${newTenders.length}):`,
    describeNew.length ? describeNew.join("\n") : "(none)",
    "",
    `CHANGED TENDERS (${changed.length}):`,
    describeChanged.length ? describeChanged.join("\n") : "(none)",
    "",
    "Summarize this sweep now as the JSON object described above.",
  ].join("\n");

  return { system, messages: [{ role: "user", content: user }] };
}

/* ---------- run ---------- */

export async function runWatcher(opts: {
  fetchCurrentSnapshot: () => Promise<Tender[]>;
  fetchPreviousSnapshot: () => Promise<Tender[]>;
}): Promise<AgentResult<WatcherRunResult>> {
  return runAgent<
    { current: Tender[]; previous: Tender[]; newTenders: Tender[]; changedTenders: WatcherChange[] },
    WatcherModelOutput,
    WatcherRunResult
  >({
    agent: "watcher",
    fetch: async () => {
      const [current, previous] = await Promise.all([opts.fetchCurrentSnapshot(), opts.fetchPreviousSnapshot()]);
      const { newTenders, changedTenders } = diffSnapshots(previous, current);
      return { current, previous, newTenders, changedTenders };
    },
    reason: async (fetched) => {
      const knownIds = new Set([...fetched.newTenders, ...fetched.changedTenders.map((c) => c.tender)].map((t) => t.id));
      const schema: JsonSchema = { name: "watcher", validate: (d) => validateWatcherOutput(d, knownIds) };
      // 4096, not a smaller "this is a short answer" guess — SARVAM-API-NOTES.md's
      // documented gotcha: thinking mode is on by default and reasoning tokens
      // count toward max_tokens, so anything under ~4096 risks finish_reason:
      // "length" with EMPTY content regardless of how short the final answer is.
      return { ...buildWatcherPrompt(fetched.newTenders, fetched.changedTenders), schema, maxTokens: 4096 };
    },
    act: (fetched, reasoned) => ({
      ...reasoned,
      sweptAt: new Date().toISOString(),
      newTenders: fetched.newTenders,
      changedTenders: fetched.changedTenders,
    }),
    fetchSummary: (f) => `swept ${f.current.length} current vs ${f.previous.length} previous — ${f.newTenders.length} new, ${f.changedTenders.length} changed`,
    actSummary: (r) => r.summary.slice(0, 140),
  });
}

/** No-diff short-circuit: don't spend a model call summarizing "nothing happened". */
export async function runWatcherSkippingIfNoDiff(opts: {
  fetchCurrentSnapshot: () => Promise<Tender[]>;
  fetchPreviousSnapshot: () => Promise<Tender[]>;
}): Promise<AgentResult<WatcherRunResult> | null> {
  const [current, previous] = await Promise.all([opts.fetchCurrentSnapshot(), opts.fetchPreviousSnapshot()]);
  const { newTenders, changedTenders } = diffSnapshots(previous, current);
  if (newTenders.length === 0 && changedTenders.length === 0) return null;
  return runWatcher(opts);
}
