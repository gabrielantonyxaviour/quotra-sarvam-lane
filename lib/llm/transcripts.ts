// Quotra blk_llm_client — transcript recorder. Client-only, no deps.
// Every Claude call through lib/llm records a Transcript into localStorage under
// "quotra-transcripts-v1" (capped, FIFO). This is the demo's provenance that real
// Claude produced the artifacts — exportable as a JSON file via exportTranscripts().

export const TRANSCRIPTS_KEY = "quotra-transcripts-v1";
export const TRANSCRIPT_CAP = 100;

export type Transcript = {
  id: string;
  feature: string; // which product surface made the call, e.g. "verdict", "ask-quotra"
  model: string;
  promptHash: string; // fnv1a hex of system+messages — proves which prompt produced this
  responseText: string;
  at: string; // ISO timestamp
  durationMs: number;
  ok: boolean;
  error?: string; // set when ok === false
};

/** FNV-1a 32-bit hash, hex-encoded. Deterministic across browser and Node. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The exact input hashed into Transcript.promptHash. Exported so checks and
 *  downstream blocks can verify a transcript against its prompt. */
export function computePromptHash(system: string, messages: unknown[]): string {
  return fnv1a(system + "\n" + JSON.stringify(messages));
}

function browserStorage(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage };
    return typeof g.localStorage !== "undefined" && g.localStorage ? g.localStorage : null;
  } catch {
    return null;
  }
}

let counter = 0;
function newId(): string {
  counter += 1;
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `tr_${Date.now().toString(36)}_${counter}_${rand}`;
}

export function makeTranscript(
  fields: Omit<Transcript, "id" | "at"> & { id?: string; at?: string },
): Transcript {
  return {
    ...fields,
    id: fields.id ?? newId(),
    at: fields.at ?? new Date().toISOString(),
  };
}

/** Append a transcript, keeping at most TRANSCRIPT_CAP entries (oldest dropped first).
 *  Storage failures (quota, private mode) are swallowed — recording must never
 *  break the feature that made the call. */
export function recordTranscript(t: Transcript): void {
  const store = browserStorage();
  if (!store) return;
  try {
    const list = listTranscripts();
    list.push(t);
    while (list.length > TRANSCRIPT_CAP) list.shift();
    store.setItem(TRANSCRIPTS_KEY, JSON.stringify(list));
  } catch {
    /* recording is best-effort */
  }
}

export function listTranscripts(): Transcript[] {
  const store = browserStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(TRANSCRIPTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Transcript[]) : [];
  } catch {
    return [];
  }
}

export function clearTranscripts(): void {
  const store = browserStorage();
  if (!store) return;
  try {
    store.removeItem(TRANSCRIPTS_KEY);
  } catch {
    /* best-effort */
  }
}

/** Trigger a JSON file download of all recorded transcripts. Browser-only;
 *  a no-op where the DOM is unavailable (checks, SSR). */
export function exportTranscripts(
  filename = `quotra-transcripts-${new Date().toISOString().slice(0, 10)}.json`,
): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const payload = {
    exportedAt: new Date().toISOString(),
    note: "Quotra provenance: every artifact in the demo was produced by a real Claude call recorded here.",
    transcripts: listTranscripts(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
