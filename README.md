# Quotra × Sarvam — the build lane

**Read this first. Then `SARVAM-API-NOTES.md`. Then work through `TASKS/` in order.**

This is a **standalone, disposable build lane**: everything needed to build Quotra's
Sarvam components lives here — frozen contracts, a runnable Next.js playground, real
fixtures, and seven task briefs written so an AI coding agent (Claude Code, Codex, etc.)
can pick each one up directly. The product itself lives in a separate private repo; the
components built here get merged into it tonight. **You never need the product repo.**

## What Quotra is (60 seconds)

Quotra reads Indian government tenders (CPPP/GeM) for a manufacturing MSME and returns a
GO / NO-GO / FIXABLE verdict where **every reason cites a clause**, an eligibility matrix
mapped to the company's document vault, and a drafted bid pack. v1 runs on Anthropic
Claude. **v2 — this lane — re-cuts the intelligence on Sarvam's stack** for the Sarvam
hackathon: `sarvam-105b` reasoning, voice in/out (Saaras/Bulbul), bilingual outputs, and
a phone line you can call and talk to about live tenders.

## Setup (10 minutes)

```bash
npm install
npm run check          # tsc — should pass on a fresh clone
npm run dev            # playground at http://localhost:3000
```

- **Sarvam API key:** create at dashboard.sarvam.ai (free signup credits) or use the one
  Gabriel shares. Put in `.env.local`: `NEXT_PUBLIC_SARVAM_API_KEY=...` — never commit it.
- **Real fixtures:** two files arrive privately over WhatsApp (`company.real.json`,
  `experience.real.json`) — drop them into `fixtures/`. Committed `*.sample.json`
  versions are sanitized so the repo works without them; loaders prefer `.real.json`
  when present (see `fixtures/load.ts`). **Never commit `*.real.json`** (gitignored).
- **Sarvam docs inside your AI agent:**
  `claude mcp add --transport http sarvam-docs https://docs.sarvam.ai/_mcp/server`
  (or append `.md` to any docs URL for clean markdown).

## The layout (mirrors the product, so tonight's merge is file-copy)

```
lib/llm/        the LLM seam — client.ts (Anthropic reference impl, READ ONLY),
                provider.ts (frozen switch), sarvam.ts (YOUR T1 deliverable — a stub now)
lib/voice/      types.ts frozen contract → you add sarvam.ts (T2)
lib/translate/  types.ts frozen contract → you add sarvam.ts + bilingual.ts (T4)
lib/i18n/       copy dictionary seam → you fill dictionaries/ta.ts, hi.ts (T7)
lib/verdict/    the REAL verdict prompt + contract validator (trimmed lane copy)
lib/tenders/    types · lib/money/ deterministic money — reference, read only
app/playground/ your playground pages (T3)
checks/         one check script per task — the acceptance bar (see checks/README.md)
fixtures/       real tenders + company/products/experience + fixtures/load.ts
phone-agent/    standalone Python Twilio agent (T6)
TASKS/          T1 → T7, each self-contained
```

## The laws (product law, paid for with real-user vetoes — never violate)

1. **Citation-or-flag.** Every technical claim cites its source or renders
   "needs confirmation". An answer without citations is a bug.
2. **The model never does arithmetic.** Money/dates come from `lib/money`-style
   deterministic code; model-emitted numbers are discarded.
3. **Voice is rep-facing and INBOUND only.** The phone agent answers calls; it never
   places calls or messages anyone.
4. **Transcripts are provenance.** Every model call records a transcript
   (`lib/llm/transcripts.ts` helpers) — it is how the demo proves the AI is real.

## Task order and the one gate

**T1 first, and inside T1 the live spike first** (can `sarvam-105b` hold the verdict
JSON contract on a real tender?). Then T2 → T7 by demo value. Do tasks fully rather than
all of them shallowly — a working T1+T2+T3 beats seven halves. Blocked (account
approval, gated API)? Write the finding in `MERGE-NOTES.md` and move on.

| # | Task | Deliverable |
|---|---|---|
| T1 | `TASKS/T1-llm-adapter.md` | `lib/llm/sarvam.ts` — the swap itself |
| T2 | `TASKS/T2-voice-core.md` | Saaras STT + Bulbul TTS modules |
| T3 | `TASKS/T3-voice-playground.md` | `/playground/voice` — ask by voice, cited |
| T4 | `TASKS/T4-translate-layer.md` | Bilingual verdicts/matrices/packs |
| T5 | `TASKS/T5-doc-digitisation.md` | Tender PDF → structured text (Sarvam Vision) |
| T6 | `TASKS/T6-phone-agent.md` | Inbound Twilio phone line to the Brain |
| T7 | `TASKS/T7-indic-copy.md` | Tamil/Hindi dictionaries + toggle |

## Definition of done (per task)

1. Its `checks/sarvam-*.ts` check passes (`npx tsx checks/<name>.ts`).
2. Committed with **explicit paths** (`git add <files>` — never `git add -A`).
3. A block in `MERGE-NOTES.md`: what landed, how to wire it, decisions made, what needs
   Gabriel. That file is the script for tonight's merge — be blunt in it.

## Do NOT

- Edit `lib/llm/client.ts`, `provider.ts`, `index.ts`, `transcripts.ts`, or any
  `types.ts` contract — implement against them. Contract feels wrong? MERGE-NOTES it.
- Put real company financials in any committed file (`*.real.json` stays gitignored —
  this repo is public).
- Add npm dependencies without a MERGE-NOTES entry saying why (prefer plain `fetch`;
  `phone-agent/` has its own Python deps and is exempt).
- Build anything that contacts a client (calls/messages OUT) — inbound only, always.
