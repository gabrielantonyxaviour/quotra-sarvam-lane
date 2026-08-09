"use client";

// Quotra app/playground/voice — T3 deliverable (TASKS/T3-voice-playground.md).
// The signature Sarvam-hackathon demo beat: rep speaks Tamil/Tanglish → Saaras
// hears → Sarvam-105B answers with citations → Bulbul speaks it back.
// Client-only, no server routes, no store writes — a playground, not a
// feature. All logic lives in lib/ (askquotra, voice, translate, llm); this
// page just wires it together and renders state, so tonight's merge into the
// real Ask Quotra dialog is copy-paste.

import { useEffect, useRef, useState } from "react";
import companyData from "@/fixtures/company.sample.json";
import productsData from "@/fixtures/products.sample.json";
import tendersData from "@/fixtures/tenders.sample.json";
import type { BrainProduct, Company, Tender } from "@/lib/tenders/types";
import { completeJSON, setActiveProviderId, SARVAM_KEY_STORAGE_KEY } from "@/lib/llm";
import { buildAskQuotraPrompt } from "@/lib/askquotra/prompt";
import { askQuotraSchema, type AskQuotraAnswer } from "@/lib/askquotra/contract";
import { transcribe, speak, MAX_AUDIO_BYTES } from "@/lib/voice/sarvam";
import { translate } from "@/lib/translate/sarvam";
import type { TranslateLanguage } from "@/lib/translate/types";
import { t, activeLanguage, type UiLanguage } from "@/lib/i18n";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";

const company = companyData as unknown as Company;
const products = productsData as unknown as BrainProduct[];
const tenders = tendersData as unknown as Tender[];

const RECORD_HARD_CAP_MS = 25_000; // Saaras REST limit is 30s; stop well before it
const SPEAK_CHAR_CAP = 2400;

type Phase = "idle" | "recording" | "transcribing" | "thinking" | "translating" | "speaking" | "done";
type ErrorKind = "no-mic" | "no-key" | "api";
type PageError = { kind: ErrorKind; message: string };
type SpokenLanguageChoice = "auto" | "en-IN" | "ta-IN" | "hi-IN";

const LANGUAGE_CHOICES: { id: SpokenLanguageChoice; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "en-IN", label: "EN" },
  { id: "ta-IN", label: "த" },
  { id: "hi-IN", label: "हि" },
];

/** Sarvam's detected-language codes aren't guaranteed to be exactly the
 *  QuotraLanguageCode set speak() accepts — normalize defensively. */
function normalizeSpokenLanguage(detected: string | undefined): "en-IN" | "ta-IN" | "hi-IN" {
  if (!detected) return "en-IN";
  const lower = detected.toLowerCase();
  if (lower.startsWith("ta")) return "ta-IN";
  if (lower.startsWith("hi")) return "hi-IN";
  return "en-IN";
}

function toTranslateLanguage(lang: "en-IN" | "ta-IN" | "hi-IN"): TranslateLanguage {
  return lang;
}

/** ≤2 sentences, ≤SPEAK_CHAR_CAP chars — what actually gets spoken. */
function summarizeForSpeech(text: string): string {
  const sentences = text.match(/[^.!?।。]+[.!?।。]?/g) ?? [text];
  const capped = sentences.slice(0, 2).join("").trim();
  return capped.length > SPEAK_CHAR_CAP ? `${capped.slice(0, SPEAK_CHAR_CAP - 1)}…` : capped;
}

