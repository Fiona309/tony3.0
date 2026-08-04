"""
染发引擎 v2 - 基于权威底色度数表

知识库：13色家族 × 5度数（5-9°）= 47个有效颜色
来源：hairdye_color_palette_rgb.csv（黄皮显白发色推荐底色度数表）

流程：
1. 目标色图 → CIEDE2000匹配 → 得到(颜色家族, 度数)
2. 查底色度数表 → 找到该家族该度数的参考RGB
3. 度数判断：
   - 用户度数 ≥ 目标度数 → 无风险
   - 用户度数 = 目标度数 - 1 → 有偏色风险
   - 用户度数 ≤ 目标度数 - 2 → 不推荐
4. 生图：
   - 必生：匹配到的那个参考色（标准色）
   - 围绕它调：低饱和、高饱和、冷调、暖调
"""

import json
import logging
import math
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


# ============================================================
# 数据库路径
# ============================================================

_PACKAGE_DIR = Path(__file__).resolve().parent
_DATA_DIR = _PACKAGE_DIR / "data"
_PALETTE_FLAT = _DATA_DIR / "hairdye_palette_flat.json"
_PALETTE_FULL = _DATA_DIR / "hairdye_palette_mapping.json"


def _load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ============================================================
# CIEDE2000
# ============================================================

def ciede2000(lab1, lab2):
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    C1 = math.sqrt(a1**2 + b1**2)
    C2 = math.sqrt(a2**2 + b2**2)
    C_avg = (C1 + C2) / 2
    C_avg_7 = C_avg**7
    G = 0.5 * (1 - math.sqrt(C_avg_7 / (C_avg_7 + 25**7)))
    a1p = a1 * (1 + G)
    a2p = a2 * (1 + G)
    C1p = math.sqrt(a1p**2 + b1**2)
    C2p = math.sqrt(a2p**2 + b2**2)
    h1p = math.degrees(math.atan2(b1, a1p))
    if h1p < 0: h1p += 360
    h2p = math.degrees(math.atan2(b2, a2p))
    if h2p < 0: h2p += 360
    dLp = L2 - L1
    dCp = C2p - C1p
    if C1p * C2p == 0:
        dhp = 0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    elif h2p - h1p > 180:
        dhp = h2p - h1p - 360
    else:
        dhp = h2p - h1p + 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp / 2))
    Lp_avg = (L1 + L2) / 2
    Cp_avg = (C1p + C2p) / 2
    if C1p * C2p == 0:
        hp_avg = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hp_avg = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hp_avg = (h1p + h2p + 360) / 2
    else:
        hp_avg = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hp_avg - 30))
         + 0.24 * math.cos(math.radians(2 * hp_avg))
         + 0.32 * math.cos(math.radians(3 * hp_avg + 6))
         - 0.20 * math.cos(math.radians(4 * hp_avg - 63)))
    SL = 1 + 0.015 * (Lp_avg - 50)**2 / math.sqrt(20 + (Lp_avg - 50)**2)
    SC = 1 + 0.045 * Cp_avg
    SH = 1 + 0.015 * Cp_avg * T
    Cp_avg_7 = Cp_avg**7
    RT = (-math.sin(math.radians(60 * math.exp(-((hp_avg - 275) / 25)**2)))
          * 2 * math.sqrt(Cp_avg_7 / (Cp_avg_7 + 25**7)))
    return math.sqrt(
        (dLp / SL)**2 + (dCp / SC)**2 + (dHp / SH)**2
        + RT * (dCp / SC) * (dHp / SH)
    )


# ============================================================
# 颜色工具
# ============================================================

def rgb_to_lab(rgb):
    r, g, b = rgb
    pixel = np.array([[[b, g, r]]], dtype=np.uint8)
    lab_cv = cv2.cvtColor(pixel, cv2.COLOR_BGR2LAB)[0][0]
    return (round(float(lab_cv[0]) * 100.0 / 255.0, 2),
            round(float(lab_cv[1]) - 128.0, 2),
            round(float(lab_cv[2]) - 128.0, 2))


