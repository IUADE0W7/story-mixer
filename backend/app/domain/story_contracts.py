"""Domain contracts shared across story generation pipelines."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StoryContext(BaseModel):
    """Context envelope that travels with a generation request."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    user_prompt: str = Field(min_length=1, max_length=12_000)
    public_title: str | None = Field(default=None, max_length=180)
    genre: str | None = Field(default=None, max_length=120)
    audience: str | None = Field(default=None, max_length=120)
    continuity_notes: tuple[str, ...] = Field(default_factory=tuple)
    existing_story_id: str | None = None
    language: str | None = Field(default=None, max_length=8)

    @field_validator("user_prompt")
    @classmethod
    def normalize_user_prompt(cls, value: str) -> str:
        """Trim transport whitespace so blank prompts are rejected consistently."""

        normalized = value.strip()
        if not normalized:
            raise ValueError("user_prompt must not be blank.")
        return normalized

    @field_validator("public_title")
    @classmethod
    def normalize_public_title(cls, value: str | None) -> str | None:
        """Treat whitespace-only titles as omitted instead of persisting empty labels."""

        if value is None:
            return None

        normalized = value.strip()
        return normalized or None


