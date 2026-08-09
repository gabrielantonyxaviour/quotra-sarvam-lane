"use client";

// Quotra app/playground/docai — S4 deliverable playground (SARVAM-LANE-TASKS.md).
// Upload a tender PDF, digitise it live via Sarvam Doc AI (submit -> poll ->
// download -> unzip -> split into pages), see the real per-page output in the
// browser. Same "playground, not a feature" spirit as /playground/voice: all
// logic lives in lib/docai/sarvam.ts, this page just wires it up and renders
// state.

import { useEffect, useState } from "react";
import {
  digestTenderPdf,
  DocAiMissingKeyError,
  type DigitisedPage,
  type DigitiseStatus,
} from "@/lib/docai/sarvam";
import { SARVAM_KEY_STORAGE_KEY } from "@/lib/llm";

type Phase = "idle" | "submitting" | "polling" | "downloading" | "done";

export default function DocAiPlaygroundPage() {
  // Deliberately starts false and is set in an effect, not a useState lazy
  // initializer — reading localStorage during the initial render diverges
  // from SSR (no window there) and throws a hydration mismatch. Same fix
  // /playground/voice already needed for LanguageToggle (see MERGE-NOTES).
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  useEffect(() => {
    setHasKey(!!(typeof window !== "undefined" && window.localStorage.getItem(SARVAM_KEY_STORAGE_KEY)));
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en-IN");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<DigitisedPage[] | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<DigitiseStatus | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [expandedPage, setExpandedPage] = useState<number | null>(null);

  function saveKey() {
    if (!keyInput.trim()) return;
    window.localStorage.setItem(SARVAM_KEY_STORAGE_KEY, keyInput.trim());
    setHasKey(true);
    setKeyInput("");
  }

  async function handleDigitise() {
    if (!file) return;
    setError(null);
    setPages(null);
    setJobId(null);
    setStatus(null);
    setDurationMs(null);
    setExpandedPage(null);

    const started = Date.now();
    try {
      setPhase("submitting");
      // digestTenderPdf itself does submit -> poll -> download internally;
      // the phase labels here are best-effort UI feedback, not driven by
      // real progress callbacks from the lib function.
      setTimeout(() => setPhase("polling"), 800);
      const result = await digestTenderPdf(file, { filename: file.name, language });
      setPhase("downloading");
      setPages(result.pages);
      setJobId(result.jobId);
      setStatus(result.status);
      setDurationMs(Date.now() - started);
      setPhase("done");
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err instanceof DocAiMissingKeyError) setHasKey(false);
      setError(err.message);
      setPhase("idle");
    }
  }

  const busy = phase !== "idle" && phase !== "done";

  return (
    <main>
      <h1>Digitise a Tender PDF</h1>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        Sarvam Doc AI: upload a real tender PDF, it&apos;s submitted as a digitise job, polled until done, and the
        rendered per-page text is shown below — the same pipeline that feeds real page citations into a verdict call.
      </p>

      {!hasKey && (
        <div className="card">
          <p style={{ marginBottom: "0.5rem" }}>Sarvam API key needed</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="password"
              value={keyInput}
              placeholder="Paste your Sarvam API key"
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button type="button" onClick={saveKey}>
              Save key
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ flex: "1 1 260px" }}
          />
          <select
            value={language}
            disabled={busy}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ background: "#121a12", color: "inherit", border: "1px solid #2a3a2a", borderRadius: 6, padding: "0.5rem" }}
          >
            <option value="en-IN">English</option>
            <option value="hi-IN">Hindi</option>
          </select>
          <button type="button" disabled={!hasKey || !file || busy} onClick={handleDigitise}>
            {busy ? "Digitising…" : "Digitise"}
          </button>
        </div>
        {file && <p className="muted" style={{ marginTop: "0.5rem" }}>{file.name} — {(file.size / 1024).toFixed(0)} KB</p>}
        {phase === "submitting" && <p className="muted" style={{ marginTop: "0.5rem" }}>Submitting job…</p>}
        {phase === "polling" && <p className="muted" style={{ marginTop: "0.5rem" }}>Job running — this can take up to ~2 minutes for longer documents…</p>}
        {phase === "downloading" && <p className="muted" style={{ marginTop: "0.5rem" }}>Fetching + unzipping the rendered output…</p>}
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#c0392b" }}>
          <strong>Something went wrong</strong>
          <p className="muted">{error}</p>
        </div>
      )}

      {pages && (
        <div className="card">
          <strong>
            {pages.length} page{pages.length === 1 ? "" : "s"} digitised
          </strong>
          <p className="muted">
            job {jobId} · status &quot;{status}&quot; · {durationMs !== null ? `${(durationMs / 1000).toFixed(1)}s` : ""}
          </p>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.75rem 0" }}>
            {pages.map((p) => (
              <button
                key={p.page}
                type="button"
                onClick={() => setExpandedPage(expandedPage === p.page ? null : p.page)}
                style={{
                  background: expandedPage === p.page ? "#b6f05a" : "transparent",
                  color: expandedPage === p.page ? "#0a0f0a" : "#e6f0e6",
                  border: expandedPage === p.page ? "0" : "1px solid #2a3a2a",
                  padding: "0.3rem 0.7rem",
                }}
              >
                Page {p.page} {p.text.trim().length === 0 ? "(empty)" : ""}
              </button>
            ))}
          </div>
          {expandedPage !== null && (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "#0a0f0a",
                border: "1px solid #2a3a2a",
                borderRadius: 6,
                padding: "0.75rem",
                maxHeight: "50vh",
                overflowY: "auto",
                fontSize: "0.8rem",
              }}
            >
              {pages.find((p) => p.page === expandedPage)?.text}
            </pre>
          )}
        </div>
      )}
    </main>
  );
}
