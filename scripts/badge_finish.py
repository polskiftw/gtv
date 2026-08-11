#!/usr/bin/env python3
"""Final compositing controls for generated branding."""

from __future__ import annotations

from PIL import Image


def apply_badge_opacity(original: Image.Image, branded: Image.Image, opacity: float) -> Image.Image:
    """Scale the complete badge treatment toward the untouched source image."""
    if not 0.0 < opacity <= 1.0:
        raise ValueError("branding.opacity must be greater than 0.0 and at most 1.0")
    source_rgba = original.convert("RGBA")
    branded_rgba = branded.convert("RGBA")
    if source_rgba.size != branded_rgba.size:
        raise ValueError("source and branded images must have identical dimensions")
    if opacity == 1.0:
        return branded_rgba.copy()
    return Image.blend(source_rgba, branded_rgba, opacity)
