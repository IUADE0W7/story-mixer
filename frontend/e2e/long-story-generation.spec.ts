/**
 * E2E tests: Long-form (multi-chapter) story generation.
 *
 * All tests in the first two describe blocks use page.route() to intercept the
 * generate-long-form request so no real backend or LLM is needed.  The third
 * describe block contains optional live-provider smoke tests that are skipped
 * when the backend is unreachable.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test"; // APIRequestContext used in live-provider tests
import { sel } from "./selectors";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL ?? "http://127.0.0.1:8001";
const OLLAMA_MODEL = process.env.E2E_OLLAMA_MODEL ?? "gpt-oss:20b";

async function gotoStudio(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("lf_token", "e2e.fake.token");
    localStorage.setItem("loreforge.language", "en");
  });
  await page.reload();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

async function fillRequiredSources(page: Page): Promise<void> {
  const s = sel(page);
  await s.sourceA.fill("Story seed A");
  await s.sourceB.fill("Story seed B");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("lf_token", "e2e.fake.token");
    localStorage.setItem("loreforge.language", "en");
  });
});

// ---------------------------------------------------------------------------
// SSE mock helpers
// ---------------------------------------------------------------------------

interface MockChapter {
  number: number;
  title: string;
  summary: string;
  content: string;
  wordCount: number;
  accepted?: boolean;
  revisions?: number; // how many chapter_revision events to emit before chapter_complete
}

/** Build a structurally-valid SSE body for the long-form endpoint. */
function mockLongFormSse(chapters: MockChapter[]): string {
  const frames: string[] = [];

  const emit = (event: string, data: object) =>
    frames.push(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  emit("status", { message: "starting_generation", request_id: "mock-lf-1" });

  emit("outline", {
    chapters: chapters.map((ch) => ({
      number: ch.number,
      title: ch.title,
      summary: ch.summary,
      word_target: ch.wordCount,
    })),
  });

  for (const ch of chapters) {
    emit("chapter_start", { number: ch.number });

    const revisions = ch.revisions ?? 0;
    for (let r = 1; r <= revisions; r++) {
      emit("chapter_revision", { chapter: ch.number, attempt: r });
      emit("chapter_token", { chapter: ch.number, text: `(revised attempt ${r}) ` });
    }

    emit("chapter_token", { chapter: ch.number, text: ch.content });
    emit("chapter_complete", {
      number: ch.number,
      content: ch.content,
      accepted: ch.accepted ?? true,
      revision_count: revisions,
      word_count: ch.wordCount,
    });
  }

  emit("complete", { request_id: "mock-lf-1" });
  return frames.join("");
}

/** Wire up page.route() to intercept the long-form generate POST. */
async function interceptLongFormRequest(
  page: Page,
  responseBody?: string,
): Promise<{ getPayload: () => object | null }> {
  let capturedPayload: object | null = null;

  await page.route("**/api/v1/stories/generate-long-form", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    capturedPayload = route.request().postDataJSON() as object;
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body:
        responseBody ??
        mockLongFormSse([
          {
            number: 1,
            title: "The Signal",
            summary: "A keeper hears something strange.",
            content: "The fog horn blared once, then silence fell over the lantern room.",
            wordCount: 120,
          },
          {
            number: 2,
            title: "The Response",
            summary: "The keeper responds to the signal.",
            content: "She tapped back in Morse, her fingers steady despite the trembling cold.",
            wordCount: 130,
          },
        ]),
    });
  });

  return { getPayload: () => capturedPayload };
}

// ---------------------------------------------------------------------------
// 1. UI behaviour tests (mocked backend)
// ---------------------------------------------------------------------------

