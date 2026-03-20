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

Each method uses `match self.band_for(<metric_value>)` on the metric value, following the same structure as the existing `_instruction_for_*` methods. **Unlike those methods** (which have no `case _` guard and return `None` implicitly on an unmatched band), the new methods must include an exhaustive guard. For example, `_negative_for_aggression` should end with:

```python
case _:
    raise ValueError(f"Unhandled band: {self.band_for(self.aggression)}")
```

The `case _` guard in each method must reference that method's own metric value. Do not copy the aggression example verbatim into other methods — substitute the correct attribute: `self.reader_respect`, `self.morality`, `self.source_fidelity` in their respective methods, so the error message names the failing metric correctly.

The guiding principle for middle bands (RESTRAINED, BALANCED, ELEVATED) is to prohibit drifting toward the opposite extreme — e.g., BALANCED aggression should not veer into either complete passivity or full combativeness.

Example negatives across all five bands for aggression:

| Band               | Negative instruction                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| STRONGLY_MINIMIZED | Do not introduce combative framing, raised voices, or confrontational subtext.        |
| RESTRAINED         | Do not let conflict escalate beyond measured tension or tip into confrontation.       |
| BALANCED           | Do not let the tone collapse into either pure passivity or unchecked aggression.      |
| ELEVATED           | Do not pull back from tension or resolve confrontations too cleanly.                  |
| DOMINANT           | Do not let characters back down, soften conflict, or resolve tension peacefully.      |

The same five-band coverage applies to reader_respect, morality, and source_fidelity.

`build_directives()` is the **only construction site** for `CalibrationDirective` in the codebase. It is updated to populate `negative_instruction` by calling the corresponding `_negative_for_*` method alongside the existing `_instruction_for_*` call. No other file constructs `CalibrationDirective` directly.

**Serialization impact:** `negative_instruction` will appear in any `model_dump()` of `CalibrationDirective`. The full chain of types whose serialized output changes:

- `CalibrationDirective.model_dump()` — directly gains the field
- `VibeMetrics.model_dump()` — via the `directives` computed field
- `CalibrationProfile.model_dump()` — via its `directives` field
- `LongFormResult.model_dump()` — via `normalized_vibe: VibeMetrics` (`CalibrationProfile` is **not** present in `LongFormResult`)
- The `complete` SSE event payload — `LongFormResult.model_dump(mode="json")` is the source; the frontend sees `negative_instruction` only through `normalized_vibe.directives`, not through `CalibrationProfile`

The frontend handler in `use-long-form-stream.tsx` already discards the entire `complete` event payload (it only sets stream status); no code change is needed there. `story-streaming.ts` should be confirmed by inspection to similarly ignore unknown fields. Any backend test asserting exact JSON shape of the above types must be updated. The field is not optional; `build_directives()` must always supply it.

---

### Section 2 — Outline Agent Prompt Restructuring (`outline_agent.py`)

The current flat prompt string is replaced with a two-message list `[SystemMessage, HumanMessage]` passed to LangChain's `structured.ainvoke(messages)`. `structured = chat_model.with_structured_output(_OutlineSpec)` — LangChain chains produced by `with_structured_output` accept a list of `BaseMessage` objects via `ainvoke`. This API path is validated by the smoke test (see Testing section).

**System prompt content (in order):**

