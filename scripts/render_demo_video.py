"""Renders Almost's product video: an animation of the pickup system in a store.

A shopper picks up a product at the window display rack, the camera tags it, the screen
beside the rack switches to it, they compare it with a second one, put one back and leave
with the other; then the day's product funnel. It's an illustration, not real footage:
the shapes and products come from components/Garment.tsx and data/products.json, and the
closing numbers are the sample day's (samples/good/events.csv + pos.csv).

  .venv\\Scripts\\python scripts/render_demo_video.py --fonts path/to/fonts
      writes public/video/almost-demo.mp4 and public/video/almost-demo.jpg

Needs Pillow and imageio-ffmpeg (pip install pillow imageio-ffmpeg). --fonts is a folder with
Manrope.ttf and Inter.ttf (Google Fonts); without it, Windows fonts are used.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H, SS, FPS = 1280, 720, 2, 30  # output size, supersampling, frames per second
DURATION = 27.0

BG = (5, 6, 7)
PANEL = (11, 13, 16)
LINE = (38, 42, 48)
FG = (232, 236, 241)
MUTED = (139, 149, 161)
AMBER = (255, 176, 32)
MINT = (52, 211, 180)
INK = (26, 18, 3)

PRODUCTS = {p["sku"]: p for p in json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))["products"]}

# The same silhouettes as components/Garment.tsx (200 x 200 box).
SHAPES = {
    "tee": "M62 42 L86 30 Q100 46 114 30 L138 42 L168 72 L148 92 L138 82 L138 172 L62 172 L62 82 L52 92 L32 72 Z",
    "shirt": "M64 40 L88 28 L100 44 L112 28 L136 40 L172 112 L154 120 L138 88 L138 176 L62 176 L62 88 L46 120 L28 112 Z",
    "jacket": "M62 40 L88 28 L100 40 L112 28 L138 40 L170 120 L152 128 L140 96 L140 150 L60 150 L60 96 L48 128 L30 120 Z",
    "kurta": "M72 32 L90 26 Q100 40 110 26 L128 32 L160 66 L144 80 L134 68 L142 186 L58 186 L66 68 L56 80 L40 66 Z",
    "dress": "M80 30 L92 26 Q100 38 108 26 L120 30 L142 62 L128 70 L124 64 L126 78 L166 186 L34 186 L74 78 L76 64 L72 70 L58 62 Z",
    "jeans": "M62 24 L138 24 L150 186 L110 186 L100 86 L90 186 L50 186 Z",
}

RAIL_SKUS = ["NEW-201", "WIN-402", "NEW-203", "WIN-401", "NEW-202", "KRT-301"]
RAIL_X = [385, 480, 575, 670, 765, 860]
RAIL_Y = 232
SCREEN = (968, 92, 1228, 482)  # the wall screen beside the rack
CLOCK_START = 12 * 3600 + 41 * 60 + 7


# ---------------------------------------------------------------- helpers


def s(v: float) -> int:
    return int(round(v * SS))


def pts(points):
    return [(s(x), s(y)) for x, y in points]


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def between(t: float, a: float, b: float) -> float:
    """0 before a, 1 after b, eased in between."""
    return ease((t - a) / (b - a)) if b > a else float(t >= a)


def lerp(a, b, k):
    if isinstance(a, tuple):
        return tuple(lerp(x, y, k) for x, y in zip(a, b))
    return a + (b - a) * k


def hex_rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def with_alpha(c, a: float):
    return (*c[:3], int(max(0, min(1, a)) * 255))


def parse_path(d: str):
    """M/L/Q/Z path → polygon points (quadratic curves flattened)."""
    tokens = re.findall(r"[MLQZ]|-?\d+(?:\.\d+)?", d)
    out, i, cur = [], 0, (0.0, 0.0)
    while i < len(tokens):
        cmd = tokens[i]
        if cmd in ("M", "L"):
            cur = (float(tokens[i + 1]), float(tokens[i + 2]))
            out.append(cur)
            i += 3
        elif cmd == "Q":
            c = (float(tokens[i + 1]), float(tokens[i + 2]))
            e = (float(tokens[i + 3]), float(tokens[i + 4]))
            for k in range(1, 9):
                u = k / 8
                out.append(((1 - u) ** 2 * cur[0] + 2 * (1 - u) * u * c[0] + u * u * e[0],
                            (1 - u) ** 2 * cur[1] + 2 * (1 - u) * u * c[1] + u * u * e[1]))
            cur = e
            i += 5
        else:
            i += 1
    return out


SHAPE_POINTS = {k: parse_path(v) for k, v in SHAPES.items()}


class Fonts:
    def __init__(self, folder: Path | None):
        win = Path("C:/Windows/Fonts")
        self.display_path = folder / "Manrope.ttf" if folder and (folder / "Manrope.ttf").exists() else None
        self.sans_path = folder / "Inter.ttf" if folder and (folder / "Inter.ttf").exists() else None
        self.fallback_bold = win / "segoeuib.ttf"
        self.fallback = win / "segoeui.ttf"
        self.mono_path = win / "consola.ttf"
        self.mono_bold_path = win / "consolab.ttf"
        self.cache: dict = {}

    def _font(self, path, size, weight=None, fallback=None):
        key = (str(path), size, weight)
        if key not in self.cache:
            if path is None:
                f = ImageFont.truetype(str(fallback), s(size))
            else:
                f = ImageFont.truetype(str(path), s(size))
                if weight:
                    try:
                        f.set_variation_by_axes([weight] if "Manrope" in str(path) else [14, weight])
                    except Exception:
                        pass
            self.cache[key] = f
        return self.cache[key]

    def display(self, size):
        return self._font(self.display_path, size, 800, self.fallback_bold)

    def bold(self, size):
        return self._font(self.sans_path, size, 700, self.fallback_bold)

    def regular(self, size):
        return self._font(self.sans_path, size, 400, self.fallback)

    def mono(self, size, bold=False):
        return self._font(self.mono_bold_path if bold else self.mono_path, size)


class Canvas:
    """A supersampled RGBA frame with alpha-blended drawing."""

    def __init__(self, base: Image.Image):
        self.img = base.copy()

    def layer(self):
        return Image.new("RGBA", self.img.size, (0, 0, 0, 0))

    def put(self, layer: Image.Image, opacity: float = 1.0):
        if opacity < 1:
            alpha = layer.getchannel("A").point(lambda v: int(v * opacity))
            layer.putalpha(alpha)
        self.img.alpha_composite(layer)

    def draw(self):
        return ImageDraw.Draw(self.img)


def text(d: ImageDraw.ImageDraw, xy, value, font, fill, anchor="la", spacing=0):
    d.text((s(xy[0]), s(xy[1])), value, font=font, fill=fill, anchor=anchor)


def text_w(font, value) -> float:
    return font.getlength(value) / SS


def garment(d: ImageDraw.ImageDraw, sku: str, cx: float, top: float, height: float, alpha: float = 1.0):
    """Draws a product's silhouette, its hanger hook at (cx, top)."""
    p = PRODUCTS[sku]
    shape = SHAPE_POINTS.get(p["kind"], SHAPE_POINTS["tee"])
    k = height / 160
    poly = [(cx + (x - 100) * k, top + (y - 26) * k) for x, y in shape]
    colour = hex_rgb(p["hex"])
    d.polygon(pts(poly), fill=with_alpha(colour, alpha))
    # a soft highlight down one side, for depth
    shade = [(cx + (x - 100) * k * 0.55 - 8 * k, top + (y - 26) * k) for x, y in shape]
    d.polygon(pts(shade), fill=with_alpha(tuple(min(255, c + 28) for c in colour), 0.35 * alpha))
    if p["kind"] == "dress":
        for yy in (120, 150):
            d.arc([s(cx - 40 * k), s(top + (yy - 34) * k), s(cx + 40 * k), s(top + (yy - 18) * k)], 20, 160,
                  fill=with_alpha((255, 215, 120), 0.6 * alpha), width=s(2.2 * k))
    hook = [(cx, top - 14 * k), (cx, top - 2 * k)]
    d.line(pts(hook), fill=with_alpha((150, 156, 166), alpha), width=s(2.4 * k))
    d.arc([s(cx - 7 * k), s(top - 24 * k), s(cx + 7 * k), s(top - 10 * k)], 180, 360,
          fill=with_alpha((150, 156, 166), alpha), width=s(2.4 * k))
    d.line(pts([(cx - 30 * k, top + 4 * k), (cx, top - 3 * k), (cx + 30 * k, top + 4 * k)]),
           fill=with_alpha((150, 156, 166), alpha), width=s(2.4 * k))
    xs = [x for x, _ in poly]
    ys = [y for _, y in poly]
    return (min(xs), top - 20 * k, max(xs), max(ys))


