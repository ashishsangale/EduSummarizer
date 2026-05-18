from __future__ import annotations

import re

import cerebras.cloud.sdk
from cerebras.cloud.sdk import Cerebras

from backend.config import settings


class LlmService:
    def __init__(self) -> None:
        self._base_url = settings.cerebras_base_url.rstrip("/")
        self._model = settings.cerebras_chat_model
        self._api_key = settings.cerebras_api_key.strip()
        self._client = (
            Cerebras(api_key=self._api_key)
            if self._api_key
            else None
        )

    def _chat(self, system_prompt: str, user_prompt: str) -> str:
        if not self._api_key:
            raise RuntimeError("CEREBRAS_API_KEY is not set")

        if self._client is None:
            raise RuntimeError("CEREBRAS_API_KEY is not set")

        endpoint = f"{self._base_url}/chat/completions"
        try:
            completion = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
            )
        except cerebras.cloud.sdk.APIStatusError as exc:
            status = exc.status_code
            detail = str(exc.response) if exc.response is not None else str(exc)
            if status == 404:
                raise RuntimeError(
                    "Cerebras model not found or not accessible (404). "
                    f"URL: {endpoint} | model: {self._model}. "
                    "Double-check that your API key has GPT-OSS access and that the model name matches the docs. "
                    f"Server response: {detail}"
                ) from exc
            raise RuntimeError(f"Cerebras request failed ({status}): {detail}") from exc
        except cerebras.cloud.sdk.APIConnectionError as exc:
            raise RuntimeError(f"Cerebras connection failed: {exc}") from exc

        choices = completion.choices or []
        message = choices[0].message if choices else None
        content = (message.content or "").strip() if message else ""
        if not content:
            raise RuntimeError("Cerebras returned an empty response")
        return content

    def summarize_transcription(self, transcription: str) -> str:
        if not self._api_key:
            return self._fallback_summarize(transcription)

        return self._chat(
            system_prompt=(
                "You are an expert academic note-taking assistant. "
                "Create accurate, structured summaries from lecture transcripts. "
                "Prioritize conceptual clarity, key mechanisms, definitions, and outcomes. "
                "Do not invent details not supported by the transcript. "
                "If parts are unclear, label them as uncertain rather than guessing. "
                "Keep language concise and student-friendly."
            ),
            user_prompt=(
                "Summarize the lecture transcription below. Format the output with these sections: "
                "1) Lecture Title Guess (short), "
                "2) Key Ideas (5-10 bullets), "
                "3) Definitions/Formulas/Terms (bullets), "
                "4) Important Examples (bullets), "
                "5) Quick Revision (3 bullets). "
                "Keep it compact and faithful to the transcript.\n\n"
                f"{transcription}"
            ),
        )

    def answer_question(self, summary: str, question: str) -> str:
        if not self._api_key:
            return self._fallback_answer(summary, question)

        return self._chat(
            system_prompt=(
                "You are an AI educational assistant designed to help students understand lecture material. "
                "Use only the provided lecture context and do not use external knowledge. "
                "If the context is insufficient, reply exactly: \"The provided context does not contain enough information to answer this question.\" "
                "Be clear, accurate, structured, and supportive. "
                "Teach concepts instead of giving only short answers. "
                "Use step-by-step reasoning when helpful, and ask for clarification if the question is ambiguous. "
                "If the question is conceptual, explain the concept first, then answer. "
                "If the question is factual, answer directly and concisely. "
                "Always follow this output structure unless context is insufficient: "
                "1) Direct Answer, 2) Explanation (if needed), 3) Key Takeaway (1-2 lines), "
                "4) Optional Example from lecture, 5) Optional Follow-up question."
            ),
            user_prompt=(
                "Answer using only this lecture summary context. "
                "If context is insufficient, return the exact fallback sentence.\n\n"
                f"Summary:\n{summary}\n\nQuestion: {question}"
            ),
        )

    def answer_with_context(self, contexts: list[str], question: str) -> str:
        if not self._api_key:
            return self._fallback_answer("\n\n".join(contexts), question)

        context_blob = "\n\n---\n\n".join(contexts)
        return self._chat(
            system_prompt=(
                "You are an AI educational assistant designed to help students understand lecture material. "
                "Use only retrieved lecture context and do not use external knowledge. "
                "If the context is insufficient, reply exactly: \"The provided context does not contain enough information to answer this question.\" "
                "Be clear, accurate, structured, and supportive. "
                "Teach concepts instead of giving only short answers. "
                "Use step-by-step reasoning when helpful, and ask for clarification if the question is ambiguous. "
                "If the question is conceptual, explain the concept first, then answer. "
                "If the question is factual, answer directly and concisely. "
                "Always follow this output structure unless context is insufficient: "
                "1) Direct Answer, 2) Explanation (if needed), 3) Key Takeaway (1-2 lines), "
                "4) Optional Example from lecture, 5) Optional Follow-up question."
            ),
            user_prompt=(
                "Answer using only this retrieved lecture context. "
                "If context is insufficient, return the exact fallback sentence.\n\n"
                f"Context:\n{context_blob}\n\nQuestion: {question}"
            ),
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
            return "The provided context does not contain enough information to answer this question."

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
