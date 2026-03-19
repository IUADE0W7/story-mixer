# Vibe Controller Design Language

The Vibe Controller should feel like a narrative mixing board rather than a generic form. The layout should prioritize precise, low-friction tuning, fast reading of current settings, and clear feedback during generation.

## Component Stack

- `Card` for the controller shell.
- `Slider` from shadcn/ui for each metric.
- `Input` for exact numeric override where precision matters.
- `Badge` for semantic bands such as `Balanced` or `Dominant`.
- `Alert` for soft warnings derived from conflicting metric combinations.
- `Progress` or streaming text panel for live generation feedback.

## Layout Direction

Use a mixing-board layout with four stacked horizontal sliders on mobile and aligned columns on wider screens.

- Aggression controls intensity and should occupy the first position.
- Reader Respect should sit in the center because it often mediates the tone created by the other metrics.
- Morality should anchor the ethical framing channel.
- Source Fidelity should follow as the fourth channel, controlling how closely the output follows named source tales versus inventing new material.

## Visual Language

Adopt distinct but restrained channels instead of a rainbow UI.

- Aggression: ember to rust scale.
- Reader Respect: slate-blue to ink scale.
- Morality: moss to pine scale.
- Source Fidelity: sand to amber scale (low = open invention, high = canonical retelling).
- Background: warm parchment or graphite-neutral surface, depending on the surrounding app theme.

Suggested CSS variable foundation:

```css
:root {
  --vibe-aggression: oklch(0.62 0.17 34);
  --vibe-respect: oklch(0.56 0.09 248);
  --vibe-morality: oklch(0.67 0.13 145);
  --vibe-source-fidelity: oklch(0.72 0.12 75);
  --vibe-surface: oklch(0.97 0.01 95);
  --vibe-foreground: oklch(0.24 0.02 262);
}
```

## Interaction Rules

- The visible slider range is `1–10`, but labels should map to semantic bands instead of raw numbers alone.
- Each slider should show the current numeric value, the normalized band label, and a one-line tone description.
- Soft warnings should appear inline as the user edits, not only after submit.
- The Generate button should stay enabled for all combinations because conflicting metrics are intentional creative inputs.
- During streaming, lock the sliders only if the user is editing the active request rather than preparing the next one.

## Accessibility

- Add an explicit `aria-label` to each slider using the metric name.
- Provide keyboard increment steps of `1` across the 1–10 range for precise control.
- Mirror current values in text adjacent to the thumb so color is never the only signal.
- Announce judge warnings and completion state through an `aria-live` region.

## shadcn/ui Implementation Notes

- Extend the base `Slider` with metric-specific track and range classes instead of forking the component.
- Use `cn`-driven variants for `aggression`, `readerRespect`, `morality`, and `sourceFidelity` so the API stays small.
- Keep the semantic band mapping in shared TypeScript constants that mirror the backend calibration bands.
- Display the judge report in a secondary `Card` next to the generated story so users can understand why a revision occurred.

## Vibe Metrics

### Tone Metrics

| Metric | Band labels (1→10) |
| --- | --- |
| Aggression | Gentle, Measured, Tense, Forceful, Combustive |
| Reader Respect | Provocative, Spare, Balanced, Trusting, Expert-facing |
| Morality | Amoral, Ambiguous, Textured, Principled, Righteous |

### Source Fidelity

Controls how much of the generated output is drawn from the named source tales versus freely invented.

| Value | Band | Behaviour |
| --- | --- | --- |
| 1–2 | Strongly Minimized — Pure Invention | Source tales are loose inspiration only; plot, characters, and events may diverge freely. |
| 3–4 | Restrained — Loose Inspiration | Character names and settings borrowed; plot beats treated as optional. |
| 5–6 | Balanced — Blended | Most recognisable source moments preserved; connecting tissue freely invented. |
| 7–8 | Elevated — Faithful | Key plot beats followed closely; deviations only where vibe calibration demands. |
| 9–10 | Dominant — Canonical | Canonical facts and sequence preserved; only tone and framing rewritten. |

Source Fidelity only has a meaningful effect when the `public_title` field contains two or more comma-separated tale names. At low fidelity the generator is essentially writing a new story inspired by the names; at high fidelity it rewrites the original tales with the requested vibe applied.

These labels should remain presentation-only. The backend remains responsible for numeric normalization and the authoritative calibration directives.
