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
