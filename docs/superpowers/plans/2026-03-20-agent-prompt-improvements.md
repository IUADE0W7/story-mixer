# Agent Prompt Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make vibe slider settings (aggression, reader_respect, morality, source_fidelity) produce a perceptible difference in generated prose by adding negative constraints to directives and restructuring both agent prompts.

**Architecture:** Add a `negative_instruction` field to `CalibrationDirective` with per-band "do NOT" rules; restructure the outline agent prompt into a system/user split using LangChain messages; restructure the chapter writer prompt so directives anchor the system role and a vibe recap anchors the user prompt.

**Tech Stack:** Python 3.12, Pydantic v2, LangChain (`langchain-core` `SystemMessage`/`HumanMessage`), pytest.

---

## File Map

| File | Change |
| ---- | ------ |
| `backend/app/domain/vibe_models.py` | Add `negative_instruction: str` to `CalibrationDirective`; add 4 `_negative_for_*` methods to `VibeMetrics`; update `build_directives()` |
| `backend/app/services/outline_agent.py` | Replace flat prompt string with `[SystemMessage, HumanMessage]`; fix `\n` bug; fix JSON requirements formatting; fix logging |
| `backend/app/services/long_form_orchestrator.py` | Change `_build_chapter_prompt` signature; add `CalibrationProfile` import; restructure prompts; remove dead `directive_lines` variable |
| `backend/tests/test_vibe_negative_instructions.py` | New: parametrized tests for all 20 band×metric combinations |
| `backend/tests/test_outline_agent_prompt.py` | New: assert message structure, directive format, bug fixes |
| `backend/tests/test_chapter_prompt.py` | New: assert system/user layout, directive format, vibe recap, language placement |

---

## Task 1: Add `negative_instruction` to `CalibrationDirective`

**Files:**
- Modify: `backend/app/domain/vibe_models.py`
- Create: `backend/tests/test_vibe_negative_instructions.py`

- [ ] **Step 1: Write failing tests**

  Create `backend/tests/test_vibe_negative_instructions.py`:

  ```python
  """Tests for CalibrationDirective.negative_instruction across all band × metric combinations."""

  from __future__ import annotations

  import pytest

  from app.domain.vibe_models import VibeMetrics

  # One representative value per band (matches band_for thresholds in vibe_models.py):
  #   STRONGLY_MINIMIZED: 0.0 ≤ v < 0.2
  #   RESTRAINED:         0.2 ≤ v < 0.4
  #   BALANCED:           0.4 ≤ v < 0.6
  #   ELEVATED:           0.6 ≤ v < 0.8
  #   DOMINANT:           0.8 ≤ v ≤ 1.0
  _BAND_VALUES = [0.1, 0.3, 0.5, 0.7, 0.9]
  _METRICS = ["aggression", "reader_respect", "morality", "source_fidelity"]


  @pytest.mark.parametrize("metric", _METRICS)
  @pytest.mark.parametrize("metric_value", _BAND_VALUES)
  def test_negative_instruction_non_empty(metric: str, metric_value: float) -> None:
      """negative_instruction must be a non-empty string for every band of every metric."""
      base = {m: 0.5 for m in _METRICS}
      base[metric] = metric_value
      metrics = VibeMetrics(**base)
      directives = metrics.build_directives()
      directive = next(d for d in directives if d.metric_name == metric)
      assert len(directive.negative_instruction) > 0, (
          f"negative_instruction is empty for {metric} at value {metric_value} "
          f"(band: {directive.band})"
      )
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd backend && ../.venv/bin/pytest tests/test_vibe_negative_instructions.py -v
  ```

  Expected: `AttributeError: 'CalibrationDirective' object has no attribute 'negative_instruction'` (or similar Pydantic validation error).

- [ ] **Step 3: Add `negative_instruction` field to `CalibrationDirective`**

  In `backend/app/domain/vibe_models.py`, add the field to `CalibrationDirective` (after `instruction`):

  ```python
  class CalibrationDirective(BaseModel):
      model_config = ConfigDict(frozen=True)

      metric_name: str
      value: float = Field(ge=0.0, le=1.0, strict=True)
      band: MetricBand
      instruction: str
      negative_instruction: str
  ```