def get_level(L):
    L = max(0.0, min(100.0, L))
    thresholds = [15, 25, 35, 45, 55, 65, 75, 85, 95, 100]
    for i, th in enumerate(thresholds):
        if L <= th: return i + 1
    return 10


def classify_hue_family(lab):
    L, a, b = lab
    chroma = math.sqrt(a**2 + b**2)
    if chroma < 8:
        if L > 80: return "白/浅灰"
        if L > 50: return "灰"
        return "黑/深灰"
    h = math.degrees(math.atan2(b, a))
    if h < 0: h += 360
    if a > 10 and b < 20 and L > 50:
        return "粉红"
    if h < 30 or h >= 330: return "红"
    if h < 60: return "橙"
    if h < 90: return "黄"
    if h < 150: return "绿"
    if h < 210: return "青"
    if h < 270: return "蓝"
    if h < 300: return "靛"
    return "紫"


def rgb_to_hex(rgb):
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"


# ============================================================
# 图片颜色提取
# ============================================================

_segmentation_service = None


def _load_segmentation_service():
    """Import segmentation.py regardless of how this module was loaded.

    The old code did ``from services.segmentation import SegmentationService``,
    but there is no ``services/`` package here — segmentation.py sits next to
    this file. That import always raised ImportError, was swallowed by a bare
    ``except``, and every call silently degraded to a center crop.

    The backend also loads this module through importlib with the pipeline dir
    only temporarily on sys.path, so a plain ``from segmentation import ...``
    would still fail at call time. Resolving against this file's own directory
    works in both cases.
    """
    global _segmentation_service
    if _segmentation_service is not None:
        return _segmentation_service

    package_dir = str(Path(__file__).resolve().parent)
    if package_dir not in sys.path:
        sys.path.insert(0, package_dir)

    from segmentation import SegmentationService

    _segmentation_service = SegmentationService()
    logger.info("hair segmentation backend: %s", _segmentation_service.backend_name)
    return _segmentation_service


def extract_color_from_image(image_path_or_pil, center_ratio=0.5, use_hair_segmentation=True):
    if isinstance(image_path_or_pil, (str, Path)):
        img = Image.open(str(image_path_or_pil)).convert("RGB")
    else:
        img = image_path_or_pil.convert("RGB")

    hair_pixels = None
    if use_hair_segmentation:
        try:
            seg = _load_segmentation_service()
            mask, conf = seg.segment_hair(img)
            arr = np.array(img)
            hair_pixels = arr[mask > 127]
            if len(hair_pixels) < 50:
                logger.warning("hair mask too small (%d px), falling back to center crop", len(hair_pixels))
                hair_pixels = None
        except Exception as error:
            # Previously this swallowed everything silently, which is why a broken
            # import path went unnoticed and colour extraction quietly ran on a
            # center crop instead of the segmented hair region.
            logger.warning("hair segmentation unavailable (%s), falling back to center crop", error)
            hair_pixels = None

    if hair_pixels is not None and len(hair_pixels) > 0:
        median_rgb = tuple(int(x) for x in np.median(hair_pixels, axis=0))
    else:
        arr = np.array(img)
        h, w = arr.shape[:2]
        mx = int(w * (1 - center_ratio) / 2)
        my = int(h * (1 - center_ratio) / 2)
        crop = arr[my:h - my, mx:w - mx]
        brightness = crop.mean(axis=2)
        valid = brightness > 10
        if valid.sum() > 0:
            crop = crop[valid.reshape(crop.shape[:2])]
        median_rgb = tuple(int(x) for x in np.median(crop.reshape(-1, 3), axis=0))

    lab = rgb_to_lab(median_rgb)
    level = get_level(lab[0])
    hue = classify_hue_family(lab)

    return {"rgb": median_rgb, "lab": lab, "level": level, "hue_family": hue}


# ============================================================
# 底色度数表匹配（核心）
# ============================================================

HUE_TO_FAMILIES = {
    "红": ["红色", "树莓红", "粉棕色", "粉色"],
    "橙": ["橙色", "脏橘色"],
    "黄": ["奶茶金"],
    "棕": ["黑茶色", "奶茶灰棕"],
    "粉红": ["粉棕色", "粉色"],
    "蓝": ["蓝色"],
    "紫": ["紫色"],
    "灰": ["雾霾灰", "银灰色"],
}


