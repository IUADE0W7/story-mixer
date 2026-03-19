import { jsPDF } from "jspdf";

interface GenreTheme {
  bgColor: [number, number, number];
  accentColor: [number, number, number];
  headerColor: [number, number, number];
  textColor: [number, number, number];
  borderColor: [number, number, number];
  label: string;
}

const GENRE_THEMES: Record<string, GenreTheme> = {
  "Fantasy": {
    bgColor:    [18, 10, 36],
    accentColor:[180, 130, 60],
    headerColor:[220, 180, 90],
    textColor:  [220, 210, 240],
    borderColor:[100, 60, 160],
    label: "Fantasy",
  },
  "Science Fiction": {
    bgColor:    [5, 15, 35],
    accentColor:[0, 200, 220],
    headerColor:[80, 220, 240],
    textColor:  [190, 230, 245],
    borderColor:[0, 120, 180],
    label: "Sci-Fi",
  },
  "Horror": {
    bgColor:    [8, 4, 4],
    accentColor:[160, 20, 20],
    headerColor:[200, 40, 40],
    textColor:  [210, 195, 195],
    borderColor:[100, 10, 10],
    label: "Horror",
  },
  "Noir": {
    bgColor:    [15, 15, 18],
    accentColor:[130, 130, 140],
    headerColor:[200, 200, 210],
    textColor:  [190, 185, 180],
    borderColor:[60, 60, 70],
    label: "Noir",
  },
  "Romance": {
    bgColor:    [40, 20, 30],
    accentColor:[210, 100, 130],
    headerColor:[240, 160, 180],
    textColor:  [240, 220, 225],
    borderColor:[160, 70, 100],
    label: "Romance",
  },
  "Thriller": {
    bgColor:    [12, 12, 16],
    accentColor:[180, 40, 40],
    headerColor:[220, 60, 50],
    textColor:  [210, 205, 200],
    borderColor:[100, 20, 20],
    label: "Thriller",
  },
  "Historical Fiction": {
    bgColor:    [45, 35, 20],
    accentColor:[180, 140, 70],
    headerColor:[210, 170, 100],
    textColor:  [235, 220, 195],
    borderColor:[130, 100, 50],
    label: "Historical",
  },
  "Fairy Tale": {
    bgColor:    [30, 20, 45],
    accentColor:[200, 160, 220],
    headerColor:[230, 200, 245],
    textColor:  [240, 230, 250],
    borderColor:[140, 100, 180],
    label: "Fairy Tale",
  },
  "Mystery": {
    bgColor:    [10, 18, 30],
    accentColor:[130, 110, 60],
    headerColor:[190, 160, 80],
    textColor:  [210, 205, 195],
    borderColor:[70, 80, 100],
    label: "Mystery",
  },
  "Adventure": {
    bgColor:    [15, 30, 15],
    accentColor:[100, 160, 60],
    headerColor:[140, 200, 80],
    textColor:  [215, 230, 205],
    borderColor:[50, 100, 40],
    label: "Adventure",
  },
  "Mythology": {
    bgColor:    [30, 25, 10],
    accentColor:[200, 170, 60],
    headerColor:[230, 200, 90],
    textColor:  [240, 230, 200],
    borderColor:[140, 120, 40],
    label: "Mythology",
  },
  "Speculative Fiction": {
    bgColor:    [10, 25, 35],
    accentColor:[40, 180, 180],
    headerColor:[80, 210, 200],
    textColor:  [200, 230, 235],
    borderColor:[20, 120, 140],
    label: "Speculative",
  },
};

const DEFAULT_THEME: GenreTheme = {
  bgColor:    [15, 15, 20],
  accentColor:[100, 120, 160],
  headerColor:[170, 185, 210],
  textColor:  [210, 210, 220],
  borderColor:[60, 70, 100],
  label: "Story",
};

function getTheme(genre: string): GenreTheme {
  return GENRE_THEMES[genre] ?? DEFAULT_THEME;
}

