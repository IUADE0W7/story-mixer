import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6 xl:p-10">
      <section className="w-full max-w-lg space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/70 p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">404</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Page not found</h1>
        <p className="text-sm leading-6 text-zinc-400">
          The page you requested does not exist or may have been moved.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            aria-label="Return to LoreForge home page"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            Return Home
          </Link>
        </div>
      </section>
    </main>
  );
}
