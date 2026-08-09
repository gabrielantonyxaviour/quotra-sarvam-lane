// Quotra lib/docai — Sarvam Doc AI (Vision) client (S4, SARVAM-LANE-TASKS.md).
//
// CORRECTION 2026-08-09 to the earlier T5 finding below: Sarvam relaunched
// their developer platform as "Indus" (indus.sarvam.ai — dashboard.sarvam.ai
// now redirects there) and IT DOES expose a real, documented REST API for
// Doc AI, under indus.sarvam.ai's own API reference. Confirmed live via the
// dashboard's own cURL code samples (Doc Intelligence tab):
//
//   1. POST https://api.sarvam.ai/doc-ai/v1/job/digitise
//      multipart form: file, language (BCP-47, e.g. "en-IN"), output_format
//      ("md" used here — plain text is easiest to feed back into the verdict
//      prompt, which expects prose, not markdown structure).
//      -> 201 { job_id, status: "pending", run_id }
//   2. POST GET https://api.sarvam.ai/doc-ai/v1/job/<JOB_ID>/status
//      -> { status: "pending" | "completed" | "partially_completed" | "failed" | "rejected", ... }
//      Poll until status leaves "pending".
//   3. GET https://api.sarvam.ai/doc-ai/v1/job/<JOB_ID>/download-url
//      -> mints a URL for the rendered output; fetch THAT url to get the
//      actual digitised content.
//
// The original T5 research (below, preserved for the record) was accurate
// for what existed at docs.sarvam.ai/docai on 2026-08-08 — that surface
// genuinely had no REST API. Sarvam shipped one since, under a new domain,
// which the original research had no way to find. Lesson for this lane
// (same one MERGE-NOTES already draws elsewhere): re-check live before
// trusting a "not available" finding that's more than a day old.
//
// ---- ORIGINAL T5 FINDING (2026-08-08, now superseded) ----
// ZERO REST endpoints were documented anywhere in docs.sarvam.ai/docai. Every
// page described dashboard-only access. The task's own fallback (digitise one
// page manually via the dashboard UI) also needed a dashboard account,
// unavailable at the time. fixtures/tender-gem-9679256.pdf — a real, public,
// bilingual GeM tender PDF — was downloaded and committed either way so
// whoever got access could digitise it directly.
// ------------------------------------------------------------

import JSZip from "jszip";

export type DigitisedPage = { page: number; text: string };
export type DigitiseStatus = "pending" | "completed" | "partially_completed" | "failed" | "rejected";

const DOC_AI_BASE = "https://api.sarvam.ai/doc-ai/v1";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000; // digitise jobs are async and can take a while; give it 2 minutes

export class DocAiMissingKeyError extends Error {
  constructor() {
    super(
      "No Sarvam API key found. Set NEXT_PUBLIC_SARVAM_API_KEY, or paste your key in " +
        "Settings → Sarvam API key (localStorage 'quotra_sarvam_key').",
    );
    this.name = "DocAiMissingKeyError";
  }
}

export class DocAiJobFailedError extends Error {
  constructor(status: DigitiseStatus, detail: string) {
    super(`Sarvam Doc AI digitise job ended with status "${status}": ${detail}`);
    this.name = "DocAiJobFailedError";
  }
}

export class DocAiTimeoutError extends Error {
  constructor(jobId: string) {
    super(`Sarvam Doc AI digitise job ${jobId} did not complete within ${POLL_TIMEOUT_MS}ms`);
    this.name = "DocAiTimeoutError";
  }
}

function browserStorage(): Storage | null {
  try {
    const g = globalThis as { localStorage?: Storage };
    return typeof g.localStorage !== "undefined" && g.localStorage ? g.localStorage : null;
  } catch {
    return null;
  }
}

function resolveSarvamKey(): string {
  const fromStore = browserStorage()?.getItem("quotra_sarvam_key")?.trim();
  if (fromStore) return fromStore;
  const fromEnv = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_SARVAM_API_KEY?.trim() : undefined;
  if (fromEnv) return fromEnv;
  throw new DocAiMissingKeyError();
}