- [ ] **Step 4: Add `_negative_for_aggression` to `VibeMetrics`**

  Add after `_instruction_for_aggression`:

  ```python
  def _negative_for_aggression(self) -> str:
      """Return the aggression negative constraint for the current band."""
      match self.band_for(self.aggression):
          case MetricBand.STRONGLY_MINIMIZED:
              return "Do not introduce combative framing, raised voices, or confrontational subtext."
          case MetricBand.RESTRAINED:
              return "Do not let conflict escalate beyond measured tension or tip into confrontation."
          case MetricBand.BALANCED:
              return "Do not let the tone collapse into either pure passivity or unchecked aggression."
          case MetricBand.ELEVATED:
              return "Do not pull back from tension or resolve confrontations too cleanly."
          case MetricBand.DOMINANT:
              return "Do not let characters back down, soften conflict, or resolve tension peacefully."
          case _:
              raise ValueError(f"Unhandled band: {self.band_for(self.aggression)}")
  ```

- [ ] **Step 5: Add `_negative_for_reader_respect` to `VibeMetrics`**

  Add after `_instruction_for_reader_respect`:

  ```python
  def _negative_for_reader_respect(self) -> str:
      """Return the reader-respect negative constraint for the current band."""
      match self.band_for(self.reader_respect):
          case MetricBand.STRONGLY_MINIMIZED:
              return "Do not soften abrasive language or add accommodating transitions for the reader's comfort."
          case MetricBand.RESTRAINED:
              return "Do not over-explain or provide hand-holding that isn't warranted."
          case MetricBand.BALANCED:
              return "Do not drift into either dismissive hostility or over-accommodating hand-holding."
          case MetricBand.ELEVATED:
              return "Do not condescend, simplify unnecessarily, or withhold context the reader needs."
          case MetricBand.DOMINANT:
              return "Do not explain what is already implied; trust the reader to follow without aid."
          case _:
              raise ValueError(f"Unhandled band: {self.band_for(self.reader_respect)}")
  ```

- [ ] **Step 6: Add `_negative_for_morality` to `VibeMetrics`**

  Add after `_instruction_for_morality`:

  ```python
  def _negative_for_morality(self) -> str:
      """Return the morality negative constraint for the current band."""
      match self.band_for(self.morality):
          case MetricBand.STRONGLY_MINIMIZED:
              return "Do not insert moral lessons, redemption arcs, or ethical commentary."
          case MetricBand.RESTRAINED:
              return "Do not let a clear moral stance emerge or steer the story toward resolution."
          case MetricBand.BALANCED:
              return "Do not let the story become either nihilistically amoral or preachy."
          case MetricBand.ELEVATED:
              return "Do not portray the protagonist's moral convictions as naive or ineffective."
          case MetricBand.DOMINANT:
              return "Do not portray ethically ambiguous outcomes without moral weight or consequence."
          case _:
              raise ValueError(f"Unhandled band: {self.band_for(self.morality)}")
  ```

- [ ] **Step 7: Add `_negative_for_source_fidelity` to `VibeMetrics`**

  Add after `_instruction_for_source_fidelity`:

  ```python
  def _negative_for_source_fidelity(self) -> str:
      """Return the source-fidelity negative constraint for the current band."""
      match self.band_for(self.source_fidelity):
          case MetricBand.STRONGLY_MINIMIZED:
              return "Do not reproduce canonical plot beats — invent freely and diverge from the source."
          case MetricBand.RESTRAINED:
              return "Do not follow the source plot closely; significant invention is expected."
          case MetricBand.BALANCED:
              return "Do not stray so far from the source that recognisable moments vanish entirely."
          case MetricBand.ELEVATED:
              return "Do not invent new plot events or remove named characters from the story."
          case MetricBand.DOMINANT:
              return "Do not invent plot events, rename characters, or deviate from canonical scene order."
          case _:
              raise ValueError(f"Unhandled band: {self.band_for(self.source_fidelity)}")
  ```

