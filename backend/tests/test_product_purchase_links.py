from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

from app.database import Database, _product_purchase_urls
from app.kb.product_kb import ProductKB


def _initialized_database(tmp_path: Path) -> Path:
    source = Path(__file__).resolve().parents[1] / "data" / "meifa.db"
    target = tmp_path / "meifa.db"
    shutil.copyfile(source, target)
    Database(target).initialize()
    return target


def test_all_product_links_are_synced_from_versioned_knowledge_base(tmp_path: Path) -> None:
    database_path = _initialized_database(tmp_path)
    with sqlite3.connect(database_path) as connection:
        linked_products = connection.execute(
            "SELECT COUNT(*) FROM products WHERE purchase_url LIKE 'https://v.douyin.com/%'"
        ).fetchone()[0]

    assert len(_product_purchase_urls()) == 16
    assert linked_products == 16


def test_recommendations_return_direct_douyin_links(tmp_path: Path) -> None:
    database_path = _initialized_database(tmp_path)
    recommendations = ProductKB(database_path).recommend(
        target_color={"tone": "blue", "display_name": "蓝色"},
        selected_route="dye",
        budget={"min_price": 0, "max_price": 1000},
        hair_length="short",
    )

    assert recommendations
    assert all(item["purchase_url"].startswith("https://v.douyin.com/") for item in recommendations)
    assert all(item["purchase_mode"] == "douyin_direct_link" for item in recommendations)
