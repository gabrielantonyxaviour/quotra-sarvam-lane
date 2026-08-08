// Quotra blk_verdict_engine — lib/money. Pure, deterministic money/date logic.
//
// Product law: THE MODEL NEVER DOES ARITHMETIC. Every rupee figure, deadline
// and margin on screen comes from these functions against the tender's parsed
// fields and the company brain — never from model output. Null/unknown inputs
// NEVER produce a guessed number: they return an explicit { known:false,
// reason } shape that renders downstream as "unknown — not in listing" /
// "needs confirmation".
//
// The real CPPP/GeM capture is listing-level (CAPTCHA-gated detail pages), so
// estValue / emd / fee are null on the bundled tenders. These functions treat
// that honestly: null in → known:false out.

import type { Company, Tender } from "../tenders/types";

/* ---------- shared shapes ---------- */

export type Known<T> = { known: true; value: T } | { known: false; reason: string };

/** The exact phrase the UI renders for a money field the listing did not expose. */
export const UNKNOWN_NOTE = "unknown — not in listing";

const isFiniteNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/* ---------- EMD exemption (Udyam / MSE) ---------- */

export type EmdExemption = { exempt: boolean; reason: string };

/**
 * Udyam-registered micro/small enterprises are exempt from Earnest Money
 * Deposit under the PPP-MSE Order 2012. This is a company-attribute lookup,
 * not a judgement call: registration on file → exempt, otherwise not.
 */
export function emdExemption(
  company: Pick<Company, "name" | "udyamRegistered" | "udyamNumber"> | null | undefined,
): EmdExemption {
  if (!company) {
    return { exempt: false, reason: "company profile unavailable — EMD exemption cannot be determined" };
  }
  if (company.udyamRegistered) {
    const suffix = company.udyamNumber ? ` (${company.udyamNumber})` : "";
    return {
      exempt: true,
      reason:
        `${company.name} is Udyam-registered${suffix} — MSEs are exempt from EMD ` +
        `under the PPP-MSE Order 2012`,
    };
  }
  return { exempt: false, reason: "no Udyam/MSE registration on file — EMD payable as stated in the tender" };
}

/* ---------- days to close ---------- */

const MS_PER_DAY = 86_400_000;

/**
 * Whole days from `now` until the tender closes (ceiling — a tender closing
 * 2h from now is "1 day to close", not 0). Negative means already closed.
 * Unparseable/missing closeAt → known:false, never a guess.
 */
export function daysToClose(
  closeAt: string | null | undefined,
  now: Date | string | number = new Date(),
): Known<number> {
  if (!closeAt) return { known: false, reason: `closing date ${UNKNOWN_NOTE}` };
  const closeMs = Date.parse(closeAt);
  if (Number.isNaN(closeMs)) return { known: false, reason: `closing date "${closeAt}" is not parseable` };
  const nowMs = now instanceof Date ? now.getTime() : typeof now === "string" ? Date.parse(now) : now;
  if (!isFiniteNum(nowMs)) return { known: false, reason: "reference time is not a valid date" };
  return { known: true, value: Math.ceil((closeMs - nowMs) / MS_PER_DAY) };
}

/* ---------- INR formatting (Indian grouping) ---------- */

/** ₹1,23,45,678 — Indian digit grouping. null/NaN → the unknown note, never "₹0". */
export function inr(n: number | null | undefined): string {
  if (!isFiniteNum(n)) return UNKNOWN_NOTE;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const rounded = Math.round(abs * 100) / 100;
  const grouped = rounded.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `${sign}₹${grouped}`;
}

/* ---------- estimate band ---------- */

export type EstimateBand = { id: string; label: string; min: number; max: number | null };

export const ESTIMATE_BANDS: EstimateBand[] = [
  { id: "micro", label: "under ₹10 lakh", min: 0, max: 1_000_000 },
  { id: "small", label: "₹10 lakh – ₹50 lakh", min: 1_000_000, max: 5_000_000 },
  { id: "medium", label: "₹50 lakh – ₹1 crore", min: 5_000_000, max: 10_000_000 },
  { id: "large", label: "₹1 crore – ₹5 crore", min: 10_000_000, max: 50_000_000 },
  { id: "very-large", label: "over ₹5 crore", min: 50_000_000, max: null },
];

/** Buckets an estimated value into a human band. null/negative/NaN → known:false. */
export function estimateBand(estValue: number | null | undefined): Known<EstimateBand> {
  if (!isFiniteNum(estValue) || estValue < 0) return { known: false, reason: `estimated value ${UNKNOWN_NOTE}` };
  const band = ESTIMATE_BANDS.find((b) => estValue >= b.min && (b.max === null || estValue < b.max));
  if (!band) return { known: false, reason: `estimated value ${estValue} falls outside configured bands` };
  return { known: true, value: band };
}

/* ---------- margin check ---------- */

export type MarginResult =
  | { known: true; ok: boolean; deltaPct: number }
  | { known: false; ok: null; deltaPct: null; reason: string };

