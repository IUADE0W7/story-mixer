"use client";
import { useEffect } from "react";

/**
 * Small client-side listener to recover from Next.js chunk load failures.
 * On ChunkLoadError we force a full reload so the browser fetches latest assets.
 */
export default function ErrorReload() {
  useEffect(() => {
    function onError(e: Event | ErrorEvent) {
      const err = e as ErrorEvent;
      const message = err?.error?.message || (err.message as string) || "";
      const name = err?.error?.name || (err as any).name || "";
      if (message.includes("Loading chunk") || name === "ChunkLoadError") {
        // Attempt a single reload to recover from mismatched asset versions.
        // Using replace to avoid polluting history if reload is triggered repeatedly.
        window.location.replace(window.location.href);
      }
    }

    window.addEventListener("error", onError as EventListener);
    return () => window.removeEventListener("error", onError as EventListener);
  }, []);

  return null;
}
