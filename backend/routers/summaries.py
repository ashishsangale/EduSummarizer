from __future__ import annotations

import os
import shutil
import time
import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.config import settings
from backend.db import SummaryRepository
from backend.models import (
    AskRequest,
    AskResponse,
    RetrievalIndexResponse,
    SummaryItem,
    TranscribeSummarizeResponse,
)
from backend.services.asr import AsrService
from backend.services.llm import LlmService
from backend.services.retrieval import RetrievalService

router = APIRouter(prefix="/api/v1/summaries", tags=["summaries"])

repo = SummaryRepository()
asr_service = AsrService()
llm_service = LlmService()
retrieval_service = RetrievalService()
logger = logging.getLogger(__name__)


def _sanitize_filename(raw_name: str | None) -> str:
    if raw_name:
        cleaned = os.path.basename(raw_name).strip()
        if cleaned:
            return cleaned
    return f"audio_{int(time.time())}.wav"


@router.post("/transcribe-and-summarize", response_model=TranscribeSummarizeResponse)
def transcribe_and_summarize(file: UploadFile = File(...)) -> TranscribeSummarizeResponse:
    os.makedirs(settings.upload_dir, exist_ok=True)

    filename = _sanitize_filename(file.filename)
    audio_path = os.path.join(settings.upload_dir, filename)

    try:
        with open(audio_path, "wb") as output:
            shutil.copyfileobj(file.file, output)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to save uploaded file: {exc}") from exc
    finally:
        file.file.close()

    try:
        try:
            transcription = asr_service.transcribe(audio_path)
            if not transcription:
                raise HTTPException(status_code=422, detail="Transcription is empty")

            summary = llm_service.summarize_transcription(transcription)
            if not summary:
                raise HTTPException(status_code=422, detail="Summary is empty")

            repo.upsert_summary(filename=filename, transcription=transcription, summary=summary)
            try:
                retrieval_service.index_summary(filename, summary)
            except RuntimeError as exc:
                logger.warning("Auto-index skipped for %s: %s", filename, exc)
            except Exception as exc:
                logger.exception("Auto-index failed for %s: %s", filename, exc)

            return TranscribeSummarizeResponse(
                filename=filename,
                transcription=transcription,
                summary=summary,
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Processing failed: {exc}") from exc
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)


@router.get("", response_model=list[SummaryItem])
def list_summaries() -> list[SummaryItem]:
    return [SummaryItem(**item) for item in repo.list_summaries()]


@router.get("/{filename}", response_model=SummaryItem)
def get_summary(filename: str) -> SummaryItem:
    item = repo.get_summary(filename)
    if not item:
        raise HTTPException(status_code=404, detail="Summary not found")
    return SummaryItem(**item)


@router.delete("/{filename}")
def delete_summary(filename: str) -> dict[str, str]:
    deleted = repo.delete_summary(filename)
    if not deleted:
        raise HTTPException(status_code=404, detail="Summary not found")
    retrieval_service.delete_index_files(filename)
    return {"status": "deleted", "filename": filename}


@router.post("/{filename}/ask", response_model=AskResponse)
def ask_question(filename: str, request: AskRequest) -> AskResponse:
    item = repo.get_summary(filename)
    if not item:
        raise HTTPException(status_code=404, detail="Summary not found")

    summary_text = item.get("summary", "")
    if not summary_text:
        raise HTTPException(status_code=422, detail="No summary available for this file")

    try:
        answer = llm_service.answer_question(summary_text, request.question)
        return AskResponse(answer=answer)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to generate answer: {exc}") from exc


@router.post("/{filename}/index", response_model=RetrievalIndexResponse)
def index_summary(filename: str) -> RetrievalIndexResponse:
    item = repo.get_summary(filename)
    if not item:
        raise HTTPException(status_code=404, detail="Summary not found")

    summary_text = item.get("summary", "")
    if not summary_text:
        raise HTTPException(status_code=422, detail="No summary available for indexing")

    try:
        chunks = retrieval_service.index_summary(filename, summary_text)
        return RetrievalIndexResponse(filename=filename, chunks_indexed=chunks)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to build retrieval index: {exc}") from exc


@router.post("/{filename}/retrieve-ask", response_model=AskResponse)
def retrieve_then_ask(filename: str, request: AskRequest) -> AskResponse:
    try:
        result = retrieval_service.query(filename, request.question)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to run retrieval query: {exc}") from exc

    if not result.contexts:
        raise HTTPException(
            status_code=404,
            detail="No retrieval index found or no relevant context returned. Index first via /index.",
        )

    try:
        answer = llm_service.answer_with_context(result.contexts, request.question)
        return AskResponse(answer=answer)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to generate retrieval answer: {exc}") from exc
