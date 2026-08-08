// Quotra blk_tender_data — tender-intelligence domain types + runtime validators.
// Client-only. No server code, no external deps. Validators return a list of
// human-readable problems; an empty list means the value conforms.

/* ---------- Company (the MSME brain seed) ---------- */

export type CompanyCert = {
  kind: string; // e.g. "ISO 9001:2015", "RoHS", "ZED"
  issuer?: string | null;
  certNumber?: string | null;
  validUntil: string | null; // ISO date; null when the source data has no validity date
  validityNote?: string; // why validUntil is null, or extra provenance
  status: "verified" | "stated"; // verified = certificate copy on file; stated = claimed, unseen
};

export type Company = {
  name: string;
  legalName?: string | null;
  gstin: string | null; // null = not present in the received records (never invent)
  city: string;
  phone: string | null;
  logo: string | null;
  leadWeeks: number | null;
  categories: string[];
  udyamRegistered: boolean;
  udyamNumber?: string | null;
  certs: CompanyCert[];
  turnoverByFY: Record<string, number>; // { "FY2022-23": 217103688 } — rupees
  address?: string | null;
  website?: string | null;
  notes?: string[]; // provenance / known gaps
};

/* ---------- Product (57-product master + datasheet capabilities) ---------- */

export type ProductCapabilities = {
  zones?: number | null;
  channels?: number | null;
  voltages?: string[]; // e.g. ["230VAC"], ["12VDC"]
  protocols?: string[]; // e.g. ["WiFi","GSM/GPRS","Ethernet","LoRA","Modbus"]
  battery?: string | null;
  certifications?: string[];
  compatibilities?: string[]; // e.g. ["Mobile App","CMMS","Fiot App"]
  notes?: string[]; // needs-confirmation markers live here — never invented specs
};

export type BrainProduct = {
  id: string;
  name: string;
  model: string | null; // null only for the panel lines that have no model in the source
  price: number | null; // from the real 2023-24 price list where the model appears
  hasDatasheet: boolean;
  domains: string[]; // e.g. ["e-surveillance"], ["iot"], ["marine electronics"]
  capabilities: ProductCapabilities; // extracted from real names/descriptions/datasheet files
};

/* ---------- Experience (digested from the real order book) ---------- */

export type ExperienceRecord = {
  buyer: string;
  productFamily: string;
  value: number; // rupees, summed from real PO lines (unit_price × qty_dwo)
  fy: string; // e.g. "FY2024-25"
  completionEvidence: string[]; // real PO / WO refs backing this record
  lineCount: number; // how many source PO lines were digested into this record
};

/* ---------- Tender (captured from CPPP / GeM) ---------- */

export type TenderPortal = "CPPP" | "GeM";

export type TenderDoc = { name: string; url: string };

export type Tender = {
  id: string; // stable internal id: portal + ref slug
  portal: TenderPortal;
  ref: string; // the authority's own reference / bid number
  title: string;
  org: string;
  category: string; // RAX category the tender matched (see RAX_CATEGORIES)
  estValue: number | null; // null = not exposed without login/captcha
  emd: number | null;
  fee: number | null;
  closeAt: string; // ISO
  publishedAt: string; // ISO
  fetchedAt: string; // ISO — when Quotra captured it
  sourceUrl: string; // real, verifiable URL on the source portal
  rawText: string; // the listing text as captured (~first 2000 chars when longer)
  fullTextAvailable: boolean; // false = listing-level capture only, full tender doc not fetched
  docs: TenderDoc[];
};

/* ---------- Verdict (GO / NO-GO / FIXABLE) ---------- */

export type VerdictKind = "GO" | "NO-GO" | "FIXABLE";

export type VerdictReason = { clause: string; page: number | null; text: string };

export type VerdictMoney = {
  emd: number | null;
  emdExempt: boolean; // Udyam-registered MSME → EMD exemption claimed
  fee: number | null;
  estValue: number | null;
  daysToClose: number; // computed in code, never by the model
};

export type Verdict = {
  tenderId: string;
  verdict: VerdictKind;
  reasons: VerdictReason[];
  money: VerdictMoney;
  computedAt: string;
  transcriptId: string | null;
};

/* ---------- Eligibility matrix ---------- */

