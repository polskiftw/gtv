#!/usr/bin/env python3
"""Perceptually optimized, locally adaptive neon ``g`` icon branding."""

from __future__ import annotations

import hashlib
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FONT = Path(os.environ.get("GTV_PRICEDOWN_FONT", ROOT / ".cache" / "Pricedown Bl.otf"))
GLYPH_TYPEFACE = "Pricedown Black"
PRICEDOWN_FONT_SHA256 = "19f8cd90ce76992c565debe80d167f58e6e1e79a6e0b86f24bd9dce12052b256"
SUPPORTED_PLACEMENTS = {"top-left", "top-right", "bottom-left", "bottom-right"}


@dataclass(frozen=True)
class BadgeConfig:
    placement: str = "bottom-right"
    scale: float = 0.30
    padding: float = 0.05
    work_scale: int = 4

    @classmethod
    def from_metadata(cls, branding: dict[str, Any]) -> "BadgeConfig":
        style = branding.get("style", "dynamic-g-neon")
        if style != "dynamic-g-neon":
            raise ValueError(f"unsupported branding style: {style}")
        placement = branding.get("placement", "bottom-right")
        if placement not in SUPPORTED_PLACEMENTS:
            raise ValueError(f"unsupported badge placement: {placement}")
        scale = float(branding.get("scale", 0.30))
        padding = float(branding.get("padding", 0.05))
        if not 0.18 <= scale <= 0.55:
            raise ValueError("branding.scale must be between 0.18 and 0.55")
        if not 0.0 <= padding <= 0.20:
            raise ValueError("branding.padding must be between 0.0 and 0.20")
        return cls(placement=placement, scale=scale, padding=padding)


def _srgb_to_linear(rgb: np.ndarray) -> np.ndarray:
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(rgb: np.ndarray) -> np.ndarray:
    rgb = np.clip(rgb, 0.0, None)
    return np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * rgb ** (1.0 / 2.4) - 0.055)


def _linear_rgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    l = 0.4122214708 * rgb[..., 0] + 0.5363325363 * rgb[..., 1] + 0.0514459929 * rgb[..., 2]
    m = 0.2119034982 * rgb[..., 0] + 0.6806995451 * rgb[..., 1] + 0.1073969566 * rgb[..., 2]
    s = 0.0883024619 * rgb[..., 0] + 0.2817188376 * rgb[..., 1] + 0.6299787005 * rgb[..., 2]
    l_, m_, s_ = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    return np.stack(
        (
            0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
        ),
        axis=-1,
    )


def _oklab_to_linear_rgb(lab: np.ndarray) -> np.ndarray:
    l_ = lab[..., 0] + 0.3963377774 * lab[..., 1] + 0.2158037573 * lab[..., 2]
    m_ = lab[..., 0] - 0.1055613458 * lab[..., 1] - 0.0638541728 * lab[..., 2]
    s_ = lab[..., 0] - 0.0894841775 * lab[..., 1] - 1.2914855480 * lab[..., 2]
    l, m, s = l_**3, m_**3, s_**3
    return np.stack(
        (
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
        ),
        axis=-1,
    )


def _srgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    return _linear_rgb_to_oklab(_srgb_to_linear(rgb))


def _gamut_map_oklab(lab: np.ndarray) -> np.ndarray:
    """Map OKLab colors to sRGB by retaining hue/lightness and reducing chroma."""
    mapped = np.asarray(lab, dtype=np.float32).copy()
    mapped[..., 0] = np.clip(mapped[..., 0], 0.0, 1.0)
    original_ab = mapped[..., 1:3].copy()
    low = np.zeros(mapped.shape[:-1], dtype=np.float32)
    high = np.ones(mapped.shape[:-1], dtype=np.float32)
    for _ in range(10):
        amount = (low + high) * 0.5
        trial = mapped.copy()
        trial[..., 1:3] = original_ab * amount[..., None]
        linear = _oklab_to_linear_rgb(trial)
        valid = np.all((linear >= 0.0) & (linear <= 1.0), axis=-1)
        low = np.where(valid, amount, low)
        high = np.where(valid, high, amount)
    mapped[..., 1:3] = original_ab * low[..., None]
    return np.clip(_linear_to_srgb(_oklab_to_linear_rgb(mapped)), 0.0, 1.0)


