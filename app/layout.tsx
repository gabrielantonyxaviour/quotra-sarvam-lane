import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quotra — Sarvam lane",
  description: "Standalone build lane for Quotra's Sarvam components",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
