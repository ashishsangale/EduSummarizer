from __future__ import annotations

import httpx

from backend.config import settings


class LlmService:
    def __init__(self) -> None:
        self._base_url = settings.cerebras_base_url.rstrip("/")
        self._model = settings.cerebras_chat_model
        self._api_key = settings.cerebras_api_key

    def _chat(self, system_prompt: str, user_prompt: str) -> str:
        if not self._api_key:
            raise RuntimeError("CEREBRAS_API_KEY is not set")

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }

        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                f"{self._base_url}/chat/completions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()

        choices = data.get("choices", [])
        message = choices[0].get("message", {}) if choices else {}
        content = message.get("content", "").strip()
        if not content:
            raise RuntimeError("Cerebras returned an empty response")
        return content

    def summarize_transcription(self, transcription: str) -> str:
        return self._chat(
            system_prompt="You are a helpful assistant that summarizes lecture transcriptions clearly and concisely.",
            user_prompt=(
                "Summarize the following lecture transcription. "
                "Use concise bullet points with key concepts and outcomes.\n\n"
                f"{transcription}"
            ),
        )

    def answer_question(self, summary: str, question: str) -> str:
        return self._chat(
            system_prompt="You answer questions based only on provided context. If context is insufficient, say so clearly.",
            user_prompt=f"Summary:\n{summary}\n\nQuestion: {question}",
        )

    def answer_with_context(self, contexts: list[str], question: str) -> str:
        context_blob = "\n\n---\n\n".join(contexts)
        return self._chat(
            system_prompt="You are a precise study assistant. Use only the provided context.",
            user_prompt=f"Context:\n{context_blob}\n\nQuestion: {question}",
        )
