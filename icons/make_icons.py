"""Generates the app icons. Run: python icons/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).parent
BG_TOP, BG_BOT = (46, 124, 255), (10, 80, 220)


def make(size, pad_frac=0.0):
    s = size * 4  # supersample for smooth edges
    img = Image.new("RGB", (s, s))
    d = ImageDraw.Draw(img)
    for y in range(s):
        t = y / s
        d.line([(0, y), (s, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOT)))

    inset = s * pad_frac
    area = s - 2 * inset
    # Three checklist rows: checked circle + line
    rows = 3
    row_h = area * 0.16
    gap = area * 0.1
    total = rows * row_h + (rows - 1) * gap
    y0 = inset + (area - total) / 2
    x0 = inset + area * 0.2
    for i in range(rows):
        cy = y0 + i * (row_h + gap) + row_h / 2
        r = row_h / 2
        done = i < 2
        if done:
            d.ellipse([x0, cy - r, x0 + 2 * r, cy + r], fill="white")
            w = max(2, int(r * 0.32))
            d.line([(x0 + r * 0.55, cy + r * 0.02), (x0 + r * 0.9, cy + r * 0.4), (x0 + r * 1.5, cy - r * 0.4)],
                   fill=BG_BOT, width=w, joint="curve")
        else:
            d.ellipse([x0, cy - r, x0 + 2 * r, cy + r], outline="white", width=max(2, int(r * 0.22)))
        lx = x0 + 2 * r + area * 0.07
        lw = area * (0.36 if i == 1 else 0.44)
        lh = row_h * 0.34
        color = (255, 255, 255) if not done else (190, 212, 255)
        d.rounded_rectangle([lx, cy - lh / 2, lx + lw, cy + lh / 2], radius=lh / 2, fill=color)
    return img.resize((size, size), Image.LANCZOS)


make(180, 0.06).save(OUT / "apple-touch-icon.png")
make(192, 0.06).save(OUT / "icon-192.png")
make(512, 0.06).save(OUT / "icon-512.png")
make(512, 0.16).save(OUT / "icon-512-maskable.png")
print("icons written")