- [ ] **Step 8: Update `build_directives()` to populate `negative_instruction`**

  Replace each `CalibrationDirective(...)` call in `build_directives()` to add the new field:

  ```python
  def build_directives(self) -> tuple[CalibrationDirective, ...]:
      return (
          CalibrationDirective(
              metric_name="aggression",
              value=self.aggression,
              band=self.band_for(self.aggression),
              instruction=self._instruction_for_aggression(),
              negative_instruction=self._negative_for_aggression(),
          ),
          CalibrationDirective(
              metric_name="reader_respect",
              value=self.reader_respect,
              band=self.band_for(self.reader_respect),
              instruction=self._instruction_for_reader_respect(),
              negative_instruction=self._negative_for_reader_respect(),
          ),
          CalibrationDirective(
              metric_name="morality",
              value=self.morality,
              band=self.band_for(self.morality),
              instruction=self._instruction_for_morality(),
              negative_instruction=self._negative_for_morality(),
          ),
          CalibrationDirective(
              metric_name="source_fidelity",
              value=self.source_fidelity,
              band=self.band_for(self.source_fidelity),
              instruction=self._instruction_for_source_fidelity(),
              negative_instruction=self._negative_for_source_fidelity(),
          ),
      )
  ```

- [ ] **Step 9: Run tests to confirm they pass**

  ```bash
  cd backend && ../.venv/bin/pytest tests/test_vibe_negative_instructions.py -v
  ```

  Expected: 20 tests PASSED.

- [ ] **Step 10: Run full test suite to confirm no regressions**

  ```bash
  cd backend && ../.venv/bin/pytest -q
  ```

  Expected: all tests pass (there are no existing tests asserting exact `CalibrationDirective` JSON shape, so no failures expected).

- [ ] **Step 11: Commit**

  ```bash
  cd backend && git add app/domain/vibe_models.py tests/test_vibe_negative_instructions.py
  git commit -m "feat: add negative_instruction to CalibrationDirective with band-aware constraints"
  ```

---

## Task 2: Restructure the Outline Agent Prompt

**Files:**
- Modify: `backend/app/services/outline_agent.py`
- Create: `backend/tests/test_outline_agent_prompt.py`

