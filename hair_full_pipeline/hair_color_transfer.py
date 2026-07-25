"""
虚拟染发服务 - LAB 颜色空间本地实现

功能：
  - 接收原图 + hair_mask + 目标发色 HEX
  - LAB 色彩空间转换，保留亮度通道
  - 修改颜色通道实现染发效果
  - mask 羽化 + alpha 融合

技术路线（参考施华蔻 Virtual Try-on）：
  1. RGB → LAB 色彩空间转换
  2. 保留 L 通道（亮度/细节）
  3. 替换 a/b 通道（颜色）
  4. 高斯模糊 mask 边缘实现自然过渡
  5. Alpha 融合输出
"""

import logging
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


class HairColorTransferService:
    """LAB 颜色空间虚拟染发服务"""

    def __init__(self):
        pass

    def hex_to_rgb(self, hex_color: str) -> Tuple[int, int, int]:
        """HEX 转 RGB"""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) != 6:
            raise ValueError(f"Invalid hex color: {hex_color}")
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        return (r, g, b)

    def rgb_to_lab_array(self, rgb_array: np.ndarray) -> np.ndarray:
        """RGB numpy array 转 LAB (OpenCV uint8 格式)"""
        # 输入: (H, W, 3) uint8 RGB
        # 输出: (H, W, 3) uint8 LAB (L: 0-255, a: 0-255, b: 0-255)
        return cv2.cvtColor(rgb_array, cv2.COLOR_RGB2LAB)

    def lab_to_rgb_array(self, lab_array: np.ndarray) -> np.ndarray:
        """LAB numpy array 转 RGB (OpenCV uint8 格式)"""
        return cv2.cvtColor(lab_array, cv2.COLOR_LAB2RGB)

    def get_target_lab(self, target_hex: str) -> Tuple[float, float, float]:
        """获取目标颜色的 LAB 值（标准范围）"""
        from utils.color_utils import rgb_to_lab
        rgb = self.hex_to_rgb(target_hex)
        return rgb_to_lab(rgb)

    def feather_mask(
        self,
        mask: np.ndarray,
        feather_radius: int = 15,
    ) -> np.ndarray:
        """
        Mask 羽化处理（v3 - 多级羽化 + 距离变换）

        实现更自然的边缘过渡：
        1. 距离变换：根据到边缘的距离生成渐变
        2. 多级高斯模糊：不同半径混合
        3. 边缘收缩：避免溢出到背景

        Args:
            mask: 输入 mask (0-255, uint8)
            feather_radius: 羽化半径（像素）

        Returns:
            羽化后的 mask (0.0-1.0, float32)
        """
        # 确保 mask 是 uint8
        if mask.dtype != np.uint8:
            mask = (mask * 255).astype(np.uint8) if mask.max() <= 1.0 else mask.astype(np.uint8)

        # 二值化
        mask_binary = (mask > 127).astype(np.uint8) * 255

        # 1. 距离变换：计算每个像素到边缘的距离
        # 内部为正，外部为负
        dist_inside = cv2.distanceTransform(mask_binary, cv2.DIST_L2, 5)
        dist_outside = cv2.distanceTransform(255 - mask_binary, cv2.DIST_L2, 5)
        dist_map = dist_inside - dist_outside

        # 2. 基于距离的渐变（sigmoid-like）
        # 在 feather_radius 范围内生成平滑过渡
        smooth_factor = feather_radius * 0.4
        mask_float = 1.0 / (1.0 + np.exp(-dist_map / smooth_factor))

        # 3. 多级高斯模糊混合
        # 小半径：保留细节
        blur_small = cv2.GaussianBlur(
            (mask_float * 255).astype(np.uint8),
            (feather_radius // 2 * 2 + 1, feather_radius // 2 * 2 + 1),
            feather_radius / 4
        ).astype(np.float32) / 255.0

        # 大半径：平滑过渡
        blur_large = cv2.GaussianBlur(
            (mask_float * 255).astype(np.uint8),
            (feather_radius * 2 + 1, feather_radius * 2 + 1),
            feather_radius
        ).astype(np.float32) / 255.0

        # 混合：70% 距离变换 + 20% 小模糊 + 10% 大模糊
        result = mask_float * 0.7 + blur_small * 0.2 + blur_large * 0.1

        # 4. 边缘收缩：避免颜色溢出
        # 对 mask 核心区域保持高值
        kernel_erode = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (feather_radius // 3, feather_radius // 3)
        )
        mask_eroded = cv2.erode(mask_binary, kernel_erode)
        mask_eroded_float = mask_eroded.astype(np.float32) / 255.0

        # 核心区域权重更高
        core_weight = 0.85
        result = result * (1 - core_weight) + mask_eroded_float * core_weight * result

        # 确保范围 [0, 1]
        result = np.clip(result, 0, 1)

        return result.astype(np.float32)

    def transfer_color_lab(
        self,
        image_rgb: np.ndarray,
        hair_mask: np.ndarray,
        target_lab: Tuple[float, float, float],
        preserve_texture: float = 0.3,
        lighten_factor: float = 0.5,
    ) -> np.ndarray:
        """
        LAB 颜色迁移核心算法（v2 - 支持 L 通道提亮）

        Args:
            image_rgb: 原图 RGB (H, W, 3) uint8
            hair_mask: 头发 mask (H, W) uint8 (0-255)
            target_lab: 目标颜色 LAB (L, a, b) 标准范围
            preserve_texture: 保留原始纹理的比例 (0-1)
            lighten_factor: L 通道提亮因子 (0=保留原亮度, 1=完全使用目标亮度, 0.5=混合)

        Returns:
            染发后的 RGB (H, W, 3) uint8
        """
        # 1. RGB → LAB
        lab_image = self.rgb_to_lab_array(image_rgb).astype(np.float32)

        # OpenCV LAB: L 0-255, a 0-255, b 0-255
        # 标准 LAB: L 0-100, a -128~127, b -128~127
        # 转换: L_cv = L_std * 255/100, a_cv = a_std + 128, b_cv = b_std + 128
        target_l_cv = target_lab[0] * 255.0 / 100.0
        target_a_cv = target_lab[1] + 128.0
        target_b_cv = target_lab[2] + 128.0

        # 2. 分离通道
        L, a, b = lab_image[:, :, 0], lab_image[:, :, 1], lab_image[:, :, 2]

        # 3. 创建 mask 区域的布尔索引
        mask_bool = hair_mask > 127

        # 4. 在 mask 区域替换颜色通道
        new_L = L.copy()
        new_a = a.copy()
        new_b = b.copy()

        # L 通道混合：实现深色头发提亮
        # new_L = old_L * (1 - lighten_factor) + target_L * lighten_factor
        if lighten_factor > 0:
            new_L[mask_bool] = (
                L[mask_bool] * (1 - lighten_factor) + target_l_cv * lighten_factor
            )

        # a/b 通道混合：保留部分纹理
        new_a[mask_bool] = (
            a[mask_bool] * preserve_texture + target_a_cv * (1 - preserve_texture)
        )
        new_b[mask_bool] = (
            b[mask_bool] * preserve_texture + target_b_cv * (1 - preserve_texture)
        )

        # 5. 合并通道
        new_lab = np.stack([new_L, new_a, new_b], axis=-1)
        new_lab = np.clip(new_lab, 0, 255).astype(np.uint8)

        # 6. LAB → RGB
        result_rgb = self.lab_to_rgb_array(new_lab)

        return result_rgb

    def transfer_hair_color(
        self,
        image: Image.Image,
        hair_mask: np.ndarray,
        target_color_hex: str,
        preserve_texture: float = 0.3,
        feather_radius: int = 15,
        blend_strength: float = 0.9,
        lighten_factor: float = 0.5,
    ) -> Optional[Image.Image]:
        """
        虚拟染发主入口（v2 - 支持 L 通道提亮）

        Args:
            image: 原始 PIL Image
            hair_mask: 头发 mask (H, W) uint8 (0-255)
            target_color_hex: 目标发色 HEX (如 "#8B0000")
            preserve_texture: 保留原始纹理比例 (0=完全替换, 1=不变)
            feather_radius: mask 羽化半径
            blend_strength: 融合强度 (0=全原图, 1=全染发)
            lighten_factor: L 通道提亮因子 (0=保留原亮度, 1=完全使用目标亮度, 0.5=混合)

        Returns:
            染发后的 PIL Image，失败返回 None
        """
        try:
            logger.info(f"[HairColorTransfer] 开始染发: target={target_color_hex}, lighten={lighten_factor}")

            # 1. 准备数据
            image_rgb = np.array(image.convert("RGB"))
            h, w = image_rgb.shape[:2]

            # 2. 调整 mask 尺寸
            if hair_mask.shape[:2] != (h, w):
                logger.info(f"[HairColorTransfer] 调整 mask 尺寸: {hair_mask.shape} -> ({h}, {w})")
                hair_mask = cv2.resize(
                    hair_mask, (w, h), interpolation=cv2.INTER_LINEAR
                )

            # 3. 获取目标颜色 LAB
            target_lab = self.get_target_lab(target_color_hex)
            logger.info(f"[HairColorTransfer] 目标 LAB: L={target_lab[0]:.1f}, a={target_lab[1]:.1f}, b={target_lab[2]:.1f}")

            # 4. LAB 颜色迁移（v2: 支持 L 通道提亮）
            transferred = self.transfer_color_lab(
                image_rgb, hair_mask, target_lab, preserve_texture, lighten_factor
            )

            # 5. Mask 羽化（v3: 多级羽化）
            mask_feathered = self.feather_mask(hair_mask, feather_radius)

            # 6. Alpha 融合（v3: 改进的自然融合）
            # 使用 smoothstep 函数让过渡更自然
            mask_smooth = mask_feathered * mask_feathered * (3 - 2 * mask_feathered)

            # 应用 blend_strength
            mask_3ch = np.stack([mask_smooth] * 3, axis=-1) * blend_strength

            # 颜色空间融合：在 LAB 空间混合更自然
            # 先转换到 LAB
            transferred_lab = self.rgb_to_lab_array(transferred).astype(np.float32)
            original_lab = self.rgb_to_lab_array(image_rgb).astype(np.float32)

            # LAB 空间混合
            blended_lab = original_lab * (1 - mask_3ch) + transferred_lab * mask_3ch
            blended_lab = np.clip(blended_lab, 0, 255).astype(np.uint8)

            # 转换回 RGB
            result = self.lab_to_rgb_array(blended_lab)

            logger.info("[HairColorTransfer] 染发完成")
            return Image.fromarray(result)

        except Exception as e:
            logger.error(f"[HairColorTransfer] 染发失败: {e}")
            return None


# Singleton instance
hair_color_transfer_service = HairColorTransferService()


