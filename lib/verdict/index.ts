// Trimmed lane copy — prompt + contract only (runVerdict lives in the product repo).
export type { VerdictModelOutput, EngineVerdict } from "./engine";
export { validateVerdictOutput, verdictSchema } from "./engine";
export type { VerdictPromptInput } from "./prompt";
export { buildVerdictPrompt, VERDICT_FEATURE } from "./prompt";
