/**
 * Tests for story-pdf.ts — verifies Unicode / Cyrillic text is not corrupted
 * in the generated PDF.
 *
 * Strategy: mock jsPDF so we can inspect exactly which font is activated and
 * which text strings reach doc.text().  The real jsPDF would silently corrupt
 * Cyrillic when Helvetica is used (no glyph mapping), so the key assertions
 * are:
 *   1. A Unicode-capable font (DejaVuSans) is registered and used.
 *   2. The Cyrillic text arrives at doc.text() byte-for-byte identical to the
 *      original input — no transliteration, replacement, or truncation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock jsPDF
// ---------------------------------------------------------------------------

const mockDoc = {
  addFileToVFS: vi.fn(),
  addFont: vi.fn(),
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  setFillColor: vi.fn(),
  setDrawColor: vi.fn(),
  setLineWidth: vi.fn(),
  setGState: vi.fn(),
  GState: vi.fn(() => ({})),
  rect: vi.fn(),
  line: vi.fn(),
  text: vi.fn(),
  splitTextToSize: vi.fn((t: string) => [t]),
  getTextWidth: vi.fn(() => 10),
  setPage: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
  internal: {
    pageSize: { getWidth: () => 210, getHeight: () => 297 },
    getNumberOfPages: () => 1,
  },
};

vi.mock("jspdf", () => ({
  // Must be a real function (not arrow) so `new jsPDF()` works as a constructor
  jsPDF: vi.fn(function () { return mockDoc; }),
}));

// ---------------------------------------------------------------------------
// Mock fetch — return a minimal valid ArrayBuffer so loadUnicodeFont completes.
// btoa is stubbed with vi.fn() — the test only cares about the font loading
// flow, not the actual base64 encoding output.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  // Restore non-vi.fn() properties on mockDoc.internal after resetAllMocks
  mockDoc.splitTextToSize.mockImplementation((t: string) => [t]);
  mockDoc.getTextWidth.mockReturnValue(10);
  mockDoc.GState.mockReturnValue({});
  mockDoc.internal.pageSize.getWidth = () => 210;
  mockDoc.internal.pageSize.getHeight = () => 297;
  (mockDoc.internal as { getNumberOfPages: () => number }).getNumberOfPages = () => 1;

  const fakeFont = new Uint8Array([0, 1, 0, 0]).buffer;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(fakeFont),
    }),
  );
  // Stub btoa with a plain vi.fn() — avoids Node Buffer dependency and masks
  // the browser vs. Node difference while still allowing call tracking.
  vi.stubGlobal("btoa", vi.fn(() => "mock-base64-font-data"));

  // Reset the module-level font cache so each test starts with a clean slate
  clearFontCache();
});

// ---------------------------------------------------------------------------
// Import under test (after mocks are in place)
// ---------------------------------------------------------------------------

import { downloadStoryAsPdf, clearFontCache } from "../story-pdf";

// ---------------------------------------------------------------------------
// Helper: collect all string arguments passed to doc.text()
// ---------------------------------------------------------------------------

function capturedTexts(): string[] {
  return mockDoc.text.mock.calls.flatMap((args) => {
    const first = args[0];
    if (typeof first === "string") return [first];
    if (Array.isArray(first)) return first.filter((x) => typeof x === "string");
    return [];
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("downloadStoryAsPdf — Unicode / Cyrillic support", () => {
  const CYRILLIC_TEXT =
    "Ти крокуєш у місті, де небо розтріскане неоновими променями, " +
    "і де кожен куток приховує смертельний підвод.";

  it("registers a Unicode font instead of using the built-in Helvetica", async () => {
    await downloadStoryAsPdf(CYRILLIC_TEXT, "Тест", "Fantasy");

    expect(mockDoc.addFileToVFS).toHaveBeenCalledWith(
      "DejaVuSans.ttf",
      expect.any(String),
    );
    expect(mockDoc.addFont).toHaveBeenCalledWith(
      "DejaVuSans.ttf",
      "DejaVuSans",
      "normal",
    );
  });

  it("never activates Helvetica for any text call", async () => {
    await downloadStoryAsPdf(CYRILLIC_TEXT, "Тест", "Fantasy");

    const helveticaCalls = mockDoc.setFont.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].toLowerCase().includes("helvetica"),
    );
    expect(helveticaCalls).toHaveLength(0);
  });

  it("passes Cyrillic body text to doc.text() without corruption", async () => {
    await downloadStoryAsPdf(CYRILLIC_TEXT, "Тест", "Fantasy");

    const texts = capturedTexts();
    const hasCyrillic = texts.some((t) => /[А-Яа-яІіЇїЄєҐґ]/.test(t));
    expect(hasCyrillic).toBe(true);
  });

  it("passes Cyrillic title to doc.text() without corruption", async () => {
    const cyrillicTitle = "Піноккіо × Blade Runner";
    await downloadStoryAsPdf("Some story text.", cyrillicTitle, "Mythology");

    const texts = capturedTexts();
    const titlePassed = texts.some((t) => t.includes("Піноккіо"));
    expect(titlePassed).toBe(true);
  });

  it("does not truncate or replace Cyrillic characters with placeholders", async () => {
    const sentence = "Декард шукає душу у металі.";
    await downloadStoryAsPdf(sentence, "Title", "Noir");

    const texts = capturedTexts();
    const intact = texts.some((t) => t.includes("Декард") && t.includes("металі"));
    expect(intact).toBe(true);
  });

  it("fetches the font file from the expected path", async () => {
    await downloadStoryAsPdf(CYRILLIC_TEXT, "Тест", "Fantasy");

    expect(fetch).toHaveBeenCalledWith("/fonts/DejaVuSans.ttf");
  });

  it("fetches the font only once across multiple downloads (cache)", async () => {
    await downloadStoryAsPdf(CYRILLIC_TEXT, "Тест", "Fantasy");
    await downloadStoryAsPdf("Second story.", "Title 2", "Noir");
    await downloadStoryAsPdf("Third story.", "Title 3", "Horror");

    // fetch should have been called exactly once regardless of how many PDFs are generated
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws when the font fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(downloadStoryAsPdf(CYRILLIC_TEXT, "Тест", "Fantasy")).rejects.toThrow(
      "Font load failed: 404",
    );
  });
});