async function submitDigitiseJob(key: string, file: Blob, filename: string, language: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("language", language);
  form.append("output_format", "md");

  const res = await fetch(`${DOC_AI_BASE}/job/digitise`, {
    method: "POST",
    headers: { "api-subscription-key": key },
    body: form,
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Sarvam Doc AI digitise submit failed (HTTP ${res.status}): ${raw.slice(0, 500)}`);

  const body = JSON.parse(raw) as { job_id?: string };
  if (!body.job_id) throw new Error(`Sarvam Doc AI digitise submit returned no job_id: ${raw.slice(0, 300)}`);
  return body.job_id;
}

async function pollUntilDone(key: string, jobId: string): Promise<DigitiseStatus> {
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const res = await fetch(`${DOC_AI_BASE}/job/${jobId}/status`, {
      headers: { "api-subscription-key": key },
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`Sarvam Doc AI status poll failed (HTTP ${res.status}): ${raw.slice(0, 500)}`);
    const body = JSON.parse(raw) as { status?: DigitiseStatus };
    if (body.status && body.status !== "pending") return body.status;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new DocAiTimeoutError(jobId);
}

const ZIP_LOCAL_FILE_SIG = 0x04034b50;

/** Sarvam's Doc AI download-url resolves to a ZIP archive (confirmed live:
 *  the fetched bytes start with "PK", the ZIP magic number, containing an
 *  entry named "<original-filename>/<name>.md"), NOT raw markdown text. A
 *  hand-rolled local-file-header parser hit "unexpected end of file" on the
 *  real archive — it uses a data-descriptor-after-data streaming layout
 *  (sizes NOT in the local header), which is common but fiddly to parse
 *  correctly by hand; jszip handles this (and zip64/encryption edge cases)
 *  correctly, so this uses it rather than debugging binary format edge cases
 *  live. Extracts every .md/.txt entry, concatenated in archive order.
 */
async function extractTextEntriesFromZip(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const parts: string[] = [];
  const names = Object.keys(zip.files).filter((n) => /\.(md|txt)$/i.test(n)).sort();
  for (const name of names) {
    const text = await zip.files[name].async("text");
    parts.push(text);
  }
  return parts.join("\n\n---\n\n");
}

async function fetchDigitisedContent(key: string, jobId: string): Promise<string> {
  const res = await fetch(`${DOC_AI_BASE}/job/${jobId}/download-url`, {
    headers: { "api-subscription-key": key },
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Sarvam Doc AI download-url mint failed (HTTP ${res.status}): ${raw.slice(0, 500)}`);
  const body = JSON.parse(raw) as { url?: string; download_url?: string };
  const url = body.url ?? body.download_url;
  if (!url) throw new Error(`Sarvam Doc AI download-url response carried no url: ${raw.slice(0, 300)}`);

  const contentRes = await fetch(url);
  if (!contentRes.ok) throw new Error(`Fetching digitised content from the minted URL failed (HTTP ${contentRes.status})`);
  const buf = Buffer.from(await contentRes.arrayBuffer());

  const isZip = buf.length >= 4 && buf.readUInt32LE(0) === ZIP_LOCAL_FILE_SIG;
  if (!isZip) return buf.toString("utf8"); // defensive: in case Sarvam ever returns plain text directly

  const text = await extractTextEntriesFromZip(buf);
  if (!text.trim()) throw new Error("Doc AI download ZIP contained no .md/.txt entries");
  return text;
}

/** Sarvam's digitise output isn't documented to carry a page-delimiter
 *  convention in this lane's research — split on the common form-feed /
 *  "---" horizontal-rule page-break conventions markdown renderers use; if
 *  neither is present, the whole document is returned as ONE page rather
 *  than guessing a split point that isn't actually there. Callers needing
 *  real per-page citations should treat page:1 honestly as "page unknown
 *  within document" until Sarvam documents (or this lane confirms from a
 *  live multi-page run) the real delimiter. */
function splitIntoPages(markdown: string): DigitisedPage[] {
  const formFeedParts = markdown.split("\f").filter((p) => p.trim().length > 0);
  if (formFeedParts.length > 1) return formFeedParts.map((text, i) => ({ page: i + 1, text: text.trim() }));

  const hrParts = markdown.split(/\n-{3,}\n/).filter((p) => p.trim().length > 0);
  if (hrParts.length > 1) return hrParts.map((text, i) => ({ page: i + 1, text: text.trim() }));

  return [{ page: 1, text: markdown.trim() }];
}

/**
 * Digitise a tender PDF via Sarvam Doc AI: submit -> poll -> download ->
 * split into pages. `language` is BCP-47 (e.g. "en-IN"); GeM/CPPP tenders
 * are frequently bilingual Hindi/English — "en-IN" is the default here since
 * the constraint pipeline downstream reads English, but pass "hi-IN" for a
 * Hindi-primary document if needed.
 */
export async function digestTenderPdf(
  file: Blob | Buffer,
  opts?: { filename?: string; language?: string },
): Promise<{ pages: DigitisedPage[]; jobId: string; status: DigitiseStatus }> {
  const key = resolveSarvamKey();
  const blob = file instanceof Blob ? file : new Blob([new Uint8Array(file)], { type: "application/pdf" });
  const filename = opts?.filename ?? "document.pdf";
  const language = opts?.language ?? "en-IN";

  const jobId = await submitDigitiseJob(key, blob, filename, language);
  const status = await pollUntilDone(key, jobId);
  if (status === "failed" || status === "rejected") {
    throw new DocAiJobFailedError(status, `job ${jobId}`);
  }

  const content = await fetchDigitisedContent(key, jobId);
  return { pages: splitIntoPages(content), jobId, status };
}
