from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator


class AskRequest(BaseModel):
    question: str = Field(min_length=1)


class AskResponse(BaseModel):
    answer: str


class SummaryItem(BaseModel):
    filename: str
    summary: str
    transcription: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def normalize_timestamp(cls, value: object) -> str | None:
        if value is None:
            return None

        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()

        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc).isoformat()
            return value.isoformat()

        return str(value)


class TranscribeSummarizeResponse(BaseModel):
    filename: str
    transcription: str
    summary: str


class RetrievalIndexResponse(BaseModel):
    filename: str
    chunks_indexed: int


class RenameSummaryRequest(BaseModel):
    new_name: str = Field(min_length=1)


class RenameSummaryResponse(BaseModel):
    old_filename: str
    new_filename: str