def match_to_palette(input_lab, top_n=5):
    """
    在权威底色度数表中匹配最接近的颜色
    增强版：当色调明确时，优先匹配同色调家族
    """
    palette = _load_json(_PALETTE_FLAT)["colors"]
    input_hue = classify_hue_family(input_lab)
    preferred_families = HUE_TO_FAMILIES.get(input_hue, [])

    results = []
    for c in palette:
        de = ciede2000(input_lab, tuple(c["lab"]))
        is_preferred = c["family_zh"] in preferred_families
        adjusted_de = de * 0.6 if is_preferred else de
        results.append({
            "family_zh": c["family_zh"],
            "family_en": c["family_en"],
            "level": c["level"],
            "rgb": c["rgb"],
            "lab": c["lab"],
            "hex": c["hex"],
            "delta_e": round(de, 2),
            "adjusted_de": round(adjusted_de, 2),
        })
    results.sort(key=lambda x: x["adjusted_de"])
    return results[:top_n]


def lookup_color(family_zh, level):
    """
    在底色度数表中查找指定家族指定度数的颜色
    返回：该颜色的RGB/LAB信息，或None
    """
    palette = _load_json(_PALETTE_FLAT)["colors"]
    for c in palette:
        if c["family_zh"] == family_zh and c["level"] == level:
            return c
    return None


def get_family_levels(family_zh):
    """获取某颜色家族所有可用的度数"""
    palette = _load_json(_PALETTE_FLAT)["colors"]
    levels = sorted(set(c["level"] for c in palette if c["family_zh"] == family_zh))
    return levels


# ============================================================

# ============================================================
# 颜色中和规则
# ============================================================

FAMILY_TO_HUE = {
    "红色": "红", "树莓红": "红",
    "橙色": "橙", "脏橘色": "橙",
    "黑茶色": "棕", "奶茶灰棕": "棕", "奶茶金": "黄棕",
    "粉棕色": "粉红", "粉色": "粉红",
    "蓝色": "蓝", "紫色": "紫",
    "雾霾灰": "灰", "银灰色": "灰",
}

NEUTRALIZATION_RULES = {
    "红":   {"红": None, "橙": "黄", "黄棕": "黄", "棕": "棕", "粉红": "白", "紫": "蓝", "蓝": "蓝", "灰": "灰"},
    "橙":   {"红": "红", "橙": None, "黄棕": "黄", "棕": "棕", "粉红": "白", "紫": "蓝", "蓝": "蓝", "灰": "灰"},
    "棕":   {"红": "红", "橙": "橙", "黄棕": "黄", "棕": None, "粉红": "粉", "紫": "紫", "蓝": "蓝", "灰": "灰"},
    "黄棕": {"红": "红", "橙": "橙", "黄棕": None, "棕": "棕", "粉红": "粉", "紫": "紫", "蓝": "蓝", "灰": "灰"},
    "粉红": {"红": "红", "橙": "橙", "黄棕": "黄", "棕": "棕", "粉红": None, "紫": "蓝", "蓝": "蓝", "灰": "灰"},
    "蓝":   {"红": "红", "橙": None, "黄棕": "黄", "棕": "棕", "粉红": None, "紫": "红", "蓝": None, "灰": "灰"},
    "紫":   {"红": "红", "橙": None, "黄棕": "黄", "棕": "棕", "粉红": "粉", "紫": None, "蓝": "蓝", "灰": "灰"},
    "灰":   {"红": "红", "橙": "橙", "黄棕": "黄", "棕": "棕", "粉红": "粉", "紫": "紫", "蓝": "蓝", "灰": None},
}


def check_neutralization(current_family, target_family):
    current_hue = FAMILY_TO_HUE.get(current_family, current_family)
    target_hue = FAMILY_TO_HUE.get(target_family, target_family)
    rules = NEUTRALIZATION_RULES.get(current_hue, {})
    target_rule = rules.get(target_hue)
    if target_rule is None and current_hue == target_hue:
        return (True, None, f"{current_family} 同色系，可直接染")
    if target_rule is None:
        return (False, None, f"{current_family} 无法转变为 {target_family}")
    return (True, target_rule, f"{current_family} + {target_rule} = {target_family}")

