import sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image
from hair_dye_engine import extract_color_from_image, match_to_palette, check_feasibility
from glm_hair_generator import generate_hair_images, create_6panel

def run(target_path, user_path, output_dir="results"):
    target_img = Image.open(target_path).convert("RGB")
    user_img = Image.open(user_path).convert("RGB")

    t_info = extract_color_from_image(target_img, use_hair_segmentation=True)
    best = match_to_palette(t_info["lab"], top_n=1)[0]
    print(f"Target: {best['family_zh']}{best['level']}deg RGB={best['rgb']} HEX={best['hex']}")

    u_info = extract_color_from_image(user_img, use_hair_segmentation=True)
    u_m = match_to_palette(u_info["lab"], top_n=1)[0]
    print(f"User: {u_m['family_zh']}{u_m['level']}deg")

    feasi = check_feasibility(u_info["level"], best["family_zh"], best["level"],
                              f"{best['family_zh']}{best['level']}deg", current_family=u_m["family_zh"])
    print(f"Feasibility: {feasi.recommendation}")

    result = generate_hair_images(
        before_pil=user_img, target_family=best["family_zh"], target_level=best["level"],
        target_rgb=tuple(best["rgb"]), target_hex=best["hex"],
        user_level=u_info["level"], has_risk=feasi.has_risk, output_dir=output_dir,
    )

    for v in result["variants"]:
        print(f"  {v['label']}: {v['path']}")
    print(f"  Compare: {result['compare_path']}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python run_pipeline.py <target_image> <user_image>")
        sys.exit(1)
    run(sys.argv[1], sys.argv[2])
