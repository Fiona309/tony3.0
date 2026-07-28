import json
from pathlib import Path

from ocrmac import ocrmac
from PIL import Image

ROOT = Path("knowledge-base/products/source-assets")
OUTPUT = ROOT / "ocr-pages.json"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

image_paths = sorted(
    path for path in ROOT.glob("*/*") if path.suffix.lower() in EXTENSIONS
)
pages = []

for index, path in enumerate(image_paths, start=1):
    with Image.open(path) as image:
        results = ocrmac.OCR(
            image,
            framework="vision",
            recognition_level="accurate",
            language_preference=["zh-Hans", "en-US"],
            confidence_threshold=0.0,
            detail=True,
        ).recognize()

        pages.append(
            {
                "path": str(path.relative_to(ROOT)),
                "width": image.width,
                "height": image.height,
                "lines": [
                    {
                        "text": text,
                        "confidence": round(float(confidence), 4),
                        "x": round(float(box[0]), 6),
                        "y": round(float(box[1]), 6),
                        "width": round(float(box[2]), 6),
                        "height": round(float(box[3]), 6),
                    }
                    for text, confidence, box in results
                ],
            }
        )
    print(f"[{index}/{len(image_paths)}] {path}: {len(results)} lines", flush=True)

OUTPUT.write_text(
    json.dumps(pages, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(f"Wrote {len(pages)} pages to {OUTPUT}", flush=True)