1. Role identity: "You are LoreForge outline architect."
2. Vibe directives block — all four metrics, each formatted as:

   ```text
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
- Line 111 (`logger.debug` for prompt length only — the `logger.info` line at 110 does not reference `prompt` and is unaffected): build the message list first, assigned to `messages`, then log `sum(len(m.content) for m in messages)`.

---

### Section 3 — Chapter Writer Prompt Restructuring (`long_form_orchestrator.py`)

`_build_chapter_prompt` is restructured so vibe directives anchor the model before any story content.

**Signature change:** The parameter `calibration_directive_lines: str` is replaced with `calibration: CalibrationProfile`. Add `from app.domain.vibe_models import CalibrationProfile` to the imports at the top of `long_form_orchestrator.py` — this import does not currently exist because `CalibrationProfile` was never referenced by name in that file. The function builds the `| NOT:` formatted directive block itself by iterating `calibration.directives`.

The call site in `LongFormOrchestrator.stream()` (around line 169) must pass `calibration` directly. The `directive_lines` string variable (built at lines 128–130) becomes dead code — remove it.

**Vibe recap band lookup:** `calibration.directives` preserves the exact order returned by `build_directives()` — `CalibrationProfile` is constructed via `VibeMetrics.to_calibration_profile()`, which calls `build_directives()` and passes the result directly to `CalibrationProfile(directives=...)` with no reordering. The fixed order is: index 0 = aggression, index 1 = reader_respect, index 2 = morality, index 3 = source_fidelity. Use `calibration.directives[0]` for aggression and `calibration.directives[2]` for morality.

**System prompt content (in order):**

1. Role identity: "You are LoreForge, a calibrated narrative model writing a long-form story one chapter at a time."
2. Vibe directives block — all four metrics, formatted as:

   ```text
   - {metric_name}: {instruction} | NOT: {negative_instruction}
   ```

3. Language constraint (if set) — moved here from the user prompt to avoid duplication.
4. Standing rule: "Write only the chapter body — no headers, no preamble."

**User prompt content (in order):**

1. One-line vibe recap at the top (reinforcement anchor). Use f-string interpolation on `calibration.directives[0].band` and `calibration.directives[2].band` — `MetricBand` is a `StrEnum` so f-string interpolation yields the enum value directly (e.g., `"dominant"`, `"strongly_minimized"`):

   ```text
   Tone: {aggression_directive.band} aggression, {morality_directive.band} morality — hold this throughout.
   ```

2. Story brief.
3. Genre.
4. Continuity block (previous chapter summaries), if any.
5. Chapter spec: number, title, arc summary, word target.
6. Closing instruction: "Write the chapter now."

**Language instruction:** Removed from user prompt. It lives only in the system prompt to avoid the duplication that currently exists in both roles.

---

## What Is Not Changing

- `VibeMetrics`, `VibeSliderInput`, `MetricBand`, `CalibrationProfile`, `long_form_contracts.py` — no structural changes to field names, types, or counts.
- `LocalOutlineAgent` (stub) — unaffected.
- `LLMGateway`, `PromptEnvelope`, `model_factory` — unaffected.
- SSE event structure and orchestrator logic (aside from the `_build_chapter_prompt` call site and removal of `directive_lines`) — unaffected.
- Tests unrelated to prompt content, directive serialization, or `LongFormResult` JSON shape — unaffected.

---

## Testing

- **New** unit tests for `VibeMetrics.build_directives()` (no such tests currently exist): assert `len(directive.negative_instruction) > 0` for all five bands of each metric (20 cases total — trigger each band by passing values in the ranges defined by `band_for`).
- Regression check: any existing test that serializes `CalibrationDirective`, `VibeMetrics`, `CalibrationProfile`, or `LongFormResult` to JSON must be updated to expect the `negative_instruction` field.
- Frontend consumer check: confirm by inspection that `story-streaming.ts` ignores unknown fields in the `complete` event payload. (`use-long-form-stream.tsx` already discards the payload — no code change needed there.)
- New assertion tests for `_build_chapter_prompt` prompt output: import the function directly from `long_form_orchestrator`; construct a `CalibrationProfile` via `VibeMetrics(...).to_calibration_profile()` to pass as the `calibration` argument. Verify directive block appears in the returned `PromptEnvelope.system_prompt` with `| NOT:` format, vibe recap appears at the top of `PromptEnvelope.user_prompt` with correct band string values, language instruction is absent from `user_prompt`.
- New assertion tests for `StructuredOutlineAgent` message construction: mock `chat_model.with_structured_output` to capture the argument passed to `ainvoke`; verify it is a two-element list, system message content contains directives with `| NOT:`, user message content contains story brief and JSON requirements, word target line ends with `\n`.
- Manual smoke test: `make smoke-stream` with `USE_STUB_LLM=true` to confirm pipeline still completes end-to-end and validates the LangChain message-list API path for the outline agent.
- Manual qualitative test with a real provider at extreme slider values (all-1 vs all-10) to verify perceived vibe difference.
