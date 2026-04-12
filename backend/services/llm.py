from __future__ import annotations

import re

import httpx

from backend.config import settings


class LlmService:
    def __init__(self) -> None:
        self._base_url = settings.cerebras_base_url.rstrip("/")
        self._model = settings.cerebras_chat_model
        self._api_key = settings.cerebras_api_key.strip()

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
        if not self._api_key:
            return self._fallback_summarize(transcription)

        return self._chat(
            system_prompt="You are a helpful assistant that summarizes lecture transcriptions clearly and concisely.",
            user_prompt=(
                "Summarize the following lecture transcription. "
                "Use concise bullet points with key concepts and outcomes.\n\n"
                f"{transcription}"
            ),
        )

    def answer_question(self, summary: str, question: str) -> str:
        if not self._api_key:
            return self._fallback_answer(summary, question)

        return self._chat(
            system_prompt="You answer questions based only on provided context. If context is insufficient, say so clearly.",
            user_prompt=f"Summary:\n{summary}\n\nQuestion: {question}",
        )

    def answer_with_context(self, contexts: list[str], question: str) -> str:
        if not self._api_key:
            return self._fallback_answer("\n\n".join(contexts), question)

        context_blob = "\n\n---\n\n".join(contexts)
        return self._chat(
            system_prompt="You are a precise study assistant. Use only the provided context.",
            user_prompt=f"Context:\n{context_blob}\n\nQuestion: {question}",
        )

    def _fallback_summarize(self, transcription: str) -> str:
        sentences = self._split_sentences(transcription)
        if not sentences:
            return "No transcription content was found to summarize."

        top = sentences[:6]
        bullets = "\n".join(f"- {sentence}" for sentence in top)
        return (
            "Offline summary (set CEREBRAS_API_KEY for higher-quality model output):\n"
            f"{bullets}"
        )

    def _fallback_answer(self, source_text: str, question: str) -> str:
        sentences = self._split_sentences(source_text)
        if not sentences:
            return "I could not find enough context to answer this question."

        query_terms = {term for term in re.findall(r"[a-zA-Z0-9]+", question.lower()) if len(term) > 2}
        scored: list[tuple[int, str]] = []
        for sentence in sentences:
            terms = set(re.findall(r"[a-zA-Z0-9]+", sentence.lower()))
            score = len(query_terms.intersection(terms))
            scored.append((score, sentence))

        scored.sort(key=lambda item: item[0], reverse=True)
        best = [text for score, text in scored if score > 0][:3]
        if not best:
            best = sentences[:2]

        return (
            "Offline answer based on available summary text "
            "(set CEREBRAS_API_KEY for model-generated answers):\n"
            + "\n".join(f"- {line}" for line in best)
        )

    def _split_sentences(self, text: str) -> list[str]:
        raw = re.split(r"(?<=[.!?])\s+|\n+", text)
        return [line.strip() for line in raw if line and line.strip()]
