// Fixture loader — prefers private *.real.json (delivered over WhatsApp, never
// committed) and falls back to the committed sanitized *.sample.json, so a
// fresh public clone runs out of the box. Node-only (used by checks and the
// phone-agent context builder); the playground imports the JSON directly.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadPreferReal<T>(base: string): T {
  const real = join(HERE, `${base}.real.json`);
  const sample = join(HERE, `${base}.sample.json`);
  const path = existsSync(real) ? real : sample;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export const isRealCompany = existsSync(join(HERE, "company.real.json"));

export function loadCompany<T = unknown>(): T {
  return loadPreferReal<T>("company");
}
export function loadExperience<T = unknown>(): T {
  return loadPreferReal<T>("experience");
}
export function loadProducts<T = unknown>(): T {
  return JSON.parse(readFileSync(join(HERE, "products.sample.json"), "utf8")) as T;
}
export function loadTenders<T = unknown>(): T {
  return JSON.parse(readFileSync(join(HERE, "tenders.sample.json"), "utf8")) as T;
}
