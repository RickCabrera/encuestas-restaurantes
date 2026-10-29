"""Genera installer/assets/sobremesa.ico: el mismo dibujo que src/components/brand/logo.tsx
(globo de conversación blanco con estrella mostaza sobre un degradado del color de acento).
El .ico está en el repo; este script solo hace falta si cambia el dibujo.

    python installer/assets/make-icon.py      (requiere Pillow: pip install pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw

TOP, BOTTOM = (0x23, 0xA2, 0x85), (0x0A, 0x6B, 0x55)
MUSTARD = (0xE8, 0xA3, 0x17, 255)
STAR = [(16, 7.6), (17.55, 10.74), (21.02, 11.24), (18.51, 13.69), (19.11, 17.14), (16, 15.5), (12.9, 17.14), (13.49, 13.69), (10.99, 11.24), (14.45, 10.74)]


def draw(size: int) -> Image.Image:
    s = 4  # sobremuestreo para bordes suaves
    big = size * s
    grad = Image.new("RGBA", (big, big))
    gd = ImageDraw.Draw(grad)
    for y in range(big):
        t = y / (big - 1)
        gd.line([(0, y), (big, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)) + (255,))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.3, fill=255)
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    # El dibujo está en un lienzo de 32 que ocupa el 72 % del ícono, centrado.
    k = big * 0.72 / 32
    o = big * 0.14

    def p(x, y):
        return (o + x * k, o + y * k)

    d.rounded_rectangle([p(6, 4), p(26, 21)], radius=4.5 * k, fill=(255, 255, 255, 255))
    d.polygon([p(9, 20), p(15, 20.5), p(8.4, 25.6), p(7, 25)], fill=(255, 255, 255, 255))
    d.polygon([p(x, y) for x, y in STAR], fill=MUSTARD)
    return img.resize((size, size), Image.LANCZOS)


out = Path(__file__).with_name("sobremesa.ico")
sizes = [16, 24, 32, 48, 64, 256]
draw(256).save(out, sizes=[(n, n) for n in sizes], append_images=[draw(n) for n in sizes[:-1]])
print(f"Listo: {out}")