def _blur(values: np.ndarray, radius: float) -> np.ndarray:
    if radius <= 0.01:
        return values.astype(np.float32, copy=True)
    if values.ndim == 2:
        minimum = float(np.min(values))
        maximum = float(np.max(values))
        if maximum - minimum < 1.0e-8:
            return np.full_like(values, minimum, dtype=np.float32)
        normalized = (values - minimum) / (maximum - minimum)
        image = Image.fromarray(np.uint8(np.clip(normalized, 0.0, 1.0) * 255.0))
        blurred = np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0
        return blurred * (maximum - minimum) + minimum
    channels = [_blur(values[..., channel], radius) for channel in range(values.shape[-1])]
    return np.stack(channels, axis=-1)


def _resize_field(values: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    channels = []
    for channel in range(values.shape[-1]):
        image = Image.fromarray(values[..., channel].astype(np.float32))
        channels.append(np.asarray(image.resize(size, Image.Resampling.BICUBIC), dtype=np.float32))
    return np.stack(channels, axis=-1)


def _make_pricedown_font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if not path.is_file():
        raise FileNotFoundError(f"badge font not found: {path}")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != PRICEDOWN_FONT_SHA256:
        raise RuntimeError(f"unexpected Pricedown font hash: {digest}")
    try:
        font = ImageFont.truetype(str(path), size=size)
    except OSError as error:
        raise ValueError(f"invalid badge font: {path}") from error
    family, style = font.getname()
    if (family, style) != ("Pricedown", "Black"):
        raise RuntimeError(f"unexpected badge font identity: {family} {style}")
    return font


def _glyph_mask(size: tuple[int, int], config: BadgeConfig, font_path: Path) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    width, height = size
    target = max(24, int(min(width, height) * config.scale))
    probe = _make_pricedown_font(font_path, target)
    probe_box = probe.getbbox("g")
    probe_extent = max(probe_box[2] - probe_box[0], probe_box[3] - probe_box[1])
    font_size = max(12, int(target * target / max(1, probe_extent)))
    font = _make_pricedown_font(font_path, font_size)
    box = font.getbbox("g")
    glyph_width, glyph_height = box[2] - box[0], box[3] - box[1]
    padding = int(min(width, height) * config.padding)

    if config.placement.endswith("right"):
        x = width - padding - glyph_width
    else:
        x = padding
    if config.placement.startswith("bottom"):
        y = height - padding - glyph_height
    else:
        y = padding
    x = max(0, min(width - glyph_width, x))
    y = max(0, min(height - glyph_height, y))

    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    stroke = max(1, int(target * 0.018))
    draw.text((x - box[0], y - box[1]), "g", font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    array = np.asarray(mask, dtype=np.float32) / 255.0
    occupied = np.argwhere(array > 0.001)
    if occupied.size == 0:
        raise RuntimeError("font renderer produced an empty lowercase g")
    y0, x0 = occupied.min(axis=0)
    y1, x1 = occupied.max(axis=0) + 1
    return array, (int(x0), int(y0), int(x1), int(y1))


def _candidate_colors() -> tuple[np.ndarray, np.ndarray, int]:
    lightness = np.linspace(0.36, 0.94, 24, dtype=np.float32)
    chroma = np.linspace(0.10, 0.34, 14, dtype=np.float32)
    hue = np.linspace(0.0, 2.0 * math.pi, 180, endpoint=False, dtype=np.float32)
    ll, cc, hh = np.meshgrid(lightness, chroma, hue, indexing="ij")
    lab = np.stack((ll, cc * np.cos(hh), cc * np.sin(hh)), axis=-1).reshape(-1, 3)
    linear = _oklab_to_linear_rgb(lab)
    valid = np.all((linear >= 0.0) & (linear <= 1.0), axis=-1)
    return lab[valid], hh.reshape(-1)[valid], int(lab.shape[0])


def _score_candidates(candidates: np.ndarray, hues: np.ndarray, background: np.ndarray, variance: float) -> np.ndarray:
    bg_l = float(background[0])
    bg_hue = math.atan2(float(background[2]), float(background[1]))
    bg_chroma = math.hypot(float(background[1]), float(background[2]))
    distance = np.linalg.norm(candidates - background, axis=1)
    contrast = np.abs(candidates[:, 0] - bg_l)
    local_sigma = min(0.25, math.sqrt(max(0.0, variance)))
    robust_contrast = np.minimum(
        np.abs(candidates[:, 0] - np.clip(bg_l - local_sigma, 0.0, 1.0)),
        np.abs(candidates[:, 0] - np.clip(bg_l + local_sigma, 0.0, 1.0)),
    )
    hue_separation = 0.5 * (1.0 - np.cos(hues - bg_hue)) if bg_chroma > 0.02 else 0.5
    candidate_chroma = np.linalg.norm(candidates[:, 1:3], axis=1)
    target_l = 0.88 if bg_l < 0.56 else 0.42
    return (
        2.9 * contrast
        + (1.7 + 2.2 * local_sigma) * robust_contrast
        + 2.2 * distance
        + 0.62 * hue_separation
        + 0.48 * candidate_chroma
        - 0.72 * np.abs(candidates[:, 0] - target_l)
    )


def _refine_color(color: np.ndarray, background: np.ndarray, variance: float) -> np.ndarray:
    current = color.astype(np.float32, copy=True)
    steps = [(0.035, 0.030, math.radians(8.0)), (0.015, 0.014, math.radians(3.0)), (0.006, 0.006, math.radians(1.2))]
    for step_l, step_c, step_h in steps:
        base_c = math.hypot(float(current[1]), float(current[2]))
        base_h = math.atan2(float(current[2]), float(current[1]))
        trials = []
        for dl in (-step_l, 0.0, step_l):
            for dc in (-step_c, 0.0, step_c):
                for dh in (-step_h, 0.0, step_h):
                    l = float(np.clip(current[0] + dl, 0.30, 0.97))
                    c = float(np.clip(base_c + dc, 0.08, 0.38))
                    h = base_h + dh
                    trials.append((l, c * math.cos(h), c * math.sin(h)))
        trial_array = np.asarray(trials, dtype=np.float32)
        linear = _oklab_to_linear_rgb(trial_array)
        valid = np.all((linear >= 0.0) & (linear <= 1.0), axis=-1)
        trial_hues = np.arctan2(trial_array[:, 2], trial_array[:, 1])
        scores = _score_candidates(trial_array, trial_hues, background, variance)
        scores = np.where(valid, scores, -1.0e9)
        current = trial_array[int(np.argmax(scores))]
    return current


def _regularize_field(initial: np.ndarray, background: np.ndarray, variance: np.ndarray) -> np.ndarray:
    field = initial.copy()
    for _ in range(24):
        weighted = np.zeros_like(field)
        weight_sum = np.zeros(field.shape[:2], dtype=np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            shifted_field = np.roll(field, (dy, dx), axis=(0, 1))
            shifted_background = np.roll(background, (dy, dx), axis=(0, 1))
            delta = np.linalg.norm(background - shifted_background, axis=-1)
            weight = np.exp(-(delta**2) / 0.018).astype(np.float32)
            if dy == -1:
                weight[-1, :] = 0.0
            elif dy == 1:
                weight[0, :] = 0.0
            elif dx == -1:
                weight[:, -1] = 0.0
            else:
                weight[:, 0] = 0.0
            weighted += shifted_field * weight[..., None]
            weight_sum += weight
        neighbor = weighted / np.maximum(weight_sum[..., None], 1.0e-6)
        data_weight = 2.4 + 8.0 * np.sqrt(np.clip(variance, 0.0, 0.25))
        smooth_weight = 3.1
        field = (data_weight[..., None] * initial + smooth_weight * neighbor) / (data_weight[..., None] + smooth_weight)
    return field


def _local_background(source_rgba: np.ndarray, radius: float) -> tuple[np.ndarray, np.ndarray]:
    alpha = source_rgba[..., 3]
    premultiplied = source_rgba[..., :3] * alpha[..., None]
    blurred_alpha = _blur(alpha, radius)
    blurred_rgb = _blur(premultiplied, radius)
    fallback = np.full_like(blurred_rgb, 0.08)
    rgb = np.where(blurred_alpha[..., None] > 0.01, blurred_rgb / np.maximum(blurred_alpha[..., None], 0.01), fallback)
    lab = _srgb_to_oklab(np.clip(rgb, 0.0, 1.0))
    l_blur = _blur(lab[..., 0], max(1.0, radius * 0.72))
    l2_blur = _blur(lab[..., 0] ** 2, max(1.0, radius * 0.72))
    variance = np.clip(l2_blur - l_blur**2, 0.0, 0.25)
    return lab, variance


def _optimized_color_field(
    local_lab: np.ndarray,
    local_variance: np.ndarray,
    bbox: tuple[int, int, int, int],
    target: int,
) -> tuple[np.ndarray, dict[str, Any]]:
    x0, y0, x1, y1 = bbox
    crop_lab = local_lab[y0:y1, x0:x1]
    crop_variance = local_variance[y0:y1, x0:x1]
    grid_width = max(16, min(30, int((x1 - x0) / max(1.0, target / 24.0))))
    grid_height = max(16, min(30, int((y1 - y0) / max(1.0, target / 24.0))))
    background_grid = _resize_field(crop_lab, (grid_width, grid_height))
    variance_grid = np.asarray(
        Image.fromarray(crop_variance.astype(np.float32)).resize((grid_width, grid_height), Image.Resampling.BILINEAR),
        dtype=np.float32,
    )
    candidates, hues, candidate_count = _candidate_colors()
    initial = np.empty_like(background_grid)
    for row in range(grid_height):
        for column in range(grid_width):
            background = background_grid[row, column]
            variance = float(variance_grid[row, column])
            scores = _score_candidates(candidates, hues, background, variance)
            initial[row, column] = _refine_color(candidates[int(np.argmax(scores))], background, variance)

    regularized = _regularize_field(initial, background_grid, variance_grid)
    field = _resize_field(regularized, (x1 - x0, y1 - y0))

    # Every rendered badge pixel also receives a smaller per-pixel correction from
    # the exact alpha-aware neighborhood underneath it. A normalized blur keeps
    # that local response coherent instead of producing multicolored speckle.
    bg = crop_lab
    bg_chroma = np.linalg.norm(bg[..., 1:3], axis=-1)
    optimized_chroma = np.linalg.norm(field[..., 1:3], axis=-1)
    fallback_direction = field[..., 1:3] / np.maximum(optimized_chroma[..., None], 1.0e-5)
    complement = -bg[..., 1:3] / np.maximum(bg_chroma[..., None], 1.0e-5)
    direction = np.where((bg_chroma > 0.025)[..., None], complement, fallback_direction)
    desired = np.empty_like(field)
    desired[..., 0] = np.where(bg[..., 0] < 0.56, 0.88, 0.42)
    desired[..., 1:3] = direction * (0.20 + 0.08 * np.clip(bg_chroma / 0.20, 0.0, 1.0))[..., None]
    field = 0.72 * field + 0.28 * desired
    smoothing_radius = max(1.2, target * 0.018)
    field = _blur(np.clip(field, -0.5, 1.0), smoothing_radius)
    diagnostics = {
        "continuous_candidates": candidate_count,
        "in_gamut_candidates": int(candidates.shape[0]),
        "control_points": grid_width * grid_height,
        "regularization_iterations": 24,
    }
    return field, diagnostics


def _alpha_composite(base: np.ndarray, rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    overlay_alpha = np.clip(alpha, 0.0, 1.0)
    base_alpha = base[..., 3]
    output_alpha = overlay_alpha + base_alpha * (1.0 - overlay_alpha)
    numerator = rgb * overlay_alpha[..., None] + base[..., :3] * base_alpha[..., None] * (1.0 - overlay_alpha[..., None])
    output_rgb = np.where(output_alpha[..., None] > 1.0e-6, numerator / np.maximum(output_alpha[..., None], 1.0e-6), 0.0)
    return np.concatenate((np.clip(output_rgb, 0.0, 1.0), output_alpha[..., None]), axis=-1)


def generate_branded_icon(
    source: Image.Image,
    config: BadgeConfig,
    font_path: Path = DEFAULT_FONT,
) -> tuple[Image.Image, dict[str, Any]]:
    """Return a branded copy and deterministic diagnostics for validation/tests."""
    original = source.convert("RGBA")
    width, height = original.size
    work_scale = config.work_scale
    work_size = (width * work_scale, height * work_scale)
    work = original.resize(work_size, Image.Resampling.LANCZOS)
    source_rgba = np.asarray(work, dtype=np.float32) / 255.0
    scaled = BadgeConfig(config.placement, config.scale, config.padding, config.work_scale)
    glyph, glyph_bbox = _glyph_mask(work_size, scaled, font_path)
    target = int(min(work_size) * config.scale)
    glow_margin = max(8, int(target * 0.30))
    x0 = max(0, glyph_bbox[0] - glow_margin)
    y0 = max(0, glyph_bbox[1] - glow_margin)
    x1 = min(work_size[0], glyph_bbox[2] + glow_margin)
    y1 = min(work_size[1], glyph_bbox[3] + glow_margin)
    field_bbox = (x0, y0, x1, y1)

    local_lab, local_variance = _local_background(source_rgba, max(2.0, target * 0.075))
    crop_field, diagnostics = _optimized_color_field(local_lab, local_variance, field_bbox, target)
    field_lab = np.zeros((*glyph.shape, 3), dtype=np.float32)
    field_lab[y0:y1, x0:x1] = crop_field
    field_rgb = np.zeros_like(field_lab)
    field_rgb[y0:y1, x0:x1] = _gamut_map_oklab(crop_field)

    tight_radius = max(2.0, target * 0.055)
    wide_radius = max(4.0, target * 0.14)
    tight_alpha = _blur(glyph, tight_radius)
    wide_alpha = _blur(glyph, wide_radius)
    tight_color = _blur(field_rgb * glyph[..., None], tight_radius) / np.maximum(tight_alpha[..., None], 1.0e-4)
    wide_color = _blur(field_rgb * glyph[..., None], wide_radius) / np.maximum(wide_alpha[..., None], 1.0e-4)

    rendered = source_rgba.copy()
    rendered = _alpha_composite(rendered, wide_color, np.clip(wide_alpha * 0.25, 0.0, 0.38))
    rendered = _alpha_composite(rendered, tight_color, np.clip(tight_alpha * 0.48, 0.0, 0.62))

    dilation = max(3, int(target * 0.045))
    dilation = dilation if dilation % 2 == 1 else dilation + 1
    support = np.asarray(
        Image.fromarray(np.uint8(glyph * 255.0)).filter(ImageFilter.MaxFilter(dilation)),
        dtype=np.float32,
    ) / 255.0
    support_alpha = np.clip((support - glyph * 0.55) * 0.78, 0.0, 0.72)
    rendered = _alpha_composite(rendered, np.zeros_like(field_rgb), support_alpha)
    rendered = _alpha_composite(rendered, field_rgb, np.clip(glyph * 0.94, 0.0, 0.96))

    erosion = max(3, int(target * 0.024))
    erosion = erosion if erosion % 2 == 1 else erosion + 1
    inner = np.asarray(
        Image.fromarray(np.uint8(glyph * 255.0)).filter(ImageFilter.MinFilter(erosion)),
        dtype=np.float32,
    ) / 255.0
    highlight_lab = field_lab.copy()
    highlight_lab[..., 0] = np.clip(highlight_lab[..., 0] + 0.16, 0.0, 0.98)
    highlight_lab[..., 1:3] *= 0.56
    highlight_rgb = np.zeros_like(field_rgb)
    highlight_rgb[y0:y1, x0:x1] = _gamut_map_oklab(highlight_lab[y0:y1, x0:x1])
    rendered = _alpha_composite(rendered, highlight_rgb, np.clip(inner * 0.76, 0.0, 0.80))

    work_output = Image.fromarray(np.uint8(np.clip(rendered, 0.0, 1.0) * 255.0))
    output = work_output.resize(original.size, Image.Resampling.LANCZOS)
    affected = np.clip(wide_alpha * 0.25 + tight_alpha * 0.48 + support_alpha + glyph, 0.0, 1.0)
    affected_image = Image.fromarray(np.uint8(affected * 255.0)).resize(original.size, Image.Resampling.LANCZOS)
    affected_array = np.asarray(affected_image, dtype=np.uint8)
    exact_mask = Image.fromarray(np.where(affected_array > 0, 255, 0).astype(np.uint8))
    final = original.copy()
    final.paste(output, (0, 0), exact_mask)

    glyph_pixels = glyph > 0.12
    badge_lab = field_lab[glyph_pixels]
    background_lab = local_lab[glyph_pixels]
    delta_e = np.linalg.norm(badge_lab - background_lab, axis=-1)
    changed = np.argwhere(affected_array > 0)
    changed_y0, changed_x0 = changed.min(axis=0)
    changed_y1, changed_x1 = changed.max(axis=0) + 1
    diagnostics.update(
        {
            "font": GLYPH_TYPEFACE,
            "font_sha256": hashlib.sha256(font_path.read_bytes()).hexdigest(),
            "glyph": "g",
            "glyph_bbox": [round(value / work_scale) for value in glyph_bbox],
            "field_bbox": [round(value / work_scale) for value in field_bbox],
            "affected_bbox": [int(changed_x0), int(changed_y0), int(changed_x1), int(changed_y1)],
            "glyph_pixels_working": int(np.count_nonzero(glyph_pixels)),
            "local_lightness_range": float(np.ptp(local_lab[..., 0][glyph_pixels])),
            "badge_lightness_range": float(np.ptp(badge_lab[..., 0])),
            "badge_chroma_range": float(np.ptp(np.linalg.norm(badge_lab[..., 1:3], axis=-1))),
            "badge_background_delta_e_p10": float(np.percentile(delta_e, 10)),
            "working_size": list(work_size),
            "output_size": [width, height],
        }
    )
    return final, diagnostics
