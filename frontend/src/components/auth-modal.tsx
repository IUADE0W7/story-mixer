"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AuthModalProps = {
  onAuthenticated: (token: string) => void;
};

type Mode = "login" | "register";

export function AuthModal({ onAuthenticated }: AuthModalProps) {
  const [mode, setMode]         = useState<Mode>("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint =
      mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";

    try {
      const resp = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });

      if (resp.status === 409) { setError("Email already registered. Try logging in."); return; }
      if (resp.status === 401) { setError("Invalid email or password."); return; }
      if (!resp.ok)            { setError("Something went wrong. Please try again."); return; }

      const data = await resp.json();
      localStorage.setItem("lf_token", data.access_token);
      onAuthenticated(data.access_token);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="w-full max-w-sm rounded-xl p-6 space-y-4"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
      >
        <h2
          id="auth-modal-title"
          className="text-lg font-semibold"
          style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}
        >
          {mode === "login" ? "Sign In" : "Create Account"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={mode === "register" ? 8 : undefined}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: "var(--error, #f87171)" }} role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "…" : mode === "login" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <p className="text-xs text-center" style={{ color: "var(--cream-muted)" }}>
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <button
            type="button"
            className="underline"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
          >
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
