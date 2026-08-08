# Fixtures — real tenders, sanitized company data (public repo!)

This repo is **public**, so fixtures come in two grades:

| File | Grade | Notes |
|---|---|---|
| `tenders.sample.json` | REAL | 3 real tenders (CPPP electrical, CPPP CCTV, GeM CCTV) with provenance — public procurement documents |
| `products.sample.json` | REAL | 12 products with datasheet-parsed capabilities (prices were already null in the seed) |
| `company.sample.json` | SANITIZED | Structure real; turnover figures representative (NOT actual), cert numbers removed |
| `experience.sample.json` | SANITIZED | Buyers genericized, values rounded, PO refs redacted |
| `company.real.json`, `experience.real.json` | REAL, PRIVATE | Delivered over WhatsApp — drop here; **gitignored, never commit** |
| `anthropic-example-outputs.json` | shapes | The JSON contract shapes per feature (verdict, eligibility-matrix, ask-quotra) |

`load.ts` prefers `*.real.json` when present. Checks must run green on a fresh public
clone (sanitized data) AND with real fixtures dropped in.

Files you add here per task: `audio/` recordings (T2), `docai-*.json` (T5), demo
recordings `*.mp4` (T3/T6).

The authoritative contract validators live in code — `lib/verdict/engine.ts`
(`validateVerdictOutput`), plus the shapes quoted inside each task brief. Import them
in checks; never re-declare a contract by hand.