- [ ] **Step 1: Write failing tests**

  Create `backend/tests/test_outline_agent_prompt.py`:

  ```python
  """Tests for StructuredOutlineAgent prompt structure (system/user split, directives, bug fixes)."""

  from __future__ import annotations

  import asyncio
  from unittest.mock import MagicMock, patch

  from app.domain.long_form_contracts import LongFormRequest
  from app.services.outline_agent import StructuredOutlineAgent, _ChapterSpec, _OutlineSpec


  def _make_request(language: str | None = None) -> LongFormRequest:
      ctx: dict = {
          "user_prompt": "A hero crosses a desert.",
          "genre": "fantasy",
          "audience": "adult",
          "continuity_notes": [],
      }
      if language:
          ctx["language"] = language
      return LongFormRequest.model_validate({
          "context": ctx,
          "vibe": {"aggression": 9, "reader_respect": 3, "morality": 2, "source_fidelity": 8},
          "chapter_count": 2,
          "chapter_word_target": 400,
          "stream": True,
      })


  def _run_outline_agent(request: LongFormRequest) -> list:
      """Return the messages list captured from ainvoke."""
      captured: list = []
      fake_result = _OutlineSpec(chapters=[
          _ChapterSpec(number=1, title="Ch1", summary="Opens.", word_target=400),
          _ChapterSpec(number=2, title="Ch2", summary="Closes.", word_target=400),
      ])

      async def _fake_ainvoke(messages):
          captured.append(messages)
          return fake_result

      mock_chain = MagicMock()
      mock_chain.ainvoke = _fake_ainvoke
      mock_model = MagicMock()
      mock_model.with_structured_output.return_value = mock_chain

      with patch("app.services.outline_agent.build_chat_model", return_value=mock_model):
          agent = StructuredOutlineAgent()
          calibration = request.calibration_profile()
          asyncio.run(agent.generate_outline(request, calibration))

      return captured[0]


  def test_outline_prompt_is_two_messages() -> None:
      """ainvoke must receive a two-element message list, not a plain string."""
      messages = _run_outline_agent(_make_request())
      assert len(messages) == 2, f"Expected 2 messages, got {len(messages)}"


  def test_outline_system_message_contains_directives_with_not() -> None:
      """System message must contain vibe directives formatted with '| NOT:'."""
      messages = _run_outline_agent(_make_request())
      assert "| NOT:" in messages[0].content


  def test_outline_system_message_contains_all_four_metrics() -> None:
      """System message must mention all four metric names."""
      content = _run_outline_agent(_make_request())[0].content
      for metric in ("aggression", "reader_respect", "morality", "source_fidelity"):
          assert metric in content, f"Missing metric '{metric}' in system message"


  def test_outline_user_message_contains_story_brief() -> None:
      """User message must contain the story brief."""
      messages = _run_outline_agent(_make_request())
      assert "A hero crosses a desert." in messages[1].content


  def test_outline_user_message_word_target_has_newline() -> None:
      """Bug fix: word target line must end with newline, not literal 'n'."""
      messages = _run_outline_agent(_make_request())
      assert "~400\n" in messages[1].content
      assert "~400n" not in messages[1].content


  def test_outline_user_message_json_fields_present() -> None:
      """User message must list all required JSON output fields."""
      content = _run_outline_agent(_make_request())[1].content
      for field in ("number", "title", "summary", "word_target"):
          assert field in content, f"Missing JSON field '{field}' in user message"


  def test_outline_language_instruction_in_system_when_set() -> None:
      """Language constraint must appear in the system message when language is set."""
      messages = _run_outline_agent(_make_request(language="uk"))
      assert "Ukrainian" in messages[0].content
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd backend && ../.venv/bin/pytest tests/test_outline_agent_prompt.py -v
  ```

  Expected: all 7 tests FAIL (prompt is currently a plain string, not a message list).

- [ ] **Step 3: Rewrite `StructuredOutlineAgent.generate_outline`**

  Replace the `prompt = (...)` block and `structured.ainvoke(prompt)` call in `backend/app/services/outline_agent.py` with:

  ```python
  from langchain_core.messages import HumanMessage, SystemMessage

  # (add this import at the top of the file alongside other imports)
  ```

  Replace the `generate_outline` method body from the `directive_lines` assignment through `result = await structured.ainvoke(prompt)`:

  ```python
  directive_lines = "\n".join(
      f"- {d.metric_name}: {d.instruction} | NOT: {d.negative_instruction}"
      for d in calibration.directives
  )
  genre = request.context.genre or "unspecified"
  lang = (request.context.language or "").strip().lower()
  lang_instruction = ""
  if lang in ("uk", "ua", "ukr", "ukraine"):
      lang_instruction = "Output language requirement: Ukrainian only (Cyrillic). Do not switch to English.\n\n"
  elif lang in ("ru", "rus", "russian"):
      lang_instruction = "Output language requirement: Russian only (Cyrillic). Do not switch to English.\n\n"
  elif lang in ("kk", "kaz", "kazakh"):
      lang_instruction = "Output language requirement: Kazakh only (Cyrillic script). Do not switch to English or Russian.\n\n"

  system_content = (
      "You are LoreForge outline architect.\n\n"
      "Vibe directives — the outline structure must reflect these, not just the prose:\n"
      f"{directive_lines}\n\n"
      "Chapter arcs, turning points, and pacing must reflect the calibration above.\n"
      + (lang_instruction if lang_instruction else "")
  )

  user_content = (
      f"{lang_instruction}"
      f"Story brief: {request.context.user_prompt}\n"
      f"Genre: {genre}\n"
      f"Public title: {request.context.public_title or 'untitled'}\n"
      f"Chapters requested: {request.chapter_count}\n"
      f"Target words per chapter: ~{request.chapter_word_target}\n"
      "Return a JSON object with a 'chapters' array. Each entry must have:\n"
      "  number (int, starting at 1)\n"
      "  title (str)\n"
      "  summary (str, 1-2 sentences describing the chapter arc)\n"
      "  word_target (int)\n"
      "Ensure chapters form a coherent narrative arc from opening to resolution."
  )

  messages = [SystemMessage(content=system_content), HumanMessage(content=user_content)]

  logger.info("Outline agent: provider=%s model=%s", settings.llm_provider, settings.llm_model)
  logger.debug("Outline prompt: %d chars", sum(len(m.content) for m in messages))
  result: _OutlineSpec = await structured.ainvoke(messages)  # type: ignore[assignment]
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd backend && ../.venv/bin/pytest tests/test_outline_agent_prompt.py -v
  ```

  Expected: all 7 tests PASSED.

