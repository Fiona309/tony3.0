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

def generate_with_glm(prompt, input_image_b64=None, max_attempts=3):
    """调一次生图。空返回会重试。

    实测该模型 5/5 成功、9-14s 返回，但偶发会回一个没有图片的空响应
    （content 只有一对空的 markdown 围栏）。之前不重试，这种偶发空返回
    直接让整个预览任务落到 fallback，用户看到的就是"生图失败"。
    """
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return _generate_with_glm_once(prompt, input_image_b64)
        except RuntimeError as error:
            last_error = error
            # 只对"没返回图片"重试；HTTP 4xx 这类错误重试也没用。
            if "no_image_response" not in str(error) or attempt == max_attempts:
                raise
            time.sleep(1.5 * attempt)
    if last_error:
        raise last_error
    return None


def _generate_with_glm_once(prompt, input_image_b64=None):
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

def build_recolor_prompt(target_rgb, target_hex, variant="standard", risk_note="", tone_note=""):
    """
    每一档都按【自己的目标色】写提示词，而不是"在标准色基础上几乎看不出区别"。

    原来 low/high 的提示词字面写着"几乎看不出区别"，而且三档传的是同一个
    rgb —— 模型照做了，所以偏浅/偏深在生图里确实看不出任何区分。
    偏色档更糟：risk 传的也是标准色的 rgb，只在末尾附一句"会有偏色效果"，
    模型没有任何色值依据，自然还是照着标准蓝画。

    现在四档各自带官方实测色值（和实时试色同源），提示词只描述那个色本身。
    """
    r, g, b = target_rgb

    prompt = f"""这是一张照片的【局部上色】任务，不是重新生成图片。

请只把头发的颜色改成：rgb({r},{g},{b})，HEX {target_hex}{tone_note}

绝对禁止（违反任何一条都算失败）：
- 禁止改变发型、发长、发量、卷直、刘海和每一缕头发的走向
- 禁止改变脸型、五官、表情、肤色、妆容
- 禁止改变背景，背景必须逐像素保持原样，不要重绘、不要虚化、不要换背景
- 禁止改变构图、裁切、缩放、角度
- 禁止改变画面整体的亮度、对比度、白平衡，不要加任何滤镜

要求：
1. 头发颜色准确达到 rgb({r},{g},{b})，不要自行调淡、调灰或调暖
2. 除头发像素之外，其余每一个像素都和原图完全相同
3. 保留头发原有的纹理、发丝走向、层次感和高光位置
4. 保留原始光照和阴影关系，只替换色相与饱和度

把它当作 Photoshop 里"选中头发选区后替换颜色"，而不是"照着描述重画一张"。"""

    if risk_note:
        prompt += f"\n\n注意：{risk_note}"

    prompt += "\n\n请直接返回编辑后的图片，不要返回任何文字说明。"

    return prompt


# ============================================================
# 四档色值：与实时试色同源
# ============================================================

def _rgb_to_hsv(rgb):
    import colorsys
    return colorsys.rgb_to_hsv(*[c / 255.0 for c in rgb])


def _hsv_to_rgb(h, s, v):
    import colorsys
    return tuple(int(round(max(0, min(255, c * 255)))) for c in colorsys.hsv_to_rgb(h, s, v))


def _hexify(rgb):
    return "#{:02X}{:02X}{:02X}".format(*[int(c) for c in rgb])


