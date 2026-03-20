import { describe, expect, it } from "vitest";
import { decodeEmail } from "../auth";

// A valid JWT: header.payload.signature
// Payload: { "email": "user@example.com", "user_id": "abc123" }
const VALID_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9." +
  "eyJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJ1c2VyX2lkIjoiYWJjMTIzIn0." +
  "signature";

// Payload with padding needed (length % 4 === 2, needs "==" padding)
// { "email": "test@example.com" }
const NEEDS_PADDING_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9." +
  "eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ." +
  "signature";

describe("decodeEmail", () => {
  it("extracts email from a valid JWT", () => {
    expect(decodeEmail(VALID_TOKEN)).toBe("user@example.com");
  });

  it("handles base64url payloads that need re-padding", () => {
    expect(decodeEmail(NEEDS_PADDING_TOKEN)).toBe("test@example.com");
  });

  it("returns null for a malformed token (not three segments)", () => {
    expect(decodeEmail("onlyone")).toBe(null);
  });

  it("returns null when payload has no email field", () => {
    // { "user_id": "abc" }
    const noEmail =
      "eyJhbGciOiJIUzI1NiJ9." +
      "eyJ1c2VyX2lkIjoiYWJjIn0." +
      "sig";
    expect(decodeEmail(noEmail)).toBe(null);
  });

  it("returns null when email field is not a string", () => {
    // { "email": 42 }
    const badEmail =
      "eyJhbGciOiJIUzI1NiJ9." +
      "eyJlbWFpbCI6NDJ9." +
      "sig";
    expect(decodeEmail(badEmail)).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(decodeEmail("")).toBe(null);
  });
});
