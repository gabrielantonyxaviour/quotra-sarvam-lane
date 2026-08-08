// Quotra lib/askquotra — the Ask-Quotra-by-voice contract (T3 deliverable,
// TASKS/T3-voice-playground.md). Kept out of app/playground so the page
// stays thin and the schema is unit-testable without a browser.
//
// Product law: uncited claims are not allowed to just appear — the system
// prompt (see ./prompt.ts) instructs the model to prefix anything it can't
// cite with "needs confirmation" rather than omit citations silently. The
// schema below only enforces shape (answer present, citations well-formed);
// it can't verify truthfulness, that's the prompt's job.

import type { JsonSchema } from "../llm";

export type AskQuotraCitationKind = "tender" | "company" | "product";

export type AskQuotraCitation = { kind: AskQuotraCitationKind; ref: string };

export type AskQuotraAnswer = {
  answer: string;
  citations: AskQuotraCitation[];
};

const CITATION_KINDS: readonly string[] = ["tender", "company", "product"];

/**
 * Validator for the ask-quotra contract. Returns a list of problems; empty =
 * valid. A reply with an empty `answer`, or a non-array `citations`, or any
 * citation missing a kind/ref, is rejected — this is what forces the model
 * to actually cite rather than free-associate.
 */
export function validateAskQuotraAnswer(data: unknown): string[] {
  const problems: string[] = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["ask-quotra answer must be a JSON object"];
  }
  const o = data as Record<string, unknown>;

  if (typeof o.answer !== "string" || o.answer.trim().length === 0) {
    problems.push('"answer" must be a non-empty string');
  }

  if (!Array.isArray(o.citations)) {
    problems.push('"citations" must be an array (use an empty array if truly nothing is citable)');
  } else {
    o.citations.forEach((c, i) => {
      if (typeof c !== "object" || c === null || Array.isArray(c)) {
        problems.push(`citations[${i}] must be an object { kind, ref }`);
        return;
      }
      const cc = c as Record<string, unknown>;
      if (typeof cc.kind !== "string" || !CITATION_KINDS.includes(cc.kind)) {
        problems.push(`citations[${i}].kind must be one of ${CITATION_KINDS.join(" | ")}`);
      }
      if (typeof cc.ref !== "string" || cc.ref.trim().length === 0) {
        problems.push(`citations[${i}].ref must be a non-empty string`);
      }
    });
  }

  return problems;
}

export const askQuotraSchema: JsonSchema = {
  name: "ask-quotra",
  validate: validateAskQuotraAnswer,
};