# 可行性判断
# ============================================================

@dataclass
class FeasibilityResult:
    can_dye: bool
    has_risk: bool
    user_level: int
    target_level: int
    level_diff: int
    target_family: str
    target_name: str
    recommendation: str
    risk_info: Optional[str] = None
    family_available_levels: Optional[List[int]] = None


def check_feasibility(user_level: int, target_family: str, target_level: int, target_name: str, current_family: str = None) -> FeasibilityResult:
    level_diff = user_level - target_level
    available = get_family_levels(target_family)

    # 检查目标度数是否在可用范围内
    if target_level not in available:
        return FeasibilityResult(
            can_dye=False,
            has_risk=False,
            user_level=user_level,
            target_level=target_level,
            level_diff=level_diff,
            target_family=target_family,
            target_name=target_name,
            recommendation=f"{target_name}在{target_level}度底色下不可用，可选度数：{available}",
            family_available_levels=available,
        )

    if level_diff >= 0:
        return FeasibilityResult(
            can_dye=True,
            has_risk=False,
            user_level=user_level,
            target_level=target_level,
            level_diff=level_diff,
            target_family=target_family,
            target_name=target_name,
            recommendation=f"可以染{target_name}，无偏色风险",
            family_available_levels=available,
        )
    elif level_diff == -1:
        return FeasibilityResult(
            can_dye=True,
            has_risk=True,
            user_level=user_level,
            target_level=target_level,
            level_diff=level_diff,
            target_family=target_family,
            target_name=target_name,
            recommendation=f"可以染{target_name}，但有偏色风险（底色差1度），建议先漂浅",
            risk_info=f"当前底色{user_level}度，目标需要{target_level}度，差1度会偏色",
            family_available_levels=available,
        )
    else:
        return FeasibilityResult(
            can_dye=False,
            has_risk=False,
            user_level=user_level,
            target_level=target_level,
            level_diff=level_diff,
            target_family=target_family,
            target_name=target_name,
            recommendation=f"不推荐染{target_name}，底色差{abs(level_diff)}度，需要先漂浅到{target_level}度",
            family_available_levels=available,
        )


# ============================================================
# 变体生成
# ============================================================

def generate_variant_rgb(base_rgb, variant):
    r, g, b = base_rgb
    if variant == "standard":
        return (r, g, b)
    if variant == "low":
        gray = int(0.299 * r + 0.587 * g + 0.114 * b)
        f = 0.8
        return tuple(max(0, min(255, int(gray + (c - gray) * f))) for c in (r, g, b))
    if variant == "high":
        gray = int(0.299 * r + 0.587 * g + 0.114 * b)
        f = 1.2
        return tuple(max(0, min(255, int(gray + (c - gray) * f))) for c in (r, g, b))
    if variant == "cool":
        return (max(0, r - 10), g, min(255, b + 20))
    if variant == "warm":
        return (min(255, r + 20), g, max(0, b - 15))
    return (r, g, b)


VARIANT_DEFS = [
    {"key": "standard", "label": "标准色"},
    {"key": "low", "label": "低饱和"},
    {"key": "high", "label": "高饱和"},
    {"key": "cool", "label": "冷调"},
    {"key": "warm", "label": "暖调"},
]


