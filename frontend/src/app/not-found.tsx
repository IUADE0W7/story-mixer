"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language-context";

export default function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <main className="grid min-h-screen place-items-center p-6 xl:p-10">
      <section className="w-full max-w-lg space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/70 p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">404</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          {t("ui.notFound.title")}
        </h1>
        <p className="text-sm leading-6 text-zinc-400">{t("ui.notFound.body")}</p>
        <div className="pt-2">
          <Link
            href="/"
            aria-label="Return to LoreForge home page"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            {t("ui.notFound.returnHome")}
          </Link>
        </div>
      </section>
    </main>
  );
}
