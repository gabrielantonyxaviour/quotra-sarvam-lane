> ⚠️ **SUPERSEDED 2026-08-09** — the executable spec is now **`SARVAM-LANE-TASKS.md`** (repo root, tasks S1–S7). This brief is kept for history; where the two disagree, S1–S7 wins. Note: T6 (phone agent) is **cut** — do not work on it.

# T7 — Indic UI copy: Tamil + Hindi dictionaries and the language toggle

**Deliverable:** filled `lib/i18n/dictionaries/ta.ts` and `hi.ts`, a
`LanguageToggle` component, and the check. This is the piece that makes the UI itself —
not just the outputs — feel Indian-language-native tomorrow.

## How the seam works (read `lib/i18n/index.ts` first)

Screens call `t("verdict.run")`; dictionaries own the words. The other lane refines
screens all day without touching dictionaries; you fill dictionaries without touching
screens. Missing keys fall back to English by design — partial coverage ships safely.

## Steps

1. **Translate the seed key set** in `dictionaries/en.ts` into Tamil and Hindi.
   Hand-write or machine-translate-then-review — you are the human reviewer; UI chrome
   is short-form text where formal-register machine output often reads wrong. Norms:
   - Verdict words GO / NO-GO / FIXABLE stay ENGLISH in all languages (they are the
     product's brand vocabulary, like "OK").
   - Domain terms reps say in English (EMD, tender, CCTV) stay English inside Indic
     sentences — code-mixed copy is correct copy here, not laziness.
   - Keep lengths comparable to English; long Tamil strings break chrome layouts.
2. **Grow the key space as needed:** you may ADD keys to `en.ts` (for strings your
   playground uses) — never change existing English values (that's the other lane's copy).
3. **`components/i18n/LanguageToggle.tsx`:** small three-way EN/த/हि control writing
   `setActiveLanguage()` from `@/lib/i18n`; minimal styling; used
   on your T3 playground page (which should call `t()` for its chrome — dogfood the seam).
   Note in MERGE-NOTES where Gabriel should mount it tonight (Settings + app header are
   the candidates — his files, his call).

## Acceptance — `checks/sarvam-i18n.ts`

- Every ta/hi key exists in en (no orphans); no en value was modified (hash the seed
  values in the check against a recorded snapshot).
- `t()` fallback chain proven: ta hit → ta; ta miss → en; unknown key → key itself.
- Coverage report printed: % of en keys covered per language (target: 100% of the seed
  set; new playground keys ta at minimum).
- Human line in MERGE-NOTES: 2–3 translation decisions you made and why (e.g. what you
  did with "Vault"), so review is fast.
