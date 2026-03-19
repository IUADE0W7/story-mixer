import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/language-context";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Story Mixer — LoreForge",
  description: "Calibrated narrative generation. Tune the vibe, brew the story.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className="min-h-screen" style={{ background: "var(--ink)" }}>
        <Providers>
          <LanguageProvider>{children}</LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}
