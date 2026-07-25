"""
头发分割服务 v3
支持双后端：MediaPipe（优先）/ SMP ONNX（回退）
新增：人脸辅助定位 ROI 优化

输出格式不变：
  segment_hair(image) -> (hair_mask, confidence)
  get_hair_regions(image) -> (regions, confidence)
"""
import os
import shutil
import tempfile
import time
import cv2
import numpy as np
from PIL import Image
from typing import List, Tuple, Dict, Any, Optional

from config import settings

# Try importing mediapipe
_HAS_MEDIAPIPE = False
try:
    import mediapipe as mp
    _HAS_MEDIAPIPE = True
except ImportError:
    pass


class MediaPipeHairSegmenter:
    """MediaPipe Hair Segmenter 后端"""

    def __init__(self):
        self._segmenter = None
        self._loaded = False
        self._temp_model_path = None

    def _resolve_model_path(self, model_path: str) -> str:
        """
        MediaPipe C++ backend cannot handle non-ASCII paths on Windows.
        Copy model to a temp directory if path contains non-ASCII chars.
        """
        try:
            model_path.encode('ascii')
            return model_path
        except UnicodeEncodeError:
            temp_dir = tempfile.mkdtemp(prefix='mediapipe_')
            temp_path = os.path.join(temp_dir, 'hair_segmenter.tflite')
            shutil.copy2(model_path, temp_path)
            self._temp_model_path = temp_path
            return temp_path

    def load(self):
        if self._loaded:
            return
        import mediapipe as mp
        model_path = os.path.join(settings.MODEL_DIR, "hair_segmenter.tflite")
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"MediaPipe model not found: {model_path}\n"
                f"Download from: https://storage.googleapis.com/mediapipe-models/hair_segmenter/hair_segmenter/float32/latest/hair_segmenter.tflite"
            )
        resolved_path = self._resolve_model_path(model_path)
        base_options = mp.tasks.BaseOptions(model_asset_path=resolved_path)
        options = mp.tasks.vision.ImageSegmenterOptions(
            base_options=base_options,
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            output_category_mask=True,
        )
        self._segmenter = mp.tasks.vision.ImageSegmenter.create_from_options(options)
        self._loaded = True

    def segment(self, image: Image.Image) -> Tuple[np.ndarray, np.ndarray, float]:
        """
        Returns:
            (hair_mask, hair_prob, confidence)
            hair_mask: uint8, 255=hair, 0=bg
            hair_prob: float32 probability map
        """
        import mediapipe as mp
        self.load()

        img_rgb = np.array(image.convert("RGB"))
        h, w = img_rgb.shape[:2]

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        result = self._segmenter.segment(mp_image)

        category_mask = result.category_mask
        mask_np = category_mask.numpy_view()

        # MediaPipe hair category = 1 (in most models)
        unique_vals = np.unique(mask_np)
        if len(unique_vals) <= 2:
            hair_mask = (mask_np > 0).astype(np.uint8) * 255
        else:
            hair_mask = (mask_np == 1).astype(np.uint8) * 255

        # Morphological cleanup
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        hair_mask = cv2.morphologyEx(hair_mask, cv2.MORPH_OPEN, kernel)
        hair_mask = cv2.morphologyEx(hair_mask, cv2.MORPH_CLOSE, kernel)

        # Confidence
        mask_bool = hair_mask > 127
        if mask_bool.sum() == 0:
            confidence = 0.0
        else:
            confidence = 0.90

        # Generate a pseudo probability map
        hair_prob = hair_mask.astype(np.float32) / 255.0

        return hair_mask, hair_prob, confidence

    def close(self):
        if self._segmenter is not None:
            self._segmenter.close()
            self._segmenter = None
            self._loaded = False
        if self._temp_model_path:
            try:
                temp_dir = os.path.dirname(self._temp_model_path)
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass
            self._temp_model_path = None