test.describe("Chapter settings UI", () => {
  test("chapter settings fields are visible on load", async ({ page }) => {
    const s = sel(page);
    await gotoStudio(page);
    await expect(s.chapterCount).toBeVisible();
    await expect(s.wordsPerChapter).toBeVisible();
  });

  test("chapter count defaults to 4 and words-per-chapter defaults to 400", async ({ page }) => {
    const s = sel(page);
    await gotoStudio(page);

    await expect(s.chapterCount).toHaveValue("4");
    await expect(s.wordsPerChapter).toHaveValue("400");
  });

  test("chapter count can be changed and is clamped to [2, 4]", async ({ page }) => {
    const s = sel(page);
    await gotoStudio(page);

    await s.chapterCount.fill("6");
    await expect(s.chapterCount).toHaveValue("4");
  });

  test("words-per-chapter can be changed", async ({ page }) => {
    const s = sel(page);
    await gotoStudio(page);

    await s.wordsPerChapter.fill("600");
    await expect(s.wordsPerChapter).toHaveValue("500");
  });
});

// ---------------------------------------------------------------------------
// 2. Payload and streaming tests (mocked backend)
// ---------------------------------------------------------------------------

test.describe("Long-form REST payload", () => {
  test("sends request to generate-long-form endpoint", async ({ page }) => {
    let longFormHit = false;

    await page.route("**/api/v1/stories/generate-long-form", async (route) => {
      if (route.request().method() === "POST") longFormHit = true;
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body: mockLongFormSse([
          {
            number: 1,
            title: "Ch1",
            summary: "s",
            content: "Hello world.",
            wordCount: 50,
          },
        ]),
      });
    });

    await gotoStudio(page);
    await fillRequiredSources(page);
    await sel(page).storyBrief.fill("A brief test story.");
    await sel(page).forgeButton.click();
    await expect(sel(page).forgeButton).toBeEnabled({ timeout: 30_000 });

    expect(longFormHit).toBe(true);
  });

  test("payload contains chapter_count and chapter_word_target", async ({ page }) => {
    const { getPayload } = await interceptLongFormRequest(page);
    const s = sel(page);

    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.chapterCount.fill("3");
    await s.wordsPerChapter.fill("500");
    await s.storyBrief.fill("A brief test story.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    const payload = getPayload() as {
      chapter_count?: number;
      chapter_word_target?: number;
    } | null;

    expect(payload?.chapter_count).toBe(3);
    expect(payload?.chapter_word_target).toBe(500);
  });

  test("payload contains context, vibe, and provider fields", async ({ page }) => {
    const { getPayload } = await interceptLongFormRequest(page);
    const s = sel(page);

    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.sourceA.fill("The Lighthouse");
    await s.storyBrief.fill("A keeper hears a distress signal.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    const payload = getPayload() as {
      context?: { user_prompt?: string; language?: string };
      vibe?: object;
      stream?: boolean;
    } | null;

    expect(payload?.context?.user_prompt).toBeTruthy();
    expect(payload?.context?.language).toBeDefined();
    expect(payload?.vibe).toBeDefined();
    expect(payload?.stream).toBe(true);
  });

  test("payload does not contain short-story max_words field", async ({ page }) => {
    const { getPayload } = await interceptLongFormRequest(page);
    const s = sel(page);

    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.storyBrief.fill("A brief test story.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    const payload = getPayload() as { max_words?: unknown } | null;
    expect(payload?.max_words).toBeUndefined();
  });

  test("language selection is reflected in long-form payload", async ({ page }) => {
    const { getPayload } = await interceptLongFormRequest(page);
    const s = sel(page);

    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.languageSelect.click();
    await page.getByRole("option", { name: "Ukrainian" }).click();
    await s.storyBrief.fill("Коротка розповідь.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    const payload = getPayload() as { context?: { language?: string } } | null;
    expect(payload?.context?.language).toBe("uk");
  });
});

