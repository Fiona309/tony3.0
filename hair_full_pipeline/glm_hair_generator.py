"""
GLM生图服务 - 基于讨论确认的逻辑

流程：
1. 接收：用户照片 + 目标色(家族+度数) + 用户底色度数
2. 判断：度数对比 + 颜色中和
3. 生图：
   - 无风险：生目标度数的标准色 + 低饱和 + 高饱和 + 冷调 + 暖调
   - 有风险：同时生用户度数偏色版 + 目标度数正常版 + 变体
   - 不推荐：不生图
4. 输出：before/after对比图
"""

import base64
import io
import json
import os
import re
import time
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

import requests
import numpy as np
from PIL import Image, ImageDraw

from config import settings


# ============================================================
# 配置
# ============================================================

def _get_api_config():
    api_key = settings.OPENROUTER_API_KEY
    api_url = settings.OPENROUTER_API_URL
    model = settings.OPENROUTER_MODEL
    return api_key, api_url, model


# ============================================================
# 图片工具
# ============================================================

def image_to_base64(pil_image, max_size=1024):
    if pil_image.width > max_size or pil_image.height > max_size:
        pil_image.thumbnail((max_size, max_size), Image.LANCZOS)
    buf = io.BytesIO()
    pil_image.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()


def base64_to_image(b64_str):
    img_data = base64.b64decode(b64_str)
    return Image.open(io.BytesIO(img_data))


def create_comparison(before_pil, after_pil, save_path):
    w, h = before_pil.size
    after_resized = after_pil.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGB", (w * 2 + 10, h), (255, 255, 255))
    canvas.paste(before_pil, (0, 0))
    canvas.paste(after_resized, (w + 10, 0))
    canvas.save(save_path, quality=95)
    return save_path