def derive_tone_colors(standard_rgb, level_colors=None):
    """四档的目标色。

    实时试色的四档【全部直查官方效果矩阵】：偏浅=高一度、标准=本档、
    偏深=低一度、偏色=低两度（见 hair-mirror-core.toneVariants）。
    生图必须走同一套值，否则两个页面对同一个"标准"给出不同答案。

    level_colors 就是那几档的官方实测 RGB（由 main.py 从矩阵取好传进来）。
    官方缺档时才回退到按 HSV 推算——推算幅度按真实照片标定：
    用户实拍的偏浅/偏深明度比 2.4×，所以 V 用 0.62 / 1.45 而不是原来
    只动饱和度的 0.7 / 1.3（只调饱和度根本产生不了深浅差别）。
    """
    level_colors = level_colors or {}
    h, s, v = _rgb_to_hsv(standard_rgb)

    def pick(key, fallback):
        got = level_colors.get(key)
        return tuple(int(c) for c in got) if got else fallback

    def damp_hue(rgb, limit_deg=26.0):
        """把偏色档拉回来一点，别让它整个变成另一个颜色。

        偏色档多数时候直接取官方矩阵里低两度的实测色（蓝色 6 度 = H164.6），
        相对标准色 H204 整整偏了 40°，出来是一头纯绿——看着像"染了绿色"，
        而不是"蓝色染偏了"。这里把偏移量截断到 limit_deg 以内。
        """
        rh, rs, rv = _rgb_to_hsv(tuple(int(c) for c in rgb))
        diff = ((rh - h) * 360.0 + 540.0) % 360.0 - 180.0
        if abs(diff) <= limit_deg:
            return tuple(int(c) for c in rgb)
        capped = (h + (limit_deg if diff > 0 else -limit_deg) / 360.0) % 1.0
        return _hsv_to_rgb(capped, rs, rv)

    return {
        "standard": tuple(int(c) for c in standard_rgb),
        # 偏浅：更亮、饱和略降（漂得更浅的底色上色后色素更薄）
        #
        # 官方值不能直接用。矩阵里 9 度(V92.5)和 8 度(V86.7)只差 6.7%，
        # 而"淡一点"是从【已经染成标准色的图】派生的，比值只有 1.067，
        # 乘完再整体压暗就跌到标准以下 —— 实测淡一点 V121 反而比标准 V137 暗，
        # 档位顺序整个颠倒。所以这里对官方值也强制拉开：至少比标准亮 28%。
        # 提亮用 screen 而不是乘法：v + (1-v)*k 永远留余量，不会顶到 V100 糊成一片。
        "light": _hsv_to_rgb(h, s * 0.88, min(0.97, max(v + (1 - v) * 0.45, v * 1.28))),
        # 偏深：更暗、饱和略升（底色深，色素叠得更实）
        "deep": pick("deep", _hsv_to_rgb(h, min(1.0, s * 1.08), v * 0.62)),
        # 偏色：底色残留把色相带偏。蓝→绿实测 H207→H165，约 -42°，
        # 但整整 -42° 会直接变成一头纯绿，看着不像"蓝色染偏了"而像"染了绿色"。
        # 收到 -26°：落在蓝绿之间，能看出往绿走，又还认得出是蓝色。
        "risk": damp_hue(pick("risk", _hsv_to_rgb((h - 26.0 / 360.0) % 1.0, s * 0.55, v * 0.55))),
    }


# ============================================================
# 主生图流程
# ============================================================

def _skin_like(arr):
    """粗略的肤色判据（YCrCb 常用阈值）。只用来把脸和手从 mask 里剔掉。"""
    import cv2
    ycrcb = cv2.cvtColor(arr, cv2.COLOR_RGB2YCrCb)
    cr = ycrcb[:, :, 1].astype(np.int16)
    cb = ycrcb[:, :, 2].astype(np.int16)
    return (cr > 133) & (cr < 180) & (cb > 77) & (cb < 128)


