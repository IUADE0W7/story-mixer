/**
 * Decode the email claim from a JWT without verifying the signature.
 * Safe for display-only use — backend verifies the token on every API call.
 * Returns null on any error (malformed token, missing claim, etc.).
 */
export function decodeEmail(token: string): string | null {
  try {
    const seg = token.split(".")[1];
    if (!seg) return null;
    const padded = seg.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (seg.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as unknown;
    if (typeof payload !== "object" || payload === null) return null;
    const email = (payload as Record<string, unknown>).email;
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}
