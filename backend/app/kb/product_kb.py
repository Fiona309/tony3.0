"""Structured SKU retrieval for product recommendations."""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Any


class ProductKB:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def recommend(
        self,
        *,
        target_color: dict[str, Any],
        selected_route: str,
        budget: dict[str, Any],
        hair_length: str,
        limit: int = 4,
    ) -> list[dict[str, Any]]:
        color_family = str(target_color.get("tone") or target_color.get("color_family") or "").lower()
        if not color_family:
            return []
        min_price = self._price(budget.get("min_price"), 0)
        max_price = self._price(budget.get("max_price"), float("inf"))
        route_like = "%染%" if selected_route == "dye" else "%固%"
        with sqlite3.connect(self.database_path) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT sku.*, p.brand, p.product_name, p.product_type, p.risk_notes,
                       p.collected_at, p.price_evidence_path, p.purchase_url, u.quantity_policy_text,
                       u.operation_text, u.operation_image_path, u.evidence_path AS usage_evidence_path
                FROM product_sku AS sku
                JOIN products AS p ON p.product_id = sku.product_id
                LEFT JOIN product_usage AS u ON u.product_id = sku.product_id
                WHERE sku.color_family = ?
                  AND p.product_type LIKE ?
                ORDER BY CASE WHEN sku.shade_name = ? THEN 0 ELSE 1 END,
                         sku.selected_price ASC, sku.sku_id ASC
                """,
                (color_family, route_like, target_color.get("display_name", "")),
            ).fetchall()

        result = []
        seen_products: set[str] = set()
        for row in rows:
            if row["product_id"] in seen_products:
                continue
            seen_products.add(row["product_id"])
            units, is_estimate = self._units_needed(row["quantity_policy_text"], hair_length, row["product_type"])
            unit_price = float(row["selected_price"])
            total_price = round(unit_price * units, 2)
            if total_price < min_price or total_price > max_price:
                continue
            result.append(
                {
                    "sku_id": row["sku_id"],
                    "brand": row["brand"],
                    "product_name": row["product_name"],
                    "shade_name": row["shade_name"],
                    "product_type": row["product_type"],
                    "badge": "SKU 精准匹配",
                    "is_video_same_product": False,
                    "url": row["product_image_path"],
                    "suitable_reason": f"色号“{row['shade_name']}”匹配目标{color_family}色系。",
                    "possible_risk": row["risk_notes"] or "商品资料未标注额外风险。",
                    "usage": {
                        "units_needed": units,
                        "units_label": f"建议购买 {units} 件" + ("（通用估算）" if is_estimate else ""),
                        "method": self._short_instruction(row["operation_text"]),
                        "waiting_minutes": self._waiting_minutes(row["operation_text"]),
                        "short_instruction": self._short_instruction(row["operation_text"]),
                        "quantity_policy": row["quantity_policy_text"],
                        "is_estimate": is_estimate,
                        "evidence_path": row["usage_evidence_path"],
                    },
                    "price": {
                        "unit_price": unit_price,
                        "total_price": total_price,
                        "currency": "CNY",
                        "collected_at": row["collected_at"],
                        "selected_spec": row["selected_spec"],
                        "evidence_path": row["evidence_path"] or row["price_evidence_path"],
                    },
                    "purchase_url": row["purchase_url"],
                    "purchase_mode": "douyin_direct_link" if row["purchase_url"] else "douyin_link_pending",
                    "purchase_channel": row["purchase_channel"],
                    "aliases": row["aliases"],
                    "base_levels": row["base_levels_text"],
                }
            )
            if len(result) >= limit:
                break
        return result

    @staticmethod
    def _price(value: Any, default: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _units_needed(policy: str | None, hair_length: str, product_type: str) -> tuple[int, bool]:
        if not policy:
            return 1, True
        is_estimate = "MVP通用估算" in policy
        if "固色" in product_type or "护理" in product_type:
            return 1, is_estimate
        length_tokens = {
            "short": ("齐耳", "短发"),
            "shoulder": ("齐肩", "中发"),
            "medium": ("齐胸", "中长发"),
            "chest": ("齐胸", "中长发"),
            "long": ("齐腰", "长发"),
            "extra_long": ("腰部以下", "超长发"),
        }
        for token in length_tokens.get(hair_length, length_tokens["shoulder"]):
            match = re.search(rf"{token}[^；。]*?(\d+)\s*(?:盒|瓶|支)", policy)
            if match:
                return int(match.group(1)), is_estimate
        return 1, is_estimate

    @staticmethod
    def _waiting_minutes(operation: str | None) -> int | None:
        if not operation:
            return None
        match = re.search(r"停留(?:约)?\s*(\d+)\s*分钟", operation)
        return int(match.group(1)) if match else None

    @staticmethod
    def _short_instruction(operation: str | None) -> str:
        if not operation or operation == "待核实":
            return "操作说明待补充，请以商品包装说明为准。"
        return re.sub(r"\s+", " ", operation)[:120]