- [ ] **Step 5: Run full test suite**

  ```bash
  cd backend && ../.venv/bin/pytest -q
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  cd backend && git add app/services/outline_agent.py tests/test_outline_agent_prompt.py
  git commit -m "feat: restructure outline agent prompt with system/user split and | NOT: directives"
  ```

---

## Task 3: Restructure the Chapter Writer Prompt

**Files:**
- Modify: `backend/app/services/long_form_orchestrator.py`
- Create: `backend/tests/test_chapter_prompt.py`

- [ ] **Step 1: Write failing tests**

  Create `backend/tests/test_chapter_prompt.py`:

  ```python
  """Tests for _build_chapter_prompt: directive placement, vibe recap, language deduplication."""

  from __future__ import annotations

  from app.domain.long_form_contracts import ChapterOutline, LongFormRequest
  from app.domain.vibe_models import VibeMetrics
  from app.services.long_form_orchestrator import _build_chapter_prompt


  def _make_calibration(
      aggression: float = 0.9,
      reader_respect: float = 0.7,
      morality: float = 0.9,
      source_fidelity: float = 0.5,
  ):
      return VibeMetrics(
          aggression=aggression,
          reader_respect=reader_respect,
          morality=morality,
          source_fidelity=source_fidelity,
      ).to_calibration_profile()


  def _make_chapter() -> ChapterOutline:
      return ChapterOutline(
          number=1, title="The Crossing",
          summary="A tense border crossing.", word_target=400,
      )


  def _make_request(language: str | None = None) -> LongFormRequest:
      ctx: dict = {
          "user_prompt": "A spy in wartime.",
          "genre": "thriller",
          "audience": "adult",
          "continuity_notes": [],
      }
      if language:
          ctx["language"] = language
      return LongFormRequest.model_validate({
          "context": ctx,
          "vibe": {"aggression": 9, "reader_respect": 7, "morality": 9, "source_fidelity": 5},
          "chapter_count": 2,
          "chapter_word_target": 400,
          "stream": True,
      })


  def test_chapter_system_prompt_contains_directives_with_not() -> None:
      """system_prompt must contain '| NOT:' formatted directives."""
      envelope = _build_chapter_prompt(
          request=_make_request(),
          chapter=_make_chapter(),
          previous_summaries=[],
          calibration=_make_calibration(),
      )
      assert "| NOT:" in envelope.system_prompt


  def test_chapter_system_prompt_contains_all_four_metrics() -> None:
      """system_prompt must enumerate all four metric names."""
      system = _build_chapter_prompt(
          request=_make_request(),
          chapter=_make_chapter(),
          previous_summaries=[],
          calibration=_make_calibration(),
      ).system_prompt
      for metric in ("aggression", "reader_respect", "morality", "source_fidelity"):
          assert metric in system, f"Metric '{metric}' missing from system_prompt"


  def test_chapter_user_prompt_starts_with_tone_recap() -> None:
      """user_prompt must begin with a 'Tone:' vibe recap line."""
      envelope = _build_chapter_prompt(
          request=_make_request(),
          chapter=_make_chapter(),
          previous_summaries=[],
          calibration=_make_calibration(aggression=0.9, morality=0.9),
      )
      assert envelope.user_prompt.startswith("Tone:")
      first_line = envelope.user_prompt.split("\n")[0]
      assert "dominant" in first_line


  def test_chapter_user_prompt_contains_story_brief() -> None:
      """user_prompt must contain the story brief."""
      envelope = _build_chapter_prompt(
          request=_make_request(),
          chapter=_make_chapter(),
          previous_summaries=[],
          calibration=_make_calibration(),
      )
      assert "A spy in wartime." in envelope.user_prompt


  def test_chapter_language_instruction_in_system_only() -> None:
      """Language constraint must appear in system_prompt and NOT in user_prompt."""
      envelope = _build_chapter_prompt(
          request=_make_request(language="uk"),
          chapter=_make_chapter(),
          previous_summaries=[],
          calibration=_make_calibration(),
      )
      assert "Ukrainian" in envelope.system_prompt
      assert "Ukrainian" not in envelope.user_prompt


  def test_chapter_no_language_instruction_when_unset() -> None:
      """When language is not set, neither prompt should contain a language instruction."""
      envelope = _build_chapter_prompt(
          request=_make_request(),
          chapter=_make_chapter(),
          previous_summaries=[],
          calibration=_make_calibration(),
      )
      assert "Ukrainian" not in envelope.system_prompt
      assert "Ukrainian" not in envelope.user_prompt
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd backend && ../.venv/bin/pytest tests/test_chapter_prompt.py -v
  ```

  Expected: all 6 tests FAIL — `_build_chapter_prompt` still takes `calibration_directive_lines: str`, so the import will fail or the signature won't match.

