"use client";

import { useState } from "react";

import { GoogleLogin } from "@react-oauth/google";
import * as Dialog from "@radix-ui/react-dialog";

export type AuthModalProps = {
  onAuthenticated: (token: string) => void;
};

export function AuthModal({ onAuthenticated }: AuthModalProps) {
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSuccess(credentialResponse: { credential?: string }) {
    setError(null);

    if (!credentialResponse.credential) {
      setError("Google sign-in failed. Please try again.");
      return;
    }

    try {
      const resp = await fetch("/api/v1/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });

      if (resp.status === 409) {
        setError("An account with this email already exists.");
        return;
      }
      if (!resp.ok) {
        setError("Google sign-in failed. Please try again.");
        return;
      }

      const data = (await resp.json()) as { access_token?: string };
      if (typeof data?.access_token !== "string") {
        setError("Unexpected response from server.");
        return;
      }

      localStorage.setItem("lf_token", data.access_token);
      onAuthenticated(data.access_token);
    } catch {
      setError("Network error. Please try again.");
    }
  }

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-lg p-6 shadow-xl space-y-4"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title
            className="text-lg font-semibold text-center"
            style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}
          >
            Sign In to LoreForge
          </Dialog.Title>

          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Google sign-in failed. Please try again.")}
              theme="filled_black"
              shape="rectangular"
              size="large"
            />
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: "var(--error, #f87171)" }} role="alert">
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
