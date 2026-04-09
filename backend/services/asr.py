from __future__ import annotations

from faster_whisper import WhisperModel

from backend.config import settings


class AsrService:
    def __init__(self) -> None:
        self._model: WhisperModel | None = None

    def _get_model(self) -> WhisperModel:
        if self._model is None:
            self._model = WhisperModel(
                settings.whisper_model_size,
                compute_type=settings.whisper_compute_type,
            )
        return self._model

    def transcribe(self, audio_path: str) -> str:
        model = self._get_model()
        segments, _ = model.transcribe(audio_path)
        return " ".join(segment.text.strip() for segment in segments if segment.text).strip()