def ik(shoulder, target, upper=112.0, fore=104.0, bend=1):
    """Elbow and hand positions for an arm reaching for target."""
    dx, dy = target[0] - shoulder[0], target[1] - shoulder[1]
    dist = max(1.0, min(math.hypot(dx, dy), upper + fore - 0.5))
    a = math.atan2(dy, dx)
    cos_e = (upper ** 2 + dist ** 2 - fore ** 2) / (2 * upper * dist)
    e = math.acos(max(-1, min(1, cos_e))) * bend
    elbow = (shoulder[0] + upper * math.cos(a - e), shoulder[1] + upper * math.sin(a - e))
    hand = (shoulder[0] + dist * math.cos(a), shoulder[1] + dist * math.sin(a))
    return elbow, hand


def tag(c: Canvas, x, y, title, status, colour, fonts: Fonts, opacity=1.0, align="left"):
    """The camera's label: product name on top, status below, as on a CCTV overlay."""
    if opacity <= 0:
        return
    lay = c.layer()
    d = ImageDraw.Draw(lay)
    ft, fs = fonts.bold(14), fonts.bold(11.5)
    w = max(text_w(ft, title), text_w(fs, status) + 16) + 24
    if align == "right":
        x -= w
    d.rounded_rectangle([s(x), s(y), s(x + w), s(y + 50)], radius=s(7), fill=(8, 10, 12, 235), outline=colour, width=s(1.5))
    text(d, (x + 12, y + 9), title, ft, FG)
    d.ellipse([s(x + 12), s(y + 33), s(x + 19), s(y + 40)], fill=colour)
    text(d, (x + 25, y + 30), status, fs, colour)
    c.put(lay, opacity)


def brackets(d, box, colour, length=14, width=2.0, dashed=False):
    x1, y1, x2, y2 = box
    for (cx, cy, sx, sy) in ((x1, y1, 1, 1), (x2, y1, -1, 1), (x1, y2, 1, -1), (x2, y2, -1, -1)):
        d.line(pts([(cx, cy + sy * length), (cx, cy), (cx + sx * length, cy)]), fill=colour, width=s(width))
    if dashed:
        for xa in range(int(x1 + length + 6), int(x2 - length - 4), 12):
            d.line(pts([(xa, y1), (xa + 6, y1)]), fill=colour, width=s(1.2))
            d.line(pts([(xa, y2), (xa + 6, y2)]), fill=colour, width=s(1.2))