export type EligibilityStatus = "have" | "missing" | "ambiguous";

export type EligibilityRow = {
  requirement: string;
  clause: string;
  status: EligibilityStatus;
  evidenceDocId: string | null; // VaultDoc.id when status === "have"
  howToGet: string | null; // remediation path when missing/ambiguous
};

export type EligibilityMatrix = {
  tenderId: string;
  rows: EligibilityRow[];
};

/* ---------- Document vault ---------- */

export type VaultDoc = {
  id: string;
  kind: string; // e.g. "udyam", "gst", "iso", "experience", "datasheet"
  filename: string;
  uploadedAt: string;
  expiresAt: string | null;
};

/* ---------- Bid pack ---------- */

export type BidPackDoc = { name: string; ready: boolean; sourceDocId: string | null };
export type BidPackComplianceRow = { spec: string; citation: string };

export type BidPack = {
  tenderId: string;
  docs: BidPackDoc[];
  complianceRows: BidPackComplianceRow[];
  generatedAt: string;
};

/* ---------- Transcript (Ask-Quotra conversation record) ---------- */

export type TranscriptMessage = { role: "user" | "assistant"; text: string; at: string };

export type Transcript = {
  id: string;
  tenderId: string | null; // null = general brain conversation
  createdAt: string; // ISO
  messages: TranscriptMessage[];
};

/* ---------- Validation result ---------- */

export type Validation = { ok: boolean; errors: string[] };
const result = (errors: string[]): Validation => ({ ok: errors.length === 0, errors });

/* ---------- RAX category keywords (capture filter + category check) ---------- */

export const RAX_CATEGORIES: { name: string; keywords: string[] }[] = [
  { name: "CCTV & Surveillance", keywords: ["cctv", "surveillance", "video analytics", "security camera", "ip camera", "ptz camera", "thermal camera", "nvr", "dvr"] },
  { name: "Alarm Panels", keywords: ["alarm panel", "alarm automation", "intrusion alarm", "burglar alarm", "automation panel"] },
  { name: "Fire Alarm", keywords: ["fire alarm", "fire detection"] },
  { name: "Access Control", keywords: ["access control", "biometric access", "door access"] },
  { name: "Industrial Lighting & LED", keywords: ["industrial lighting", "led", "led light", "led lighting", "street light", "high mast", "luminaire", "led luminaire", "floodlight"] },
  { name: "IoT & Sensors", keywords: ["iot", "sensor", "remote monitoring", "scada"] },
];

export const RAX_CATEGORY_KEYWORDS: string[] = RAX_CATEGORIES.flatMap((c) => c.keywords);

/**
 * Word-boundary keyword match with optional plural "s" — "led" must not match
 * "installed", "iot" must not match "biotin", but "street lights" must match
 * "street light". MUST stay behavior-identical with the classifier in
 * scripts/capture-tenders.mjs (the acceptance check re-derives categories).
 */
export function keywordMatches(text: string, keyword: string): boolean {
  const re = new RegExp(`\\b${keyword.replace(/\s+/g, "\\s+")}s?\\b`, "i");
  return re.test(text);
}

/** Classify free text into the first matching RAX category, else null. */
export function classifyCategory(text: string): string | null {
  for (const c of RAX_CATEGORIES) {
    if (c.keywords.some((k) => keywordMatches(text, k))) return c.name;
  }
  return null;
}

/* ---------- Runtime validators ---------- */

const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isNumOrNull = (x: unknown): x is number | null => x === null || isNum(x);
const isStrOrNull = (x: unknown): x is string | null => x === null || typeof x === "string";
const isBool = (x: unknown): x is boolean => typeof x === "boolean";
const isIsoDate = (x: unknown): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x));
const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

