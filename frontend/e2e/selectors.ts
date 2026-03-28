/**
 * Shared Playwright selector helpers.
 * Centralises aria-label strings so a UI rename only requires one edit here.
 */
import type { Page } from "@playwright/test";

export const sel = (page: Page) => ({
  forgeButton:     page.getByLabel("Forge narrative from current calibration"),
  storyBrief:      page.getByLabel("Custom story brief"),
  sourceA:         page.getByLabel("First source tale"),
  sourceB:         page.getByLabel("Second source tale"),
  languageSelect:  page.getByLabel("Select story language"),
  modelName:       page.getByLabel(/^Model name$/),
  judgeModelName:  page.getByLabel(/^Judge model name$/),
  chapterCount:    page.getByLabel("Chapters"),
  wordsPerChapter: page.getByLabel("Words/ch."),
});
