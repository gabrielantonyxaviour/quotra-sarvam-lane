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
  const [answer, setAnswer] = useState<AskQuotraAnswer | null>(null);
  const [bilingualText, setBilingualText] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

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
    setBilingualText(null);
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
    if (audio.size > MAX_AUDIO_BYTES) {
      setError({ kind: "api", message: t("voice.error", uiLang) + ": clip too long, try a shorter question." });
      setPhase("idle");
      return;
    }
    try {
      setPhase("transcribing");
      const [codemix, translated] = await Promise.all([
        transcribe({ audio, language: "unknown", mode: "codemix" }),
        transcribe({ audio, language: "unknown", mode: "translate" }),
      ]);
      setCodemixText(codemix.text);
      const detected = normalizeSpokenLanguage(codemix.detectedLanguage ?? translated.detectedLanguage);
      setSpokenLanguage(detected);

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

      let textToSpeak = data.answer;
      if (detected === "ta-IN" || detected === "hi-IN") {
        setPhase("translating");
        const bilingual = await translate({
          text: data.answer,
          source: "en-IN",
          target: toTranslateLanguage(detected),
        });
        setBilingualText(bilingual.text);
        textToSpeak = bilingual.text;
      }

      setPhase("speaking");
      const spoken = await speak({ text: summarizeForSpeech(textToSpeak), language: detected });
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

      {codemixText && (
        <div className="card">
          <strong>{t("voice.youSaid", uiLang)}</strong>
          <p>{codemixText}</p>
        </div>
      )}

      {answer && (
        <div className="card">
          <strong>{t("voice.answer", uiLang)}</strong>
          <p>{answer.answer}</p>
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

      {bilingualText && (
        <div className="card">
          <strong>{t("voice.inYourLanguage", uiLang)}</strong>
          <p>{bilingualText}</p>
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
