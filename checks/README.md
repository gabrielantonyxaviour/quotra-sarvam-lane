# Checks — the acceptance bar

One script per task: `sarvam-spike.ts`, `sarvam-llm.ts`, `sarvam-voice.ts`,
`sarvam-playground.ts`, `sarvam-translate.ts`, `sarvam-docai.ts`, `sarvam-i18n.ts`.
Run from the repo root: `npx tsx checks/<name>.ts`.

House style (match it):

- Each assertion prints one line: `PASS  <what was proven>` or `FAIL  <what broke>`.
- Final line: `<task> check: N/M passed — PASS|FAIL`; exit code 1 on any failure.
- Offline assertions use a **stubbed fetch** (swap `globalThis.fetch`, restore after) —
  they must pass with no network and no API key.
- Live assertions run only when `NEXT_PUBLIC_SARVAM_API_KEY` is set; print
  `SKIP <reason>` otherwise. A check that silently skips its live half must say so in
  its final summary line.
- No invented data — fixtures come from `fixtures/load.ts`.