def chip(c: Canvas, x, y, label, colour, ink, fonts: Fonts, opacity=1.0):
    if opacity <= 0:
        return
    lay = c.layer()
    d = ImageDraw.Draw(lay)
    f = fonts.bold(12.5)
    w = text_w(f, label) + 26
    d.rounded_rectangle([s(x), s(y), s(x + w), s(y + 28)], radius=s(14), fill=colour)
    text(d, (x + 13, y + 7), label, f, ink)
    c.put(lay, opacity)


# ---------------------------------------------------------------- the store scene


def store_background(fonts: Fonts) -> Image.Image:
    img = Image.new("RGBA", (s(W), s(H)), (*BG, 255))
    d = ImageDraw.Draw(img)
    # back wall with a warm vertical gradient, then the floor
    for y in range(0, s(560)):
        k = y / s(560)
        d.line([(0, y), (s(W), y)], fill=(int(24 - 10 * k), int(22 - 8 * k), int(22 - 6 * k), 255))
    for y in range(s(560), s(H)):
        k = (y - s(560)) / s(H - 560)
        d.line([(0, y), (s(W), y)], fill=(int(14 + 6 * k), int(13 + 5 * k), int(13 + 5 * k), 255))
    # wall panels
    for x in (300, 940):
        d.line([(s(x), 0), (s(x), s(560))], fill=(30, 29, 29, 255), width=s(2))
    # warm spotlights on the rack
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for x in (430, 620, 810):
        gd.ellipse([s(x - 170), s(60), s(x + 170), s(470)], fill=(255, 196, 120, 34))
    glow = glow.filter(ImageFilter.GaussianBlur(s(60)))
    img.alpha_composite(glow)
    for x in (430, 620, 810):
        d.rounded_rectangle([s(x - 26), s(26), s(x + 26), s(38)], radius=s(5), fill=(60, 58, 54, 255))
        d.ellipse([s(x - 16), s(33), s(x + 16), s(43)], fill=(255, 226, 170, 255))
    # the rail
    d.rounded_rectangle([s(330), s(RAIL_Y - 7), s(915), s(RAIL_Y - 1)], radius=s(3), fill=(120, 124, 130, 255))
    for x in (345, 900):
        d.line([(s(x), s(RAIL_Y - 4)), (s(x), s(0))], fill=(80, 82, 86, 255), width=s(4))
    # the wall screen's bezel and its soft light on the wall
    sx1, sy1, sx2, sy2 = SCREEN
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(halo).rounded_rectangle([s(sx1 - 30), s(sy1 - 30), s(sx2 + 30), s(sy2 + 30)], radius=s(40), fill=(120, 140, 160, 40))
    halo = halo.filter(ImageFilter.GaussianBlur(s(30)))
    img.alpha_composite(halo)
    d.rounded_rectangle([s(sx1 - 8), s(sy1 - 8), s(sx2 + 8), s(sy2 + 8)], radius=s(12), fill=(16, 17, 19, 255), outline=(44, 46, 50, 255), width=s(2))
    return img


def draw_shopper(c: Canvas, x: float, bob: float, right_target, left_target):
    """A shopper seen from behind, standing in front of the rack."""
    d = c.draw()
    y0 = 300 + bob
    jacket, jacket_hi, skin, hair = (52, 60, 74), (78, 88, 104), (196, 150, 120), (28, 24, 26)
    sl, sr = (x - 64, y0 + 58), (x + 64, y0 + 58)
    # arms behind the body first when they hang down, so the torso covers the shoulders
    arms = []
    for shoulder, target, bend in ((sr, right_target, -1), (sl, left_target, 1)):
        elbow, hand = ik(shoulder, target, bend=bend)
        arms.append((shoulder, elbow, hand))
    torso = [(x - 72, y0 + 52), (x + 72, y0 + 52), (x + 84, y0 + 120), (x + 66, H + 10), (x - 66, H + 10), (x - 84, y0 + 120)]
    d.polygon(pts(torso), fill=jacket)
    d.polygon(pts([(x - 72, y0 + 52), (x - 50, y0 + 52), (x - 62, H + 10), (x - 66, H + 10), (x - 84, y0 + 120)]), fill=jacket_hi)
    d.line(pts([(x, y0 + 70), (x, H)]), fill=(44, 50, 62), width=s(2))
    # neck, head and hair in a low bun
    d.rounded_rectangle([s(x - 14), s(y0 + 22), s(x + 14), s(y0 + 60)], radius=s(6), fill=(170, 126, 100))
    d.ellipse([s(x - 34), s(y0 - 44), s(x + 34), s(y0 + 36)], fill=hair)
    d.ellipse([s(x - 18), s(y0 + 6), s(x + 18), s(y0 + 34)], fill=(40, 34, 36))
    d.ellipse([s(x - 40), s(y0 - 8), s(x - 30), s(y0 + 12)], fill=(170, 126, 100))  # ear
    d.ellipse([s(x + 30), s(y0 - 8), s(x + 40), s(y0 + 12)], fill=(170, 126, 100))
    hands = []
    for shoulder, elbow, hand in arms:
        d.line(pts([shoulder, elbow]), fill=jacket, width=s(30), joint="curve")
        d.line(pts([elbow, hand]), fill=jacket, width=s(25), joint="curve")
        for p, r in ((shoulder, 15), (elbow, 12.5)):
            d.ellipse([s(p[0] - r), s(p[1] - r), s(p[0] + r), s(p[1] + r)], fill=jacket)
        d.ellipse([s(hand[0] - 13), s(hand[1] - 13), s(hand[0] + 13), s(hand[1] + 13)], fill=skin)
        hands.append(hand)
    return hands  # right, left


