// Hindi dictionary — v2 Sarvam lane (T7). Partial by design: missing keys
// fall back to English (see lib/i18n/index.ts). GO / NO-GO / FIXABLE stay
// English everywhere (product's brand vocabulary). Domain nouns reps
// actually inflect in speech ("tender", "verdict", "bid pack") are written
// as Devanagari loanwords — that's how the language is spoken, not
// laziness; acronyms (EMD) stay Latin-script.
// AI-drafted, not yet reviewed by a native speaker — see MERGE-NOTES.
export const hi: Record<string, string> = {
  "nav.tenders": "टेंडर",
  "nav.vault": "Vault",
  "nav.brain": "Brain",
  "nav.products": "उत्पाद",
  "nav.settings": "सेटिंग्स",
  "verdict.go": "GO",
  "verdict.nogo": "NO-GO",
  "verdict.fixable": "FIXABLE",
  "verdict.run": "वर्डिक्ट देखें",
  "verdict.running": "टेंडर पढ़ा जा रहा है…",
  "verdict.needsConfirmation": "पुष्टि आवश्यक",
  "tender.closes": "अंतिम तिथि",
  "tender.emd": "EMD",
  "tender.fee": "टेंडर शुल्क",
  "tender.estValue": "अनुमानित मूल्य",
  "tender.daysToClose": "दिन शेष",
  "eligibility.have": "उपलब्ध",
  "eligibility.missing": "अनुपलब्ध",
  "eligibility.ambiguous": "स्पष्ट नहीं",
  "bidpack.generate": "बिड पैक तैयार करें",
  "bidpack.ready": "तैयार",
  "ask.placeholder": "किसी भी टेंडर के बारे में पूछें — English, தமிழ், हिन्दी…",
  "ask.send": "पूछें",
};
