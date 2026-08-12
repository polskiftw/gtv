#!/usr/bin/env python3
"""Deterministically render gnews's static icon and four channel tiles."""

from __future__ import annotations

import argparse
import hashlib
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


FONT_SHA256 = "19f8cd90ce76992c565debe80d167f58e6e1e79a6e0b86f24bd9dce12052b256"
TILE_SIZE = (1600, 870)
ICON_SIZE = (400, 400)


def verify_font(path: Path) -> None:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != FONT_SHA256:
        raise SystemExit(f"unexpected Pricedown Black font hash: {digest}")


def gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        amount = y / max(1, height - 1)
        color = tuple(round(a + (b - a) * amount) for a, b in zip(top, bottom))
        draw.line((0, y, width, y), fill=color)
    return image


def centered_text(
    image: Image.Image,
    text: str,
    font_path: Path,
    fill: tuple[int, int, int],
    stroke: tuple[int, int, int],
    shadow: tuple[int, int, int],
    max_width: int,
    max_height: int,
) -> None:
    draw = ImageDraw.Draw(image)
    size = max_height
    while size > 20:
        font = ImageFont.truetype(str(font_path), size=size)
        box = draw.textbbox((0, 0), text, font=font, stroke_width=max(2, size // 38))
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            break
        size -= 2
    stroke_width = max(3, size // 34)
    box = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    x = (image.width - (box[2] - box[0])) // 2 - box[0]
    y = (image.height - (box[3] - box[1])) // 2 - box[1]
    shadow_offset = max(8, size // 20)
    draw.text(
        (x + shadow_offset, y + shadow_offset),
        text,
        font=font,
        fill=shadow,
        stroke_width=stroke_width + 3,
        stroke_fill=shadow,
    )
    draw.text(
        (x, y),
        text,
        font=font,
        fill=fill,
        stroke_width=stroke_width,
        stroke_fill=stroke,
    )


def add_frame(image: Image.Image, accent: tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((18, 18, image.width - 19, image.height - 19), radius=42, outline=(12, 12, 14), width=20)
    draw.rounded_rectangle((31, 31, image.width - 32, image.height - 32), radius=32, outline=accent, width=7)
    draw.line((70, image.height - 62, image.width - 70, image.height - 62), fill=(255, 255, 255, 80), width=3)


def render_abc(font_path: Path) -> Image.Image:
    image = gradient(TILE_SIZE, (55, 39, 12), (12, 11, 12))
    draw = ImageDraw.Draw(image, "RGBA")
    center = (800, 435)
    for angle in range(0, 360, 18):
        radians = math.radians(angle)
        outer = (center[0] + math.cos(radians) * 1100, center[1] + math.sin(radians) * 900)
        half = math.radians(angle + 6)
        outer2 = (center[0] + math.cos(half) * 1100, center[1] + math.sin(half) * 900)
        draw.polygon((center, outer, outer2), fill=(236, 158, 30, 22))
    for radius, alpha in ((360, 22), (270, 24), (190, 28)):
        draw.ellipse((800 - radius, 435 - radius, 800 + radius, 435 + radius), outline=(255, 188, 52, alpha), width=10)
    add_frame(image, (224, 154, 35))
    centered_text(image, "ABC", font_path, (255, 205, 91), (36, 21, 6), (7, 5, 4), 1250, 520)
    return image


def render_cbs(font_path: Path) -> Image.Image:
    image = gradient(TILE_SIZE, (23, 100, 196), (7, 35, 91))
    draw = ImageDraw.Draw(image, "RGBA")
    for x in range(-900, 1900, 160):
        draw.polygon(((x, 0), (x + 105, 0), (x + 900, 870), (x + 795, 870)), fill=(118, 199, 255, 22))
    for y in (185, 685):
        draw.line((75, y, 1525, y), fill=(190, 232, 255, 45), width=5)
    add_frame(image, (81, 180, 255))
    centered_text(image, "CBS", font_path, (236, 248, 255), (5, 35, 83), (2, 13, 35), 1250, 520)
    return image


def render_nbc(font_path: Path) -> Image.Image:
    image = gradient(TILE_SIZE, (28, 34, 64), (10, 12, 29))
    draw = ImageDraw.Draw(image, "RGBA")
    colors = ((237, 70, 74), (247, 151, 40), (246, 207, 68), (69, 177, 131), (52, 139, 215), (118, 83, 181))
    band_width = math.ceil(TILE_SIZE[0] / len(colors))
    for index, color in enumerate(colors):
        left = index * band_width
        draw.polygon(((left - 140, 0), (left + band_width + 80, 0), (left + band_width - 80, 870), (left - 300, 870)), fill=(*color, 105))
    draw.rounded_rectangle((130, 115, 1470, 755), radius=88, fill=(8, 11, 24, 88), outline=(255, 255, 255, 45), width=6)
    add_frame(image, (224, 231, 255))
    centered_text(image, "NBC", font_path, (246, 245, 238), (21, 23, 45), (5, 6, 12), 1250, 520)
    return image


def render_roar(font_path: Path) -> Image.Image:
    image = gradient(TILE_SIZE, (206, 54, 24), (93, 14, 17))
    draw = ImageDraw.Draw(image, "RGBA")
    center = (800, 435)
    for index in range(28):
        angle = math.radians(index * (360 / 28))
        spread = math.radians(5.2)
        length = 1150 if index % 2 == 0 else 850
        p1 = (center[0] + math.cos(angle - spread) * 105, center[1] + math.sin(angle - spread) * 75)
        p2 = (center[0] + math.cos(angle) * length, center[1] + math.sin(angle) * length)
        p3 = (center[0] + math.cos(angle + spread) * 105, center[1] + math.sin(angle + spread) * 75)
        draw.polygon((p1, p2, p3), fill=(255, 179, 35, 35 if index % 2 == 0 else 20))
    draw.ellipse((520, 155, 1080, 715), fill=(91, 9, 13, 45), outline=(255, 202, 69, 45), width=9)
    add_frame(image, (255, 156, 34))
    centered_text(image, "ROAR", font_path, (255, 196, 60), (72, 9, 12), (28, 3, 5), 1340, 490)
    return image


def render_icon(font_path: Path) -> Image.Image:
    scale = 3
    large = gradient((ICON_SIZE[0] * scale, ICON_SIZE[1] * scale), (35, 38, 46), (7, 8, 12))
    draw = ImageDraw.Draw(large, "RGBA")
    for y in range(40, large.height, 65):
        draw.line((40, y, large.width - 40, y - 16), fill=(255, 255, 255, 10), width=5)
    draw.rounded_rectangle((28, 28, large.width - 29, large.height - 29), radius=118, outline=(0, 0, 0, 235), width=34)
    draw.rounded_rectangle((55, 55, large.width - 56, large.height - 56), radius=92, outline=(184, 191, 205, 120), width=9)
    centered_text(large, "gnews", font_path, (239, 237, 226), (3, 4, 7), (0, 0, 0), 1050, 500)
    return large.resize(ICON_SIZE, Image.Resampling.LANCZOS)


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, "PNG", optimize=True, compress_level=9)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    verify_font(args.font)
    save(render_icon(args.font), args.output / "icon.png")
    save(render_abc(args.font), args.output / "abc.png")
    save(render_cbs(args.font), args.output / "cbs.png")
    save(render_nbc(args.font), args.output / "nbc.png")
    save(render_roar(args.font), args.output / "roar.png")
    print(args.output)


if __name__ == "__main__":
    main()