function drawGenreBackground(doc: jsPDF, theme: GenreTheme, width: number, height: number): void {
  const [r, g, b] = theme.bgColor;
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, width, height, "F");

  // Outer decorative border
  const [br, bg2, bb] = theme.borderColor;
  doc.setDrawColor(br, bg2, bb);
  doc.setLineWidth(0.8);
  doc.rect(8, 8, width - 16, height - 16, "S");

  // Inner accent border
  const [ar, ag, ab] = theme.accentColor;
  doc.setDrawColor(ar, ag, ab);
  doc.setLineWidth(0.3);
  doc.rect(11, 11, width - 22, height - 22, "S");

  // Top decorative band
  doc.setFillColor(ar, ag, ab);
  doc.setGState(doc.GState({ opacity: 0.15 }));
  doc.rect(0, 0, width, 28, "F");
  doc.setGState(doc.GState({ opacity: 1 }));

  // Bottom decorative band
  doc.setFillColor(ar, ag, ab);
  doc.setGState(doc.GState({ opacity: 0.15 }));
  doc.rect(0, height - 20, width, 20, "F");
  doc.setGState(doc.GState({ opacity: 1 }));

  // Corner ornaments (small filled squares)
  doc.setFillColor(ar, ag, ab);
  const corners: [number, number][] = [
    [8, 8], [width - 10, 8], [8, height - 10], [width - 10, height - 10],
  ];
  for (const [cx, cy] of corners) {
    doc.rect(cx - 1, cy - 1, 2, 2, "F");
  }

  // Horizontal divider lines at top/bottom
  doc.setDrawColor(ar, ag, ab);
  doc.setLineWidth(0.4);
  doc.line(14, 28, width - 14, 28);
  doc.line(14, height - 20, width - 14, height - 20);
}

function wrapText(text: string, maxWidth: number, doc: jsPDF): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const w = doc.getTextWidth(test);
    if (w > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const FONT_NAME = "DejaVuSans";
const FONT_PATH = "/fonts/DejaVuSans.ttf";

// Cached after first fetch so repeated downloads don't re-fetch 742 KB
let cachedFontBase64: string | null = null;

/** Exposed so tests can reset the module-level cache between runs. */
export function clearFontCache(): void {
  cachedFontBase64 = null;
}

async function loadUnicodeFont(doc: jsPDF): Promise<void> {
  if (!cachedFontBase64) {
    const response = await fetch(FONT_PATH);
    if (!response.ok) throw new Error(`Font load failed: ${response.status} ${FONT_PATH}`);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Chunked to avoid `Maximum call stack exceeded` on large buffers
    const CHUNK = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    cachedFontBase64 = btoa(binary);
  }
  doc.addFileToVFS("DejaVuSans.ttf", cachedFontBase64);
  doc.addFont("DejaVuSans.ttf", FONT_NAME, "normal");
}

export async function downloadStoryAsPdf(
  storyText: string,
  title: string,
  genre: string,
): Promise<void> {
  const theme = getTheme(genre);
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  await loadUnicodeFont(doc);

  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  drawGenreBackground(doc, theme, pageWidth, pageHeight);

  const [hr, hg, hb] = theme.headerColor;
  const [tr, tg, tb] = theme.textColor;
  const [ar, ag, ab] = theme.accentColor;

  // Genre label (top-left)
  doc.setFontSize(8);
  doc.setTextColor(ar, ag, ab);
  doc.setFont(FONT_NAME, "normal");
  doc.text(theme.label.toUpperCase(), 16, 19);

  // Title
  doc.setFontSize(16);
  doc.setTextColor(hr, hg, hb);
  doc.setFont(FONT_NAME, "normal");
  const maxTitleWidth = pageWidth - 32;
  const titleLines = doc.splitTextToSize(title, maxTitleWidth) as string[];
  doc.text(titleLines, pageWidth / 2, 22, { align: "center", baseline: "bottom" });

  // Story body
  const margin     = 16;
  const textWidth  = pageWidth - margin * 2;
  const lineHeight = 6;
  let y = 38;

  doc.setFontSize(10.5);
  doc.setTextColor(tr, tg, tb);
  doc.setFont(FONT_NAME, "normal");

  // Split by paragraph, then wrap each paragraph
  const paragraphs = storyText.split(/\n+/);
  for (const para of paragraphs) {
    if (!para.trim()) {
      y += lineHeight * 0.5;
      continue;
    }
    const lines = wrapText(para.trim(), textWidth, doc);
    for (const line of lines) {
      if (y > pageHeight - 24) {
        doc.addPage();
        drawGenreBackground(doc, theme, pageWidth, pageHeight);
        y = 38;
        doc.setFontSize(10.5);
        doc.setTextColor(tr, tg, tb);
        doc.setFont(FONT_NAME, "normal");
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += lineHeight * 0.4; // paragraph spacing
  }

  // Footer
  const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(ar, ag, ab);
    doc.setFont(FONT_NAME, "normal");
    doc.text("LoreForge", margin, pageHeight - 12);
    doc.text(`${i} / ${totalPages}`, pageWidth - margin, pageHeight - 12, { align: "right" });
  }

  const safeTitle = title.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40) || "story";
  doc.save(`${safeTitle}.pdf`);
}
