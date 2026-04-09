from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from typing import Any

import faiss
import numpy as np

from backend.config import settings


@dataclass
class RetrievalResult:
    contexts: list[str]


class _FallbackEncoder:
    def __init__(self, dim: int = 384) -> None:
        self._dim = dim

    def encode(self, texts: list[str], convert_to_numpy: bool = True) -> np.ndarray:
        vectors = np.vstack([self._encode_text(text) for text in texts]).astype("float32")
        return vectors

    def _encode_text(self, text: str) -> np.ndarray:
        vec = np.zeros(self._dim, dtype="float32")
        tokens = text.lower().split()
        if not tokens:
            return vec

        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            idx = int.from_bytes(digest[:4], byteorder="big") % self._dim
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vec[idx] += sign

        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec


class RetrievalService:
    def __init__(self) -> None:
        os.makedirs(settings.retrieval_dir, exist_ok=True)
        self._encoder: Any | None = None

    def _get_encoder(self) -> Any:
        if self._encoder is not None:
            return self._encoder

        try:
            from sentence_transformers import SentenceTransformer

            self._encoder = SentenceTransformer(settings.embedding_model_name)
            return self._encoder
        except Exception:
            self._encoder = _FallbackEncoder(dim=384)
            return self._encoder

    def _index_path(self, filename: str) -> str:
        safe = filename.replace("/", "_")
        return os.path.join(settings.retrieval_dir, f"{safe}.index")

    def _meta_path(self, filename: str) -> str:
        safe = filename.replace("/", "_")
        return os.path.join(settings.retrieval_dir, f"{safe}.json")

    def _chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 75) -> list[str]:
        chunks: list[str] = []
        start = 0
        while start < len(text):
            end = min(len(text), start + chunk_size)
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end == len(text):
                break
            start = max(end - overlap, start + 1)
        return chunks

    def delete_index_files(self, filename: str) -> int:
        removed = 0
        for path in (self._index_path(filename), self._meta_path(filename)):
            if os.path.exists(path):
                os.remove(path)
                removed += 1
        return removed

    def index_summary(self, filename: str, summary_text: str) -> int:
        chunks = self._chunk_text(summary_text)
        # Ensure a re-index replaces previous artifacts for the same filename.
        self.delete_index_files(filename)

        if not chunks:
            return 0

        encoder = self._get_encoder()

        embeddings = encoder.encode(chunks, convert_to_numpy=True)
        vectors = np.asarray(embeddings, dtype="float32")

        dim = vectors.shape[1]
        index = faiss.IndexFlatIP(dim)

        faiss.normalize_L2(vectors)
        index.add(vectors)

        faiss.write_index(index, self._index_path(filename))
        with open(self._meta_path(filename), "w", encoding="utf-8") as fp:
            json.dump({"chunks": chunks}, fp)

        return len(chunks)

    def query(self, filename: str, question: str, top_k: int = 3) -> RetrievalResult:
        encoder = self._get_encoder()
        index_path = self._index_path(filename)
        meta_path = self._meta_path(filename)

        if not os.path.exists(index_path) or not os.path.exists(meta_path):
            return RetrievalResult(contexts=[])

        index = faiss.read_index(index_path)
        with open(meta_path, "r", encoding="utf-8") as fp:
            metadata = json.load(fp)

        chunks: list[str] = metadata.get("chunks", [])
        if not chunks:
            return RetrievalResult(contexts=[])

        query_embedding = encoder.encode([question], convert_to_numpy=True)
        query_vector = np.asarray(query_embedding, dtype="float32")
        faiss.normalize_L2(query_vector)

        k = min(top_k, len(chunks))
        _, indices = index.search(query_vector, k)
        selected = [chunks[i] for i in indices[0] if 0 <= i < len(chunks)]
        return RetrievalResult(contexts=selected)