def plan_generation(user_level, target_family, target_level, target_name):
    """
    规划生图方案

    - 无风险：生目标度数的图 + 变体
    - 有风险（差1度）：同时生用户度数偏色图 + 目标度数正常图 + 变体
    - 不推荐：不生图
    """
    base_color = lookup_color(target_family, target_level)
    if not base_color:
        return None

    base_rgb = tuple(base_color["rgb"])
    level_diff = user_level - target_level

    plan = {
        "target_family": target_family,
        "target_name": target_name,
        "target_level": target_level,
        "user_level": user_level,
        "level_diff": level_diff,
        "base_color": {
            "family": target_family,
            "level": target_level,
            "rgb": list(base_rgb),
            "lab": base_color["lab"],
            "hex": base_color["hex"],
        },
        "variants": [],
        "risk_variant": None,
    }

    if level_diff >= 0:
        for v in VARIANT_DEFS:
            plan["variants"].append({
                "key": v["key"],
                "label": v["label"],
                "rgb": list(generate_variant_rgb(base_rgb, v["key"])),
            })
    elif level_diff == -1:
        user_color = lookup_color(target_family, user_level)
        if user_color:
            risk_rgb = tuple(user_color["rgb"])
        else:
            risk_rgb = generate_variant_rgb(base_rgb, "low")

        plan["risk_variant"] = {
            "key": "risk",
            "label": f"偏色风险（{user_level}度底色）",
            "rgb": list(risk_rgb),
            "description": f"底色{user_level}度时染{target_name}会偏色",
        }

        for v in VARIANT_DEFS:
            plan["variants"].append({
                "key": v["key"],
                "label": v["label"],
                "rgb": list(generate_variant_rgb(base_rgb, v["key"])),
            })

    return plan


# ============================================================
# 完整流程
# ============================================================

def full_pipeline(target_image_path, user_level, output_dir=None):
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    target_info = extract_color_from_image(target_image_path)
    matches = match_to_palette(target_info["lab"], top_n=5)
    best = matches[0]

    target_family = best["family_zh"]
    target_level = best["level"]
    target_name = f"{best['family_zh']}{best['level']}度"

    feasibility = check_feasibility(user_level, target_family, target_level, target_name)
    plan = plan_generation(user_level, target_family, target_level, target_name)

    return {
        "target": {
            "image": str(target_image_path),
            "extracted": target_info,
            "matched": best,
            "all_matches": matches,
        },
        "feasibility": {
            "can_dye": feasibility.can_dye,
            "has_risk": feasibility.has_risk,
            "user_level": feasibility.user_level,
            "target_level": feasibility.target_level,
            "level_diff": feasibility.level_diff,
            "recommendation": feasibility.recommendation,
            "risk_info": feasibility.risk_info,
            "family_available_levels": feasibility.family_available_levels,
        },
        "plan": plan,
    }


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("用法: python hair_dye_engine.py <目标色图> <用户底色度数>")
        sys.exit(1)

    target_path = sys.argv[1]
    user_level = int(sys.argv[2])

    result = full_pipeline(target_path, user_level)

    print("=" * 60)
    print("染发引擎 v2 结果")
    print("=" * 60)

    t = result["target"]
    m = t["matched"]
    print(f"\n匹配结果: {m['family_zh']}{m['level']}度 ({m['family_en']})")
    print(f"匹配色差: dE={m['delta_e']}")
    print(f"参考RGB: {m['rgb']}")
    print(f"参考LAB: {m['lab']}")
    print(f"参考HEX: {m['hex']}")

    print(f"\n--- Top-5 匹配 ---")
    for i, match in enumerate(t["all_matches"], 1):
        print(f"  {i}. {match['family_zh']}{match['level']}度  dE={match['delta_e']:.1f}  RGB{match['rgb']}")

    f = result["feasibility"]
    print(f"\n--- 可行性判断 ---")
    print(f"用户底色: {f['user_level']}度")
    print(f"目标度数: {f['target_level']}度")
    print(f"度数差: {f['level_diff']}")
    print(f"可否染: {'是' if f['can_dye'] else '否'}")
    print(f"偏色风险: {'有' if f['has_risk'] else '无'}")
    print(f"建议: {f['recommendation']}")
    if f['risk_info']:
        print(f"风险: {f['risk_info']}")
    if f['family_available_levels']:
        print(f"可选度数: {f['family_available_levels']}")

    p = result["plan"]
    if p:
        print(f"\n--- 生图方案 ---")
        bc = p["base_color"]
        print(f"基准色: {bc['family']}{bc['level']}度 RGB{bc['rgb']} HEX={bc['hex']}")
        if p["risk_variant"]:
            rv = p["risk_variant"]
            print(f"偏色版: {rv['label']} RGB{rv['rgb']}")
        for v in p["variants"]:
            print(f"  {v['label']}: RGB{v['rgb']}")
    else:
        print("\n不推荐生图")
