"""Operation question-answer knowledge base backed by SQLite and ChromaDB."""

from __future__ import annotations

import math
import os
import re
import sqlite3
from pathlib import Path
from typing import Callable, Optional


EmbeddingFunction = Callable[[list[str]], list[Optional[list[float]]]]


class OperationQAKB:
    def __init__(
        self,
        *,
        database_path: Path,
        chroma_dir: Path,
        embedding_function: EmbeddingFunction | None = None,
    ) -> None:
        self.database_path = database_path
        self.chroma_dir = chroma_dir
        self.embedding_function = embedding_function
        self._collection = None
        self._chroma_available = False

    def initialize(self) -> None:
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        try:
            os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
            import chromadb
            from chromadb.config import Settings as ChromaSettings

            client = chromadb.PersistentClient(
                path=str(self.chroma_dir),
                settings=ChromaSettings(anonymized_telemetry=False),
            )
            self._collection = client.get_or_create_collection("operation_qa")
            self._chroma_available = True
            self._sync_chroma_collection()
        except Exception:
            self._collection = None
            self._chroma_available = False

    def search(
        self,
        *,
        query: str,
        current_step_id: str,
        product_id: str | None,
        top_k: int = 5,
    ) -> dict | None:
        query = query.strip()
        if not query:
            return None

        if self._chroma_available and self._collection is not None:
            hit = self._search_chroma(
                query=query,
                current_step_id=current_step_id,
                product_id=product_id,
                top_k=top_k,
            )
            if hit is not None:
                return hit
        return self._search_sqlite_keywords(query=query, top_k=top_k)

    def _sync_chroma_collection(self) -> None:
        rows = self._rows()
        if not rows or self._collection is None:
            return

        ids = [row["qa_id"] for row in rows]
        documents = [self._embedding_document_text(row) for row in rows]
        embeddings = self._embed_texts(documents)
        if embeddings is None:
            self._chroma_available = False
            return
        metadatas = [
            {
                "qa_id": row["qa_id"],
                "category": row["category"],
                "product_id": row["product_id"],
                "step_id": row["step_id"],
                "query": row["query"],
            }
            for row in rows
        ]
        self._collection.upsert(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    def _search_chroma(
        self,
        *,
        query: str,
        current_step_id: str,
        product_id: str | None,
        top_k: int,
    ) -> dict | None:
        if self._collection is None:
            return None

        embeddings = self._embed_texts([query])
        if embeddings is None:
            return None
        query_embedding = embeddings[0]
        result = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=max(top_k, 10),
            include=["distances", "metadatas"],
        )
        ids = (result.get("ids") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        best: tuple[float, sqlite3.Row] | None = None
        for qa_id, distance, metadata in zip(ids, distances, metadatas):
            if not self._metadata_matches(metadata, current_step_id, product_id):
                continue
            row = self._row_by_id(str(qa_id))
            if row is None:
                continue
            semantic_score = 1.0 / (1.0 + max(0.0, float(distance)))
            lexical_score = _lexical_score(query, self._embedding_document_text(row))
            score = (0.75 * semantic_score) + (0.25 * lexical_score)
            if best is None or score > best[0]:
                best = (score, row)

        if best is None or best[0] < 0.2:
            return None
        return self._result(best[1], score=round(best[0], 3), source="chroma")

    @staticmethod
    def _metadata_matches(
        metadata: dict,
        current_step_id: str,
        product_id: str | None,
    ) -> bool:
        row_product = metadata.get("product_id")
        row_step = metadata.get("step_id")
        product_ok = row_product in {"default", product_id, None}
        step_ok = row_step in {"all", current_step_id, None}
        return bool(product_ok and step_ok)

    def _search_sqlite_keywords(self, *, query: str, top_k: int) -> dict | None:
        query_tokens = set(_tokens(query))
        best: tuple[float, sqlite3.Row] | None = None
        for row in self._rows():
            document_tokens = set(_tokens(self._embedding_document_text(row)))
            if not query_tokens or not document_tokens:
                continue
            overlap = len(query_tokens & document_tokens)
            score = overlap / math.sqrt(len(query_tokens) * len(document_tokens))
            if best is None or score > best[0]:
                best = (score, row)

        if best is None or best[0] < 0.08:
            return None
        return self._result(best[1], score=round(best[0], 3), source="sqlite_keyword")

    def _rows(self) -> list[sqlite3.Row]:
        with self._connect() as connection:
            return connection.execute(
                """
                SELECT qa_id, category, query, original_user_questions,
                       original_comment_answer_clues, answer, product_id, step_id
                FROM operation_qa
                ORDER BY qa_id
                """
            ).fetchall()

    def _row_by_id(self, qa_id: str) -> sqlite3.Row | None:
        with self._connect() as connection:
            return connection.execute(
                """
                SELECT qa_id, category, query, original_user_questions,
                       original_comment_answer_clues, answer, product_id, step_id
                FROM operation_qa
                WHERE qa_id = ?
                """,
                (qa_id,),
            ).fetchone()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _embed_texts(self, texts: list[str]) -> list[list[float]] | None:
        if self.embedding_function is not None:
            try:
                embeddings = self.embedding_function(texts)
                if all(isinstance(item, list) and item for item in embeddings):
                    return [item for item in embeddings if item is not None]
            except Exception:
                pass
        return None

    @staticmethod
    def _embedding_document_text(row: sqlite3.Row) -> str:
        return "\n".join(
            item
            for item in (
                row["query"],
                row["original_user_questions"] or "",
            )
            if item
        )

    @staticmethod
    def _result(row: sqlite3.Row, *, score: float, source: str) -> dict:
        return {
            "answer_id": row["qa_id"],
            "category": row["category"],
            "matched_query": row["query"],
            "answer_text": row["answer"],
            "score": score,
            "source": source,
        }


def _tokens(text: str) -> list[str]:
    compact = re.sub(r"\s+", "", text.lower())
    words = re.findall(r"[a-z0-9_]+", compact)
    chars = [char for char in compact if "\u4e00" <= char <= "\u9fff"]
    bigrams = [compact[index : index + 2] for index in range(max(0, len(compact) - 1))]
    return words + chars + bigrams


def _lexical_score(query: str, document: str) -> float:
    query_tokens = set(_tokens(query))
    document_tokens = set(_tokens(document))
    if not query_tokens or not document_tokens:
        return 0.0
    return len(query_tokens & document_tokens) / math.sqrt(
        len(query_tokens) * len(document_tokens)
    )