export function validateCompany(c: unknown): Validation {
  const p: string[] = [];
  if (typeof c !== "object" || c === null) return result(["company: not an object"]);
  const o = c as Record<string, unknown>;
  if (!isStr(o.name)) p.push("company.name: missing");
  if (!isStrOrNull(o.gstin)) p.push("company.gstin: must be string|null");
  if (!isStr(o.city)) p.push("company.city: missing");
  if (!isStrOrNull(o.phone)) p.push("company.phone: must be string|null");
  if (!isStrOrNull(o.logo)) p.push("company.logo: must be string|null");
  if (!(o.leadWeeks === null || isNum(o.leadWeeks))) p.push("company.leadWeeks: must be number|null");
  if (!isStrArr(o.categories) || o.categories.length === 0) p.push("company.categories: need ≥1");
  if (!isBool(o.udyamRegistered)) p.push("company.udyamRegistered: must be boolean");
  if (!Array.isArray(o.certs)) p.push("company.certs: not an array");
  else
    o.certs.forEach((cert, i) => {
      const k = cert as Record<string, unknown>;
      if (!isStr(k.kind)) p.push(`company.certs[${i}].kind: missing`);
      if (!isStrOrNull(k.validUntil)) p.push(`company.certs[${i}].validUntil: must be string|null`);
      if (k.validUntil !== null && !isIsoDate(k.validUntil)) p.push(`company.certs[${i}].validUntil: not a date`);
      if (k.validUntil === null && !isStr(k.validityNote))
        p.push(`company.certs[${i}]: validity date absent without a note`);
      if (k.status !== "verified" && k.status !== "stated") p.push(`company.certs[${i}].status: bad value`);
    });
  if (typeof o.turnoverByFY !== "object" || o.turnoverByFY === null || Object.keys(o.turnoverByFY).length === 0)
    p.push("company.turnoverByFY: missing/empty");
  else
    for (const [fy, v] of Object.entries(o.turnoverByFY as Record<string, unknown>)) {
      if (!/^FY\d{4}-\d{2}$/.test(fy)) p.push(`company.turnoverByFY key "${fy}": want FYxxxx-xx`);
      if (!isNum(v) || v <= 0) p.push(`company.turnoverByFY["${fy}"]: not a positive number`);
    }
  return result(p);
}

export function validateProduct(x: unknown): Validation {
  const p: string[] = [];
  if (typeof x !== "object" || x === null) return result(["product: not an object"]);
  const o = x as Record<string, unknown>;
  if (!isStr(o.id)) p.push("product.id: missing");
  if (!isStr(o.name)) p.push("product.name: missing");
  if (!isStrOrNull(o.model)) p.push("product.model: must be string|null");
  if (!isNumOrNull(o.price)) p.push("product.price: must be number|null");
  if (!isBool(o.hasDatasheet)) p.push("product.hasDatasheet: must be boolean");
  if (!isStrArr(o.domains) || o.domains.length === 0) p.push("product.domains: need ≥1");
  if (typeof o.capabilities !== "object" || o.capabilities === null || Array.isArray(o.capabilities))
    p.push("product.capabilities: not an object");
  else {
    const cap = o.capabilities as Record<string, unknown>;
    const nonEmpty = Object.values(cap).some(
      (v) => (Array.isArray(v) && v.length > 0) || (typeof v === "number" && v > 0) || (typeof v === "string" && v.length > 0)
    );
    if (!nonEmpty) p.push("product.capabilities: empty object — needs at least one real extracted spec or a note");
    if (cap.zones !== undefined && cap.zones !== null && !isNum(cap.zones)) p.push("product.capabilities.zones: bad type");
    if (cap.voltages !== undefined && !isStrArr(cap.voltages)) p.push("product.capabilities.voltages: bad type");
    if (cap.protocols !== undefined && !isStrArr(cap.protocols)) p.push("product.capabilities.protocols: bad type");
    if (cap.certifications !== undefined && !isStrArr(cap.certifications)) p.push("product.capabilities.certifications: bad type");
    if (cap.compatibilities !== undefined && !isStrArr(cap.compatibilities)) p.push("product.capabilities.compatibilities: bad type");
  }
  return result(p);
}

export function validateExperience(x: unknown): Validation {
  const p: string[] = [];
  if (typeof x !== "object" || x === null) return result(["experience: not an object"]);
  const o = x as Record<string, unknown>;
  if (!isStr(o.buyer)) p.push("experience.buyer: missing");
  if (!isStr(o.productFamily)) p.push("experience.productFamily: missing");
  if (!isNum(o.value) || o.value < 0) p.push("experience.value: bad");
  if (!isStr(o.fy) || !/^FY\d{4}-\d{2}$/.test(o.fy)) p.push("experience.fy: want FYxxxx-xx");
  if (!isStrArr(o.completionEvidence) || o.completionEvidence.length === 0)
    p.push("experience.completionEvidence: need ≥1 PO ref");
  if (!isNum(o.lineCount) || o.lineCount < 1) p.push("experience.lineCount: bad");
  return result(p);
}

