// Tamil dictionary — v2 Sarvam lane (T7). Partial by design: missing keys
// fall back to English (see lib/i18n/index.ts). GO / NO-GO / FIXABLE stay
// English everywhere (product's brand vocabulary). Domain nouns reps
// actually inflect in speech ("tender", "verdict", "bid pack") are written
// as Tamil-script loanwords with Tamil case endings — that's how the
// language is spoken, not laziness; acronyms (EMD) stay Latin-script.
// AI-drafted, not yet reviewed by a native speaker — see MERGE-NOTES.
export const ta: Record<string, string> = {
  "nav.tenders": "டெண்டர்கள்",
  "nav.vault": "Vault",
  "nav.brain": "Brain",
  "nav.products": "தயாரிப்புகள்",
  "nav.settings": "அமைப்புகள்",
  "verdict.go": "GO",
  "verdict.nogo": "NO-GO",
  "verdict.fixable": "FIXABLE",
  "verdict.run": "தீர்ப்பு பெறு",
  "verdict.running": "டெண்டரைப் படிக்கிறோம்…",
  "verdict.needsConfirmation": "உறுதிப்படுத்த வேண்டும்",
  "tender.closes": "முடிவு தேதி",
  "tender.emd": "EMD",
  "tender.fee": "டெண்டர் கட்டணம்",
  "tender.estValue": "மதிப்பிடப்பட்ட மதிப்பு",
  "tender.daysToClose": "நாட்கள் மீதம்",
  "eligibility.have": "உள்ளது",
  "eligibility.missing": "இல்லை",
  "eligibility.ambiguous": "தெளிவில்லை",
  "bidpack.generate": "பிட் பேக் தயாரி",
  "bidpack.ready": "தயார்",
  "ask.placeholder": "எந்த டெண்டர் பற்றியும் கேளுங்கள் — English, தமிழ், हिन्दी…",
  "ask.send": "கேள்",
};
