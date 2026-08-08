// Quotra lib/voice — the voice seam (contract only, FROZEN 2026-08-08).
//
// The v2 Sarvam lane implements this in lib/voice/sarvam.ts (handoff/sarvam/
// TASKS/T2-voice-core.md). The app wires implementations through this shape
// only — screens never import a vendor module directly, mirroring lib/llm.
//
// Product laws that bind every implementation:
//   - Voice is REP-FACING (the sales rep talks to Quotra). No outbound
//     calls/messages to the rep's clients — vetoed twice by the design partner.
//   - Spoken answers carry the same citation discipline as text: the payload a
//     voice answer speaks must come from a cited text answer, never fresh
//     uncited generation.

/** BCP-47 codes the product ships today. Saaras v3 accepts "unknown" to auto-detect. */
export type QuotraLanguageCode = "en-IN" | "ta-IN" | "hi-IN" | "unknown";

export type SttMode = "transcribe" | "translate" | "verbatim" | "translit" | "codemix";

export type TranscribeArgs = {
  /** Audio captured in the browser (MediaRecorder blob) or a file fixture. */
  audio: Blob;
  /** Expected language, or "unknown" for auto-detect (code-mixed speech is normal input, not an edge case). */
  language: QuotraLanguageCode;
  /**
   * translate → English text for the reasoning pipeline (the default the app
   * uses: Indic speech in, LLM-comprehensible English out).
   * transcribe/codemix → what the rep actually said, for display.
   */
  mode: SttMode;
};

export type TranscribeResult = {
  text: string;
  /** Language the model detected, when the API reports one. */
  detectedLanguage?: string;
  /** Provider request id / raw metadata for provenance, if available. */
  requestId?: string;
};

export type SpeakArgs = {
  text: string;
  language: QuotraLanguageCode;
  /** Provider voice id (e.g. a Bulbul v3 speaker). Implementations pick a documented default per language. */
  speaker?: string;
  /** 0.5–2.0, default 1.0. */
  pace?: number;
};

export type SpeakResult = {
  /** Playable audio (audio/wav or audio/mpeg) ready for `new Audio(URL.createObjectURL(...))`. */
  audio: Blob;
  mimeType: string;
};

/** The whole voice capability behind one object, so screens can feature-detect it. */
export interface VoiceProvider {
  id: "sarvam";
  transcribe(args: TranscribeArgs): Promise<TranscribeResult>;
  speak(args: SpeakArgs): Promise<SpeakResult>;
}
