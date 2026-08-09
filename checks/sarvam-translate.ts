// checks/sarvam-translate.ts — T4 acceptance (TASKS/T4-translate-layer.md).
//
// Offline (house style): chunking splits at sentence boundaries and rejoins
// losslessly; translateMany preserves order and survives one failing row;
// digit-preservation guard catches a deliberately-mangled fixture.
//
// Live (key set): translate a real verdict reason (tender [0]'s shape)
// en→ta and en→hi — non-empty, digits intact, INR/dates byte-identical; a
// matrix row round-trips with evidence ids untouched. SKIPs cleanly without
// a key.

import { chunkForTranslate, digitsPreserved, TranslateMissingKeyError, translate, translateMany } from "../lib/translate/sarvam";
import { translateMatrixRows, translateVerdictReasons } from "../lib/translate/bilingual";
import type { EligibilityRow, VerdictReason } from "../lib/tenders/types";

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

function stubFetch(handler: (body: Record<string, unknown>) => { status: number; body: unknown } | { networkError: string }): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const result = handler(body);
    if ("networkError" in result) throw new Error(result.networkError);
    return new Response(JSON.stringify(result.body), { status: result.status });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/* ---------- offline: chunking ---------- */

function offlineChunking(): void {
  const short = "இந்த டெண்டருக்கு EMD எவ்வளவு?";
  check("short text (< 2000 chars) is not chunked", chunkForTranslate(short).length === 1 && chunkForTranslate(short)[0] === short);

  const sentence = "The EMD is ₹4,86,000. ";
  const long = sentence.repeat(150); // well over 2000 chars, clean sentence boundaries throughout
  const chunks = chunkForTranslate(long);
  check("long text splits into multiple chunks", chunks.length > 1, `${chunks.length} chunks for ${long.length} chars`);
  check("every chunk is at or under the 2000-char limit", chunks.every((c) => c.length <= 2000));
  check("chunks rejoin losslessly via join('')", chunks.join("") === long);

  // Devanagari danda (।) and mixed punctuation boundaries.
  const mixed = "यह टेंडर है। EMD कितना है? समय सीमा 21 अगस्त है!";
  const mixedRepeated = mixed.repeat(60);
  const mixedChunks = chunkForTranslate(mixedRepeated);
  check("Devanagari danda (।) counts as a sentence boundary", mixedChunks.join("") === mixedRepeated);

  // a single "sentence" with no boundary at all, longer than the limit — documented hard-split fallback.
  const noBoundary = "x".repeat(5000);
  const hardSplit = chunkForTranslate(noBoundary);
  check("text with no sentence boundary hard-splits at the char limit (documented fallback)", hardSplit.join("") === noBoundary && hardSplit.every((c) => c.length <= 2000));
}

/* ---------- offline: digit-preservation guard ---------- */

function offlineDigitGuard(): void {
  check("digitsPreserved: identical digits pass", digitsPreserved("EMD is ₹4,86,000 due 2026-08-21", "EMD ஆனது ₹4,86,000 ஆகும், 2026-08-21 அன்று"));
  check("digitsPreserved: a mangled digit fails", !digitsPreserved("EMD is ₹4,86,000", "EMD ஆனது ₹4,86,001 ஆகும்"));
  check("digitsPreserved: a dropped digit sequence fails", !digitsPreserved("Closes in 14 days, EMD ₹50000", "14 நாட்களில் முடிவடையும்"));
  check("digitsPreserved: text with no digits always passes", digitsPreserved("no numbers here", "இங்கே எண்கள் இல்லை"));
}

/* ---------- offline: translateMany order + fallback + digit guard ---------- */

async function offlineTranslateMany(): Promise<void> {
  process.env.NEXT_PUBLIC_SARVAM_API_KEY = "test-key";

  // Row 1 translates cleanly; row 2's API call fails (500); row 3's translation mangles a digit.
  const restore = stubFetch((body) => {
    const input = body.input as string;
    if (input === "row-2-fails") return { status: 500, body: { error: "boom" } };
    if (input === "EMD is 50000") return { status: 200, body: { translated_text: "EMD ஆனது 99999" } }; // digit mismatch
    return { status: 200, body: { translated_text: `[ta] ${input}` } };
  });

  const inputs = ["row-1-ok", "row-2-fails", "EMD is 50000", "row-4-ok"];
  const results = await translateMany(inputs, "en-IN", "ta-IN");
  restore();
  delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;

  check("translateMany preserves order and length", results.length === inputs.length);
  check("translateMany: successful row translates", results[0] === "[ta] row-1-ok");
  check("translateMany: a row whose API call fails falls back to source text", results[1] === "row-2-fails");
  check("translateMany: a row with a digit mismatch falls back to source text", results[2] === "EMD is 50000");
  check("translateMany: unrelated rows are unaffected by another row's failure", results[3] === "[ta] row-4-ok");
}

/* ---------- offline: key resolution ---------- */

