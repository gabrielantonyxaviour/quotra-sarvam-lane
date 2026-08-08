// checks/sarvam-llm.ts — T1 acceptance (TASKS/T1-llm-adapter.md).
//
// Offline half (house style, checks/README.md): stubbed fetch + a fake
// localStorage (Node has none), no network, no API key required. Proves: key
// resolution order + named error when absent; request shape (endpoint,
// header, model, system-in-messages); 429 → rate-limit error; other HTTP →
// ApiError; network failure → ApiError(status 0); transcript recorded on
// success AND on failure.
//
// Live half: only when NEXT_PUBLIC_SARVAM_API_KEY is set — one real verdict
// on fixture tender [0] passing validateVerdictOutput, and one real
// Ask-Quotra-style Tanglish question answered with cited English text.
// SKIPs (not fails) without a key, and says so in the final summary line.

import { sarvamComplete, SarvamMissingKeyError, SARVAM_API_URL, sarvamModelFor } from "../lib/llm/sarvam";
import { SARVAM_KEY_STORAGE_KEY } from "../lib/llm/provider";
import { RateLimitError, ApiError, type CompleteArgs } from "../lib/llm/client";
import { listTranscripts, clearTranscripts } from "../lib/llm/transcripts";
import { loadCompany, loadExperience, loadProducts, loadTenders } from "../fixtures/load";
import { buildVerdictPrompt } from "../lib/verdict/prompt";
import { validateVerdictOutput } from "../lib/verdict/engine";
import type { BrainProduct, Company, ExperienceRecord, Tender } from "../lib/tenders/types";

let passed = 0;
let total = 0;
let liveSkipped = false;

