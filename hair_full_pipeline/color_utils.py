"""
颜色分析工具（LAB 色彩空间相关）

负责：
- RGB <-> LAB 转换（标准 LAB 范围）
- RGB <-> HSV 转换
- 色度等级计算
- 发色分类
"""

import cv2
import numpy as np
from typing import Tuple


def _opencv_lab_to_standard(lab_opencv: np.ndarray) -> Tuple[float, float, float]:
    """
    将 OpenCV uint8 LAB 转换为标准 LAB 范围

    OpenCV uint8 范围:
        L: 0~255 (映射标准 0~100)
        a: 0~255 (映射标准 -128~127)
        b: 0~255 (映射标准 -128~127)

    标准 LAB:
        L: 0~100
        a: -128~127
        b: -128~127
    """
    l_std = lab_opencv[0] * 100.0 / 255.0
    a_std = lab_opencv[1] - 128.0
    b_std = lab_opencv[2] - 128.0
    return (l_std, a_std, b_std)


def _standard_lab_to_opencv(lab: Tuple[float, float, float]) -> np.ndarray:
    """将标准 LAB 转换回 OpenCV uint8 范围"""
    l_cv = lab[0] * 255.0 / 100.0
    a_cv = lab[1] + 128.0
    b_cv = lab[2] + 128.0
    return np.array([l_cv, a_cv, b_cv], dtype=np.uint8)


def rgb_to_lab(rgb: Tuple[int, int, int]) -> Tuple[float, float, float]:
    """
    RGB 转标准 LAB 色彩空间

    Args:
        rgb: (R, G, B) 值域 0~255

    Returns:
        (L*: 0~100, a*: -128~127, b*: -128~127)
    """
    pixel = np.array([[rgb]], dtype=np.uint8)
    lab_cv = cv2.cvtColor(pixel, cv2.COLOR_RGB2LAB)[0, 0]
    return _opencv_lab_to_standard(lab_cv)


def lab_to_rgb(lab: Tuple[float, float, float]) -> Tuple[int, int, int]:
    """
    标准 LAB 转 RGB

    Args:
        lab: (L*, a*, b*)

    Returns:
        (R, G, B) 值域 0~255
    """
    lab_cv = _standard_lab_to_opencv(lab)
    pixel = np.array([[lab_cv]], dtype=np.uint8)
    rgb = cv2.cvtColor(pixel, cv2.COLOR_LAB2RGB)[0, 0]
    return (int(rgb[0]), int(rgb[1]), int(rgb[2]))


def rgb_to_hsv(rgb: Tuple[int, int, int]) -> Tuple[float, float, float]:
    """
    RGB 转 HSV

    Args:
        rgb: (R, G, B) 值域 0~255

    Returns:
        (H: 0~180, S: 0~255, V: 0~255) — OpenCV 标准
    """
    pixel = np.array([[rgb]], dtype=np.uint8)
    hsv = cv2.cvtColor(pixel, cv2.COLOR_RGB2HSV).astype(np.float64)[0, 0]
    return (hsv[0], hsv[1], hsv[2])


def get_color_level(l_value: float) -> int:
    """
    根据 L* 值计算色度等级 (1~10)
    L* 范围: 0(黑) ~ 100(白)

    映射：
        0-15 → 1 (最深)
        15-25 → 2
        25-35 → 3
        35-45 → 4
        45-55 → 5
        55-65 → 6
        65-75 → 7
        75-85 → 8
        85-95 → 9
        95-100 → 10 (最浅)

    Args:
        l_value: L* 值 (0~100，标准 LAB 范围)

    Returns:
        色度等级 (1~10)
    """
    l_value = max(0.0, min(100.0, l_value))

    thresholds = [15, 25, 35, 45, 55, 65, 75, 85, 95, 100]
    for i, th in enumerate(thresholds):
        if l_value <= th:
            return i + 1
    return 10


