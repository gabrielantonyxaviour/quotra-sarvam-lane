"use client";

// T3 deliverable — replace this stub with the full voice loop:
// mic (MediaRecorder, ≤25 s) → lib/voice transcribe (codemix display + translate
// for the LLM) → completeJSON from @/lib/llm with the cited ask contract →
// cited English answer (+ ta/hi rendering via lib/translate) → Bulbul playback.
// See TASKS/T3-voice-playground.md for the acceptance bar.

export default function VoicePlayground() {
  return (
    <main>
      <h1>Ask Quotra — voice playground</h1>
      <div className="card">
        <p>T3 not implemented yet. Build order: T1 (LLM adapter) → T2 (voice core) → this page.</p>
        <p className="muted">TASKS/T3-voice-playground.md has the full loop and acceptance criteria.</p>
      </div>
    </main>
  );
}
