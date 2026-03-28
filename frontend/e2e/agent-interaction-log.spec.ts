/**
 * E2E tests: Agent Interaction Log panel UI behaviour.
 *
 * All tests intercept the generate-long-form POST so no real backend is required.
 * Mock SSE bodies include `log` events so the panel receives entries.
 */
import { expect, test, type Page } from "@playwright/test";
import { sel } from "./selectors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LogEntry {
  from: string;
  to: string;
  message: string;
  level?: string;
}

function logToggle(page: Page) {
  return page.locator('button[aria-controls="agent-log-body"]');
}

async function gotoStudio(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("lf_token", "e2e.fake.token");
    localStorage.setItem("loreforge.language", "en");
  });
  await page.reload();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

/** Build a minimal long-form SSE body that includes log events. */
function mockSseWithLogs(logEntries: LogEntry[]): string {
  const frames: string[] = [];

  const emit = (event: string, data: object) =>
    frames.push(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  for (const entry of logEntries) {
    emit("log", { from: entry.from, to: entry.to, message: entry.message, level: entry.level ?? "info" });
  }

  emit("status",  { message: "starting_generation", request_id: "mock-log-1" });
  emit("outline", { chapters: [
    { number: 1, title: "The Signal",   summary: "s", word_target: 200 },
    { number: 2, title: "The Response", summary: "s", word_target: 200 },
  ]});
  emit("chapter_start",    { number: 1 });
  emit("chapter_token",    { chapter: 1, text: "She heard it." });
  emit("chapter_complete", { number: 1, content: "She heard it.", accepted: true, revision_count: 0, word_count: 3 });
  emit("chapter_start",    { number: 2 });
  emit("chapter_token",    { chapter: 2, text: "She responded." });
  emit("chapter_complete", { number: 2, content: "She responded.", accepted: true, revision_count: 0, word_count: 2 });
  emit("complete", { request_id: "mock-log-1" });

  return frames.join("");
}

/** Intercept the long-form generate endpoint and fulfil with the provided body. */
async function interceptWithLogs(page: Page, logEntries: LogEntry[]): Promise<void> {
  await page.route("**/api/v1/stories/generate-long-form", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: mockSseWithLogs(logEntries),
    });
  });
}

const SAMPLE_LOGS: LogEntry[] = [
  { from: "Orchestrator", to: "OutlineAgent", message: "Generating outline for 2 chapters" },
  { from: "OutlineAgent", to: "Orchestrator", message: "Outline ready: 2 chapters" },
  { from: "Orchestrator", to: "LLM",          message: "Writing chapter 1: The Signal" },
  { from: "LLM",          to: "Orchestrator",  message: "Chapter 1 draft received" },
  { from: "Orchestrator", to: "Critic",        message: "Evaluating chapter 1 (attempt 1)" },
];

// ---------------------------------------------------------------------------
// Tests: panel visibility and default state
// ---------------------------------------------------------------------------

test.describe("Agent Interaction Log — panel presence", () => {
  test("panel header is visible on the page before any generation", async ({ page }) => {
    await gotoStudio(page);
    await expect(logToggle(page)).toBeVisible();
  });

  test("panel is collapsed by default (log body not visible)", async ({ page }) => {
    await gotoStudio(page);
    const body = page.locator("#agent-log-body");
    await expect(body).not.toBeVisible();
  });

  test("panel header button has aria-expanded=false when collapsed", async ({ page }) => {
    await gotoStudio(page);
    const toggleBtn = logToggle(page);
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
  });
});

// ---------------------------------------------------------------------------
// Tests: expand / collapse behaviour
// ---------------------------------------------------------------------------

