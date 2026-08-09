"""SQLite storage for the Mock API and P0 knowledge base seeds."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET


PROJECT_ROOT = Path(__file__).resolve().parents[2]
HAIRDYE_COLOR_MATRIX_CSV = PROJECT_ROOT / "docs" / "hairdye_color_palette_rgb.csv"
OPERATION_QA_TSV = PROJECT_ROOT / "docs" / "操作问题知识库.tsv"
COLOR_TRANSITION_MATRIX_MD = PROJECT_ROOT / "docs" / "target_color_current_color_simple_matrix(1).md"
PRODUCT_KB_DOCX = PROJECT_ROOT / "docs" / "商品知识库（SKU级RAG版）(1).docx"
PRODUCT_RAG_SOURCE = (
    PROJECT_ROOT
    / "my-tony2.0"
    / "knowledge-base"
    / "products"
    / "product-recommendation-rag-source.json"
)
PRODUCT_KB_SOURCE = "docs/商品知识库（SKU级RAG版）(1).docx"
PRODUCT_KB_COLLECTED_AT = "2026-07-26T01:18:00+08:00"
WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

PRIMARY_TONE_ALIASES = {
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

# P0 rules transcribed from the annotated product chart provided by the user.
# The CSV says whether a cell is recommendable; this table says whether a
# recommendable result is still visibly biased.
BIASED_RESULT_RULES = {
    ("雾霾灰", 6): "6度底色染雾霾灰容易偏脏、偏灰绿，标注为偏色。",
    ("脏橘色", 6): "6度底色染脏橘色容易偏暗、偏棕，标注为偏色。",
    ("橙色", 6): "6度底色染橙色容易偏暗、偏红棕，标注为偏色。",
    ("蓝色", 6): "6度底色染蓝色容易受黄橙底影响偏青绿，标注为偏色。",
    ("紫色", 6): "6度底色染紫色容易受暖底影响偏红棕，标注为偏色。",
    # The product note mentions an additional raspberry-red level-10 exception.
    # The current CSV only covers levels 5-9; keep this here so the rule is
    # applied automatically once level 10 data is added.
    ("树莓红", 10): "树莓红在10度底色上过于接近紫色，标注为偏色。",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _bool_text(value: str) -> int:
    return 1 if value.strip().lower() == "true" else 0


def _int_or_none(value: str) -> int | None:
    value = value.strip()
    return int(value) if value else None


def _extract_primary_tone(color_name: str) -> tuple[str, str]:
    """Extract one coarse tone from a Chinese commercial color name."""
    matches = [
        (color_name.index(token), token, tone)
        for token, tone in PRIMARY_TONE_ALIASES.items()
        if token in color_name
    ]
    if not matches:
        return "unknown", "no_color_token"
    _, token, tone = sorted(matches, key=lambda item: item[0])[0]
    return tone, f"first_token:{token}"


def _docx_tables(path: Path) -> list[list[list[str]]]:
    """Read DOCX table cells directly so SKU fields do not depend on OCR/text layout."""
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    tables = []
    for table in root.findall(".//w:tbl", WORD_NS):
        rows = []
        for row in table.findall("./w:tr", WORD_NS):
            rows.append(
                [
                    "".join(cell.itertext()).strip()
                    for cell in row.findall("./w:tc", WORD_NS)
                ]
            )
        tables.append(rows)
    return tables


def _product_id(brand: str, product_name: str) -> str:
    digest = hashlib.sha1(f"{brand}|{product_name}".encode("utf-8")).hexdigest()[:16]
    return f"product_{digest}"


def _product_purchase_urls() -> dict[tuple[str, str], str]:
    """Load canonical Douyin links from the versioned product knowledge base."""
    if not PRODUCT_RAG_SOURCE.exists():
        return {}
    payload = json.loads(PRODUCT_RAG_SOURCE.read_text(encoding="utf-8"))
    return {
        (str(product.get("brand_name") or ""), str(product.get("product_name") or "")): url
        for product in payload.get("products", [])
        if (url := str(product.get("douyin_url") or "").strip())
    }


def _price(value: str) -> float:
    match = re.search(r"(\d+(?:\.\d+)?)", value.replace(",", ""))
    if not match:
        raise ValueError(f"商品结算价无效: {value}")
    return float(match.group(1))


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            self._create_tables(connection)
            self._seed_color_knowledge_base(connection)
            self._seed_operation_qa(connection)
            self._seed_dark_base_levels(connection)
            self._seed_color_fade(connection)
            self._seed_product_knowledge_base(connection)
            self._sync_product_purchase_urls(connection)

    def record_event(
        self,
        *,
        user_key: str | None,
        method: str,
        path: str,
        trace_id: str,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO api_events (created_at, user_key, method, path, trace_id)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    datetime.now(timezone.utc).isoformat(),
                    user_key,
                    method,
                    path,
                    trace_id,
                ),
            )

    def save_state(
        self,
        *,
        user_key: str,
        entity_type: str,
        entity_id: str,
        payload: dict,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO app_state (user_key, entity_type, entity_id, payload_json, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_key, entity_type, entity_id) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (
                    user_key,
                    entity_type,
                    entity_id,
                    json.dumps(payload, ensure_ascii=False),
                    _now(),
                ),
            )

    def load_state(self) -> list[dict]:
        with self._connect() as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT user_key, entity_type, entity_id, payload_json
                FROM app_state
                ORDER BY updated_at ASC
                """
            ).fetchall()
        result = []
        for row in rows:
            result.append(
                {
                    "user_key": row["user_key"],
                    "entity_type": row["entity_type"],
                    "entity_id": row["entity_id"],
                    "payload": json.loads(row["payload_json"]),
                }
            )
        return result

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def _create_tables(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS api_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                user_key TEXT,
                method TEXT NOT NULL,
                path TEXT NOT NULL,
                trace_id TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS app_state (
                user_key TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_key, entity_type, entity_id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS color_effect_matrix (
                color_id TEXT PRIMARY KEY,
                color_en TEXT NOT NULL,
                color_zh TEXT NOT NULL,
                base_level INTEGER NOT NULL,
                recommended INTEGER NOT NULL CHECK (recommended IN (0, 1)),
                r INTEGER,
                g INTEGER,
                b INTEGER,
                hex TEXT,
                rgb_quality TEXT NOT NULL,
                source TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                -- r/g/b 采自色卡（印刷/渲染的理想效果），鲜艳色系饱和度比真实染后高 2 倍以上。
                -- *_real 是从种草参考图发区实测标定的真实染后色，渲染与接近度计算用它。
                -- 色卡原值保留不动，商品页展示色号仍可用。
                r_real INTEGER,
                g_real INTEGER,
                b_real INTEGER,
                hex_real TEXT,
                real_source TEXT,
                UNIQUE(color_zh, base_level)
            )
            """
        )
        # 老库补列：CREATE TABLE IF NOT EXISTS 不会给已存在的表加字段
        existing = {row[1] for row in connection.execute("PRAGMA table_info(color_effect_matrix)")}
        for column, ddl in (
            ("r_real", "INTEGER"),
            ("g_real", "INTEGER"),
            ("b_real", "INTEGER"),
            ("hex_real", "TEXT"),
            ("real_source", "TEXT"),
        ):
            if column not in existing:
                connection.execute(f"ALTER TABLE color_effect_matrix ADD COLUMN {column} {ddl}")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS operation_qa (
                qa_id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                query TEXT NOT NULL,
                original_user_questions TEXT,
                original_comment_answer_clues TEXT,
                answer TEXT NOT NULL,
                product_id TEXT NOT NULL DEFAULT 'default',
                step_id TEXT NOT NULL DEFAULT 'all',
                source TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS color_result_rules (
                color_id TEXT PRIMARY KEY,
                color_zh TEXT NOT NULL,
                base_level INTEGER NOT NULL,
                result_quality TEXT NOT NULL
                    CHECK (result_quality IN ('not_recommended', 'normal', 'biased')),
                reason TEXT NOT NULL,
                source TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS color_alias (
                color_zh TEXT PRIMARY KEY,
                primary_tone TEXT NOT NULL,
                extraction_method TEXT NOT NULL,
                source TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS color_transition_rules (
                target_color_zh TEXT NOT NULL,
                current_color_zh TEXT NOT NULL,
                decision TEXT NOT NULL CHECK (decision IN ('可以', '不能染', '不建议')),
                result_quality TEXT NOT NULL
                    CHECK (result_quality IN ('normal', 'not_recommended', 'discouraged')),
                add_color TEXT,
                reason TEXT NOT NULL,
                source TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (target_color_zh, current_color_zh)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS color_fade (
                color_zh TEXT NOT NULL,
                week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 5),
                stage_name TEXT NOT NULL,
                hold_weeks_min INTEGER NOT NULL,
                hold_weeks_max INTEGER NOT NULL,
                source TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                r INTEGER,
                g INTEGER,
                b INTEGER,
                hex TEXT,
                PRIMARY KEY (color_zh, week)
            )
            """
        )
        # 老库补列：CREATE TABLE IF NOT EXISTS 不会给已存在的表加字段。
        # main.py 的 /api/color-matrix 会 SELECT 这四列，缺列会直接 500。
        fade_columns = {row[1] for row in connection.execute("PRAGMA table_info(color_fade)")}
        for column, column_type in (("r", "INTEGER"), ("g", "INTEGER"), ("b", "INTEGER"), ("hex", "TEXT")):
            if column not in fade_columns:
                connection.execute(f"ALTER TABLE color_fade ADD COLUMN {column} {column_type}")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                product_id TEXT PRIMARY KEY,
                brand TEXT NOT NULL,
                product_name TEXT NOT NULL,
                product_type TEXT NOT NULL,
                selected_price REAL NOT NULL,
                selected_spec TEXT NOT NULL,
                selected_color TEXT,
                checkout_quantity INTEGER,
                price_evidence_path TEXT,
                capacity TEXT,
                confirmed_sku_count INTEGER,
                product_image_path TEXT,
                unused_price_text TEXT,
                purchase_channel TEXT NOT NULL,
                purchase_url TEXT,
                risk_notes TEXT,
                source TEXT NOT NULL,
                collected_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(brand, product_name)
            )
            """
        )
        product_columns = {row[1] for row in connection.execute("PRAGMA table_info(products)")}
        if "purchase_url" not in product_columns:
            connection.execute("ALTER TABLE products ADD COLUMN purchase_url TEXT")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS product_sku (
                sku_id TEXT PRIMARY KEY,
                product_id TEXT NOT NULL REFERENCES products(product_id),
                shade_name TEXT NOT NULL,
                color_family TEXT NOT NULL,
                aliases TEXT,
                base_levels_text TEXT,
                selected_price REAL NOT NULL,
                selected_spec TEXT NOT NULL,
                product_image_path TEXT,
                purchase_channel TEXT NOT NULL,
                evidence_path TEXT,
                source TEXT NOT NULL,
                collected_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS product_usage (
                product_id TEXT PRIMARY KEY REFERENCES products(product_id),
                quantity_policy_text TEXT NOT NULL,
                operation_text TEXT,
                operation_image_path TEXT,
                evidence_path TEXT,
                source TEXT NOT NULL,
                collected_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS product_price_snapshot (
                sku_id TEXT NOT NULL REFERENCES product_sku(sku_id),
                selected_price REAL NOT NULL,
                selected_spec TEXT NOT NULL,
                evidence_path TEXT,
                collected_at TEXT NOT NULL,
                source TEXT NOT NULL,
                PRIMARY KEY (sku_id, collected_at)
            )
            """
        )

    def _seed_color_knowledge_base(self, connection: sqlite3.Connection) -> None:
        if not HAIRDYE_COLOR_MATRIX_CSV.exists():
            return

        now = _now()
        with HAIRDYE_COLOR_MATRIX_CSV.open(encoding="utf-8-sig", newline="") as csv_file:
            rows = list(csv.DictReader(csv_file))

        for row in rows:
            color_id = row["color_id"].strip()
            color_zh = row["color_zh"].strip()
            base_level = int(row["base_level"])
            recommended = _bool_text(row["recommended"])
            rgb = (_int_or_none(row["r"]), _int_or_none(row["g"]), _int_or_none(row["b"]))
            connection.execute(
                """
                INSERT INTO color_effect_matrix (
                    color_id, color_en, color_zh, base_level, recommended,
                    r, g, b, hex, rgb_quality, source, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(color_id) DO UPDATE SET
                    color_en = excluded.color_en,
                    color_zh = excluded.color_zh,
                    base_level = excluded.base_level,
                    recommended = excluded.recommended,
                    r = excluded.r,
                    g = excluded.g,
                    b = excluded.b,
                    hex = excluded.hex,
                    rgb_quality = excluded.rgb_quality,
                    source = excluded.source,
                    updated_at = excluded.updated_at
                """,
                (
                    color_id,
                    row["color_en"].strip(),
                    color_zh,
                    base_level,
                    recommended,
                    *rgb,
                    row["hex"].strip() or None,
                    row["rgb_quality"].strip(),
                    "docs/hairdye_color_palette_rgb.csv",
                    now,
                ),
            )

            result_quality, reason = self._result_quality(color_zh, base_level, recommended)
            connection.execute(
                """
                INSERT INTO color_result_rules (
                    color_id, color_zh, base_level, result_quality, reason, source, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(color_id) DO UPDATE SET
                    color_zh = excluded.color_zh,
                    base_level = excluded.base_level,
                    result_quality = excluded.result_quality,
                    reason = excluded.reason,
                    source = excluded.source,
                    updated_at = excluded.updated_at
                """,
                (
                    color_id,
                    color_zh,
                    base_level,
                    result_quality,
                    reason,
                    "user_annotated_product_chart",
                    now,
                ),
            )

        for color_zh in sorted({row["color_zh"].strip() for row in rows}):
            primary_tone, method = _extract_primary_tone(color_zh)
            connection.execute(
                """
                INSERT INTO color_alias (
                    color_zh, primary_tone, extraction_method, source, updated_at
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(color_zh) DO UPDATE SET
                    primary_tone = excluded.primary_tone,
                    extraction_method = excluded.extraction_method,
                    source = excluded.source,
                    updated_at = excluded.updated_at
                """,
                (
                    color_zh,
                    primary_tone,
                    method,
                    "primary_color_token_rule",
                    now,
                ),
            )
        self._seed_color_transition_rules(connection)

    def _seed_color_transition_rules(self, connection: sqlite3.Connection) -> None:
        if not COLOR_TRANSITION_MATRIX_MD.exists():
            return

        source = "docs/target_color_current_color_simple_matrix(1).md"
        now = _now()
        rows = self._parse_color_transition_matrix(COLOR_TRANSITION_MATRIX_MD)
        connection.execute("DELETE FROM color_transition_rules WHERE source = ?", (source,))
        for row in rows:
            connection.execute(
                """
                INSERT INTO color_transition_rules (
                    target_color_zh, current_color_zh, decision, result_quality,
                    add_color, reason, source, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(target_color_zh, current_color_zh) DO UPDATE SET
                    decision = excluded.decision,
                    result_quality = excluded.result_quality,
                    add_color = excluded.add_color,
                    reason = excluded.reason,
                    source = excluded.source,
                    updated_at = excluded.updated_at
                """,
                (
                    row["target_color_zh"],
                    row["current_color_zh"],
                    row["decision"],
                    row["result_quality"],
                    row["add_color"],
                    row["reason"],
                    source,
                    now,
                ),
            )

    @staticmethod
    def _parse_color_transition_matrix(path: Path) -> list[dict[str, str | None]]:
        result = []
        current_target = None
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if line.startswith("## "):
                current_target = line.removeprefix("## ").strip()
                continue
            if not current_target or not line.startswith("|"):
                continue
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if len(cells) != 3 or cells[0] in {"用户现有色", "---"} or set(cells[0]) == {"-"}:
                continue
            current_color, decision, add_color = cells
            if decision not in {"可以", "不能染", "不建议"}:
                continue
            normalized_add_color = None if add_color in {"", "—", "-"} else add_color
            result_quality = {
                "可以": "normal",
                "不能染": "not_recommended",
                "不建议": "discouraged",
            }[decision]
            reason = (
                f"按目标色与现有色中和矩阵，当前{current_color}发色可以往{current_target}方向染，"
                f"建议补充{normalized_add_color}。"
                if decision == "可以"
                else f"按目标色与现有色中和矩阵，当前{current_color}发色{decision}{current_target}。"
            )
            result.append(
                {
                    "target_color_zh": current_target,
                    "current_color_zh": current_color,
                    "decision": decision,
                    "result_quality": result_quality,
                    "add_color": normalized_add_color,
                    "reason": reason,
                }
            )
        return result

    def _seed_product_knowledge_base(self, connection: sqlite3.Connection) -> None:
        if not PRODUCT_KB_DOCX.exists():
            return

        tables = _docx_tables(PRODUCT_KB_DOCX)
        if len(tables) < 19:
            raise ValueError("商品知识库 DOCX 缺少商品、SKU 或用量表")

        now = _now()
        purchase_urls = _product_purchase_urls()
        products_by_identity: dict[tuple[str, str], str] = {}
        for row in tables[1][1:]:
            if len(row) != 14:
                continue
            (
                brand,
                product_name,
                product_type,
                price_text,
                selected_spec,
                selected_color,
                checkout_quantity,
                price_evidence_path,
                capacity,
                confirmed_sku_count,
                product_image_path,
                unused_price_text,
                purchase_channel,
                risk_notes,
            ) = row
            product_id = _product_id(brand, product_name)
            products_by_identity[(brand, product_name)] = product_id
            connection.execute(
                """
                INSERT INTO products (
                    product_id, brand, product_name, product_type, selected_price,
                    selected_spec, selected_color, checkout_quantity, price_evidence_path,
                    capacity, confirmed_sku_count, product_image_path, unused_price_text,
                    purchase_channel, purchase_url, risk_notes, source, collected_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(product_id) DO UPDATE SET
                    brand = excluded.brand, product_name = excluded.product_name,
                    product_type = excluded.product_type, selected_price = excluded.selected_price,
                    selected_spec = excluded.selected_spec, selected_color = excluded.selected_color,
                    checkout_quantity = excluded.checkout_quantity,
                    price_evidence_path = excluded.price_evidence_path, capacity = excluded.capacity,
                    confirmed_sku_count = excluded.confirmed_sku_count,
                    product_image_path = excluded.product_image_path,
                    unused_price_text = excluded.unused_price_text,
                    purchase_channel = excluded.purchase_channel,
                    purchase_url = excluded.purchase_url, risk_notes = excluded.risk_notes,
                    source = excluded.source, collected_at = excluded.collected_at,
                    updated_at = excluded.updated_at
                """,
                (
                    product_id,
                    brand,
                    product_name,
                    product_type,
                    _price(price_text),
                    selected_spec,
                    selected_color,
                    int(checkout_quantity) if checkout_quantity.isdigit() else None,
                    price_evidence_path,
                    capacity,
                    int(re.search(r"\d+", confirmed_sku_count).group())
                    if re.search(r"\d+", confirmed_sku_count)
                    else None,
                    product_image_path,
                    unused_price_text,
                    purchase_channel,
                    purchase_urls.get((brand, product_name)),
                    risk_notes,
                    PRODUCT_KB_SOURCE,
                    PRODUCT_KB_COLLECTED_AT,
                    now,
                ),
            )

        for table in tables[2:18]:
            for row in table[1:]:
                if len(row) != 13:
                    continue
                (
                    sku_id,
                    brand,
                    product_name,
                    _product_type,
                    shade_name,
                    color_family,
                    aliases,
                    base_levels_text,
                    price_text,
                    selected_spec,
                    product_image_path,
                    purchase_channel,
                    evidence_path,
                ) = row
                product_id = products_by_identity.get((brand, product_name))
                if not product_id:
                    raise ValueError(f"SKU 找不到商品主表: {sku_id}")
                price = _price(price_text)
                connection.execute(
                    """
                    INSERT INTO product_sku (
                        sku_id, product_id, shade_name, color_family, aliases, base_levels_text,
                        selected_price, selected_spec, product_image_path, purchase_channel,
                        evidence_path, source, collected_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(sku_id) DO UPDATE SET
                        product_id = excluded.product_id, shade_name = excluded.shade_name,
                        color_family = excluded.color_family, aliases = excluded.aliases,
                        base_levels_text = excluded.base_levels_text,
                        selected_price = excluded.selected_price,
                        selected_spec = excluded.selected_spec,
                        product_image_path = excluded.product_image_path,
                        purchase_channel = excluded.purchase_channel,
                        evidence_path = excluded.evidence_path, source = excluded.source,
                        collected_at = excluded.collected_at, updated_at = excluded.updated_at
                    """,
                    (
                        sku_id,
                        product_id,
                        shade_name,
                        color_family,
                        aliases,
                        base_levels_text,
                        price,
                        selected_spec,
                        product_image_path,
                        purchase_channel,
                        evidence_path,
                        PRODUCT_KB_SOURCE,
                        PRODUCT_KB_COLLECTED_AT,
                        now,
                    ),
                )
                connection.execute(
                    """
                    INSERT INTO product_price_snapshot (
                        sku_id, selected_price, selected_spec, evidence_path, collected_at, source
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(sku_id, collected_at) DO UPDATE SET
                        selected_price = excluded.selected_price,
                        selected_spec = excluded.selected_spec,
                        evidence_path = excluded.evidence_path,
                        source = excluded.source
                    """,
                    (
                        sku_id,
                        price,
                        selected_spec,
                        evidence_path,
                        PRODUCT_KB_COLLECTED_AT,
                        PRODUCT_KB_SOURCE,
                    ),
                )

        for row in tables[18][1:]:
            if len(row) != 6:
                continue
            brand, product_name, policy, operation, image_path, evidence_path = row
            product_id = products_by_identity.get((brand, product_name))
            if not product_id:
                raise ValueError(f"用量规则找不到商品主表: {brand} {product_name}")
            connection.execute(
                """
                INSERT INTO product_usage (
                    product_id, quantity_policy_text, operation_text, operation_image_path,
                    evidence_path, source, collected_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(product_id) DO UPDATE SET
                    quantity_policy_text = excluded.quantity_policy_text,
                    operation_text = excluded.operation_text,
                    operation_image_path = excluded.operation_image_path,
                    evidence_path = excluded.evidence_path, source = excluded.source,
                    collected_at = excluded.collected_at, updated_at = excluded.updated_at
                """,
                (
                    product_id,
                    policy,
                    operation,
                    image_path,
                    evidence_path,
                    PRODUCT_KB_SOURCE,
                    PRODUCT_KB_COLLECTED_AT,
                    now,
                ),
            )

    def _sync_product_purchase_urls(self, connection: sqlite3.Connection) -> None:
        """Backfill links into the tracked/legacy SQLite product rows."""
        for (brand, product_name), purchase_url in _product_purchase_urls().items():
            connection.execute(
                """
                UPDATE products
                SET purchase_url = ?
                WHERE brand = ? AND product_name = ?
                """,
                (purchase_url, brand, product_name),
            )

    def _seed_dark_base_levels(self, connection: sqlite3.Connection) -> None:
        """补录 3~4 度（天生黑发）的结论。

        官方效果矩阵只覆盖 5~9 度，3~4 度整列是空的。此前代码把"查不到"当成
        "不能染"，导致天生黑发用户被告知六个颜色全都染不了——那是错误结论，
        不是数据缺失的正确表达（中国用户绝大多数正是 3~4 度）。

        本表只录结论，不录 RGB：色值仍由 lookup() 借最近有色值的度数做物理外推，
        并标记 extrapolated，UI 会提示"模拟效果"。这样既纠正了结论，又不伪造
        官方没有给过的精确色值。

        source 标为 product_owner_judgment 以便与官方效果图来源区分。
        """
        DIRECT_DYE = {
            "黑茶色": "深色暖调，天生黑发可直接上色。",
            "奶茶灰棕": "棕调足够深，天生黑发可直接上色。",
            "红色": "红色分子可在深色底上显色，天生黑发可直接上色。",
        }
        NEEDS_BLEACH = {
            "蓝色": "冷色需要浅底才显色，天生黑发必须先漂浅。",
            "紫色": "冷色需要浅底才显色，天生黑发必须先漂浅。",
            "粉色": "浅色需要更浅的底，天生黑发必须先漂浅。",
        }
        now = _now()
        source = "product_owner_judgment"

        for level in (3, 4):
            for color_zh, reason in {**DIRECT_DYE, **NEEDS_BLEACH}.items():
                row = connection.execute(
                    "SELECT color_id, color_en FROM color_effect_matrix WHERE color_zh = ? LIMIT 1",
                    (color_zh,),
                ).fetchone()
                if row is None:
                    continue
                base_color_id, color_en = row[0], row[1]
                color_id = f"{str(base_color_id).rsplit('_', 1)[0]}_{level}"
                quality = "normal" if color_zh in DIRECT_DYE else "not_recommended"

                connection.execute(
                    """
                    INSERT INTO color_effect_matrix (
                        color_id, color_en, color_zh, base_level, recommended,
                        r, g, b, hex, rgb_quality, source, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 'not_sampled', ?, ?)
                    ON CONFLICT(color_id) DO NOTHING
                    """,
                    (color_id, color_en, color_zh, level,
                     1 if quality == "normal" else 0, source, now),
                )
                connection.execute(
                    """
                    INSERT INTO color_result_rules (
                        color_id, color_zh, base_level, result_quality, reason, source, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(color_id) DO UPDATE SET
                        result_quality = excluded.result_quality,
                        reason = excluded.reason,
                        source = excluded.source,
                        updated_at = excluded.updated_at
                    """,
                    (color_id, color_zh, level, quality, reason, source, now),
                )

    def _seed_color_fade(self, connection: sqlite3.Connection) -> None:
        """掉色过程与保色期。

        为什么需要这张表：掉色的【色值】不需要新数据——掉色的物理过程就是
        "染膏色素流失、底色残留逐渐暴露"，起点是 color_effect_matrix 的呈色、
        终点是 RESIDUAL_UNDERTONE 的残留色，中间用前端已有的 biasedColor() 插值
        即可，且这样算出来的色和实时试色的偏色档完全一致，不会自相矛盾。

        真正缺的只有两样，都无法从现有数据推导：
          1. 每一周的【中文阶段名】——按色值反推出的名字很怪（用户说"蓝绿色"，
             机器会说"深青灰"），必须人工命名
          2. 【保色期】——取决于色素分子大小、染膏类型、洗发频率，知识库里没有
             任何字段承载它

        保色期与阶段名来自染发行业通识（冷色分子大、附着差，掉得快；棕色分子小、
        最持久），标 industry_reference 以区别于官方效果图实测数据。UI 必须显示
        "参考"字样，后续靠用户回访数据替换为实测值。
        """
        # (色系, 保色期下限, 上限, [(第N周阶段名, 该阶段色值), ...])
        #
        # 色值按中文阶段名定色相、再按褪彩程度定明度饱和度，是产品给的权威数据。
        # 不能靠减色物理模型推：蓝与残留的橙是互补色，插值会穿过灰、乘法出不了黄，
        # 算出来是一串浑浊的褐色，和"蓝→蓝绿→绿→黄绿"这个真实观感对不上。
        # 前端 fadeStages 里那套物理推算只在这里没值时兜底。
        FADE = [
            ("蓝色", 2, 3, [
                ("蓝色", "#5691CB"), ("浅蓝色", "#66ABCE"), ("蓝绿色", "#75D1CA"),
                ("绿色", "#83D38E"), ("黄绿色", "#C1D691"),
            ]),
            ("紫色", 1, 2, [
                ("紫色", "#813E68"), ("浅紫色", "#904D83"), ("灰紫色", "#9F5D9F"),
                ("米黄色", "#AE996F"), ("黄色", "#BDB181"),
            ]),
            ("粉色", 1, 2, [
                ("粉色", "#EAA7B1"), ("浅粉色", "#E9A7AB"), ("藕粉色", "#E9B0A8"),
                ("米粉色", "#E8C4A9"), ("浅黄色", "#E7D8AB"),
            ]),
            ("红色", 4, 6, [
                ("红色", "#A21F1C"), ("玫红色", "#AC3549"), ("橘红色", "#B5664E"),
                ("橘色", "#BF8C68"), ("浅橘色", "#C8A581"),
            ]),
            ("黑茶色", 6, 8, [
                ("黑茶色", "#534D48"), ("深茶色", "#665B53"), ("茶棕色", "#78695E"),
                ("浅茶棕", "#8B7868"), ("浅棕色", "#9D8572"),
            ]),
            ("奶茶灰棕", 6, 8, [
                ("奶茶灰棕", "#A79890"), ("浅灰棕", "#AC998C"), ("浅棕色", "#B19A89"),
                ("米棕色", "#B59D87"), ("浅黄棕", "#BAA287"),
            ]),
        ]
        now = _now()
        for color_zh, lo, hi, stages in FADE:
            for index, (stage_name, hex_value) in enumerate(stages, start=1):
                r, g, b = (int(hex_value[i : i + 2], 16) for i in (1, 3, 5))
                connection.execute(
                    """
                    INSERT INTO color_fade (
                        color_zh, week, stage_name, hold_weeks_min, hold_weeks_max,
                        source, updated_at, r, g, b, hex
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(color_zh, week) DO UPDATE SET
                        stage_name = excluded.stage_name,
                        hold_weeks_min = excluded.hold_weeks_min,
                        hold_weeks_max = excluded.hold_weeks_max,
                        source = excluded.source,
                        updated_at = excluded.updated_at,
                        r = excluded.r, g = excluded.g, b = excluded.b, hex = excluded.hex
                    """,
                    (color_zh, index, stage_name, lo, hi, "industry_reference", now,
                     r, g, b, hex_value),
                )

    def _seed_operation_qa(self, connection: sqlite3.Connection) -> None:
        if not OPERATION_QA_TSV.exists():
            return

        now = _now()
        with OPERATION_QA_TSV.open(encoding="utf-8-sig", newline="") as tsv_file:
            rows = list(csv.DictReader(tsv_file, delimiter="\t"))

        for row in rows:
            qa_id = row["id"].strip()
            if not qa_id:
                continue
            connection.execute(
                """
                INSERT INTO operation_qa (
                    qa_id, category, query, original_user_questions,
                    original_comment_answer_clues, answer, product_id, step_id,
                    source, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(qa_id) DO UPDATE SET
                    category = excluded.category,
                    query = excluded.query,
                    original_user_questions = excluded.original_user_questions,
                    original_comment_answer_clues = excluded.original_comment_answer_clues,
                    answer = excluded.answer,
                    product_id = excluded.product_id,
                    step_id = excluded.step_id,
                    source = excluded.source,
                    updated_at = excluded.updated_at
                """,
                (
                    qa_id,
                    row["category"].strip(),
                    row["query"].strip(),
                    row.get("original_user_questions", "").strip(),
                    row.get("original_comment_answer_clues", "").strip(),
                    row["agent_answer"].strip(),
                    "default",
                    "all",
                    "docs/操作问题知识库.tsv",
                    now,
                ),
            )

    @staticmethod
    def _result_quality(color_zh: str, base_level: int, recommended: int) -> tuple[str, str]:
        if not recommended:
            return "not_recommended", "商品官方效果图标注该底色不推荐。"
        bias_reason = BIASED_RESULT_RULES.get((color_zh, base_level))
        if bias_reason:
            return "biased", bias_reason
        return "normal", "商品官方效果图标注为推荐，且未命中偏色规则。"
