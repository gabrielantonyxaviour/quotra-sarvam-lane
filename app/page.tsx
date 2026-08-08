import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Quotra — Sarvam lane</h1>
      <p className="muted" style={{ margin: "0.5rem 0 1.5rem" }}>
        Standalone build lane. Read README.md at the repo root first, then work through TASKS/.
      </p>
      <div className="card">
        <Link href="/playground/voice">→ /playground/voice</Link>
        <p className="muted">T3 deliverable: ask Quotra by voice (Saaras → Sarvam-105B → Bulbul).</p>
      </div>
    </main>
  );
}
