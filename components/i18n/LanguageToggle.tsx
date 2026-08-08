"use client";

// Quotra components/i18n — T7 deliverable. A minimal three-way EN / த / हि
// control over the lib/i18n seam (see lib/i18n/index.ts). Writes
// setActiveLanguage() and reloads the page's t() calls by asking the parent
// to re-render (onChange) — this component owns no dictionary content.
// Gabriel: candidates to mount this tonight are Settings and the app header
// (see MERGE-NOTES) — his files, his call.

import { useState } from "react";
import { activeLanguage, setActiveLanguage, type UiLanguage } from "@/lib/i18n";

const OPTIONS: { id: UiLanguage; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "ta", label: "த" },
  { id: "hi", label: "हि" },
];

export type LanguageToggleProps = {
  onChange?: (lang: UiLanguage) => void;
};

export function LanguageToggle({ onChange }: LanguageToggleProps) {
  const [lang, setLang] = useState<UiLanguage>(() => activeLanguage());

  const select = (next: UiLanguage) => {
    setActiveLanguage(next);
    setLang(next);
    onChange?.(next);
  };

  return (
    <div style={{ display: "inline-flex", gap: "0.25rem", border: "1px solid #2a3a2a", borderRadius: 8, padding: 2 }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => select(opt.id)}
          aria-pressed={lang === opt.id}
          style={{
            padding: "0.3rem 0.6rem",
            borderRadius: 6,
            background: lang === opt.id ? "#b6f05a" : "transparent",
            color: lang === opt.id ? "#0a0f0a" : "#e6f0e6",
            fontWeight: lang === opt.id ? 700 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