class SMPSegmentationBackend:
    """SMP ONNX 后端（原有实现）"""

    INPUT_SIZE = 512
    MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    CLASS_HAIR = 2

    def __init__(self):
        self._session = None
        self._input_name = None
        self._output_name = None
        self._loaded = False

    def load(self):
        if self._loaded:
            return
        model_path = os.path.join(settings.MODEL_DIR, "hair_seg_smp.onnx")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"SMP model not found: {model_path}")
        providers = ['CPUExecutionProvider']
        if settings.DEVICE == "cuda":
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
        import onnxruntime as ort
        self._session = ort.InferenceSession(model_path, providers=providers)
        self._input_name = self._session.get_inputs()[0].name
        self._output_name = self._session.get_outputs()[0].name
        self._loaded = True

    def segment(self, image: Image.Image) -> Tuple[np.ndarray, np.ndarray, float]:
        self.load()

        img_rgb = np.array(image.convert("RGB"))
        orig_h, orig_w = img_rgb.shape[:2]

        img_resized = cv2.resize(img_rgb, (self.INPUT_SIZE, self.INPUT_SIZE), interpolation=cv2.INTER_LINEAR)
        img_norm = (img_resized.astype(np.float32) / 255.0 - self.MEAN) / self.STD
        img_chw = img_norm.transpose(2, 0, 1).astype(np.float32)
        img_batch = np.expand_dims(img_chw, axis=0)

        output = self._session.run([self._output_name], {self._input_name: img_batch})[0]

        logits = output.squeeze()
        shifted = logits - logits.max(axis=0, keepdims=True)
        exp_vals = np.exp(shifted)
        probs = exp_vals / exp_vals.sum(axis=0, keepdims=True)

        hair_prob = probs[self.CLASS_HAIR]
        class_map = np.argmax(logits, axis=0)
        binary = ((class_map == self.CLASS_HAIR) & (hair_prob > 0.3)).astype(np.uint8)

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

        hair_mask = cv2.resize(binary, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST) * 255
        hair_prob_resized = cv2.resize(hair_prob, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)

        mask_bool = hair_mask > 127
        if mask_bool.sum() == 0:
            confidence = 0.0
        else:
            confidence = float(hair_prob_resized[mask_bool].mean())
            confidence = round(min(max(confidence, 0.0), 1.0), 4)

        return hair_mask, hair_prob_resized, confidence