def screen_content(t: float, state: dict, fonts: Fonts) -> Image.Image:
    """What the wall screen shows: the playlist, the held product, or two side by side."""
    sx1, sy1, sx2, sy2 = SCREEN
    w, h = sx2 - sx1, sy2 - sy1
    img = Image.new("RGBA", (s(w), s(h)), (12, 14, 18, 255))
    d = ImageDraw.Draw(img)
    mode, skus, since = state["mode"], state["skus"], state["since"]
    k = between(t, since, since + 0.35)  # slide in
    dy = (1 - k) * 18

    def product_block(sku, cx, top, gh, name_size, label=None, price=True):
        p = PRODUCTS[sku]
        glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse([s(cx - gh * 0.45), s(top + gh * 0.1 + dy), s(cx + gh * 0.45), s(top + gh * 0.9 + dy)],
                                     fill=with_alpha(hex_rgb(p["hex"]), 0.45 * k))
        img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(s(18))))
        gd = ImageDraw.Draw(img)
        garment(gd, sku, cx, top + 18 + dy, gh, alpha=k)
        y = top + gh + 34 + dy
        if label:
            text(gd, (cx, y), label, fonts.bold(9.5), with_alpha(AMBER if mode != "idle" else MUTED, k), anchor="ma")
            y += 18
        for line in wrap(p["name"], fonts.display(name_size), w - 30 if mode != "pair" else (w / 2 - 14)):
            text(gd, (cx, y), line, fonts.display(name_size), with_alpha(FG, k), anchor="ma")
            y += name_size * 1.12
        if price:
            text(gd, (cx, y + 4), f"{p['colour']} · ₹{p['price']:,}", fonts.regular(11), with_alpha(MUTED, k), anchor="ma")
            y += 22
        return y

    if mode == "pair":
        text(d, (w / 2, 18), "COMPARING TWO?", fonts.bold(10), with_alpha(AMBER, k), anchor="ma")
        product_block(skus[0], w * 0.27, 50, 120, 15)
        product_block(skus[1], w * 0.73, 50, 120, 15)
        text(d, (w / 2, h - 34), "Tap nothing. Just hold them.", fonts.regular(10), with_alpha(MUTED, k), anchor="ma")
    elif mode == "held":
        y = product_block(skus[0], w / 2, 26, 180, 21, label="IN YOUR HAND")
        p = PRODUCTS[skus[0]]
        for i, line in enumerate(wrap(p["tagline"], fonts.regular(11), w - 40)):
            text(ImageDraw.Draw(img), (w / 2, y + 10 + i * 15), line, fonts.regular(11), with_alpha(FG, k * 0.85), anchor="ma")
    else:
        playlist = ["WIN-401", "WIN-402", "NEW-201"]
        sku = playlist[int((t - since) // 3) % len(playlist)] if t >= since else playlist[0]
        slide_start = since + ((t - since) // 3) * 3
        k = between(t, slide_start, slide_start + 0.35)
        dy = (1 - k) * 18
        product_block(sku, w / 2, 40, 170, 20, label="WINDOW DISPLAY")
        text(ImageDraw.Draw(img), (w / 2, h - 34), "Pick one up to see more", fonts.regular(11), MUTED, anchor="ma")
    return img


def wrap(value: str, font, max_w: float):
    words, lines, cur = value.split(), [], ""
    for wd in words:
        trial = f"{cur} {wd}".strip()
        if text_w(font, trial) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


# Story beats, in seconds.
T_WALK_IN = (0.3, 2.6)
T_REACH_R = (2.6, 3.6)
T_LIFT_R = (3.6, 4.5)
T_PICKUP_1 = 4.5
T_ON_SCREEN = 4.9
T_REACH_L = (8.4, 9.3)
T_LIFT_L = (9.3, 10.1)
T_PICKUP_2 = 10.1
T_RETURN_R = (13.6, 14.6)
T_PUT_BACK = 14.6
T_WALK_OUT = (15.4, 17.4)
T_TAKEN = 16.6
T_TO_DASH = (17.6, 18.3)
T_TO_END = (24.0, 24.6)

HELD_R = (640, 452)  # where the right hand holds the first product up to look at it
HELD_L = (462, 470)


def scene_frame(t: float, base: Image.Image, fonts: Fonts) -> Image.Image:
    c = Canvas(base)
    d = c.draw()
    anarkali_hook = (RAIL_X[RAIL_SKUS.index("WIN-401")], RAIL_Y)  # to the shopper's right
    coord_hook = (RAIL_X[RAIL_SKUS.index("WIN-402")], RAIL_Y)  # to her left

    # who is holding what
    r_holds = T_LIFT_R[0] <= t < T_RETURN_R[1]
    l_holds = t >= T_LIFT_L[0]

    # rail garments (the ones in a hand are drawn later, on top of the shopper)
    for sku, x in zip(RAIL_SKUS, RAIL_X):
        if (sku == "WIN-401" and r_holds) or (sku == "WIN-402" and l_holds):
            continue
        garment(d, sku, x, RAIL_Y + 2, 150)

    # shelf zone
    zone_alpha = 0.55 + 0.25 * math.sin(t * 3) if T_REACH_R[0] - 0.3 < t < T_WALK_OUT[0] else 0.35
    lay = c.layer()
    ld = ImageDraw.Draw(lay)
    zx1, zy1, zx2, zy2 = 322, 196, 922, 418
    for x in range(zx1, zx2, 16):
        ld.line(pts([(x, zy1), (min(x + 8, zx2), zy1)]), fill=with_alpha(MINT, zone_alpha), width=s(1.6))
        ld.line(pts([(x, zy2), (min(x + 8, zx2), zy2)]), fill=with_alpha(MINT, zone_alpha), width=s(1.6))
    for y in range(zy1, zy2, 16):
        ld.line(pts([(zx1, y), (zx1, min(y + 8, zy2))]), fill=with_alpha(MINT, zone_alpha), width=s(1.6))
        ld.line(pts([(zx2, y), (zx2, min(y + 8, zy2))]), fill=with_alpha(MINT, zone_alpha), width=s(1.6))
    text(ld, (zx1 + 8, zy2 - 22), "ZONE R4 · WINDOW DISPLAY RACK", fonts.bold(10.5), with_alpha(MINT, min(1, zone_alpha + 0.3)))
    c.put(lay)

    # where the shopper is and where each hand is going
    walk_in = between(t, *T_WALK_IN)
    walk_out = between(t, *T_WALK_OUT)
    x = lerp(-140, 560, walk_in) + lerp(0, 860, walk_out)
    walking = (T_WALK_IN[0] < t < T_WALK_IN[1]) or (T_WALK_OUT[0] < t < T_WALK_OUT[1])
    bob = abs(math.sin(t * 7)) * -5 if walking else 0
    rest_r, rest_l = (x + 78, 612 + bob), (x - 78, 612 + bob)

    if t < T_REACH_R[0]:
        rt = rest_r
    elif t < T_REACH_R[1]:
        rt = lerp(rest_r, (anarkali_hook[0] + 2, anarkali_hook[1] + 6), between(t, *T_REACH_R))
    elif t < T_LIFT_R[1]:
        rt = lerp((anarkali_hook[0] + 2, anarkali_hook[1] + 6), HELD_R, between(t, *T_LIFT_R))
    elif t < T_RETURN_R[0]:
        sway = math.sin(t * 1.6) * 6
        rt = (HELD_R[0] + sway, HELD_R[1] + math.cos(t * 1.3) * 4)
    elif t < T_RETURN_R[1]:
        rt = lerp(HELD_R, (anarkali_hook[0] + 2, anarkali_hook[1] + 6), between(t, *T_RETURN_R))
    else:
        rt = lerp((anarkali_hook[0] + 2, anarkali_hook[1] + 6), rest_r, between(t, T_RETURN_R[1], T_RETURN_R[1] + 0.7))

    if t < T_REACH_L[0]:
        lt = rest_l
    elif t < T_REACH_L[1]:
        lt = lerp(rest_l, (coord_hook[0] + 2, coord_hook[1] + 6), between(t, *T_REACH_L))
    elif t < T_LIFT_L[1]:
        lt = lerp((coord_hook[0] + 2, coord_hook[1] + 6), HELD_L, between(t, *T_LIFT_L))
    elif t < T_WALK_OUT[0]:
        lt = (HELD_L[0] + math.sin(t * 1.4) * 5, HELD_L[1])
    else:
        lt = (HELD_L[0] + lerp(0, 860, walk_out) + 40 * walk_out, HELD_L[1] + 30 * walk_out)

    right_hand, left_hand = draw_shopper(c, x, bob, rt, lt)
    d = c.draw()

    held_boxes = {}
    if r_holds:
        held_boxes["WIN-401"] = garment(d, "WIN-401", right_hand[0], right_hand[1] + 8, 175)
    if l_holds:
        held_boxes["WIN-402"] = garment(d, "WIN-402", left_hand[0], left_hand[1] + 8, 175)
    # redraw the hands on top of the hangers they hold
    for hx, hy in (right_hand, left_hand):
        d.ellipse([s(hx - 13), s(hy - 13), s(hx + 13), s(hy + 13)], fill=(196, 150, 120))

    # camera overlays: hand boxes while reaching, product boxes and tags once picked up
    lay = c.layer()
    ld = ImageDraw.Draw(lay)
    if T_REACH_R[0] + 0.4 < t < T_PICKUP_1:
        hx, hy = right_hand
        brackets(ld, (hx - 34, hy - 34, hx + 34, hy + 34), with_alpha(AMBER, 0.9), length=10, width=1.6, dashed=True)
        text(ld, (hx + 40, hy - 32), "hand · in zone R4", fonts.bold(11), with_alpha(AMBER, 0.95))
    if T_REACH_L[0] + 0.3 < t < T_PICKUP_2:
        hx, hy = left_hand
        brackets(ld, (hx - 34, hy - 34, hx + 34, hy + 34), with_alpha(AMBER, 0.9), length=10, width=1.6, dashed=True)
        text(ld, (hx - 40, hy - 32), "hand · in zone R4", fonts.bold(11), with_alpha(AMBER, 0.95), anchor="ra")
    for sku, box in held_boxes.items():
        start = T_PICKUP_1 if sku == "WIN-401" else T_PICKUP_2
        if t >= start - 0.1 and not (sku == "WIN-401" and t >= T_RETURN_R[0]) and not (sku == "WIN-402" and t >= T_WALK_OUT[0] + 0.4):
            pad = 8
            brackets(ld, (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad), AMBER, length=16, width=2.2)
    c.put(lay)

    def held_for(start, end=None):
        return max(0.0, (min(t, end) if end else t) - start)

    if T_PICKUP_1 - 0.05 <= t < T_RETURN_R[0]:
        box = held_boxes.get("WIN-401")
        status = "PICKED UP" if t < T_PICKUP_1 + 1.2 else f"HELD {held_for(T_PICKUP_1):.1f} s"
        tag(c, box[2] + 16, box[1] + 96, "FESTIVE ANARKALI · WIN-401", status, AMBER, fonts, opacity=between(t, T_PICKUP_1 - 0.05, T_PICKUP_1 + 0.2))
    if T_PICKUP_2 - 0.05 <= t < T_WALK_OUT[0] + 0.4:
        box = held_boxes.get("WIN-402")
        status = "PICKED UP" if t < T_PICKUP_2 + 1.2 else f"HELD {held_for(T_PICKUP_2):.1f} s"
        tag(c, box[0] - 16, box[1] - 4, "SILK-BLEND CO-ORD · WIN-402", status, AMBER, fonts,
            opacity=between(t, T_PICKUP_2 - 0.05, T_PICKUP_2 + 0.2), align="right")
    if T_PICKUP_2 + 0.3 <= t < T_RETURN_R[0]:
        chip(c, 486, 300, "COMPARED · 2 PRODUCTS", AMBER, INK, fonts, opacity=between(t, T_PICKUP_2 + 0.3, T_PICKUP_2 + 0.6))
    if T_PUT_BACK <= t < T_PUT_BACK + 2.2:
        a = between(t, T_PUT_BACK, T_PUT_BACK + 0.25) * (1 - between(t, T_PUT_BACK + 1.8, T_PUT_BACK + 2.2))
        tag(c, anarkali_hook[0] - 70, 140, "FESTIVE ANARKALI · WIN-401", f"PUT BACK · HELD {T_RETURN_R[0] - T_PICKUP_1:.1f} s", MINT, fonts, opacity=a)
    if T_TAKEN <= t < T_TAKEN + 1.8:
        a = between(t, T_TAKEN, T_TAKEN + 0.25) * (1 - between(t, T_TAKEN + 1.4, T_TAKEN + 1.8))
        tag(c, 650, 520, "SILK-BLEND CO-ORD · WIN-402", f"TAKEN · HELD {T_TAKEN - T_PICKUP_2:.1f} s", MINT, fonts, opacity=a)

    # the screen: what it shows, and the "on screen" chip that links the pickup to it
    if t < T_ON_SCREEN:
        state = {"mode": "idle", "skus": [], "since": 0.0}
    elif t < T_PICKUP_2 + 0.3:
        state = {"mode": "held", "skus": ["WIN-401"], "since": T_ON_SCREEN}
    elif t < T_PUT_BACK + 0.3:
        state = {"mode": "pair", "skus": ["WIN-401", "WIN-402"], "since": T_PICKUP_2 + 0.3}
    elif t < T_TAKEN + 3.0:
        state = {"mode": "held", "skus": ["WIN-402"], "since": T_PUT_BACK + 0.3}
    else:
        state = {"mode": "idle", "skus": [], "since": T_TAKEN + 3.0}
    content = screen_content(t, state, fonts)
    c.img.alpha_composite(content, (s(SCREEN[0]), s(SCREEN[1])))
    for at, until in ((T_ON_SCREEN, T_ON_SCREEN + 2.4), (T_PICKUP_2 + 0.3, T_PICKUP_2 + 2.4), (T_PUT_BACK + 0.3, T_PUT_BACK + 2.0)):
        if at <= t < until:
            a = between(t, at, at + 0.2) * (1 - between(t, until - 0.4, until))
            lay = c.layer()
            ld = ImageDraw.Draw(lay)
            for xx in range(938, 962, 7):
                ld.line(pts([(xx, 164), (xx + 3, 164)]), fill=with_alpha(MINT, a), width=s(2))
            c.put(lay)
            chip(c, 812, 150, "→  ON SCREEN", MINT, (2, 26, 21), fonts, opacity=a)

    hud(c, t, fonts)
    event_log(c, t, fonts)
    return c.img


def hud(c: Canvas, t: float, fonts: Fonts):
    lay = c.layer()
    d = ImageDraw.Draw(lay)
    clock = CLOCK_START + int(t)
    hh, mm, ss = clock // 3600, clock // 60 % 60, clock % 60
    if int(t * 2) % 2 == 0:
        d.ellipse([s(28), s(29), s(38), s(39)], fill=(239, 68, 68, 255))
    text(d, (46, 26), f"REC   CAM 02 · WINDOW DISPLAY   {hh:02d}:{mm:02d}:{ss:02d}", fonts.mono(14, bold=True), with_alpha(FG, 0.9))
    text(d, (W - 28, 26), "ALMOST · PICKUP DETECTOR", fonts.bold(12), with_alpha(AMBER, 0.95), anchor="ra")
    text(d, (W - 28, H - 30), "Illustration of Almost in a store · no faces, no footage kept", fonts.regular(11), with_alpha(MUTED, 0.85), anchor="ra")
    for (x, y, sx, sy) in ((14, 14, 1, 1), (W - 14, 14, -1, 1), (14, H - 14, 1, -1), (W - 14, H - 14, -1, -1)):
        d.line(pts([(x, y + sy * 26), (x, y), (x + sx * 26, y)]), fill=with_alpha(FG, 0.5), width=s(2))
    c.put(lay)


EVENTS = [
    (T_PICKUP_1, "pickup  ", "Festive anarkali", ""),
    (T_PICKUP_2, "pickup  ", "Silk-blend co-ord", ""),
    (T_PICKUP_2 + 0.1, "compare ", "WIN-401 vs WIN-402", ""),
    (T_PUT_BACK, "put_back", "Festive anarkali", f"{T_RETURN_R[0] - T_PICKUP_1:.1f} s"),
    (T_TAKEN, "taken   ", "Silk-blend co-ord", f"{T_TAKEN - T_PICKUP_2:.1f} s"),
]


def event_log(c: Canvas, t: float, fonts: Fonts):
    shown = [e for e in EVENTS if t >= e[0]]
    if not shown:
        return
    lay = c.layer()
    d = ImageDraw.Draw(lay)
    x, y, w = 28, H - 74 - 22 * len(shown), 360
    d.rounded_rectangle([s(x), s(y), s(x + w), s(H - 52)], radius=s(10), fill=(6, 8, 10, 215), outline=with_alpha(LINE, 1), width=s(1))
    text(d, (x + 14, y + 10), "EVENTS · SENT TO THE DASHBOARD", fonts.bold(9.5), MUTED)
    for i, (at, kind, what, extra) in enumerate(shown):
        clock = CLOCK_START + int(at)
        a = between(t, at, at + 0.25)
        row_y = y + 32 + i * 22
        colour = MINT if kind.strip() in ("put_back", "taken") else AMBER
        text(d, (x + 14, row_y), f"{clock // 3600:02d}:{clock // 60 % 60:02d}:{clock % 60:02d}", fonts.mono(12.5), with_alpha(MUTED, a))
        text(d, (x + 88, row_y), kind, fonts.mono(12.5, bold=True), with_alpha(colour, a))
        text(d, (x + 166, row_y), what, fonts.mono(12.5), with_alpha(FG, a))
        if extra:
            text(d, (x + w - 14, row_y), extra, fonts.mono(12.5), with_alpha(MUTED, a), anchor="ra")
    c.put(lay)


# ---------------------------------------------------------------- dashboard and end card


FUNNEL = [("01", "On the shelf", 14, "products in view", ""), ("02", "Picked up", 518, "pickups", ""),
          ("03", "Held", 25, "on average", " s"), ("04", "Compared", 104, "40% of pickups", ""),
          ("05", "Put back", 326, "63% of pickups", ""), ("06", "Purchased", 81, "units, from your POS", "")]


def dashboard_frame(t: float, fonts: Fonts) -> Image.Image:
    img = Image.new("RGBA", (s(W), s(H)), (*BG, 255))
    c = Canvas(img)
    d = c.draw()
    t0 = T_TO_DASH[1]
    for x in range(0, W, 48):
        d.line([(s(x), 0), (s(x), s(H))], fill=(12, 13, 15, 255), width=s(1))
    for y in range(0, H, 48):
        d.line([(0, s(y)), (s(W), s(y))], fill=(12, 13, 15, 255), width=s(1))
    d.rounded_rectangle([s(60), s(46), s(84), s(70)], radius=s(5), outline=with_alpha(AMBER, 0.8), width=s(2))
    d.ellipse([s(68), s(54), s(76), s(62)], fill=AMBER)
    text(d, (96, 44), "Almost", fonts.display(22), FG)
    text(d, (W - 60, 50), "PICKUPS · 21 OCT · ONE STORE", fonts.bold(12), MUTED, anchor="ra")
    a = between(t, t0, t0 + 0.5)
    text(d, (60, 108), "PRODUCT FUNNEL · END OF THE DAY", fonts.bold(12), with_alpha(AMBER, a))
    text(d, (60, 130), "Everything that happened before the till.", fonts.display(40), with_alpha(FG, a))

    gap, cw, top = 14, (W - 120 - 5 * 14) / 6, 212
    for i, (n, title, value, sub, unit) in enumerate(FUNNEL):
        start = t0 + 0.3 + i * 0.18
        k = between(t, start, start + 0.4)
        if k <= 0:
            continue
        x = 60 + i * (cw + gap)
        y = top + (1 - k) * 16
        lay = c.layer()
        ld = ImageDraw.Draw(lay)
        mint = title == "Purchased"
        ld.rounded_rectangle([s(x), s(y), s(x + cw), s(y + 170)], radius=s(16), fill=(14, 16, 20, 255),
                             outline=with_alpha(MINT if mint else LINE, 0.9 if mint else 1), width=s(1.5))
        text(ld, (x + 16, y + 16), n, fonts.mono(12), MUTED)
        text(ld, (x + 16, y + 36), title, fonts.bold(14), FG)
        count = int(round(value * between(t, start + 0.1, start + 1.3)))
        text(ld, (x + 16, y + 70), f"{count}{unit}", fonts.display(40), MINT if mint else FG)
        text(ld, (x + 16, y + 122), sub, fonts.regular(11.5), MUTED)
        bar = {"Compared": 0.4, "Put back": 0.63, "Purchased": 0.16}.get(title, 1.0)
        ld.rounded_rectangle([s(x + 16), s(y + 148), s(x + cw - 16), s(y + 153)], radius=s(3), fill=(30, 33, 38, 255))
        ld.rounded_rectangle([s(x + 16), s(y + 148), s(x + 16 + (cw - 32) * bar * between(t, start + 0.2, start + 1.2)), s(y + 153)],
                             radius=s(3), fill=MINT if mint else AMBER)
        c.put(lay, k)

    start = t0 + 2.2
    k = between(t, start, start + 0.6)
    if k > 0:
        y = 412 + (1 - k) * 20
        lay = c.layer()
        ld = ImageDraw.Draw(lay)
        ld.rounded_rectangle([s(60), s(y), s(W - 60), s(y + 250)], radius=s(18), fill=(14, 16, 20, 255),
                             outline=with_alpha(AMBER, 0.45), width=s(1.5))
        ld.rounded_rectangle([s(84), s(y + 24), s(284), s(y + 226)], radius=s(14), fill=(10, 12, 15, 255), outline=with_alpha(LINE, 1), width=s(1))
        garment(ld, "WIN-401", 184, y + 58, 150)
        text(ld, (316, y + 34), "HIGH INTEREST · LOW CONVERSION", fonts.bold(12), AMBER)
        line1 = "Festive anarkali is picked up 85 times"
        line2 = "and held 35 s on average."
        line3 = "The POS shows only 4 sold."
        text(ld, (316, y + 62), line1, fonts.display(30), FG)
        text(ld, (316, y + 98), line2, fonts.display(30), FG)
        text(ld, (316, y + 134), line3, fonts.display(30), MINT)
        chips = ["Check the price", "Check size availability", "Try it on a different rack", "Compare with the co-ord set"]
        cx = 316
        for i, label in enumerate(chips):
            ck = between(t, start + 0.8 + i * 0.15, start + 1.1 + i * 0.15)
            f = fonts.regular(12.5)
            wch = text_w(f, label) + 26
            ld.rounded_rectangle([s(cx), s(y + 190), s(cx + wch), s(y + 218)], radius=s(14), outline=with_alpha(FG, 0.25 * ck), width=s(1))
            text(ld, (cx + 13, y + 196), label, f, with_alpha(FG, 0.9 * ck))
            cx += wch + 8
        c.put(lay, k)
    return c.img


def end_frame(t: float, fonts: Fonts) -> Image.Image:
    img = Image.new("RGBA", (s(W), s(H)), (*BG, 255))
    d = ImageDraw.Draw(img)
    k = between(t, T_TO_END[1], T_TO_END[1] + 0.6)
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([s(W / 2 - 320), s(H / 2 - 220), s(W / 2 + 320), s(H / 2 + 220)], fill=(255, 176, 32, int(40 * k)))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(s(90))))
    d = ImageDraw.Draw(img)
    cx = W / 2
    d.rounded_rectangle([s(cx - 150), s(250), s(cx - 106), s(294)], radius=s(9), outline=with_alpha(AMBER, k), width=s(3))
    d.ellipse([s(cx - 136), s(264), s(cx - 120), s(280)], fill=with_alpha(AMBER, k))
    text(d, (cx - 92, 243), "Almost", fonts.display(54), with_alpha(FG, k))
    k2 = between(t, T_TO_END[1] + 0.4, T_TO_END[1] + 1.0)
    text(d, (cx, 336), "Which product. Not just which rack.", fonts.display(40), with_alpha(AMBER, k2), anchor="ma")
    k3 = between(t, T_TO_END[1] + 0.8, T_TO_END[1] + 1.4)
    text(d, (cx, 400), "Pickups · hold time · put-backs · comparisons · screens that react", fonts.regular(18), with_alpha(MUTED, k3), anchor="ma")
    text(d, (cx, 430), "Joined with the POS you already have.", fonts.regular(18), with_alpha(MUTED, k3), anchor="ma")
    return img


# ---------------------------------------------------------------- render


def frame(t: float, base: Image.Image, fonts: Fonts) -> Image.Image:
    if t < T_TO_DASH[0]:
        out = scene_frame(t, base, fonts)
    elif t < T_TO_DASH[1]:
        out = Image.blend(scene_frame(t, base, fonts), dashboard_frame(t, fonts), between(t, *T_TO_DASH))
    elif t < T_TO_END[0]:
        out = dashboard_frame(t, fonts)
    elif t < T_TO_END[1]:
        out = Image.blend(dashboard_frame(t, fonts), end_frame(t, fonts), between(t, *T_TO_END))
    else:
        out = end_frame(t, fonts)
    fade_out = between(t, DURATION - 0.6, DURATION)  # fade to black so the loop restarts cleanly
    fade_in = 1 - between(t, 0, 0.3)
    dark = max(fade_out, fade_in)
    if dark > 0:
        out = Image.blend(out, Image.new("RGBA", out.size, (*BG, 255)), dark)
    return out.convert("RGB").resize((W, H), Image.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fonts", type=Path, help="folder with Manrope.ttf and Inter.ttf")
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "video" / "almost-demo.mp4")
    parser.add_argument("--preview", type=float, nargs="*", help="only save stills at these seconds, e.g. 5 11 20")
    args = parser.parse_args()

    fonts = Fonts(args.fonts)
    base = store_background(fonts)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    if args.preview is not None:
        for sec in args.preview:
            path = ROOT / "output" / f"video-preview-{sec:g}.png"  # git-ignored, not in public/
            path.parent.mkdir(exist_ok=True)
            frame(sec, base, fonts).save(path)
            print(path)
        return

    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    proc = subprocess.Popen(
        [ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         "-an", str(args.out)],
        stdin=subprocess.PIPE,
    )
    total = int(DURATION * FPS)
    for i in range(total):
        t = i / FPS
        img = frame(t, base, fonts)
        proc.stdin.write(img.tobytes())
        if i == int(6.2 * FPS):
            img.save(args.out.with_suffix(".jpg"), quality=86)  # poster: the screen showing the held product
        if i % FPS == 0:
            print(f"  {t:4.0f} s / {DURATION:.0f} s", flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"Wrote {args.out} ({args.out.stat().st_size / 1e6:.1f} MB) and {args.out.with_suffix('.jpg').name}")


if __name__ == "__main__":
    main()
