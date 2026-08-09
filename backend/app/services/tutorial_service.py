"""Tutorial voice orchestration service."""

from __future__ import annotations

import re

from .model_service import ModelService, TranscribeResult
from ..kb.operation_qa_kb import OperationQAKB
from ..mock_data import MockStore

MIN_KB_ANSWER_SCORE = 0.30


class TutorialService:
    def __init__(
        self,
        *,
        store: MockStore,
        model_service: ModelService,
        operation_qa_kb: OperationQAKB,
    ) -> None:
        self.store = store
        self.model_service = model_service
        self.operation_qa_kb = operation_qa_kb

    def handle_voice_input(
        self,
        *,
        tutorial_session_id: str,
        current_step_id: str,
        client_event_id: str,
        transcribe_result: TranscribeResult,
        user_key: str | None = None,
    ) -> dict:
        if not transcribe_result.has_voice:
            tts = self.model_service.synthesize_speech("我没有听清，你再说一次。")
            return self.store.voice_input_from_transcript(
                tutorial_session_id,
                current_step_id,
                client_event_id,
                transcript="",
                intent="silence",
                tts_audio_url=tts.audio_url,
                user_key=user_key,
            )

        if _looks_like_asr_hallucination(transcribe_result.transcript):
            tts = self.model_service.synthesize_speech("我没有听清，你再说一次。")
            return self.store.voice_input_from_transcript(
                tutorial_session_id,
                current_step_id,
                client_event_id,
                transcript=transcribe_result.transcript,
                intent="silence",
                tts_audio_url=tts.audio_url,
                user_key=user_key,
            )

        intent = self.model_service.classify_tutorial_intent(transcribe_result.transcript)
        session = self.store.session(tutorial_session_id, user_key=user_key)
        current_step = session.get("current_step", {})
        authoritative_step_id = str(current_step.get("step_id") or current_step_id)
        answer_text = None
        answer_meta = None
        hit = None
        if intent == "question":
            archive = self.store.archive(session["archive_id"], user_key=user_key)
            context = {
                "step_id": authoritative_step_id,
                "step_title": current_step.get("title"),
                "sku_id": archive.get("product_snapshot", {}).get("sku_id"),
                "product_name": archive.get("product_snapshot", {}).get("product_name"),
            }
            query = ""
            if not _looks_like_question(transcribe_result.transcript):
                # The clarify reply below never uses the rewritten query, so the
                # rewrite LLM round trip is skipped entirely on this branch.
                answer_text = "我没太理解你的问题。你可以说具体一点，比如问要等多久、怎么涂、能不能碰头皮。"
                answer_meta = {
                    "answer_id": "clarify",
                    "category": "问题不明确",
                    "source": "voice_guard",
                }
            else:
                query = self.model_service.rewrite_operation_question(
                    transcript=transcribe_result.transcript,
                    context=context,
                )
                hit = self._best_kb_hit(
                    queries=[transcribe_result.transcript, query],
                    current_step_id=str(context.get("step_id") or ""),
                    product_id=context.get("sku_id"),
                )
            if answer_text is None and hit is not None and float(hit.get("score") or 0.0) >= MIN_KB_ANSWER_SCORE:
                answer_text = self.model_service.polish_operation_answer(
                    answer_record=hit,
                    transcript=transcribe_result.transcript,
                    context=context,
                )
                answer_meta = {
                    "answer_id": hit["answer_id"],
                    "category": hit["category"],
                    "matched_query": hit["matched_query"],
                    "score": hit["score"],
                    "source": hit["source"],
                }
            elif answer_text is None:
                answer_text = self.model_service.generate_tutorial_answer(
                    transcript=transcribe_result.transcript,
                    current_step=current_step,
                )
                answer_meta = {
                    "answer_id": "step_context_fallback",
                    "category": "当前步骤上下文回答",
                    "matched_query": query,
                    "score": float(hit.get("score") or 0.0) if hit is not None else 0.0,
                    "source": "step_context_llm",
                }
        effective_intent = intent
        if intent == "finish":
            if int(current_step.get("step_no") or 0) < int(current_step.get("total_steps") or 0):
                effective_intent = "next"
        tts_text = _tts_text_for_intent(effective_intent, answer_text)
        tts = self.model_service.synthesize_speech(tts_text) if tts_text else None
        return self.store.voice_input_from_transcript(
            tutorial_session_id,
            authoritative_step_id,
            client_event_id,
            transcript=transcribe_result.transcript,
            intent=intent,
            tts_audio_url=tts.audio_url if tts else None,
            answer_text=answer_text,
            answer_meta=answer_meta,
            user_key=user_key,
        )

    def _best_kb_hit(
        self,
        *,
        queries: list[str],
        current_step_id: str,
        product_id: str | None,
    ) -> dict | None:
        # search_many embeds every phrasing in one API call and applies the same
        # "highest score wins" rule this method used to apply query by query.
        return self.operation_qa_kb.search_many(
            queries=queries,
            current_step_id=current_step_id,
            product_id=product_id,
        )


def _looks_like_question(text: str) -> bool:
    normalized = re.sub(r"\s+", "", text.strip())
    if not normalized:
        return False
    question_markers = (
        "吗",
        "么",
        "？",
        "?",
        "怎么",
        "为什么",
        "怎么办",
        "多久",
        "多少",
        "哪里",
        "什么",
        "要不要",
        "需不需要",
        "需要",
        "可以",
        "能不能",
        "会不会",
        "是不是",
        "有没有",
        "行不行",
    )
    return any(marker in normalized for marker in question_markers) or len(normalized) >= 9


def _looks_like_asr_hallucination(text: str) -> bool:
    normalized = re.sub(r"\s+", " ", text.strip()).lower()
    if not normalized:
        return True
    has_chinese = re.search(r"[\u4e00-\u9fff]", normalized) is not None
    if has_chinese:
        return False
    ascii_letters = re.findall(r"[a-z]", normalized)
    if len(ascii_letters) >= 8:
        return True
    hallucination_markers = (
        "i'm going to",
        "go ahead",
        "next video",
        "next one",
        "more questions",
        "rest of the room",
        "so let's go",
    )
    return any(marker in normalized for marker in hallucination_markers)


def _tts_text_for_intent(intent: str, answer_text: str | None) -> str | None:
    if intent == "question":
        return answer_text
    if intent == "next":
        return "你在这一步有什么问题，可以随时问我～"
    if intent == "replay":
        return "好的，我再播放一遍当前步骤。"
    if intent == "finish":
        return "好的，本次染发教程已结束。现在拍摄你的染后照片，生成专属短视频吧。"
    return None