export default function VoicePlaygroundPage() {
  const [uiLang, setUiLang] = useState<UiLanguage>("en");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<PageError | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);

  const [codemixText, setCodemixText] = useState<string | null>(null);
  const [spokenLanguage, setSpokenLanguage] = useState<"en-IN" | "ta-IN" | "hi-IN">("en-IN");
  // Explicit override — auto-detect can misfire on short/code-mixed speech,
  // so letting the rep pick their language guarantees the answer language
  // deterministically instead of depending on Sarvam's detection confidence.
  const [languageChoice, setLanguageChoice] = useState<SpokenLanguageChoice>("auto");
  const [answer, setAnswer] = useState<AskQuotraAnswer | null>(null);
  // The answer TEXT actually shown/spoken — English as-is when the rep spoke
  // English, translated into their language otherwise. One answer, one
  // language, matching what they asked in. `answer.citations` stay
  // language-agnostic (kind/ref ids) so they render unchanged either way.
  const [displayAnswerText, setDisplayAnswerText] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  // Temporary debug line — shows exactly what Sarvam reported for language
  // detection on this turn, so a mismatch (or misdetection) is visible on
  // the page itself without needing DevTools. Safe to remove once the
  // detection path is confirmed solid across a few real test turns.
  const [debugLanguage, setDebugLanguage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const recordingStartedAtRef = useRef<number>(0);

  useEffect(() => {
    setUiLang(activeLanguage());
    setActiveProviderId("sarvam");
    setHasKey(!!(typeof window !== "undefined" && window.localStorage.getItem(SARVAM_KEY_STORAGE_KEY)));
  }, []);

  function saveKey() {
    if (!keyInput.trim()) return;
    window.localStorage.setItem(SARVAM_KEY_STORAGE_KEY, keyInput.trim());
    setHasKey(true);
    setKeyInput("");
  }

  function resetForNewTurn() {
    setError(null);
    setCodemixText(null);
    setAnswer(null);
    setDisplayAnswerText(null);
    setDebugLanguage(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  }

  async function startRecording() {
    resetForNewTurn();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void handleRecordingComplete(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setPhase("recording");
      recordTimerRef.current = setTimeout(() => stopRecording(), RECORD_HARD_CAP_MS);
    } catch {
      setError({ kind: "no-mic", message: t("voice.noMic", uiLang) });
    }
  }

  function stopRecording() {
    if (recordTimerRef.current) {
      clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function classifyError(e: unknown): PageError {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.name.includes("MissingKeyError")) {
      return { kind: "no-key", message: err.message };
    }
    return { kind: "api", message: err.message };
  }

  async function handleRecordingComplete(audio: Blob) {
    const recordedMs = Date.now() - recordingStartedAtRef.current;
    const audioDebug = `clip: ${audio.size}B, held ${(recordedMs / 1000).toFixed(1)}s, type=${audio.type}`;
    if (audio.size > MAX_AUDIO_BYTES) {
      setError({ kind: "api", message: t("voice.error", uiLang) + ": clip too long, try a shorter question." });
      setPhase("idle");
      return;
    }
    if (audio.size < 2000) {
      // A handful of bytes is a container header with ~no audio in it — this
      // is what "held the button but Sarvam heard nothing" looks like at the
      // recording layer, before it even reaches the network. Surface it here
      // instead of letting it silently fail Sarvam's side and produce an
      // empty transcript with no diagnostic trail.
      setError({
        kind: "api",
        message: `Recording was almost empty (${audioDebug}) — the button was likely released before any audio was captured. Hold it down while speaking, then release.`,
      });
      setPhase("idle");
      return;
    }
    try {
      setPhase("transcribing");
      // Auto-detect only when the rep hasn't told us their language — when
      // they have (languageChoice !== "auto"), pass it straight to Sarvam
      // (better STT accuracy than blind auto-detect) AND use it directly as
      // the answer language, skipping detection-response parsing entirely.
      const requestLanguage = languageChoice === "auto" ? "unknown" : languageChoice;
      const [codemix, translated] = await Promise.all([
        transcribe({ audio, language: requestLanguage, mode: "codemix" }),
        transcribe({ audio, language: requestLanguage, mode: "translate" }),
      ]);
      setCodemixText(codemix.text);
      const detected =
        languageChoice === "auto"
          ? normalizeSpokenLanguage(codemix.detectedLanguage ?? translated.detectedLanguage)
          : languageChoice;
      setSpokenLanguage(detected);
      setDebugLanguage(
        `${audioDebug} | ` +
          (languageChoice === "auto"
            ? `codemix=${codemix.detectedLanguage ?? "(none)"}, translate=${translated.detectedLanguage ?? "(none)"} → auto-resolved ${detected}`
            : `forced by language picker → ${detected}`) +
          ` | question sent to LLM (translate-mode STT text): "${translated.text || "(EMPTY — this is almost certainly why the answer never changes)"}"`,
      );

      setPhase("thinking");
      const { system, messages } = buildAskQuotraPrompt({
        question: translated.text,
        company,
        products,
        tenders,
      });
      const { data } = await completeJSON<AskQuotraAnswer>({
        feature: "ask-quotra",
        system,
        messages,
        schema: askQuotraSchema,
        maxTokens: 1024,
      });
      setAnswer(data);

      // One answer, in the language the rep actually spoke — English stays
      // English; Tamil/Hindi input gets the LLM's English answer translated
      // once and THAT is the only text shown and spoken (no separate
      // English-vs-local display).
      let localizedAnswer = data.answer;
      if (detected === "ta-IN" || detected === "hi-IN") {
        setPhase("translating");
        const translated = await translate({
          text: data.answer,
          source: "en-IN",
          target: toTranslateLanguage(detected),
        });
        localizedAnswer = translated.text;
      }
      setDisplayAnswerText(localizedAnswer);

      setPhase("speaking");
      const spoken = await speak({ text: summarizeForSpeech(localizedAnswer), language: detected });
      const url = URL.createObjectURL(spoken.audio);
      setAudioUrl(url);
      setPhase("done");
    } catch (e) {
      setError(classifyError(e));
      setPhase("idle");
    }
  }

  useEffect(() => {
    if (audioUrl && audioElRef.current) {
      audioElRef.current.play().catch(() => {
        /* autoplay can be blocked by the browser — the Replay button still works */
      });
    }
  }, [audioUrl]);

  const busy = phase !== "idle" && phase !== "done";

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1>{t("voice.title", uiLang)}</h1>
        <LanguageToggle value={uiLang} onChange={setUiLang} />
      </div>

      {!hasKey && (
        <div className="card">
          <p style={{ marginBottom: "0.5rem" }}>{t("voice.keyNeeded", uiLang)}</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="password"
              value={keyInput}
              placeholder={t("voice.keyPlaceholder", uiLang)}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button type="button" onClick={saveKey}>
              {t("voice.keySave", uiLang)}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "0.3rem", marginBottom: "0.75rem" }}>
          {LANGUAGE_CHOICES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={busy}
              onClick={() => setLanguageChoice(opt.id)}
              aria-pressed={languageChoice === opt.id}
              style={{
                padding: "0.3rem 0.7rem",
                background: languageChoice === opt.id ? "#b6f05a" : "transparent",
                color: languageChoice === opt.id ? "#0a0f0a" : "#e6f0e6",
                border: languageChoice === opt.id ? "0" : "1px solid #2a3a2a",
                fontWeight: languageChoice === opt.id ? 700 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginBottom: "0.5rem" }}>
          {languageChoice === "auto" ? "Auto-detect the language you speak" : "Speaking in: " + LANGUAGE_CHOICES.find((o) => o.id === languageChoice)?.label}
        </p>
        <button
          type="button"
          disabled={!hasKey || busy}
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={() => phase === "recording" && stopRecording()}
        >
          {phase === "recording" ? t("voice.recording", uiLang) : t("voice.holdToTalk", uiLang)}
        </button>
        {phase === "transcribing" && <p className="muted">{t("voice.processing", uiLang)}</p>}
        {phase === "thinking" && <p className="muted">{t("voice.processing", uiLang)}</p>}
        {phase === "translating" && <p className="muted">{t("voice.processing", uiLang)}</p>}
        {phase === "speaking" && <p className="muted">{t("voice.speaking", uiLang)}</p>}
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#c0392b" }}>
          <strong>{t("voice.error", uiLang)}</strong>
          <p className="muted">{error.message}</p>
        </div>
      )}

      {codemixText !== null && (
        <div className="card">
          <strong>{t("voice.youSaid", uiLang)}</strong>
          <p>
            {codemixText || (
              <span style={{ color: "#c0392b" }}>
                (empty — Sarvam heard no speech in that clip. Check your mic is the right input device, and hold the
                button for a beat longer while you speak.)
              </span>
            )}
          </p>
          {debugLanguage && <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.4rem" }}>[debug] {debugLanguage}</p>}
        </div>
      )}

      {answer && displayAnswerText && (
        <div className="card">
          <strong>{t("voice.answer", uiLang)}</strong>
          <p>{displayAnswerText}</p>
          {answer.citations.length > 0 && (
            <>
              <strong style={{ fontSize: "0.85rem" }}>{t("voice.citations", uiLang)}</strong>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
                {answer.citations.map((c, i) => (
                  <span key={i} className="muted" style={{ border: "1px solid #2a3a2a", borderRadius: 999, padding: "0.15rem 0.6rem" }}>
                    {c.kind}: {c.ref}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {audioUrl && (
        <div className="card">
          <audio ref={audioElRef} src={audioUrl} controls style={{ width: "100%" }} />
          <button type="button" onClick={() => audioElRef.current?.play()} style={{ marginTop: "0.5rem" }}>
            {t("voice.replay", uiLang)}
          </button>
        </div>
      )}
    </main>
  );
}
