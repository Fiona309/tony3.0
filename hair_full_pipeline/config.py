import os
"""
搴旂敤閰嶇疆
"""

from typing import List


PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))


try:
    from pydantic_settings import BaseSettings
except ModuleNotFoundError:
    class BaseSettings:
        model_config = {}

        def __init__(self):
            self._load_env_file()
            annotations = getattr(self.__class__, "__annotations__", {})
            for key, annotation in annotations.items():
                default = getattr(self.__class__, key)
                raw_value = os.getenv(key)
                value = self._cast_value(raw_value, default, annotation) if raw_value is not None else default
                setattr(self, key, value)

        def _load_env_file(self):
            env_file = self.model_config.get("env_file") if isinstance(self.model_config, dict) else None
            if not env_file or not os.path.exists(env_file):
                return
            with open(env_file, encoding="utf-8") as file:
                for raw_line in file:
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

        @staticmethod
        def _cast_value(raw_value, default, annotation):
            if annotation is int:
                return int(raw_value)
            if annotation is bool:
                return raw_value.lower() in {"1", "true", "yes", "on"}
            if annotation in {List[str], list[str]}:
                return [item.strip() for item in raw_value.split(",") if item.strip()]
            return raw_value


class Settings(BaseSettings):
    APP_NAME: str = "Hair Vision Service"
    VERSION: str = "0.2.0"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True

    CORS_ORIGINS: List[str] = ["*"]

    MODEL_DIR: str = os.path.join(PACKAGE_DIR, "models", "weights")
    DEVICE: str = "cpu"  # "cpu" 鎴?"cuda"

    # 鍒嗗壊妯″瀷閰嶇疆
    SEG_INPUT_SIZE: int = 512
    SEG_SCORE_THRESHOLD: float = 0.5

    # 棰滆壊鍒嗘瀽閰嶇疆
    COLOR_N_CLUSTERS: int = 3  # K-Means 鑱氱被鏁?    # Gemini Vision 閰嶇疆锛堝彲閫夐珮绾у懡鍚嶆ā鍧楋級
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GEMINI_TIMEOUT: int = 15

    # DeepSeek 閰嶇疆锛堝彲閫夎涔夊懡鍚嶆ā鍧楋級
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_TIMEOUT: int = 15

    # OpenRouter AI 染发配置
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "google/gemini-2.5-flash-image"
    OPENROUTER_API_URL: str = "https://openrouter.ai/api/v1/chat/completions"

    # GLM (智谱 AI) 配置
    GLM_API_KEY: str = ""
    GLM_MODEL: str = "cogview-4-250304"

    # 鍒嗗壊璋冭瘯妯″紡
    DEBUG_SEGMENTATION: bool = False
    DEBUG_MASKS_DIR: str = "tests/debug_masks"

    # 浜鸿劯杈呭姪瀹氫綅閰嶇疆
    FACE_DETECTION_ENABLED: bool = False  # services/face_detection.py was never delivered; blaze_face.tflite is unused until it is
    FACE_DETECTION_MODEL: str = "blaze_face.tflite"
    FACE_DETECTION_MIN_CONFIDENCE: float = 0.5
    FACE_ROI_EXPANSION: str = "conservative"  # conservative / aggressive / adaptive

    model_config = {"env_file": os.path.join(PACKAGE_DIR, ".env"), "extra": "ignore"}


settings = Settings()

