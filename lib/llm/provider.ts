// Quotra lib/llm — provider seam (v2 groundwork, frozen 2026-08-08).
//
// The product's intelligence flows through ONE dispatching complete()/completeJSON()
// (see index.ts). Which vendor actually answers is decided here, per-browser:
//   localStorage "quotra_llm_provider"  →  NEXT_PUBLIC_QUOTRA_LLM_PROVIDER  →  "anthropic"
//
// Adding a provider = one new file exporting `complete(args: CompleteArgs)`
// with the exact semantics documented in ./client.ts (transcripts recorded on
// success AND failure, named errors, no arithmetic in the model). Register it
// in index.ts's PROVIDERS map. Do NOT edit client.ts (Anthropic) to add one.
//
// This interface is FROZEN for the v2 parallel build (2026-08-08): the Sarvam
// lane implements ./sarvam.ts against it while the Anthropic lane keeps
// shipping on top of it. Changing these types mid-day breaks the other lane.

export type LlmProviderId = "anthropic" | "sarvam";

export const PROVIDER_STORAGE_KEY = "quotra_llm_provider";
/** Sarvam BYOK key, same pattern as client.ts's quotra_anthropic_key. */
export const SARVAM_KEY_STORAGE_KEY = "quotra_sarvam_key";

const PROVIDER_IDS: LlmProviderId[] = ["anthropic", "sarvam"];

function browserStorage(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage };
    return typeof g.localStorage !== "undefined" && g.localStorage ? g.localStorage : null;
  } catch {
    return null;
  }
}

/** The provider answering intelligent calls in this browser right now. */
export function activeProviderId(): LlmProviderId {
  const fromStore = browserStorage()?.getItem(PROVIDER_STORAGE_KEY)?.trim();
  if (fromStore && (PROVIDER_IDS as string[]).includes(fromStore)) return fromStore as LlmProviderId;
  const fromEnv =
    typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_QUOTRA_LLM_PROVIDER?.trim() : undefined;
  if (fromEnv && (PROVIDER_IDS as string[]).includes(fromEnv)) return fromEnv as LlmProviderId;
  return "anthropic";
}

/** Settings writes through this so the value is always a legal id. */
export function setActiveProviderId(id: LlmProviderId): void {
  browserStorage()?.setItem(PROVIDER_STORAGE_KEY, id);
}