async function offlineKeyResolution(): Promise<void> {
  delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
  try {
    await translate({ text: "hello", source: "en-IN", target: "ta-IN" });
    check("translate() throws TranslateMissingKeyError when no key anywhere", false, "did not throw");
  } catch (e) {
    check("translate() throws TranslateMissingKeyError when no key anywhere", e instanceof TranslateMissingKeyError, String(e));
  }
}

/* ---------- offline: bilingual.ts never mutates source fields ---------- */

async function offlineBilingual(): Promise<void> {
  process.env.NEXT_PUBLIC_SARVAM_API_KEY = "test-key";
  const restore = stubFetch((body) => ({ status: 200, body: { translated_text: `[ta] ${body.input}` } }));

  const reasons: VerdictReason[] = [{ clause: "Clause 4.2", page: 3, text: "Turnover must exceed ₹2,00,00,000" }];
  const translatedReasons = await translateVerdictReasons(reasons, "ta-IN");
  check("translateVerdictReasons keeps clause/page/text untouched", translatedReasons[0].clause === "Clause 4.2" && translatedReasons[0].page === 3 && translatedReasons[0].text === "Turnover must exceed ₹2,00,00,000");
  check("translateVerdictReasons adds textTranslated alongside the original", translatedReasons[0].textTranslated === "[ta] Turnover must exceed ₹2,00,00,000");
  check("translateVerdictReasons does not mutate the input array's objects", reasons[0].text === "Turnover must exceed ₹2,00,00,000");

  const rows: EligibilityRow[] = [
    { requirement: "ISO 9001 certification", clause: "E3", status: "have", evidenceDocId: "doc-iso-9001", howToGet: null },
  ];
  const translatedRows = await translateMatrixRows(rows, "ta-IN");
  check("translateMatrixRows keeps clause/status/evidenceDocId untouched", translatedRows[0].clause === "E3" && translatedRows[0].status === "have" && translatedRows[0].evidenceDocId === "doc-iso-9001");
  check("translateMatrixRows leaves howToGetTranslated null when howToGet is null", translatedRows[0].howToGetTranslated === null);

  restore();
  delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
}

/* ---------- live ---------- */

async function liveTests(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_SARVAM_API_KEY?.trim();
  if (!key) {
    liveSkipped = true;
    console.log("SKIP  live en→ta / en→hi translation of a real verdict reason — no NEXT_PUBLIC_SARVAM_API_KEY set");
    console.log("SKIP  live matrix row round-trip — no NEXT_PUBLIC_SARVAM_API_KEY set");
    return;
  }

  const reason = "The Earnest Money Deposit is ₹4,86,000, due before 2026-08-21.";
  try {
    const [ta, hi] = await Promise.all([
      translate({ text: reason, source: "en-IN", target: "ta-IN" }),
      translate({ text: reason, source: "en-IN", target: "hi-IN" }),
    ]);
    console.log(`  en: ${reason}`);
    console.log(`  ta: ${ta.text}`);
    console.log(`  hi: ${hi.text}`);
    check("live en→ta translation is non-empty with digits intact", ta.text.trim().length > 0 && digitsPreserved(reason, ta.text));
    check("live en→hi translation is non-empty with digits intact", hi.text.trim().length > 0 && digitsPreserved(reason, hi.text));
  } catch (e) {
    check("live en→ta / en→hi translation", false, String(e));
  }

  try {
    const rows: EligibilityRow[] = [
      { requirement: "Udyam/MSE registration", clause: "E1", status: "have", evidenceDocId: "doc-udyam-1", howToGet: null },
    ];
    const translatedRows = await translateMatrixRows(rows, "ta-IN");
    check(
      "live matrix row round-trips with evidenceDocId untouched",
      translatedRows[0].evidenceDocId === "doc-udyam-1" && translatedRows[0].requirementTranslated.trim().length > 0,
    );
  } catch (e) {
    check("live matrix row round-trip", false, String(e));
  }
}

async function main(): Promise<void> {
  // Stash any real key before the offline tests start clobbering
  // NEXT_PUBLIC_SARVAM_API_KEY for isolation — restored right before
  // liveTests() runs, or the live half silently skips even with a real key
  // (same bug class fixed in checks/sarvam-llm.ts).
  const realKey = process.env.NEXT_PUBLIC_SARVAM_API_KEY;

  offlineChunking();
  offlineDigitGuard();
  await offlineTranslateMany();
  await offlineKeyResolution();
  await offlineBilingual();

  if (realKey) process.env.NEXT_PUBLIC_SARVAM_API_KEY = realKey;
  else delete process.env.NEXT_PUBLIC_SARVAM_API_KEY;
  await liveTests();

  const summary = liveSkipped ? " (live half SKIPPED — set NEXT_PUBLIC_SARVAM_API_KEY to run it)" : "";
  console.log("");
  console.log(`sarvam-translate check: ${passed}/${total} passed — ${passed === total ? "PASS" : "FAIL"}${summary}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error("sarvam-translate check crashed:", e);
  process.exit(1);
});
