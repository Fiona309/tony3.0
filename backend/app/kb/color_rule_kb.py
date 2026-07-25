"""P0 ColorRuleKB backed by the seeded SQLite color matrix."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any


PRIMARY_TONE_KEYWORDS = {
    "黑": "black",
    "灰": "gray",
    "银": "gray",
    "红": "red",
    "粉": "pink",
    "橙": "orange",
    "橘": "orange",
    "铜": "orange",
    "黄": "yellow",
    "金": "yellow",
    "蓝": "blue",
    "紫": "purple",
    "绿": "green",
    "青": "green",
    "棕": "brown",
    "褐": "brown",
}

SIMPLE_COLOR_KEYWORDS = {
    "黑": "黑",
    "银": "银",
    "灰": "灰",
    "红": "红",
    "粉": "粉",
    "橙": "橙",
    "橘": "橙",
    "黄": "黄",
    "金": "金",
    "蓝": "蓝",
    "紫": "紫",
    "绿": "绿",
    "青": "绿",
    "棕": "棕",
    "褐": "棕",
}

TONE_TO_SIMPLE_COLOR = {
    "natural_black": "黑",
    "black": "黑",
    "brown": "棕",
    "ash_brown": "棕",
    "red": "红",
    "orange": "橙",
    "yellow_orange": "橙",
    "yellow": "黄",
    "gold": "金",
    "green": "绿",
    "blue": "蓝",
    "purple": "紫",
    "gray": "灰",
    "silver": "银",
    "pink": "粉",
}

TARGET_COLOR_ALIASES = {
    "冷茶": "黑茶色",
    "茶": "黑茶色",
    "冷棕": "奶茶灰棕",
    "灰棕": "奶茶灰棕",
}


class ColorRuleKB:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def evaluate_profile(self, profile: dict[str, Any]) -> dict[str, Any]:
        current_level = self._current_level(profile)
        target_name = profile.get("target_color", {}).get("display_name") or "目标色"
        dye_history = profile.get("dye_history")

        color_row = self._find_target_color(target_name)
        if color_row is None:
            return self._unknown_decision(
                current_level=current_level,
                target_name=target_name,
                reason="目标色暂未录入官方底色效果矩阵。",
            )

        if dye_history == "dyed_black":
            return self._salon_required_decision(
                current_level=current_level,
                color_row=color_row,
                matrix_row=None,
            )

        transition_row = self._find_transition_row(color_row["color_zh"], profile)
        if transition_row is not None:
            return self._transition_decision(current_level, color_row, transition_row)

        matrix_row = self._find_matrix_row(color_row["color_zh"], current_level)
        if matrix_row is None:
            return self._unknown_decision(
                current_level=current_level,
                target_name=color_row["color_zh"],
                reason=f"当前只录入 5-9 度矩阵，暂缺 {current_level} 度底色效果。",
            )

        quality = matrix_row["result_quality"]
        if quality == "not_recommended":
            return self._not_recommended_decision(current_level, color_row, matrix_row)
        if quality == "biased":
            return self._biased_decision(current_level, color_row, matrix_row)
        return self._normal_decision(current_level, color_row, matrix_row)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _find_target_color(self, target_name: str) -> dict[str, Any] | None:
        alias_target = self._target_alias(target_name)
        if alias_target:
            target_name = alias_target
        with self._connect() as connection:
            exact = connection.execute(
                """
                SELECT color_zh, primary_tone
                FROM color_alias
                WHERE color_zh = ?
                """,
                (target_name,),
            ).fetchone()
            if exact:
                return dict(exact)

            tone = self._extract_primary_tone(target_name)
            if tone == "unknown":
                return None
            matched = connection.execute(
                """
                SELECT color_zh, primary_tone
                FROM color_alias
                WHERE primary_tone = ?
                ORDER BY color_zh
                LIMIT 1
                """,
                (tone,),
            ).fetchone()
            return dict(matched) if matched else None

    @staticmethod
    def _target_alias(target_name: str) -> str | None:
        matches = [
            (target_name.index(token), color_zh)
            for token, color_zh in TARGET_COLOR_ALIASES.items()
            if token in target_name
        ]
        if not matches:
            return None
        return sorted(matches, key=lambda item: item[0])[0][1]

    def _find_matrix_row(self, color_zh: str, current_level: int) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    m.color_id,
                    m.color_en,
                    m.color_zh,
                    m.base_level,
                    m.recommended,
                    m.r,
                    m.g,
                    m.b,
                    m.hex,
                    m.rgb_quality,
                    r.result_quality,
                    r.reason
                FROM color_effect_matrix m
                JOIN color_result_rules r ON r.color_id = m.color_id
                WHERE m.color_zh = ? AND m.base_level = ?
                """,
                (color_zh, current_level),
            ).fetchone()
            return dict(row) if row else None

    def _find_transition_row(self, target_color_zh: str, profile: dict[str, Any]) -> dict[str, Any] | None:
        current_color_zh = self._current_simple_color(profile)
        if current_color_zh is None:
            return None
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    target_color_zh,
                    current_color_zh,
                    decision,
                    result_quality,
                    add_color,
                    reason,
                    source
                FROM color_transition_rules
                WHERE target_color_zh = ? AND current_color_zh = ?
                """,
                (target_color_zh, current_color_zh),
            ).fetchone()
            return dict(row) if row else None

    @staticmethod
    def _current_level(profile: dict[str, Any]) -> int:
        current_hair = profile.get("current_hair", {})
        if current_hair.get("region_mode") == "root_mid_end":
            end = current_hair.get("regions", {}).get("end", {})
            return int(end.get("color", {}).get("level", 8))
        return int(current_hair.get("color", {}).get("level", 8))

    @classmethod
    def _current_simple_color(cls, profile: dict[str, Any]) -> str | None:
        current_hair = profile.get("current_hair", {})
        if current_hair.get("region_mode") == "root_mid_end":
            color = current_hair.get("regions", {}).get("end", {}).get("color", {})
        else:
            color = current_hair.get("color", {})
        display_name = color.get("display_name") or ""
        matches = [
            (display_name.index(token), simple)
            for token, simple in SIMPLE_COLOR_KEYWORDS.items()
            if token in display_name
        ]
        if matches:
            return sorted(matches, key=lambda item: item[0])[0][1]
        tone = color.get("tone")
        if tone in TONE_TO_SIMPLE_COLOR:
            return TONE_TO_SIMPLE_COLOR[tone]
        return None

    @staticmethod
    def _extract_primary_tone(color_name: str) -> str:
        matches = [
            (color_name.index(token), tone)
            for token, tone in PRIMARY_TONE_KEYWORDS.items()
            if token in color_name
        ]
        if not matches:
            return "unknown"
        return sorted(matches, key=lambda item: item[0])[0][1]

    @staticmethod
    def _official_color(matrix_row: dict[str, Any] | None) -> dict[str, Any] | None:
        if not matrix_row or matrix_row["r"] is None:
            return None
        return {
            "rgb": {"r": matrix_row["r"], "g": matrix_row["g"], "b": matrix_row["b"]},
            "hex": matrix_row["hex"],
            "rgb_quality": matrix_row["rgb_quality"],
        }

    def _rule_debug(
        self,
        *,
        current_level: int,
        color_row: dict[str, Any],
        matrix_row: dict[str, Any] | None,
    ) -> dict[str, Any]:
        return {
            "source": "color_effect_matrix",
            "matched_color_name": color_row["color_zh"],
            "primary_tone": color_row["primary_tone"],
            "current_level": current_level,
            "matrix_color_id": matrix_row["color_id"] if matrix_row else None,
            "result_quality": matrix_row["result_quality"] if matrix_row else "unknown",
            "recommended": bool(matrix_row["recommended"]) if matrix_row else None,
            "official_result_color": self._official_color(matrix_row),
        }

    def _transition_rule_debug(
        self,
        *,
        current_level: int,
        color_row: dict[str, Any],
        transition_row: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "source": "color_transition_rules",
            "matched_color_name": color_row["color_zh"],
            "primary_tone": color_row["primary_tone"],
            "current_level": current_level,
            "current_color_zh": transition_row["current_color_zh"],
            "target_color_zh": transition_row["target_color_zh"],
            "decision": transition_row["decision"],
            "result_quality": transition_row["result_quality"],
            "add_color": transition_row["add_color"],
            "recommended": transition_row["decision"] == "可以",
            "official_result_color": None,
        }

    def _transition_decision(
        self,
        current_level: int,
        color_row: dict[str, Any],
        transition_row: dict[str, Any],
    ) -> dict[str, Any]:
        target = color_row["color_zh"]
        current_color = transition_row["current_color_zh"]
        add_color = transition_row["add_color"]
        decision = transition_row["decision"]
        color_rule = self._transition_rule_debug(
            current_level=current_level,
            color_row=color_row,
            transition_row=transition_row,
        )
        if decision == "可以":
            suggestion = (
                f"配方方向上只补{add_color}，不要一次叠加多个颜色。"
                if add_color
                else "按目标色方向操作，不要一次叠加多个颜色。"
            )
            return {
                "feasibility": "reachable",
                "summary": f"当前{current_color}发色可以往{target}方向染，建议补充{add_color}。",
                "reachability_score": 88,
                "risks": [
                    {
                        "title": "按中和方向操作",
                        "severity": "low",
                        "reason": transition_row["reason"],
                        "suggestion": suggestion,
                    }
                ],
                "can_recommend_product": True,
                "color_rule": color_rule,
            }
        severity = "medium" if decision == "不建议" else "high"
        return {
            "feasibility": "not_reachable",
            "summary": f"当前{current_color}发色{decision}{target}，不建议直接居家染这个目标色。",
            "reachability_score": 30 if decision == "不建议" else 20,
            "risks": [
                {
                    "title": "当前色与目标色不匹配",
                    "severity": severity,
                    "reason": transition_row["reason"],
                    "suggestion": "建议先调整底色，或改选更适合当前发色的目标色。",
                }
            ],
            "can_recommend_product": False,
            "color_rule": color_rule,
        }

    def _normal_decision(
        self,
        current_level: int,
        color_row: dict[str, Any],
        matrix_row: dict[str, Any],
    ) -> dict[str, Any]:
        target = color_row["color_zh"]
        return {
            "feasibility": "reachable",
            "summary": f"当前 {current_level} 度底色染{target}在官方效果矩阵中属于推荐且正常显色。",
            "reachability_score": 88,
            "risks": [
                {
                    "title": "按商品说明操作",
                    "severity": "low",
                    "reason": matrix_row["reason"],
                    "suggestion": "仍需按商品说明控制停留时间和涂抹均匀度。",
                }
            ],
            "can_recommend_product": True,
            "color_rule": self._rule_debug(
                current_level=current_level, color_row=color_row, matrix_row=matrix_row
            ),
        }

    def _biased_decision(
        self,
        current_level: int,
        color_row: dict[str, Any],
        matrix_row: dict[str, Any],
    ) -> dict[str, Any]:
        target = color_row["color_zh"]
        return {
            "feasibility": "conditional",
            "summary": f"当前 {current_level} 度底色可以尝试{target}，但官方效果图标注存在偏色风险。",
            "reachability_score": 65,
            "risks": [
                {
                    "title": "可能偏色",
                    "severity": "medium",
                    "reason": matrix_row["reason"],
                    "suggestion": "如果不能接受偏色，建议先由专业人士处理底色后再染。",
                }
            ],
            "can_recommend_product": True,
            "color_rule": self._rule_debug(
                current_level=current_level, color_row=color_row, matrix_row=matrix_row
            ),
        }

    def _not_recommended_decision(
        self,
        current_level: int,
        color_row: dict[str, Any],
        matrix_row: dict[str, Any],
    ) -> dict[str, Any]:
        target = color_row["color_zh"]
        return {
            "feasibility": "not_reachable",
            "summary": f"当前 {current_level} 度底色不推荐染{target}，官方效果矩阵标注该底色不适合。",
            "reachability_score": 25,
            "risks": [
                {
                    "title": "官方图不推荐",
                    "severity": "high",
                    "reason": matrix_row["reason"],
                    "suggestion": "建议选择更深目标色，或去理发店先处理底色。",
                }
            ],
            "can_recommend_product": False,
            "color_rule": self._rule_debug(
                current_level=current_level, color_row=color_row, matrix_row=matrix_row
            ),
        }

    def _salon_required_decision(
        self,
        *,
        current_level: int,
        color_row: dict[str, Any],
        matrix_row: dict[str, Any] | None,
    ) -> dict[str, Any]:
        return {
            "feasibility": "salon_required",
            "summary": "有染黑历史，人工黑色素残留会影响上色，建议由专业人士处理后再染。",
            "reachability_score": 35,
            "risks": [
                {
                    "title": "染黑历史",
                    "severity": "high",
                    "reason": "染过黑色后不漂直接改色容易不显色或颜色不均。",
                    "suggestion": "不要居家强行改色，建议去理发店处理。",
                }
            ],
            "can_recommend_product": False,
            "color_rule": self._rule_debug(
                current_level=current_level, color_row=color_row, matrix_row=matrix_row
            ),
        }

    @staticmethod
    def _unknown_decision(
        *,
        current_level: int,
        target_name: str,
        reason: str,
    ) -> dict[str, Any]:
        return {
            "feasibility": "unknown",
            "summary": f"暂时无法判断当前 {current_level} 度底色是否适合{target_name}。",
            "reachability_score": 50,
            "risks": [
                {
                    "title": "资料不足",
                    "severity": "medium",
                    "reason": reason,
                    "suggestion": "请先选择已录入色卡中的单一目标色，或由专业人士确认。",
                }
            ],
            "can_recommend_product": False,
            "color_rule": {
                "source": "color_effect_matrix",
                "matched_color_name": target_name,
                "primary_tone": "unknown",
                "current_level": current_level,
                "matrix_color_id": None,
                "result_quality": "unknown",
                "recommended": None,
                "official_result_color": None,
            },
        }
