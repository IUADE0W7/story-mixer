# Agent Prompt Improvements — Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Scope:** `backend/app/domain/vibe_models.py`, `backend/app/services/outline_agent.py`, `backend/app/services/long_form_orchestrator.py`

---

## Problem

Users report that vibe sliders (Aggression, Reader Respect, Morality, Source Fidelity) have no perceptible effect on the generated prose. All four sliders feel flat regardless of their position. The root cause is that calibration directives are weak and poorly positioned in both agent prompts:

- **Outline agent:** No system/user split; vibe directives appear at the bottom of a flat string and have no negative counterparts; a formatting bug (`~{word_target}n`) corrupts the word-target line; JSON format instructions are concatenated without newlines.
- **Chapter writer:** Vibe directives are buried at the bottom of the user prompt; language instruction is duplicated in both system and user prompts; the system prompt references directives only by name ("follow vibe directives precisely") without enumerating them.
- **Both agents:** Directives carry only positive instructions ("do X") with no complementary prohibitions ("do NOT Y"), which makes band boundaries fuzzy.

---

## Approach

**Option B — Prompt restructuring + band-aware negative constraints**, applied to all three affected files.

---

## Design

### Section 1 — Negative Constraints in `vibe_models.py`

`CalibrationDirective` gains a `negative_instruction: str` field — a complementary prohibition that makes the band boundary explicit for the model.

`VibeMetrics` gains four new private methods, one per metric:

- `_negative_for_aggression() -> str`
- `_negative_for_reader_respect() -> str`
- `_negative_for_morality() -> str`
- `_negative_for_source_fidelity() -> str`

Each method returns a "do NOT" rule matched to the current band. Examples:

| Metric | Band | Negative instruction |
|--------|------|----------------------|
| aggression | DOMINANT | Do not let characters back down, soften conflict, or resolve tension peacefully. |
| aggression | STRONGLY_MINIMIZED | Do not introduce combative framing, raised voices, or confrontational subtext. |
| morality | DOMINANT | Do not portray ethically ambiguous outcomes without consequences. |
| morality | STRONGLY_MINIMIZED | Do not insert moral lessons, redemption arcs, or ethical commentary. |
| reader_respect | DOMINANT | Do not explain what is already implied; trust the reader to follow. |
| reader_respect | STRONGLY_MINIMIZED | Do not soften abrasive language or add accommodating transitions for the reader's comfort. |
| source_fidelity | DOMINANT | Do not invent plot events, rename characters, or deviate from canonical scene order. |
| source_fidelity | STRONGLY_MINIMIZED | Do not reproduce canonical plot beats — invent freely. |

`build_directives()` is updated to populate the new field by calling the corresponding `_negative_for_*` method.

No new files. No changes to the external `CalibrationDirective` contract beyond the addition of `negative_instruction`.

---

### Section 2 — Outline Agent Prompt Restructuring (`outline_agent.py`)

The current flat prompt string is replaced with a proper system/user split, aligning with the `PromptEnvelope` pattern already used by the chapter writer.

**System prompt content (in order):**
1. Role identity: "You are LoreForge outline architect."
2. Vibe directives block — all four metrics, each formatted as:
   ```
   - {metric_name}: {instruction} | NOT: {negative_instruction}
   ```
3. Explicit instruction that vibe must shape the outline structure itself — chapter arcs, turning points, and pacing must reflect the calibration, not just the eventual prose.
4. Language constraint (if set).

**User prompt content (in order):**
1. Language constraint (if set) — repeated here as an output-level reminder.
2. Story brief.
3. Genre and public title.
4. Chapter count and word target per chapter (bug fix: `\n` after word target).
5. Structural JSON requirements — each field on its own line, clearly formatted.
6. Closing instruction: "Ensure chapters form a coherent narrative arc from opening to resolution."

**Bug fixes included:**
- Line 101: `~{request.chapter_word_target}n` → `~{request.chapter_word_target}\n`
- Lines 103–106: JSON field list reformatted with proper newlines between entries.

The `StructuredOutlineAgent` passes this as a two-message list `[SystemMessage, HumanMessage]` to LangChain, which already supports this calling convention.

---

### Section 3 — Chapter Writer Prompt Restructuring (`long_form_orchestrator.py`)

`_build_chapter_prompt` is restructured so vibe directives anchor the model before any story content.

**System prompt content (in order):**
1. Role identity: "You are LoreForge, a calibrated narrative model writing a long-form story one chapter at a time."
2. Vibe directives block — all four metrics, formatted as:
   ```
   - {metric_name}: {instruction} | NOT: {negative_instruction}
   ```
3. Language constraint (if set) — moved here from the user prompt to avoid duplication.
4. Standing rule: "Write only the chapter body — no headers, no preamble."

**User prompt content (in order):**
1. One-line vibe recap at the top (reinforcement anchor):
   ```
   Tone: {band_label for aggression}, {band_label for morality} — hold this throughout.
   ```
   This is a short restatement that pulls the model's attention back to vibe immediately before the write instruction, without repeating the full directive list.
2. Story brief.
3. Genre.
4. Continuity block (previous chapter summaries), if any.
5. Chapter spec: number, title, arc summary, word target.
6. Closing instruction: "Write the chapter now."

**Language instruction:** Removed from user prompt. It lives only in the system prompt to avoid the duplication that currently exists in both roles.

---

## What Is Not Changing

- `CalibrationProfile`, `VibeMetrics`, `VibeSliderInput`, `MetricBand`, and all other domain contracts — no changes to external shape.
- `LocalOutlineAgent` (stub) — unaffected.
- `LLMGateway`, `PromptEnvelope`, `model_factory` — unaffected.
- SSE event structure and orchestrator logic — unaffected.
- Tests not related to prompt content — unaffected.

---

## Testing

- Existing unit tests for `VibeMetrics.build_directives()` updated to assert `negative_instruction` is populated and non-empty for each band of each metric.
- New snapshot/assertion tests for `_build_chapter_prompt` and `StructuredOutlineAgent.generate_outline` prompt output to verify directive placement and bug fix.
- Manual smoke test: `make smoke-stream` with `USE_STUB_LLM=true` to confirm pipeline still completes.
- Manual qualitative test with a real provider at extreme slider values (all-1 vs all-10) to verify perceived vibe difference.