/**
 * Compares the tender's estimated value against our price-list value for the
 * offered goods. deltaPct = (estValue − priceListValue) / priceListValue × 100,
 * rounded to 2dp; ok = the tender estimate covers our price (deltaPct ≥ 0).
 * Any missing input → known:false with a reason naming the missing input.
 */
export function marginCheck(
  estValue: number | null | undefined,
  priceListValue: number | null | undefined,
): MarginResult {
  if (!isFiniteNum(estValue) || estValue < 0) {
    return { known: false, ok: null, deltaPct: null, reason: `tender estimated value ${UNKNOWN_NOTE}` };
  }
  if (!isFiniteNum(priceListValue) || priceListValue < 0) {
    return { known: false, ok: null, deltaPct: null, reason: "no price-list value on file for the offered goods" };
  }
  if (priceListValue === 0) {
    return { known: false, ok: null, deltaPct: null, reason: "price-list value is zero — margin cannot be computed" };
  }
  const deltaPct = Math.round(((estValue - priceListValue) / priceListValue) * 10000) / 100;
  return { known: true, ok: deltaPct >= 0, deltaPct };
}

/* ---------- composite: the money card for a tender × company ---------- */

export type MoneyKnown = { emd: boolean; fee: boolean; estValue: boolean; daysToClose: boolean };

/**
 * The persisted Verdict.money shape. Superset of the base VerdictMoney in
 * lib/tenders/types: carries per-field known flags and human "needs
 * confirmation" lines alongside the base number|null fields. Every value in
 * here comes from this module — the engine attaches it verbatim and discards
 * any numbers in model output.
 */
export type ComputedMoney = {
  emd: number | null; // 0 when exempt (a computed fact); parsed value when known; null when unknown
  emdExempt: boolean;
  emdNote: string; // why emd is 0 / what it is / that it is unknown
  fee: number | null;
  estValue: number | null;
  estBand: string | null; // ESTIMATE_BANDS label, null when estValue unknown
  daysToClose: number; // computed; 0 + known.daysToClose=false when closeAt is unparseable
  known: MoneyKnown;
  unknowns: string[]; // render downstream as "needs confirmation"
};

/**
 * The ONE place tender × company money is computed. The verdict engine calls
 * this and persists the result — model output never touches it.
 */
export function computeVerdictMoney(
  tender: Pick<Tender, "emd" | "fee" | "estValue" | "closeAt">,
  company: Pick<Company, "name" | "udyamRegistered" | "udyamNumber"> | null | undefined,
  now: Date | string | number = new Date(),
): ComputedMoney {
  const unknowns: string[] = [];

  // EMD — exemption first (₹0 is a code-computed fact), then the parsed value, else unknown.
  const ex = emdExemption(company);
  let emd: number | null;
  let emdKnown: boolean;
  let emdNote: string;
  if (ex.exempt) {
    emd = 0;
    emdKnown = true;
    emdNote = ex.reason;
  } else if (isFiniteNum(tender.emd) && tender.emd >= 0) {
    emd = tender.emd;
    emdKnown = true;
    emdNote = `${ex.reason}; EMD as stated in the listing`;
  } else {
    emd = null;
    emdKnown = false;
    emdNote = `EMD ${UNKNOWN_NOTE}`;
    unknowns.push(`EMD ${UNKNOWN_NOTE} — needs confirmation from the full tender document`);
  }

  // Fee — parsed value or unknown, never guessed.
  let fee: number | null = null;
  let feeKnown = false;
  if (isFiniteNum(tender.fee) && tender.fee >= 0) {
    fee = tender.fee;
    feeKnown = true;
  } else {
    unknowns.push(`tender fee ${UNKNOWN_NOTE} — needs confirmation from the full tender document`);
  }

  // Estimated value — parsed value + band, or unknown.
  let estValue: number | null = null;
  let estValueKnown = false;
  let estBand: string | null = null;
  if (isFiniteNum(tender.estValue) && tender.estValue >= 0) {
    estValue = tender.estValue;
    estValueKnown = true;
    const band = estimateBand(tender.estValue);
    estBand = band.known ? band.value.label : null;
  } else {
    unknowns.push(`estimated value ${UNKNOWN_NOTE} — needs confirmation from the full tender document`);
  }

  // Days to close — computed from the closing date, never by the model.
  const dtc = daysToClose(tender.closeAt, now);
  let daysToCloseVal = 0;
  let daysKnown = false;
  if (dtc.known) {
    daysToCloseVal = dtc.value;
    daysKnown = true;
  } else {
    unknowns.push(`days to close: ${(dtc as { known: false; reason: string }).reason} — needs confirmation`);
  }

  return {
    emd,
    emdExempt: ex.exempt,
    emdNote,
    fee,
    estValue,
    estBand,
    daysToClose: daysToCloseVal,
    known: { emd: emdKnown, fee: feeKnown, estValue: estValueKnown, daysToClose: daysKnown },
    unknowns,
  };
}