def _hair_mask_for(pil_image):
    """头发 mask（0~1 float）。拿不到就返回 None，调用方退回全图调色。

    分割网络会往外溢：发际线糊到额头、墙面上还会有零星误判斑块。
    直接拿去做色相旋转，这些像素会被转成橙色 —— 实测生成图里额头一圈橙边、
    背景墙上几块橙斑，就是这么来的。所以这里必须清理干净再羽化：
    去肤色 → 只留最大的几块连通域 → 先腐蚀再羽化（宁可少染一点，不要溢出）。
    """
    try:
        # 必须两种导入都试。后端是以 backend 为根导入本模块的，那时
        # hair_full_pipeline 不在 sys.path 上，`from segmentation import ...`
        # 会 ModuleNotFoundError → 这里返回 None → _recolor_to 退化成【整图】调色，
        # 于是每一档的脸和背景都被染成不同颜色，看起来就像加了不同的滤镜。
        # 用 segmentation.py 里的模块级单例，不要 SegmentationService()。
        # 分割后端（mediapipe / onnxruntime）缓存在实例上，每次新建实例等于
        # 每张图都重新加载一遍模型再扔掉。本机感觉不明显，2 核服务器上开销可观。
        # hair_dye_engine 也是复用单例的写法。
        try:
            from segmentation import segmentation_service
        except ModuleNotFoundError:
            import sys as _sys
            _pkg = os.path.dirname(os.path.abspath(__file__))
            if _pkg not in _sys.path:
                _sys.path.insert(0, _pkg)
            from segmentation import segmentation_service
        import cv2
        mask, _conf = segmentation_service.segment_hair(pil_image)
        arr = np.array(pil_image.convert("RGB"))
        binary = (mask > 127).astype(np.uint8)

        # 1) 剔除肤色像素——但只剔【又亮又明确是肤色】的。
        #    单纯用 YCrCb 阈值会把暖光下的黑发也判成皮肤：实测黑发照片里
        #    46.7% 的头发像素落在肤色区间，砍完 mask 从 18.5% 掉到 8.2%，
        #    头发被削成一顶"泳帽"、碎发全留黑。所以加一道亮度门槛：
        #    头发（哪怕棕色）明显比脸暗，V 高的才可能真是皮肤。
        hsv_v = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)[:, :, 2]
        skin = _skin_like(arr) & (hsv_v > 140)
        binary[skin] = 0

        # 2) 形态学开运算去掉背景上的孤立小斑（核放小，别吃掉碎发）
        k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, k3)

        # 3) 丢掉明显是误判的碎片，但阈值要松——发梢本来就是细小连通域
        n, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
        if n > 1:
            areas = stats[1:, cv2.CC_STAT_AREA]
            keep = np.zeros_like(binary)
            biggest = areas.max()
            for i, a in enumerate(areas, start=1):
                if a >= max(biggest * 0.01, 80):
                    keep[labels == i] = 1
            binary = keep

        if binary.sum() < 50:
            return None

        # 4) 只羽化，不腐蚀。腐蚀会连发丝一起削掉；边缘溢出交给羽化的软过渡处理。
        m = binary.astype(np.float32)
        k = max(3, (min(pil_image.size) // 200) * 2 + 1)
        return cv2.GaussianBlur(m, (k, k), 0)
    except Exception:
        return None


# _keep_identity 已删除。
#
# 它做的是"只保留模型画的头发、其余回贴原图"。加它是因为旧提示词下模型
# 会重画整张图。提示词改写后（明确禁止改发型/脸/背景/滤镜），实测模型
# 本身就已经守住了这些，回贴反而成了纯粹的副作用来源：
#   - 抠图边缘把发丝削平 → 头发像一顶"泳帽"，碎发留黑
#   - 原图与生成图的发型轮廓不同 → 边缘出现橙色描边
# 现在按"提示词负责画、代码只做模型做不到的事"分工，这一步不再需要。


def _soft_clip(a, knee=0.82):
    """把 [0,1] 之外的部分平滑压回来，中间段保持斜率 1。

    直接 clip 会把所有过曝像素并到同一个值（高光糊成一片）；
    tanh 肩部让它们仍然保持先后次序，头发的高光才有层次。
    """
    out = np.where(a > knee, knee + (1.0 - knee) * np.tanh((a - knee) / (1.0 - knee)), a)
    return np.where(out < -0.0, 0.0, np.clip(out, 0.0, 1.0))


def _fit_curve(x_sel, want01):
    """求一条把 x_sel 均值搬到 want01 的曲线，且【尽量不损失局部对比】。

    这一步的存在理由：生图模型给的饱和度只有目标的三分之一（实测 S30 vs 目标 S87），
    必须由本地补上。难点在于"补"的方式：

      × 乘系数再 clip —— 要把 V46 拉到 V87 得乘 1.9 倍，每根受光发丝都撞上 255
        并成同一个值，高光糊成一片，头发像一顶塑料泳帽。
      × screen / gamma 曲线 —— 不撞顶了，但它们本质是压缩：实测 V 的标准差
        从 38.7 掉到 24.1，发丝之间的明暗差被磨平，看着还是一块死板的色块。
      √ 平移 —— f(a) = a + d，导数恒为 1，像素之间的差值【原封不动】保留，
        发丝纹理和高光位置完全不变，只是整体提亮/加饱和。溢出部分交给
        tanh 肩部软着陆，而不是一刀切。

    d 用二分法求，让均值正好落在目标上。
    """
    cur = float(x_sel.mean())
    if cur <= 1e-4 or want01 <= 1e-4 or abs(cur - want01) < 0.004:
        return None
    lo, hi = -1.5, 1.5
    for _ in range(40):
        mid = (lo + hi) / 2.0
        if float(_soft_clip(x_sel + mid).mean()) > want01:
            hi = mid
        else:
            lo = mid
    d = (lo + hi) / 2.0
    return lambda a: _soft_clip(a + d)


def _recolor_to(std_arr, std_rgb, dst_rgb, mask):
    """把已经是 std_rgb 的头发，本地改成 dst_rgb。

    只调头发，且【按色相亲和度加权】。原来是把 mask 内所有像素统一旋转色相、
    统一乘饱和度系数——mask 羽化边上那圈像素其实是头发和皮肤的混合（色相 ~20° 的
    肉色、饱和度 ~30），被同一个 3 倍系数一放大就成了 S90 的鲜橙色，
    发际线和耳边那一圈橙边就是这么来的。

    现在每个像素的改动量 = mask 透明度 × 色相亲和度：色相离模型画出来的发色越远
    （典型就是肤色），改得越少，肉色像素基本原样保留。色相也改成【直接设成目标色相】
    而不是整体旋转，这样即使有漏网的非头发像素，也只会偏向发色，不会甩到橙色去。
    """
    import cv2
    sh, _ss, _sv = _rgb_to_hsv(std_rgb)
    dh, ds, dv = _rgb_to_hsv(dst_rgb)

    hsv = cv2.cvtColor(std_arr, cv2.COLOR_RGB2HSV).astype(np.float32)
    hue, sat, val = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]

    alpha = np.ones(hue.shape, np.float32) if mask is None else mask.astype(np.float32)

    # 色相亲和度：和模型画出来的发色相差 30° 以内算满，70° 以外算 0。
    # OpenCV 的 H 是 0~179（半度），所以阈值也要减半。
    dist = np.abs(hue - sh * 180.0)
    dist = np.minimum(dist, 180.0 - dist)
    aff = np.clip(1.0 - (dist - 15.0) / 20.0, 0.0, 1.0)
    # 暗部和灰部的色相本来就没有意义（黑发的阴影、发丝间的缝隙），
    # 不能因为"色相对不上"就把它们排除在外，否则头发会留下一块块没染到的黑斑。
    aff = np.maximum(aff, ((val < 70) & (sat < 90)).astype(np.float32))

    w = alpha * aff
    # 统计基准只取【确定是头发】的核心像素：边缘混合像素会压低均值，
    # 让系数被推得过大。
    sel = w > 0.85
    if sel.sum() < 50:
        sel = w > 0.5
    if sel.sum() < 50:
        sel = np.ones(hue.shape, bool)

    a = w[:, :, None]

    def render(want_s, want_v):
        out = hsv.copy()
        out[:, :, 0] = dh * 180.0
        for ch, want in ((1, want_s), (2, want_v)):
            curve = _fit_curve(hsv[:, :, ch][sel] / 255.0, want)
            if curve is not None:
                out[:, :, ch] = np.clip(curve(hsv[:, :, ch] / 255.0) * 255.0, 0, 255)
        rgb = cv2.cvtColor(out.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32)
        return (std_arr.astype(np.float32) * (1 - a) + rgb * a).astype(np.uint8)

    # 曲线是逐像素在 S/V 通道上拟合的，但"这头发是什么颜色"看的是【平均 RGB】。
    # 两者不是一回事：一堆色相略有差异的像素平均成 RGB 后会互相抵消掉一部分饱和度，
    # 实测差 16 个点（通道均值 S87 → 平均 RGB 只有 S71）。之前按通道均值收敛，
    # 所以数字看着达标、眼睛看着还是不够蓝。这里改成量平均 RGB，
    # 也就是和官方色卡、实时试色完全同一个口径。
    # 明度不能直接照搬色卡。官方 9 度实测 V86.7 说的是【色卡上那块颜料】的明度，
    # 不是"照片里的头发该有多亮"——照片里有阴影、有背光、有发丝间的缝隙，
    # 整片头发的均值必然低于色卡。之前把整头头发抬到 V220（原图 V120），
    # 等于糊了一层均匀的荧光漆，发丝明暗差被 tanh 肩部挤扁（动态范围 103→35），
    # 就是"淡一点"和"标准"那两张显假的原因。
    #
    # 所以：色相和饱和度严格对齐官方值（那是"染成什么颜色"），
    # 明度只跟着官方值【按比例走一部分】，并限制相对原图的提亮幅度，
    # 把照片本身的光影关系留住。
    cur_v = float(cv2.cvtColor(std_arr, cv2.COLOR_RGB2HSV)[:, :, 2][sel].mean()) / 255.0
    _, _, src_v = _rgb_to_hsv(std_rgb)
    # 目标明度相对基准色的变化，按同样的倍数作用到照片实际明度上
    ratio = (dv / src_v) if src_v > 1e-3 else 1.0
    # 档位之间的差距要放大，不能只跟着色卡走：官方 9 度(V87)和 8 度(V71)
    # 只差 1.2 倍，照搬到照片上"淡一点"和"标准"只差 12 点 V，肉眼分不出。
    #
    # 但提亮和压暗不能用同一个放大系数。照片头发均值已经被抬到 V208，
    # 再往上提空间只剩 47 点，放大只会撞进 tanh 压缩区把层次挤没（实测
    # 动态范围掉到 48）；往下压则有 200 点空间，放大很安全。
    # 所以：压暗放开手脚，提亮温和，靠"把深的压得更深"拉开档位差。
    ratio = 1.0 + (ratio - 1.0) * (2.0 if ratio < 1.0 else 1.25)
    dv = float(np.clip(cur_v * ratio, 0.12, 0.95))
    # 提亮上限 1.6 倍。设 1.35 时"淡一点"会被这里截断到和标准一样，
    # 再乘全局压暗系数就反而比标准更暗，档位顺序颠倒。
    dv = float(min(dv, cur_v * 1.6 + 0.02))
    # 整体压暗一档。色卡明度是颜料在白纸上的读数，照片里的头发本来就该更沉；
    # 不压的话标准档到 V208，蓝得发白、像打了荧光漆。
    #
    # 只在【标准档】压。标准档是拿模型原图(src_v≈0.46)去够色卡(0.87)，
    # ratio 接近 1.9，压掉两成没问题；而派生档是拿【已经染好的标准图】
    # 再往上推，"淡一点"的 ratio 只有 1.12，同样乘 0.82 会把这点提亮
    # 吃成净压暗（实测 dv 0.593 < 当前 0.630），淡一点反而比标准还暗。
    if ratio > 1.5:
        dv = float(np.clip(dv * 0.82, 0.16, 0.85))
    # 下限统一兜一次。偏色档的 ratio 小于 1.5，走不到上面那个分支，
    # 之前会一路掉到 V12 —— 一头近乎全黑的头发，看不出是"偏绿"。
    dv = float(max(dv, 0.20))

    want_h, want_s, _ = _rgb_to_hsv(dst_rgb)
    result = render(ds, dv)
    for _ in range(4):
        got = cv2.cvtColor(result, cv2.COLOR_RGB2HSV).astype(np.float32)
        gs_ = float(got[:, :, 1][sel].mean()) / 255.0
        gv_ = float(got[:, :, 2][sel].mean()) / 255.0
        if abs(gs_ - ds) < 0.01 and abs(gv_ - dv) < 0.01:
            break
        ds = float(np.clip(ds + (ds - gs_), 0.0, 1.0))
        dv = float(np.clip(dv + (dv - gv_), 0.0, 0.92))
        result = render(ds, dv)
    return result


def generate_hair_images(
    before_pil,
    target_family,
    target_level,
    target_rgb,
    target_hex,
    user_level,
    has_risk,
    output_dir,
    level_colors=None,
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

    tones = derive_tone_colors(target_rgb, level_colors)

    # Step 1: 只请求一次 API —— 标准档。其余三档从这张图本地推。
    standard_prompt = build_recolor_prompt(target_rgb, target_hex, "standard")
    standard_img = generate_with_glm(standard_prompt, before_b64)
    if standard_img is None:
        raise RuntimeError("openrouter_standard_image_missing")

    # 模型画的整张图直接用：发型、脸、背景都由提示词约束，代码不再回贴。
    standard_arr = np.array(standard_img.convert("RGB"))
    mask = _hair_mask_for(standard_img)

    # 模型返回的发色不能直接信。实测：要求 rgb(34,115,182)（H207 S81 V71），
    # 它回的是 rgb(53,67,75)（H202 S29 V29）—— 和原图几乎一样，等于没染。
    # 用户说"标准这一栏不够蓝、和实时试色对不上"，就是这么来的。
    # 所以标准档也要过一遍本地校色，和另外三档同一条路：模型负责发丝纹理与光照，
    # 色值一律由官方矩阵说了算。这样四档天然自洽，也天然和试色屏一致。
    if mask is not None and (mask > 0.5).sum() > 50:
        model_std = tuple(int(c) for c in standard_arr[mask > 0.5].mean(axis=0))
        standard_arr = _recolor_to(standard_arr, model_std, tuple(target_rgb), mask)
    standard_img = Image.fromarray(standard_arr)

    # 后面三档按【标准图实际发色】的比例推。校色后它就等于 target_rgb 了。
    actual_std = tuple(target_rgb)

    standard_path = os.path.join(output_dir, "standard.jpg")
    standard_img.save(standard_path, quality=95)
    result["after_paths"]["standard"] = standard_path
    result["variants"].append({
        "key": "standard", "label": "标准色", "path": standard_path, "rgb": list(target_rgb),
    })

    derived = [
        ("low", "偏浅", tones["light"]),
        ("high", "偏深", tones["deep"]),
    ]
    if has_risk:
        derived.append(("risk", f"偏色（{user_level}度底色残留）", tones["risk"]))
    else:
        # 知识库没判 biased 时不伪造风险结论，但仍要给第四格一个真实的档位。
        derived.append(("warm", "偏色", tones["risk"]))

    for vkey, vlabel, dst in derived:
        arr = _recolor_to(standard_arr, actual_std, dst, mask)
        path_out = os.path.join(output_dir, f"{vkey}.jpg")
        Image.fromarray(arr).save(path_out, quality=95)
        result["after_paths"][vkey] = path_out
        result["variants"].append({"key": vkey, "label": vlabel, "path": path_out, "rgb": list(dst)})

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
            # 标签跟着实际档位走，不能写死——档位已经从"饱和度微调"改成了真实的深浅/偏色
            create_6panel(before_pil, after_images, compare_path,
                          labels=["染前"] + [v["label"] for v in result["variants"]])
        result["compare_path"] = compare_path

    return result