export function validateTender(t: unknown): Validation {
  const p: string[] = [];
  if (typeof t !== "object" || t === null) return result(["tender: not an object"]);
  const o = t as Record<string, unknown>;
  if (!isStr(o.id)) p.push("tender.id: missing");
  if (o.portal !== "CPPP" && o.portal !== "GeM") p.push("tender.portal: want CPPP|GeM");
  if (!isStr(o.ref)) p.push("tender.ref: missing");
  if (!isStr(o.title)) p.push("tender.title: missing");
  if (!isStr(o.org)) p.push("tender.org: missing");
  if (!isStr(o.category)) p.push("tender.category: missing");
  if (!isNumOrNull(o.estValue)) p.push("tender.estValue: must be number|null");
  if (!isNumOrNull(o.emd)) p.push("tender.emd: must be number|null");
  if (!isNumOrNull(o.fee)) p.push("tender.fee: must be number|null");
  if (!isIsoDate(o.closeAt)) p.push("tender.closeAt: not an ISO date");
  if (!isIsoDate(o.publishedAt)) p.push("tender.publishedAt: not an ISO date");
  if (!isIsoDate(o.fetchedAt)) p.push("tender.fetchedAt: not an ISO date");
  if (!isStr(o.sourceUrl) || !/^https?:\/\//.test(o.sourceUrl)) p.push("tender.sourceUrl: not http(s)");
  if (!isStr(o.rawText)) p.push("tender.rawText: empty");
  if (!isBool(o.fullTextAvailable)) p.push("tender.fullTextAvailable: must be boolean");
  if (!Array.isArray(o.docs)) p.push("tender.docs: not an array");
  else
    o.docs.forEach((d, i) => {
      const doc = d as Record<string, unknown>;
      if (!isStr(doc.name)) p.push(`tender.docs[${i}].name: missing`);
      if (!isStr(doc.url) || !/^https?:\/\//.test(doc.url)) p.push(`tender.docs[${i}].url: not http(s)`);
    });
  return result(p);
}

export function validateVerdict(v: unknown): Validation {
  const p: string[] = [];
  if (typeof v !== "object" || v === null) return result(["verdict: not an object"]);
  const o = v as Record<string, unknown>;
  if (!isStr(o.tenderId)) p.push("verdict.tenderId: missing");
  if (o.verdict !== "GO" && o.verdict !== "NO-GO" && o.verdict !== "FIXABLE") p.push("verdict.verdict: bad value");
  if (!Array.isArray(o.reasons)) p.push("verdict.reasons: not an array");
  else
    o.reasons.forEach((r, i) => {
      const rr = r as Record<string, unknown>;
      if (!isStr(rr.clause)) p.push(`verdict.reasons[${i}].clause: missing`);
      if (!(rr.page === null || isNum(rr.page))) p.push(`verdict.reasons[${i}].page: bad`);
      if (!isStr(rr.text)) p.push(`verdict.reasons[${i}].text: missing`);
    });
  if (typeof o.money !== "object" || o.money === null) p.push("verdict.money: missing");
  else {
    const m = o.money as Record<string, unknown>;
    if (!isNumOrNull(m.emd)) p.push("verdict.money.emd: bad");
    if (!isBool(m.emdExempt)) p.push("verdict.money.emdExempt: bad");
    if (!isNumOrNull(m.fee)) p.push("verdict.money.fee: bad");
    if (!isNumOrNull(m.estValue)) p.push("verdict.money.estValue: bad");
    if (!isNum(m.daysToClose)) p.push("verdict.money.daysToClose: bad");
  }
  if (!isIsoDate(o.computedAt)) p.push("verdict.computedAt: not an ISO date");
  if (!isStrOrNull(o.transcriptId)) p.push("verdict.transcriptId: bad");
  return result(p);
}

export function validateMatrix(m: unknown): Validation {
  const p: string[] = [];
  if (typeof m !== "object" || m === null) return result(["matrix: not an object"]);
  const o = m as Record<string, unknown>;
  if (!isStr(o.tenderId)) p.push("matrix.tenderId: missing");
  if (!Array.isArray(o.rows)) p.push("matrix.rows: not an array");
  else
    o.rows.forEach((r, i) => {
      const rr = r as Record<string, unknown>;
      if (!isStr(rr.requirement)) p.push(`matrix.rows[${i}].requirement: missing`);
      if (!isStr(rr.clause)) p.push(`matrix.rows[${i}].clause: missing`);
      if (rr.status !== "have" && rr.status !== "missing" && rr.status !== "ambiguous")
        p.push(`matrix.rows[${i}].status: bad value`);
      if (!isStrOrNull(rr.evidenceDocId)) p.push(`matrix.rows[${i}].evidenceDocId: bad`);
      if (!isStrOrNull(rr.howToGet)) p.push(`matrix.rows[${i}].howToGet: bad`);
    });
  return result(p);
}

export function validateVaultDoc(d: unknown): Validation {
  const p: string[] = [];
  if (typeof d !== "object" || d === null) return result(["vaultdoc: not an object"]);
  const o = d as Record<string, unknown>;
  if (!isStr(o.id)) p.push("vaultdoc.id: missing");
  if (!isStr(o.kind)) p.push("vaultdoc.kind: missing");
  if (!isStr(o.filename)) p.push("vaultdoc.filename: missing");
  if (!isIsoDate(o.uploadedAt)) p.push("vaultdoc.uploadedAt: not an ISO date");
  if (!(o.expiresAt === null || isIsoDate(o.expiresAt))) p.push("vaultdoc.expiresAt: bad");
  return result(p);
}

export function validateBidPack(b: unknown): Validation {
  const p: string[] = [];
  if (typeof b !== "object" || b === null) return result(["bidpack: not an object"]);
  const o = b as Record<string, unknown>;
  if (!isStr(o.tenderId)) p.push("bidpack.tenderId: missing");
  if (!Array.isArray(o.docs)) p.push("bidpack.docs: not an array");
  else
    o.docs.forEach((d, i) => {
      const dd = d as Record<string, unknown>;
      if (!isStr(dd.name)) p.push(`bidpack.docs[${i}].name: missing`);
      if (!isBool(dd.ready)) p.push(`bidpack.docs[${i}].ready: bad`);
      if (!isStrOrNull(dd.sourceDocId)) p.push(`bidpack.docs[${i}].sourceDocId: bad`);
    });
  if (!Array.isArray(o.complianceRows)) p.push("bidpack.complianceRows: not an array");
  else
    o.complianceRows.forEach((r, i) => {
      const rr = r as Record<string, unknown>;
      if (!isStr(rr.spec)) p.push(`bidpack.complianceRows[${i}].spec: missing`);
      if (!isStr(rr.citation)) p.push(`bidpack.complianceRows[${i}].citation: missing`);
    });
  if (!isIsoDate(o.generatedAt)) p.push("bidpack.generatedAt: not an ISO date");
  return result(p);
}

/** The seed's product entity is named BrainProduct; Product is the spec-facing alias. */
export type Product = BrainProduct;

export function validateTranscript(t: unknown): Validation {
  const p: string[] = [];
  if (typeof t !== "object" || t === null) return result(["transcript: not an object"]);
  const o = t as Record<string, unknown>;
  if (!isStr(o.id)) p.push("transcript.id: missing");
  if (!isStrOrNull(o.tenderId)) p.push("transcript.tenderId: must be string|null");
  if (!isIsoDate(o.createdAt)) p.push("transcript.createdAt: not an ISO date");
  if (!Array.isArray(o.messages)) p.push("transcript.messages: not an array");
  else
    o.messages.forEach((m, i) => {
      const mm = m as Record<string, unknown>;
      if (mm.role !== "user" && mm.role !== "assistant") p.push(`transcript.messages[${i}].role: bad value`);
      if (!isStr(mm.text)) p.push(`transcript.messages[${i}].text: missing`);
      if (!isIsoDate(mm.at)) p.push(`transcript.messages[${i}].at: not an ISO date`);
    });
  return result(p);
}