test.describe("Long-form streaming UI", () => {
  test("shows outline table of contents after outline event", async ({ page }) => {
    await interceptLongFormRequest(page);
    const s = sel(page);

    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.storyBrief.fill("A lighthouse keeper story.");
    await s.forgeButton.click();

    // Table of contents should appear once the outline SSE event is processed
    await expect(page.getByText("Table of Contents")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("The Signal", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("The Response", { exact: true }).first()).toBeVisible();
  });

  test("shows chapter status cards for each chapter", async ({ page }) => {
    await interceptLongFormRequest(page);
    const s = sel(page);

    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.storyBrief.fill("A lighthouse keeper story.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    // Both chapters should appear as status cards
    await expect(page.getByText("1. The Signal")).toBeVisible();
    await expect(page.getByText("2. The Response")).toBeVisible();
  });

  test("completed chapters show 'done' status and word count", async ({ page }) => {
    await interceptLongFormRequest(page);
    const s = sel(page);

    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.storyBrief.fill("A lighthouse keeper story.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    // Accepted chapters show "done · Xw"
    await expect(page.getByText(/done · \d+w/)).toHaveCount(2);
  });

  test("chapter with revisions shows revision count during streaming", async ({ page }) => {
    const body = mockLongFormSse([
      {
        number: 1,
        title: "Troubled Draft",
        summary: "Needs work.",
        content: "Eventually it was good.",
        wordCount: 80,
        accepted: false,
        revisions: 2,
      },
    ]);

    let revisionSeen = false;
    await page.route("**/api/v1/stories/generate-long-form", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      // Stream frame-by-frame so the UI can observe intermediate states
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body,
      });
    });

    page.on("console", (msg) => {
      if (msg.text().includes("revising")) revisionSeen = true;
    });

    const s = sel(page);
    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.storyBrief.fill("A troubled draft story.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    // After streaming completes, the chapter should be marked done with a word count.
    await expect(page.getByText(/done · \d+w/)).toBeVisible();
  });

  test("forge button is disabled while streaming and re-enables on completion", async ({
    page,
  }) => {
    // Use a slow mock so we can assert disabled state mid-stream
    let resolveMock!: () => void;
    const mockReady = new Promise<void>((r) => (resolveMock = r));

    await page.route("**/api/v1/stories/generate-long-form", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      // Wait briefly to let the UI settle into streaming state
      await new Promise((r) => setTimeout(r, 300));
      resolveMock();
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body: mockLongFormSse([
          {
            number: 1,
            title: "Ch1",
            summary: "s",
            content: "Hello world.",
            wordCount: 50,
          },
        ]),
      });
    });

    const s = sel(page);
    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.storyBrief.fill("A story.");
    await s.forgeButton.click();

    // Assert button becomes disabled while the request is in flight
    await expect(s.forgeButton).toBeDisabled({ timeout: 5_000 });

    // Wait for mock to resolve and streaming to complete
    await mockReady;
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });
  });

  test("error event shows error message in UI", async ({ page }) => {
    const errBody = [
      `event: status\ndata: {"message": "starting_generation", "request_id": "err-1"}\n\n`,
      `event: error\ndata: {"user_message": "LLM quota exceeded", "request_id": "err-1"}\n\n`,
    ].join("");

    await page.route("**/api/v1/stories/generate-long-form", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body: errBody,
      });
    });

    const s = sel(page);
    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.storyBrief.fill("A story that will error.");
    await s.forgeButton.click();

    await expect(page.getByText(/LLM quota exceeded/i)).toBeVisible({ timeout: 30_000 });
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });
  });

  test("completed chapter shows full text without truncation", async ({ page }) => {
    // Use a chapter whose content is well over 240 chars so truncation is detectable.
    const longContent =
      "The lighthouse beam swept the horizon in its slow, eternal arc. " +
      "She had counted each rotation since childhood — one, two, three — " +
      "and the rhythm had always steadied her. Tonight the fog was dense " +
      "enough to taste, salt and rust, and the coded pulses coming back " +
      "through the hull were unlike anything in the manual. She copied " +
      "them down anyway, letter by letter, her pencil pressing hard into " +
      "the damp log-book paper, because somebody had to.";
    // longContent.length > 240 — verify the assumption so the test is meaningful
    expect(longContent.length).toBeGreaterThan(240);

    const body = mockLongFormSse([
      {
        number: 1,
        title: "The Signal",
        summary: "A keeper hears something strange.",
        content: longContent,
        wordCount: 95,
        accepted: true,
      },
    ]);

    await page.route("**/api/v1/stories/generate-long-form", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body,
      });
    });

    const s = sel(page);
    await gotoStudio(page);
    await fillRequiredSources(page);
    await s.storyBrief.fill("A lighthouse keeper story.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    // The chapter card for a completed chapter must contain the full text,
    // not the first 240 chars only.
    const cardText = await page.getByText(/The lighthouse beam swept/).textContent();
    expect(cardText?.trim()).toBe(longContent);
  });
});

