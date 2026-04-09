from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pymongo import MongoClient

from backend.config import settings


class SummaryRepository:
    def __init__(self) -> None:
        self._client = MongoClient(settings.mongo_uri)
        self._collection = self._client[settings.mongo_db_name][settings.mongo_collection_name]

    def list_summaries(self) -> list[dict[str, Any]]:
        docs = list(
            self._collection.find({}, {"_id": 0}).sort("updated_at", -1)
        )
        return docs

    def get_summary(self, filename: str) -> dict[str, Any] | None:
        return self._collection.find_one({"filename": filename}, {"_id": 0})

    def upsert_summary(self, filename: str, transcription: str, summary: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self._collection.update_one(
            {"filename": filename},
            {
                "$set": {
                    "filename": filename,
                    "transcription": transcription,
                    "summary": summary,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )

    def delete_summary(self, filename: str) -> bool:
        result = self._collection.delete_one({"filename": filename})
        return result.deleted_count > 0
