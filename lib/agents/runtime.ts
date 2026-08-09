// Quotra lib/agents — the self-hosted agent runtime (S5 deliverable,
// SARVAM-LANE-TASKS.md). Replaces Claude's managed agents
// (watcher.agent.yaml, deep-reader.agent.yaml) with our own loop, powered
// by sarvam-105b, hosted independently.
//
// The loop is fetch -> reason -> act -> record:
//   - fetch: gather whatever input this run needs (a portal snapshot, a
//     tender document) — pluggable per agent, fixture-backed in this lane.
//   - reason: build the prompt + JSON schema and call the model.
//   - act: fold the model's (validated) output together with code-computed
//     fields the model is never trusted to invent (timestamps, ids) — same
//     discipline lib/verdict/engine.ts uses for money.
//   - record: an AgentRunLog capturing what happened, for the runbook/audit
//     trail — no separate step function; the runtime builds it from the
//     other three.
//
// DELIBERATELY provider-narrow: agents built on this runtime call
// lib/llm/sarvam.ts's sarvamComplete DIRECTLY — never the provider-dispatched
// complete()/completeJSON() in lib/llm/index.ts, which can route to Anthropic
// depending on the active-provider localStorage toggle. That's the literal
// mechanism behind S5's "runs WITHOUT ANTHROPIC_API_KEY set" bar: it isn't
// just untested against Anthropic, it is structurally incapable of calling
// it — there is no code path in this file that can reach client.ts's
// Anthropic complete().

import { ContractError, type ChatMessage, type JsonSchema } from "../llm/client";
import { sarvamCompleteJSONRobust } from "../llm/sarvamRobust";

export type AgentRunLog = {
  agent: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  fetchSummary: string;
  actSummary: string;
  transcriptId: string | null;
};

export type AgentResult<TAct> = { data: TAct; log: AgentRunLog };

export type AgentReasonSpec = {
  system: string;
  messages: ChatMessage[];
  schema: JsonSchema;
  maxTokens?: number;
};

export async function runAgent<TFetched, TReasoned, TAct>(opts: {
  agent: string;
  fetch: () => Promise<TFetched>;
  reason: (fetched: TFetched) => Promise<AgentReasonSpec>;
  act: (fetched: TFetched, reasoned: TReasoned, transcriptId: string | null) => TAct;
  fetchSummary: (fetched: TFetched) => string;
  actSummary: (result: TAct) => string;
}): Promise<AgentResult<TAct>> {
  const startedAt = new Date().toISOString();
  const started = Date.now();

  const fetched = await opts.fetch();
  const spec = await opts.reason(fetched);

  let reasoned: TReasoned;
  let transcriptId: string | null;
  try {
    // sarvamCompleteJSONRobust (lib/llm/sarvamRobust.ts), not the raw
    // completeJSONWith — adds fresh (non-growing) retries for sarvam-105b's
    // thinking-mode empty-content failures, on top of client.ts's own
    // corrective retry. See MERGE-NOTES S2/S5 for why this exists.
    const result = await sarvamCompleteJSONRobust<TReasoned>({
      feature: `agent-${opts.agent}`,
      system: spec.system,
      messages: spec.messages,
      schema: spec.schema,
      maxTokens: spec.maxTokens ?? 4096,
    });
    reasoned = result.data;
    transcriptId = result.transcriptId;
  } catch (e) {
    if (e instanceof ContractError) {
      throw new Error(`agent "${opts.agent}" reason step failed the "${spec.schema.name}" contract: ${e.message}`);
    }
    throw e;
  }

  const data = opts.act(fetched, reasoned, transcriptId);
  const finishedAt = new Date().toISOString();

  const log: AgentRunLog = {
    agent: opts.agent,
    startedAt,
    finishedAt,
    durationMs: Date.now() - started,
    fetchSummary: opts.fetchSummary(fetched),
    actSummary: opts.actSummary(data),
    transcriptId,
  };

  return { data, log };
}
