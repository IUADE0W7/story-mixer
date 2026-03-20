import { describe, expect, it } from "vitest";
import { buildLongFormRequest, parseSseChunk } from "../story-streaming";
import type { VibeValues } from "../vibe-bands";

const BASE_VIBE: VibeValues = { aggression: 5, readerRespect: 6, morality: 5, sourceFidelity: 7 };
const BASE_DRAFT = { values: BASE_VIBE };

// ---------------------------------------------------------------------------
// buildLongFormRequest — language in REST payload
// ---------------------------------------------------------------------------

describe("buildLongFormRequest — language field in REST payload", () => {
  it("includes language='en' when English is selected", () => {
    const payload = buildLongFormRequest({ ...BASE_DRAFT, language: "en" }, 4, 400);
    expect(payload.context.language).toBe("en");
  });

  it("includes language='uk' when Ukrainian is selected", () => {
    const payload = buildLongFormRequest({ ...BASE_DRAFT, language: "uk" }, 4, 400);
    expect(payload.context.language).toBe("uk");
  });

  it("defaults language to 'en' when language is omitted", () => {
    const payload = buildLongFormRequest(BASE_DRAFT, 4, 400);
    expect(payload.context.language).toBe("en");
  });

  it("defaults language to 'en' when language is undefined", () => {
    const payload = buildLongFormRequest({ ...BASE_DRAFT, language: undefined }, 4, 400);
    expect(payload.context.language).toBe("en");
  });

  it("includes language='ua' when ua code is provided", () => {
    const payload = buildLongFormRequest({ ...BASE_DRAFT, language: "ua" }, 4, 400);
    expect(payload.context.language).toBe("ua");
  });
});

// ---------------------------------------------------------------------------
// buildLongFormRequest — default Ukrainian prompt when no userPrompt is given
// ---------------------------------------------------------------------------

describe("buildLongFormRequest — default prompt content", () => {
  it("generates a Ukrainian default prompt when language='uk' and no userPrompt", () => {
    const payload = buildLongFormRequest({ ...BASE_DRAFT, language: "uk" }, 4, 400);
    // The default prompt for Ukrainian should contain Cyrillic characters
    expect(payload.context.user_prompt).toMatch(/[А-Яа-яІіЇїЄєҐґ]/);
  });

  it("generates an English default prompt when language='en' and no userPrompt", () => {
    const payload = buildLongFormRequest({ ...BASE_DRAFT, language: "en" }, 4, 400);
    expect(payload.context.user_prompt).not.toMatch(/[А-Яа-яІіЇїЄєҐґ]/);
  });

  it("uses the provided userPrompt over the default prompt", () => {
    const custom = "Write a story about a storm.";
    const payload = buildLongFormRequest({ ...BASE_DRAFT, language: "uk", userPrompt: custom }, 4, 400);
    expect(payload.context.user_prompt).toBe(custom);
  });

  it("trims whitespace from userPrompt", () => {
    const payload = buildLongFormRequest({
      ...BASE_DRAFT,
      userPrompt: "  Custom prompt.  ",
    }, 4, 400);
    expect(payload.context.user_prompt).toBe("Custom prompt.");
  });

  it("falls back to default prompt when userPrompt is only whitespace", () => {
    const payload = buildLongFormRequest({ ...BASE_DRAFT, userPrompt: "   " }, 4, 400);
    expect(payload.context.user_prompt.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildLongFormRequest — vibe values are forwarded correctly
// ---------------------------------------------------------------------------

describe("buildLongFormRequest — vibe forwarding", () => {
  it("maps camelCase readerRespect to snake_case reader_respect in payload", () => {
    const payload = buildLongFormRequest({ values: { aggression: 3, readerRespect: 8, morality: 4, sourceFidelity: 7 } }, 4, 400);
    expect(payload.vibe.reader_respect).toBe(8);
    expect(payload.vibe.aggression).toBe(3);
    expect(payload.vibe.morality).toBe(4);
    expect(payload.vibe.source_fidelity).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// buildLongFormRequest — chapter settings
// ---------------------------------------------------------------------------

describe("buildLongFormRequest — chapter settings", () => {
  it("forwards chapterCount and chapterWordTarget", () => {
    const payload = buildLongFormRequest(BASE_DRAFT, 3, 300);
    expect(payload.chapter_count).toBe(3);
    expect(payload.chapter_word_target).toBe(300);
  });

  it("always sets stream: true", () => {
    const payload = buildLongFormRequest(BASE_DRAFT, 4, 400);
    expect(payload.stream).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseSseChunk
// ---------------------------------------------------------------------------

describe("parseSseChunk", () => {
  it("parses a token event frame", () => {
    const raw = 'event: token\ndata: {"text": "Hello"}';
    const frame = parseSseChunk(raw);
    expect(frame?.event).toBe("token");
    expect(frame?.payload).toEqual({ text: "Hello" });
  });

  it("parses a complete event frame", () => {
    const raw = 'event: complete\ndata: {"content": "Full story.", "story_id": "abc"}';
    const frame = parseSseChunk(raw);
    expect(frame?.event).toBe("complete");
    expect(frame?.payload.content).toBe("Full story.");
  });

  it("parses a status event frame", () => {
    const raw = 'event: status\ndata: {"message": "starting_generation"}';
    const frame = parseSseChunk(raw);
    expect(frame?.event).toBe("status");
    expect(frame?.payload.message).toBe("starting_generation");
  });

  it("parses a log event frame with all required fields", () => {
    const raw =
      'event: log\ndata: {"from": "Orchestrator", "to": "LLM", "message": "Streaming initial draft", "level": "info"}';
    const frame = parseSseChunk(raw);
    expect(frame?.event).toBe("log");
    expect(frame?.payload.from).toBe("Orchestrator");
    expect(frame?.payload.to).toBe("LLM");
    expect(frame?.payload.message).toBe("Streaming initial draft");
    expect(frame?.payload.level).toBe("info");
  });

  it("parses a log event frame with warning level", () => {
    const raw =
      'event: log\ndata: {"from": "Orchestrator", "to": "LLM", "message": "Chapter write slow", "level": "warning"}';
    const frame = parseSseChunk(raw);
    expect(frame?.event).toBe("log");
    expect(frame?.payload.level).toBe("warning");
  });

  it("parses a log event frame for outline agent", () => {
    const raw =
      'event: log\ndata: {"from": "OutlineAgent", "to": "Orchestrator", "message": "Outline ready: 4 chapters", "level": "info"}';
    const frame = parseSseChunk(raw);
    expect(frame?.event).toBe("log");
    expect(frame?.payload.from).toBe("OutlineAgent");
    expect(frame?.payload.message).toBe("Outline ready: 4 chapters");
  });

  it("returns null for an empty string", () => {
    expect(parseSseChunk("")).toBeNull();
  });

  it("returns event with empty payload when data line is missing", () => {
    const raw = "event: status";
    const frame = parseSseChunk(raw);
    expect(frame?.event).toBe("status");
    expect(frame?.payload).toEqual({});
  });

  it("handles CRLF line endings", () => {
    const raw = "event: token\r\ndata: {\"text\": \"Hi\"}";
    const frame = parseSseChunk(raw);
    expect(frame?.event).toBe("token");
    expect(frame?.payload.text).toBe("Hi");
  });
});