def create_6panel(before_pil, after_images, save_path, labels=None):
    from PIL import ImageFont, ImageDraw
    w, h = before_pil.size
    gap = 5
    row_gap = 100
    label_h = 40
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 28)
    except Exception:
        font = ImageFont.load_default()
    canvas_w = w * 3 + gap * 2
    canvas_h = h * 2 + row_gap + label_h * 2
    canvas = Image.new("RGB", (canvas_w, canvas_h), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    if labels is None:
        labels = ["染前", "理论染后", "偏低饱和", "偏高饱和", "偏冷调", "偏暖调"]
    all_images = [before_pil] + list(after_images[:5])
    while len(all_images) < 6:
        all_images.append(None)
    row2_y = h + row_gap
    grid_positions = [
        (0, 0),
        (w + gap, 0),
        (2 * (w + gap), 0),
        (0, row2_y),
        (w + gap, row2_y),
        (2 * (w + gap), row2_y),
    ]
    for i, (img, label) in enumerate(zip(all_images, labels)):
        gx, gy = grid_positions[i]
        bbox = font.getbbox(label)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = gx + (w - tw) // 2
        ty = gy + (label_h - th) // 2
        draw.text((tx, ty), label, fill=(50, 50, 50), font=font)
        if img:
            resized = img.resize((w, h), Image.LANCZOS)
            canvas.paste(resized, (gx, gy + label_h))
    canvas.save(save_path, quality=95)
    return save_path


def _image_from_data_url(url):
    if not isinstance(url, str):
        return None
    if url.startswith("data:image/") and "," in url:
        return base64_to_image(url.split(",", 1)[1])
    return None


def _extract_image_from_openrouter_value(value):
    if isinstance(value, str):
        image = _image_from_data_url(value)
        if image is not None:
            return image
        markdown_match = re.search(r"!\[[^\]]*\]\((data:image/[^)]+)\)", value)
        if markdown_match:
            return _image_from_data_url(markdown_match.group(1))
        if len(value) > 1000:
            try:
                return base64_to_image(value)
            except Exception:
                return None
        return None

    if isinstance(value, list):
        for item in value:
            image = _extract_image_from_openrouter_value(item)
            if image is not None:
                return image
        return None

    if isinstance(value, dict):
        if isinstance(value.get("b64_json"), str):
            return base64_to_image(value["b64_json"])
        image_url = value.get("image_url")
        if isinstance(image_url, dict):
            image = _extract_image_from_openrouter_value(image_url.get("url"))
            if image is not None:
                return image
        elif isinstance(image_url, str):
            image = _extract_image_from_openrouter_value(image_url)
            if image is not None:
                return image
        for key in ("url", "data", "content", "images"):
            image = _extract_image_from_openrouter_value(value.get(key))
            if image is not None:
                return image
    return None


def _redact_openrouter_preview(value, max_text=300):
    if isinstance(value, str):
        if value.startswith("data:image/"):
            return value.split(",", 1)[0] + ",<base64_redacted>"
        if len(value) > max_text:
            return value[:max_text] + "...<truncated>"
        return value
    if isinstance(value, list):
        return [_redact_openrouter_preview(item, max_text=max_text) for item in value[:3]]
    if isinstance(value, dict):
        redacted = {}
        for key, item in list(value.items())[:10]:
            if key in {"url", "b64_json"} and isinstance(item, str) and len(item) > 120:
                redacted[key] = item[:60] + "...<redacted>"
            else:
                redacted[key] = _redact_openrouter_preview(item, max_text=max_text)
        return redacted
    return value


def _openrouter_no_image_preview(data):
    choice = (data.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    preview = {
        "model": data.get("model"),
        "finish_reason": choice.get("finish_reason"),
        "message_keys": list(msg.keys()),
        "content": _redact_openrouter_preview(msg.get("content")),
        "images": _redact_openrouter_preview(msg.get("images")),
        "top_level_keys": list(data.keys()),
    }
    return json.dumps(preview, ensure_ascii=False)


# ============================================================
# GLM 生图
# ============================================================

def generate_with_glm(prompt, input_image_b64=None):
    api_key, api_url, model = _get_api_config()
    if not api_key:
        print("[GLM] API key not configured")
        return None

    messages = []
    if input_image_b64:
        messages.append({
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{input_image_b64}"}},
                {"type": "text", "text": prompt},
            ]
        })
    else:
        messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": "1:1"},
        "max_tokens": 4096,
        "stream": False,
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        resp = requests.post(api_url, headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()

        msg = data.get("choices", [{}])[0].get("message", {})
        # Extract image from common OpenRouter Gemini image response shapes.
        image = _extract_image_from_openrouter_value(msg.get("images"))
        if image is None:
            image = _extract_image_from_openrouter_value(msg.get("content"))
        if image is None:
            image = _extract_image_from_openrouter_value(data.get("images"))
        if image is not None:
            return image

        raise RuntimeError(f"openrouter_no_image_response:{_openrouter_no_image_preview(data)[:800]}")

    except requests.HTTPError as e:
        detail = e.response.text[:500] if e.response is not None else str(e)
        raise RuntimeError(
            f"openrouter_image_generation_http_{e.response.status_code if e.response is not None else 'unknown'}:{detail}"
        ) from e
    except Exception as e:
        raise RuntimeError(f"openrouter_image_generation_failed:{e}") from e


# ============================================================
# Prompt 构建
# ============================================================

def build_recolor_prompt(target_rgb, target_hex, variant="standard", risk_note=""):
    r, g, b = target_rgb

    variant_desc = {
        "standard": f"标准色 rgb({r},{g},{b})",
        "low": f"在标准色基础上轻微降低饱和度，颜色略微偏灰，几乎看不出区别 rgb({r},{g},{b})",
        "high": f"在标准色基础上轻微提高饱和度，颜色略微更鲜艳，几乎看不出区别 rgb({r},{g},{b})",
        "cool": f"在标准色基础上轻微偏冷调，略微偏蓝 rgb({max(0,r-3)},{g},{min(255,b+5)})",
        "warm": f"在标准色基础上轻微偏暖调，略微偏红 rgb({min(255,r+5)},{g},{max(0,b-3)})",
        "risk": f"偏色版本 rgb({r},{g},{b})",
    }

    desc = variant_desc.get(variant, variant_desc["standard"])

    prompt = f"""你是一位专业的染发造型师和图像编辑专家。

请编辑这张照片，只改变头发的颜色，其他所有内容保持完全不变：

目标发色：{desc}
目标 HEX：{target_hex}

核心要求：
1. 只改变头发颜色，面部特征完全不变
2. 背景完全不变
3. 发型和发量完全不变
4. 保留头发的自然纹理、层次感和光泽
5. 保留原始光照和阴影效果
6. 头发颜色要自然真实，符合真实染发效果"""

    if risk_note:
        prompt += f"\n\n注意：{risk_note}"

    prompt += "\n\n请直接返回编辑后的图片，不要返回任何文字说明。"

    return prompt


# ============================================================
# 主生图流程
# ============================================================

def generate_hair_images(
    before_pil,
    target_family,
    target_level,
    target_rgb,
    target_hex,
    user_level,
    has_risk,
    output_dir,
):
    os.makedirs(output_dir, exist_ok=True)

    before_path = os.path.join(output_dir, "before.jpg")
    before_pil.save(before_path, quality=95)
    before_b64 = image_to_base64(before_pil)

    result = {
        "before_path": before_path,
        "after_paths": {},
        "compare_path": None,
        "variants": [],
    }

    if has_risk:
        risk_prompt = build_recolor_prompt(
            target_rgb, target_hex, "risk",
            risk_note=f"用户底色{user_level}度，目标需要{target_level}度，会有偏色效果"
        )
        risk_img = generate_with_glm(risk_prompt, before_b64)
        if risk_img:
            risk_path = os.path.join(output_dir, "risk.jpg")
            risk_img.save(risk_path, quality=95)
            result["after_paths"]["risk"] = risk_path
            result["variants"].append({"key": "risk", "label": f"偏色风险（{user_level}度）", "path": risk_path})

    # Step 1: 先从原图生成标准染后图
    standard_prompt = build_recolor_prompt(target_rgb, target_hex, "standard")
    standard_img = generate_with_glm(standard_prompt, before_b64)
    if standard_img is None:
        raise RuntimeError("openrouter_standard_image_missing")
    if standard_img:
        standard_path = os.path.join(output_dir, "standard.jpg")
        standard_img.save(standard_path, quality=95)
        result["after_paths"]["standard"] = standard_path
        result["variants"].append({"key": "standard", "label": "标准色", "path": standard_path})
        standard_b64 = image_to_base64(standard_img)
    else:
        standard_b64 = before_b64

    # Step 2: 本地HSV微调生成4张变体（零API调用）
    import cv2
    if standard_img:
        standard_arr = np.array(standard_img)
        
        def hsv_tweak(img_arr, s_factor=1.0, v_shift=0, r_shift=0, b_shift=0):
            hsv = cv2.cvtColor(img_arr, cv2.COLOR_RGB2HSV).astype(np.float32)
            hsv[:,:,1] = np.clip(hsv[:,:,1] * s_factor, 0, 255)
            hsv[:,:,2] = np.clip(hsv[:,:,2] + v_shift, 0, 255)
            result = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
            if r_shift != 0 or b_shift != 0:
                result[:,:,0] = np.clip(result[:,:,0].astype(np.int16) + r_shift, 0, 255).astype(np.uint8)
                result[:,:,2] = np.clip(result[:,:,2].astype(np.int16) + b_shift, 0, 255).astype(np.uint8)
            return result
        
        tweaks = [
            ("low", "偏低饱和", {"s_factor": 0.7}),
            ("high", "偏高饱和", {"s_factor": 1.3}),
            ("cool", "偏冷调", {"r_shift": -5, "b_shift": 8}),
            ("warm", "偏暖调", {"r_shift": 8, "b_shift": -5}),
        ]
        
        for vkey, vlabel, params in tweaks:
            tweaked = hsv_tweak(standard_arr, **params)
            variant_img = Image.fromarray(tweaked)
            path_out = os.path.join(output_dir, f"{vkey}.jpg")
            variant_img.save(path_out, quality=95)
            result["after_paths"][vkey] = path_out
            result["variants"].append({"key": vkey, "label": vlabel, "path": path_out})

        time.sleep(1)

    after_images = []
    for v in result["variants"]:
        try:
            after_images.append(Image.open(v["path"]))
        except:
            after_images.append(None)

    if after_images:
        compare_path = os.path.join(output_dir, "compare.jpg")
        if len(after_images) <= 2:
            create_comparison(before_pil, after_images[0], compare_path)
        else:
            create_6panel(before_pil, after_images, compare_path, labels=["染前", "理论染后", "偏低饱和", "偏高饱和", "偏冷调", "偏暖调"])
        result["compare_path"] = compare_path

    return result
