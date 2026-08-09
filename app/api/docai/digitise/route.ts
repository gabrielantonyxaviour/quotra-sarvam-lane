// Quotra app/api/docai/digitise — server-side proxy for Sarvam Doc AI.
//
// WHY THIS EXISTS: /playground/docai originally called lib/docai/sarvam.ts's
// digestTenderPdf() directly from the browser, mirroring how /playground/
// voice calls STT/TTS/Chat/Translate directly (those all support browser
// CORS — proven live). Doc AI does NOT: live testing showed the browser's
// CORS preflight (OPTIONS) to https://api.sarvam.ai/doc-ai/v1/job/digitise
// returns 204 but never allows the actual POST through — the request never
// leaves the browser, surfacing only as an opaque "Failed to fetch". Sarvam's
// other endpoints support real-time client-side use (voice apps need direct
// mic-to-browser calls); Doc AI's own quickstart only shows SDK/cURL
// examples, consistent with it being built for server-side use only.
//
// Fix: route through our own server. Browser -> same-origin API route has no
// CORS restriction; this route -> api.sarvam.ai is a normal server-to-server
// call, where CORS (a browser-only mechanism) doesn't apply at all.
//
// The API key travels in the request body (`apiKey` field) rather than
// relying on a server-side env var — this app is BYOK (key saved in the
// browser's localStorage only), so the Next.js server process has no
// guaranteed access to it otherwise.

import { NextResponse } from "next/server";
import { digestTenderPdf, DocAiMissingKeyError } from "@/lib/docai/sarvam";

export const runtime = "nodejs"; // needs Buffer-free but Node-friendly fetch/FormData; jszip works here too
export const maxDuration = 120; // digitise jobs can take up to ~2 minutes (see lib/docai/sarvam.ts's poll timeout)

export async function POST(req: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Request body must be multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const language = form.get("language");
  const apiKey = form.get("apiKey");

  if (!(file instanceof Blob)) return NextResponse.json({ error: "Missing or invalid 'file' field" }, { status: 400 });
  if (typeof apiKey !== "string" || !apiKey.trim()) return NextResponse.json({ error: "Missing 'apiKey' field" }, { status: 400 });

  try {
    const result = await digestTenderPdf(file, {
      filename: file instanceof File ? file.name : "document.pdf",
      language: typeof language === "string" && language ? language : "en-IN",
      apiKey: apiKey.trim(),
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DocAiMissingKeyError) return NextResponse.json({ error: e.message }, { status: 401 });
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