function check(name: string, cond: boolean, detail?: string): void {
  total++;
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ---------- fake localStorage (Node has none) ---------- */

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function installFakeStorage(): FakeStorage {
  const store = new FakeStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  return store;
}
function removeFakeStorage(): void {
  delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
}

type CapturedRequest = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function stubFetch(handler: (req: CapturedRequest) => { status: number; body: unknown } | { networkError: string }): {
  captured: CapturedRequest[];
  restore: () => void;
} {
  const captured: CapturedRequest[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const req: CapturedRequest = {
      url: String(url),
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body ? JSON.parse(String(init.body)) : {},
    };
    captured.push(req);
    const result = handler(req);
    if ("networkError" in result) throw new Error(result.networkError);
    return new Response(JSON.stringify(result.body), { status: result.status });
  }) as typeof fetch;
  return {
    captured,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const okChoice = (content: string) => ({ choices: [{ message: { content }, finish_reason: "stop" }] });

/* ---------- offline tests ---------- */

async function offlineTests(): Promise<void> {
  const verdictArgs: CompleteArgs = {
    feature: "verdict",
    system: "You are a test system prompt.",
    messages: [{ role: "user", content: "build the verdict" }],
  };
  const askArgs: CompleteArgs = {
    feature: "ask-quotra",
    system: "You are Ask Quotra.",
    messages: [{ role: "user", content: "intha tender ku EMD evlo?" }],
  };

  // 1. No key anywhere → SarvamMissingKeyError, no fetch attempted.
  delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
  removeFakeStorage();
  {
    const { captured, restore } = stubFetch(() => ({ status: 200, body: okChoice("{}") }));
    try {
      await sarvamComplete(verdictArgs);
      check("throws SarvamMissingKeyError when no key anywhere", false, "did not throw");
    } catch (e) {
      check("throws SarvamMissingKeyError when no key anywhere", e instanceof SarvamMissingKeyError, String(e));
    }
    check("no network call attempted before key resolution", captured.length === 0);
    restore();
  }

  // 2. Env var fallback used when localStorage has no key.
  process.env.NEXT_PUBLIC_SARVAM_API_KEY = "env-key-123";
  {
    const { captured, restore } = stubFetch(() => ({ status: 200, body: okChoice('{"ok":true}') }));
    await sarvamComplete(verdictArgs);
    check("falls back to NEXT_PUBLIC_SARVAM_API_KEY when localStorage has no key", captured.length === 1);
    check("request carries api-subscription-key header with the env key", captured[0]?.headers["api-subscription-key"] === "env-key-123");
    restore();
  }

  // 3. localStorage key takes priority over the env var.
  const store = installFakeStorage();
  store.setItem(SARVAM_KEY_STORAGE_KEY, "store-key-456");
  {
    const { captured, restore } = stubFetch(() => ({ status: 200, body: okChoice('{"ok":true}') }));
    await sarvamComplete(verdictArgs);
    check("localStorage key takes priority over NEXT_PUBLIC_SARVAM_API_KEY", captured[0]?.headers["api-subscription-key"] === "store-key-456");
    restore();
  }

  // 4. Request shape — endpoint, model routing, system-in-messages, json_object for verdict-class features.
  {
    const { captured, restore } = stubFetch(() => ({ status: 200, body: okChoice('{"ok":true}') }));
    await sarvamComplete(verdictArgs);
    const req = captured[0];
    check("posts to the Sarvam chat completions endpoint", req?.url === SARVAM_API_URL);
    check("model defaults to sarvam-105b for verdict feature", req?.body.model === "sarvam-105b" && sarvamModelFor("verdict") === "sarvam-105b");
    check(
      "system prompt is folded into messages[0] as role:system (OpenAI shape)",
      Array.isArray(req?.body.messages) &&
        (req!.body.messages as { role: string; content: string }[])[0]?.role === "system" &&
        (req!.body.messages as { role: string; content: string }[])[0]?.content === verdictArgs.system,
    );
    check(
      "user message follows the system message unchanged",
      (req!.body.messages as { role: string; content: string }[])[1]?.content === "build the verdict",
    );
    check("verdict feature requests response_format json_object", (req?.body.response_format as { type?: string } | undefined)?.type === "json_object");
    restore();
  }

  // 5. ask-quotra routes to the dialogue-tuned model, no forced json_object.
  {
    const { captured, restore } = stubFetch(() => ({ status: 200, body: okChoice('{"ok":true}') }));
    await sarvamComplete(askArgs);
    const req = captured[0];
    check("ask-quotra feature routes to sarvam-105b-conversations", req?.body.model === "sarvam-105b-conversations" && sarvamModelFor("ask-quotra") === "sarvam-105b-conversations");
    check("ask-quotra feature does not force response_format", req?.body.response_format === undefined);
    restore();
  }

  // 6. 429 → RateLimitError.
  {
    const { restore } = stubFetch(() => ({ status: 429, body: { error: "rate limited" } }));
    try {
      await sarvamComplete(verdictArgs);
      check("HTTP 429 throws RateLimitError", false, "did not throw");
    } catch (e) {
      check("HTTP 429 throws RateLimitError", e instanceof RateLimitError, String(e));
    }
    restore();
  }

  // 7. Other HTTP error → ApiError with status + body excerpt.
  {
    const { restore } = stubFetch(() => ({ status: 500, body: { error: "server exploded" } }));
    try {
      await sarvamComplete(verdictArgs);
      check("HTTP 500 throws ApiError", false, "did not throw");
    } catch (e) {
      check("HTTP 500 throws ApiError with status 500", e instanceof ApiError && e.status === 500, String(e));
    }
    restore();
  }

  // 8. Network failure → ApiError(status 0).
  {
    const { restore } = stubFetch(() => ({ networkError: "ECONNRESET" }));
    try {
      await sarvamComplete(verdictArgs);
      check("network failure throws ApiError(status 0)", false, "did not throw");
    } catch (e) {
      check("network failure throws ApiError(status 0)", e instanceof ApiError && e.status === 0, String(e));
    }
    restore();
  }

  // 9. Transcript recorded on success AND on failure.
  {
    clearTranscripts();
    const { restore } = stubFetch(() => ({ status: 200, body: okChoice('{"ok":true}') }));
    await sarvamComplete(verdictArgs);
    restore();
    const afterSuccess = listTranscripts();
    check(
      "transcript recorded on success (ok:true, feature, model)",
      afterSuccess.length === 1 && afterSuccess[0].ok === true && afterSuccess[0].feature === "verdict" && afterSuccess[0].model === "sarvam-105b",
    );

    const failing = stubFetch(() => ({ status: 500, body: { error: "boom" } }));
    try {
      await sarvamComplete(verdictArgs);
    } catch {
      /* expected */
    }
    failing.restore();
    const afterFailure = listTranscripts();
    check(
      "transcript recorded on failure (ok:false, error set)",
      afterFailure.length === 2 && afterFailure[1].ok === false && !!afterFailure[1].error,
    );
    clearTranscripts();
  }

  removeFakeStorage();
  delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
}

/* ---------- live tests ---------- */

async function liveTests(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_SARVAM_API_KEY?.trim();
  if (!key) {
    liveSkipped = true;
    console.log("SKIP  live verdict call on fixture tender [0] — no NEXT_PUBLIC_SARVAM_API_KEY set");
    console.log("SKIP  live Ask-Quotra Tanglish call — no NEXT_PUBLIC_SARVAM_API_KEY set");
    return;
  }

  const tenders = loadTenders<Tender[]>();
  const company = loadCompany<Company>();
  const products = loadProducts<BrainProduct[]>();
  const experience = loadExperience<ExperienceRecord[]>();
  const { system, messages } = buildVerdictPrompt({ tender: tenders[0], company, products, experience });

  try {
    const result = await sarvamComplete({ feature: "verdict", system, messages, maxTokens: 4096 });
    const start = result.text.indexOf("{");
    const data = start >= 0 ? JSON.parse(result.text.slice(start, result.text.lastIndexOf("}") + 1)) : null;
    const problems = data ? validateVerdictOutput(data) : ["no JSON object in response"];
    check("live verdict call on fixture tender [0] passes validateVerdictOutput", problems.length === 0, problems.join("; "));
  } catch (e) {
    check("live verdict call on fixture tender [0] passes validateVerdictOutput", false, String(e));
  }

  try {
    const result = await sarvamComplete({
      feature: "ask-quotra",
      system:
        "You are Ask Quotra. Answer in English. Every technical claim must cite its source; " +
        "if the answer is not in the provided text, say it needs confirmation — never guess.",
      messages: [{ role: "user", content: "intha tender ku EMD evlo?" }],
      maxTokens: 1024,
    });
    check("live Ask-Quotra Tanglish call returns non-empty English-cited text", result.text.trim().length > 0, result.text.slice(0, 200));
  } catch (e) {
    check("live Ask-Quotra Tanglish call returns non-empty English-cited text", false, String(e));
  }
}

async function main(): Promise<void> {
  await offlineTests();
  await liveTests();

  const summary = liveSkipped ? " (live half SKIPPED — set NEXT_PUBLIC_SARVAM_API_KEY to run it)" : "";
  console.log(`sarvam-llm check: ${passed}/${total} passed — ${passed === total ? "PASS" : "FAIL"}${summary}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error("sarvam-llm check crashed:", e);
  process.exit(1);
});