def classify_hair_color(rgb: Tuple[int, int, int]) -> str:
    """
    根据 RGB 值分类发色（重构版 v2 - HSV 色相优先）

    策略：
    1. 先用 LAB 判断极暗/极亮/极低饱和（黑白灰银）
    2. 再用 HSV 色相判断彩色系（红/橙/黄/绿/蓝/紫/粉）
    3. 最后用 LAB 亮度区分深浅

    Args:
        rgb: (R, G, B) 值域 0~255

    Returns:
        发色分类标签（匹配 HairColor 枚举）
    """
    l_val, a_val, b_val = rgb_to_lab(rgb)
    h_val, s_val, v_val = rgb_to_hsv(rgb)

    # OpenCV HSV: H 0~180, S 0~255, V 0~255
    s_norm = s_val / 255.0  # 归一化到 0~1
    h_deg = h_val * 2       # 转换为 0~360 度

    # ---- 第一步：极暗/极亮/极低饱和 → 黑白灰银 ----

    # 极暗 → 黑色
    if l_val < 15:
        return "black"

    # 极低饱和度（S < 0.08）→ 灰色系
    if s_norm < 0.08:
        if l_val > 85:
            return "white"
        if l_val > 70:
            return "silver"
        if l_val > 45:
            return "ash_gray"
        return "black"

    # 低饱和度（S < 0.15）→ 可能是灰/银/奶茶棕
    if s_norm < 0.15:
        if l_val > 85:
            return "white"
        if l_val > 70:
            # 高亮度低饱和 → 银灰/灰金
            return "silver"
        if l_val > 45:
            # 中亮度低饱和 → 灰/奶茶棕
            # 用 LAB b* 判断：b* > 10 偏黄 → 奶茶棕
            if b_val > 10:
                return "light_brown"
            return "ash_gray"
        # 低亮度低饱和 → 深灰/黑
        return "black"

    # ---- 第二步：HSV 色相判断彩色系 ----
    # 色相环：红(0/360) → 橙(30) → 黄(60) → 绿(120) → 青(180) → 蓝(240) → 紫(270) → 粉(330) → 红(360)

    # 红色/粉色系：H 0~20 或 340~360
    # 注意：暖棕色在 H 20~45 范围
    if (h_deg < 20) or (h_deg >= 340):
        # 深色 → 红/深红
        if l_val < 30:
            return "red"
        # 中等亮度（30-50）：根据饱和度判断红 vs 棕
        if l_val < 50:
            if s_norm > 0.6:
                return "red"
            return "dark_brown"
        # 高亮度 + 低饱和 → 粉色
        if l_val > 60 and s_norm < 0.45:
            return "pink"
        # 高亮度 + 高饱和 → 红/赤褐
        if s_norm > 0.5:
            return "red"
        return "auburn"

    # 橙/棕色系：H 20~55
    # 这是暖棕色的主要范围
    if 20 <= h_deg < 55:
        if l_val < 40:
            return "dark_brown"
        if l_val < 61:
            return "brown"
        if l_val > 70:
            return "blonde"
        return "light_brown"

    # 黄/金色系：H 55~85
    if 55 <= h_deg < 85:
        if l_val > 60:
            return "blonde"
        if l_val > 45:
            return "light_brown"
        return "brown"

    # 黄绿/绿色系：H 85~155
    if 85 <= h_deg < 155:
        return "green"

    # 青/蓝绿系：H 155~215
    if 155 <= h_deg < 215:
        if s_norm < 0.15:
            return "ash_gray"
        return "blue"

    # 蓝色系：H 215~265
    if 215 <= h_deg < 265:
        # 浅蓝/粉蓝（高亮度 + 低饱和）→ 可能是粉色系
        if l_val > 70 and s_norm < 0.25:
            return "pink"
        return "blue"

    # 蓝紫/紫色系：H 265~305
    if 265 <= h_deg < 305:
        # 浅紫（高亮度 + 低饱和）→ 粉色
        if l_val > 70 and s_norm < 0.3:
            return "pink"
        return "purple"

    # 紫粉/粉色系：H 305~335
    if 305 <= h_deg < 335:
        if l_val > 65 and s_norm < 0.4:
            return "pink"
        if s_norm > 0.5:
            return "purple"
        return "pink"

    # ---- 第三步：兜底 ----
    # 根据亮度和饱和度兜底
    if l_val > 70:
        return "blonde"
    if l_val > 45:
        return "light_brown"
    return "other"