test.describe("Agent Interaction Log — expand / collapse", () => {
  test("clicking the header expands the panel", async ({ page }) => {
    await gotoStudio(page);
    await logToggle(page).click();
    await expect(page.locator("#agent-log-body")).toBeVisible();
  });

  test("aria-expanded becomes true after opening", async ({ page }) => {
    await gotoStudio(page);
    const btn = logToggle(page);
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  test("clicking the header again collapses the panel", async ({ page }) => {
    await gotoStudio(page);
    const btn = logToggle(page);
    await btn.click();
    await expect(page.locator("#agent-log-body")).toBeVisible();
    await btn.click();
    await expect(page.locator("#agent-log-body")).not.toBeVisible();
  });

  test("empty state message is shown when panel is open but no entries yet", async ({ page }) => {
    await gotoStudio(page);
    await logToggle(page).click();
    await expect(
      page.getByText(/no interactions recorded yet/i),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: log entries appear after generation
// ---------------------------------------------------------------------------

test.describe("Agent Interaction Log — entries after generation", () => {
  test("entry count badge appears after generation with log events", async ({ page }) => {
    await interceptWithLogs(page, SAMPLE_LOGS);
    const s = sel(page);

    await gotoStudio(page);
    await s.sourceA.fill("Story seed A");
    await s.sourceB.fill("Story seed B");
    await s.storyBrief.fill("A traveller arrives at a crossroads.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    // The badge shows the count of log entries
    await expect(
      logToggle(page).getByText(String(SAMPLE_LOGS.length), { exact: true }),
    ).toBeVisible();
  });

  test("opening the panel after generation shows log entry rows", async ({ page }) => {
    await interceptWithLogs(page, SAMPLE_LOGS);
    const s = sel(page);

    await gotoStudio(page);
    await s.sourceA.fill("Story seed A");
    await s.sourceB.fill("Story seed B");
    await s.storyBrief.fill("A traveller arrives at a crossroads.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    await logToggle(page).click();

    // At least one "Orchestrator" agent badge should be visible
    await expect(page.getByText("Orchestrator").first()).toBeVisible();
  });

  test("opening the panel shows from-agent and to-agent labels", async ({ page }) => {
    await interceptWithLogs(page, [
      { from: "Orchestrator", to: "Critic", message: "Evaluating chapter 1 (attempt 1)" },
    ]);
    const s = sel(page);

    await gotoStudio(page);
    await s.sourceA.fill("Story seed A");
    await s.sourceB.fill("Story seed B");
    await s.storyBrief.fill("A crossroads scene.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    await logToggle(page).click();

    await expect(page.getByText("Orchestrator")).toBeVisible();
    await expect(page.getByText("Critic")).toBeVisible();
  });

  test("log entry message text is visible in the expanded panel", async ({ page }) => {
    const uniqueMessage = "Evaluating chapter 1 (attempt 1)";
    await interceptWithLogs(page, [
      { from: "Orchestrator", to: "Critic", message: uniqueMessage },
    ]);
    const s = sel(page);

    await gotoStudio(page);
    await s.sourceA.fill("Story seed A");
    await s.sourceB.fill("Story seed B");
    await s.storyBrief.fill("A crossroads scene.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    await logToggle(page).click();
    await expect(page.getByText(uniqueMessage)).toBeVisible();
  });

  test("multiple log entries are all rendered in the panel", async ({ page }) => {
    const entries: LogEntry[] = [
      { from: "Orchestrator", to: "OutlineAgent", message: "Generating outline for 2 chapters" },
      { from: "OutlineAgent", to: "Orchestrator", message: "Outline ready: 2 chapters" },
      { from: "Orchestrator", to: "Critic",       message: "Evaluating chapter 1 (attempt 1)" },
    ];
    await interceptWithLogs(page, entries);
    const s = sel(page);

    await gotoStudio(page);
    await s.sourceA.fill("Story seed A");
    await s.sourceB.fill("Story seed B");
    await s.storyBrief.fill("A crossroads scene.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    await logToggle(page).click();

    for (const entry of entries) {
      await expect(page.getByText(entry.message)).toBeVisible();
    }
  });

  test("log entries are cleared when a new generation starts", async ({ page }) => {
    let callCount = 0;
    await page.route("**/api/v1/stories/generate-long-form", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      callCount += 1;
      const entry: LogEntry =
        callCount === 1
          ? { from: "Orchestrator", to: "OutlineAgent", message: "First generation log" }
          : { from: "Orchestrator", to: "OutlineAgent", message: "Second generation log" };
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body: mockSseWithLogs([entry]),
      });
    });

    const s = sel(page);
    await gotoStudio(page);
    await s.sourceA.fill("Story seed A");
    await s.sourceB.fill("Story seed B");
    await s.storyBrief.fill("First story.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    // Start second generation
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    await logToggle(page).click();

    // The first generation's log should not be visible; second generation's should
    await expect(page.getByText("Second generation log")).toBeVisible();
    await expect(page.getByText("First generation log")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: log entries with OutlineAgent
// ---------------------------------------------------------------------------

test.describe("Agent Interaction Log — OutlineAgent entries", () => {
  test("log panel shows OutlineAgent entries after generation", async ({ page }) => {
    const logEntries: LogEntry[] = [
      { from: "Orchestrator", to: "OutlineAgent", message: "Generating outline for 2 chapters" },
      { from: "OutlineAgent", to: "Orchestrator", message: "Outline ready: 2 chapters" },
      { from: "Orchestrator", to: "LLM", message: "Writing chapter 1: The Signal" },
    ];

    await interceptWithLogs(page, logEntries);

    const s = sel(page);
    await gotoStudio(page);
    await s.sourceA.fill("Story seed A");
    await s.sourceB.fill("Story seed B");

    await s.storyBrief.fill("A spy story in two chapters.");
    await s.forgeButton.click();
    await expect(s.forgeButton).toBeEnabled({ timeout: 30_000 });

    await logToggle(page).click();

    await expect(page.getByText("OutlineAgent").first()).toBeVisible();
    await expect(page.getByText("Outline ready: 2 chapters")).toBeVisible();
  });
});