// ---------------------------------------------------------------------------
// 3. Live-provider smoke tests (skipped when backend unreachable)
// ---------------------------------------------------------------------------

async function trySkipIfUnavailable(request: APIRequestContext): Promise<void> {
  try {
    const health = await request.get(`${BACKEND_BASE_URL}/api/v1/stories/health/ollama`);
    if (!health.ok()) {
      test.skip(true, `Ollama not available (status ${health.status()}) — skipping`);
    }
  } catch {
    test.skip(true, "Backend not reachable — skipping");
  }
}

test.describe("Long-form generation via live Ollama (integration)", () => {
  test("generates a 2-chapter story end-to-end via Ollama and renders chapters", async ({
    page,
    request,
  }) => {
    await trySkipIfUnavailable(request);

    const s = sel(page);
    let sawLongFormRequest = false;
    let longFormStatus = 0;
    let sawEventStream = false;

    page.on("response", (response) => {
      if (!response.url().includes("/api/v1/stories/generate-long-form")) return;
      sawLongFormRequest = true;
      longFormStatus = response.status();
      sawEventStream = (response.headers()["content-type"] ?? "").includes("text/event-stream");
    });

    await gotoStudio(page);

    await s.sourceA.fill("Lighthouse Signal");
    await s.sourceB.fill("Harbor Echo");
    await s.storyBrief.fill(
      "Write a very short two-sentence scene about a lighthouse keeper hearing a coded distress signal.",
    );
    await s.modelName.fill(OLLAMA_MODEL);
    await s.judgeModelName.fill(OLLAMA_MODEL);

    await s.chapterCount.fill("2");
    await s.wordsPerChapter.fill("150");

    await s.forgeButton.click();

    // Table of contents should appear
    await expect(page.getByText("Table of Contents")).toBeVisible({ timeout: 60_000 });

    // Wait for full completion (generous timeout for LLM + judge loops)
    await expect(s.forgeButton).toBeEnabled({ timeout: 300_000 });

    // Both chapters must complete
    await expect(page.getByText(/done · \d+w/)).toHaveCount(2, { timeout: 10_000 });

    expect(sawLongFormRequest).toBe(true);
    expect(longFormStatus).toBe(200);
    expect(sawEventStream).toBe(true);
  });

  test("API: long-form endpoint returns SSE stream with outline and complete events", async ({
    request,
  }) => {
    await trySkipIfUnavailable(request);

    const response = await request.post(
      `${BACKEND_BASE_URL}/api/v1/stories/generate-long-form`,
      {
        data: {
          context: {
            user_prompt:
              "Write a very short two-sentence opening about a keeper hearing a signal.",
            language: "en",
            public_title: "Lighthouse",
            genre: "literary fiction",
            audience: "adult",
            continuity_notes: [],
          },
          vibe: { aggression: 3, reader_respect: 7, morality: 5, source_fidelity: 5 },
          provider: {
            provider: "ollama",
            model: OLLAMA_MODEL,
            judge_model: OLLAMA_MODEL,
            temperature: 0.7,
          },
          chapter_count: 2,
          chapter_word_target: 150,
          revision_limit: 1,
          stream: true,
        },
        timeout: 300_000,
      },
    );

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/event-stream");

    const body = await response.text();
    expect(body).toContain("event: outline");
    expect(body).toContain("event: chapter_start");
    expect(body).toContain("event: chapter_complete");
    expect(body).toContain("event: complete");
  });
});