- [ ] **Step 3: Add `CalibrationProfile` import to `long_form_orchestrator.py`**

  At the top of `backend/app/services/long_form_orchestrator.py`, add to the existing imports:

  ```python
  from app.domain.vibe_models import CalibrationProfile
  ```

- [ ] **Step 4: Rewrite `_build_chapter_prompt` signature and body**

  Replace the entire `_build_chapter_prompt` function in `long_form_orchestrator.py`:

  ```python
  def _build_chapter_prompt(
      request: LongFormRequest,
      chapter: ChapterOutline,
      previous_summaries: list[str],
      calibration: CalibrationProfile,
  ) -> PromptEnvelope:
      """Compose a chapter-writing prompt including continuity and vibe context."""

      lang = (request.context.language or "").strip().lower()
      lang_instruction = ""
      if lang in ("uk", "ua", "ukr", "ukraine"):
          lang_instruction = (
              "Output language requirement: Ukrainian only (Cyrillic). "
              "Do not switch to English."
          )
      elif lang in ("ru", "rus", "russian"):
          lang_instruction = (
              "Output language requirement: Russian only (Cyrillic). "
              "Do not switch to English."
          )
      elif lang in ("kk", "kaz", "kazakh"):
          lang_instruction = (
              "Output language requirement: Kazakh only (Cyrillic script). "
              "Do not switch to English or Russian."
          )
      elif lang.startswith("en"):
          lang_instruction = "Output language requirement: English only."

      directive_block = "\n".join(
          f"- {d.metric_name}: {d.instruction} | NOT: {d.negative_instruction}"
          for d in calibration.directives
      )

      system_prompt = (
          "You are LoreForge, a calibrated narrative model writing a long-form story "
          "one chapter at a time.\n\n"
          "Vibe directives — apply these throughout the chapter:\n"
          f"{directive_block}\n"
          + (f"\n{lang_instruction}\n" if lang_instruction else "")
          + "\nWrite only the chapter body — no headers, no preamble."
      )

      aggression_band = calibration.directives[0].band   # index 0 = aggression
      morality_band = calibration.directives[2].band     # index 2 = morality

      continuity_block = (
          "Previous chapters (for continuity):\n"
          + "\n".join(f"  Ch{i+1}: {s}" for i, s in enumerate(previous_summaries))
          + "\n\n"
          if previous_summaries
          else ""
      )

      user_prompt = (
          f"Tone: {aggression_band} aggression, {morality_band} morality — hold this throughout.\n\n"
          f"Story brief: {request.context.user_prompt}\n"
          f"Genre: {request.context.genre or 'unspecified'}\n\n"
          f"{continuity_block}"
          f"Chapter {chapter.number}: {chapter.title}\n"
          f"Chapter arc: {chapter.summary}\n"
          f"Target words: ~{chapter.word_target}\n\n"
          "Write the chapter now."
      )

      return PromptEnvelope(
          system_prompt=system_prompt,
          user_prompt=user_prompt,
          metadata={"chapter": chapter.number},
      )
  ```