class SegmentationService:
    """头发分割服务（双后端 + 人脸辅助 ROI）"""

    def __init__(self):
        self._backend = None
        self._backend_name = None

    def _init_backend(self):
        if self._backend is not None:
            return
        if _HAS_MEDIAPIPE:
            try:
                backend = MediaPipeHairSegmenter()
                backend.load()
                self._backend = backend
                self._backend_name = "mediapipe"
                return
            except Exception:
                pass
        self._backend = SMPSegmentationBackend()
        self._backend_name = "smp_onnx"

    @property
    def backend_name(self) -> str:
        self._init_backend()
        return self._backend_name

    def _apply_roi(self, hair_mask: np.ndarray, roi_mask: np.ndarray) -> np.ndarray:
        """将 ROI mask 应用到 hair mask 上"""
        # 确保尺寸一致
        if roi_mask.shape != hair_mask.shape:
            roi_mask = cv2.resize(roi_mask, (hair_mask.shape[1], hair_mask.shape[0]),
                                  interpolation=cv2.INTER_NEAREST)
        return cv2.bitwise_and(hair_mask, roi_mask)

    def segment_hair(self, image: Image.Image) -> Tuple[np.ndarray, float]:
        """
        分割头发区域（可选：应用人脸辅助 ROI）

        Args:
            image: 输入图片 (PIL Image)

        Returns:
            (hair_mask, confidence):
                hair_mask: 二值 mask (numpy array, 255=头发, 0=背景)
                confidence: 分割置信度 0~1
        """
        self._init_backend()
        hair_mask, hair_prob, confidence = self._backend.segment(image)

        # 人脸辅助 ROI 优化
        if settings.FACE_DETECTION_ENABLED:
            try:
                from services.face_detection import face_detection_service
                roi_mask, face_detected = face_detection_service.generate_head_roi(image)
                if face_detected:
                    hair_mask = self._apply_roi(hair_mask, roi_mask)
            except Exception as e:
                # face detection 失败不影响主流程
                pass

        return hair_mask, confidence

    def segment_hair_with_debug(
        self, image: Image.Image, save_prefix: str = "debug"
    ) -> Tuple[np.ndarray, float, Dict[str, Any]]:
        """
        分割并保存调试图片

        Args:
            image: 输入图片 (PIL Image)
            save_prefix: 输出文件名前缀

        Returns:
            (hair_mask, confidence, debug_info)
        """
        self._init_backend()
        raw_mask, hair_prob, confidence = self._backend.segment(image)

        # 人脸辅助 ROI 优化
        face_detected = False
        roi_applied = False
        roi_mask = None

        if settings.FACE_DETECTION_ENABLED:
            try:
                from services.face_detection import face_detection_service
                roi_mask, face_detected = face_detection_service.generate_head_roi(image)
                if face_detected:
                    raw_mask = self._apply_roi(raw_mask, roi_mask)
                    roi_applied = True
            except Exception as e:
                pass

        hair_mask = raw_mask

        # Ensure output directory exists
        output_dir = settings.DEBUG_MASKS_DIR
        os.makedirs(output_dir, exist_ok=True)

        # Get image as numpy array
        img_rgb = np.array(image.convert("RGB"))

        # --- A. Save original ---
        original_path = os.path.join(output_dir, f"original_{save_prefix}.jpg")
        Image.fromarray(img_rgb).save(original_path, quality=95)

        # --- B. Save hair mask (white=hair, black=bg) ---
        mask_vis = hair_mask.copy()
        mask_path = os.path.join(output_dir, f"hair_mask_{save_prefix}.png")
        Image.fromarray(mask_vis, mode="L").save(mask_path)

        # --- C. Save hair-only (mask applied, background black) ---
        mask_float = hair_mask.astype(np.float32) / 255.0
        mask_3ch = mask_float[:, :, np.newaxis]
        hair_only = (img_rgb * mask_3ch).astype(np.uint8)
        hair_only_path = os.path.join(output_dir, f"hair_only_{save_prefix}.jpg")
        Image.fromarray(hair_only).save(hair_only_path, quality=95)

        # --- D. Save ROI mask (if face detected) ---
        roi_path = None
        if roi_applied and roi_mask is not None:
            roi_path = os.path.join(output_dir, f"roi_mask_{save_prefix}.png")
            Image.fromarray(roi_mask, mode="L").save(roi_path)

        # Hair pixel ratio
        total_pixels = hair_mask.shape[0] * hair_mask.shape[1]
        hair_pixels = (hair_mask > 127).sum()
        hair_pixel_ratio = hair_pixels / total_pixels

        debug_info = {
            "original_path": original_path,
            "mask_path": mask_path,
            "hair_only_path": hair_only_path,
            "roi_path": roi_path,
            "backend": self._backend_name,
            "hair_pixel_ratio": round(hair_pixel_ratio, 4),
            "face_detected": face_detected,
            "roi_applied": roi_applied,
        }

        return hair_mask, confidence, debug_info

    def get_hair_regions(self, image: Image.Image) -> Tuple[List[np.ndarray], float]:
        """
        获取多个头发区域（按空间位置三等分）

        Returns:
            (regions, confidence):
                regions: [upper_mask, middle_mask, lower_mask]
                confidence: 分割置信度
        """
        hair_mask, confidence = self.segment_hair(image)
        h, w = hair_mask.shape[:2]

        h1 = h // 3
        h2 = 2 * h // 3

        regions = []
        for start, end in [(0, h1), (h1, h2), (h2, h)]:
            region_mask = np.zeros_like(hair_mask)
            region_mask[start:end, :] = hair_mask[start:end, :]
            regions.append(region_mask)

        return regions, confidence


segmentation_service = SegmentationService()