- [ ] **Step 5: Update the call site in `LongFormOrchestrator.stream()`**

  Find the `directive_lines` variable (lines 128–130) and the `_build_chapter_prompt` call (~line 169) in `long_form_orchestrator.py`.

  **Remove** the `directive_lines` variable entirely:
  ```python
  # DELETE these lines:
  directive_lines = "\n".join(
      f"- {d.metric_name}: {d.instruction}" for d in calibration.directives
  )
  ```

  **Update** the `_build_chapter_prompt` call to pass `calibration` instead of `calibration_directive_lines`:
  ```python
  # BEFORE:
  chapter_prompt = _build_chapter_prompt(
      request=request,
      chapter=chapter_outline,
      previous_summaries=previous_summaries,
      calibration_directive_lines=directive_lines,
  )

  # AFTER:
  chapter_prompt = _build_chapter_prompt(
      request=request,
      chapter=chapter_outline,
      previous_summaries=previous_summaries,
      calibration=calibration,
  )
  ```

- [ ] **Step 6: Run tests to confirm they pass**

  ```bash
  cd backend && ../.venv/bin/pytest tests/test_chapter_prompt.py -v
  ```

  Expected: all 6 tests PASSED.

- [ ] **Step 7: Run full test suite**

  ```bash
  cd backend && ../.venv/bin/pytest -q
  ```

  Expected: all tests pass including existing `test_long_form_log_events.py`.

- [ ] **Step 8: Commit**

  ```bash
  cd backend && git add app/services/long_form_orchestrator.py tests/test_chapter_prompt.py
  git commit -m "feat: restructure chapter writer prompt with | NOT: directives and vibe recap anchor"
  ```

---

## Task 4: Frontend Inspection + Smoke Test

**Files:**
- Read-only verify: `frontend/src/lib/story-streaming.ts`
- Read-only verify: `frontend/src/components/use-long-form-stream.tsx`

- [ ] **Step 1: Confirm `story-streaming.ts` is safe**

  Open `frontend/src/lib/story-streaming.ts` and locate `parseSseChunk`. The return type is `{ event: string; payload: Record<string, unknown> }` — a generic object. JSON.parse produces an untyped object; no fields are destructured by name. This means unknown fields (including `negative_instruction`) are silently ignored. No code change needed. ✓

- [ ] **Step 2: Confirm `use-long-form-stream.tsx` is safe**

  Open `frontend/src/components/use-long-form-stream.tsx` and find the `complete` event handler. It should only set stream status and not destructure `normalized_vibe.directives`. No code change needed. ✓

- [ ] **Step 3: Run smoke test**

  ```bash
  cd /home/mikha/projects/story-mixer && make smoke-stream
  ```

  Expected: request completes, SSE events printed, pipeline exits 0. This also validates the LangChain `[SystemMessage, HumanMessage]` message-list API path for the outline agent end-to-end.

- [ ] **Step 4: Commit smoke test result (nothing to commit if no files changed)**

  If any files were changed during debugging, commit them now. Otherwise skip.

---

## Task 5: Final verification

- [ ] **Step 1: Run the complete test suite one last time**

  ```bash
  cd backend && ../.venv/bin/pytest -v
  ```

  Expected: all tests pass.

- [ ] **Step 2: Run frontend lint**

  ```bash
  cd frontend && npm run lint
  ```

  Expected: no errors.
