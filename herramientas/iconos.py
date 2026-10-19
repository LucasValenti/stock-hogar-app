"""Dibuja el ícono de la app (papelito con imán, dirección Heladera) en todos los tamaños.

Uso: python herramientas/iconos.py   (necesita Pillow)

Escribe public/favicon.png y public/icono-{192,512,maskable-512}.png.
La geometría está en una grilla de 1024 y se dibuja a 4x para suavizar los bordes.
Colores de DESIGN.md: enlozado (color.claro.fondo), papelito (color.claro.superficie) y
renglones (color.claro.textoSuave). El naranja del imán es solo del ícono: el acento de la app
(#a8380a) queda apagado a 48 px sobre el verde agua, y #ff8f57 casi no se distingue de él.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

FONDO = (0xDC, 0xE8, 0xE3)
PAPEL = (0xFB, 0xFD, 0xFC)
RENGLON = (0x4D, 0x5B, 0x57)
IMAN = (0xE0, 0x62, 0x1F)

ESCALA = 4
LADO = 1024 * ESCALA
raiz = Path(__file__).resolve().parent.parent


def s(*valores):
    return [v * ESCALA for v in valores]


def papelito(renglones=True, color_papel=PAPEL, color_renglon=RENGLON):
    """El papelito girado -6°, en una capa transparente."""
    capa = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    d.rounded_rectangle(s(322, 300, 702, 760), radius=28 * ESCALA, fill=color_papel)
    if renglones:
        for x2, y in ((642, 430), (582, 520), (612, 610)):
            d.rounded_rectangle(s(382, y, x2, y + 30), radius=15 * ESCALA, fill=color_renglon)
    return capa.rotate(6, resample=Image.BICUBIC, center=(512 * ESCALA, 540 * ESCALA))


def sombra(capa, dx, dy, opacidad):
    alfa = capa.getchannel('A').point(lambda a: int(a * opacidad))
    negra = Image.new('RGBA', capa.size, (0, 0, 0, 0))
    negra.putalpha(alfa)
    negra = negra.filter(ImageFilter.GaussianBlur(6 * ESCALA))
    corrida = Image.new('RGBA', capa.size, (0, 0, 0, 0))
    corrida.paste(negra, (dx * ESCALA, dy * ESCALA))
    return corrida


def iman():
    capa = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    d.ellipse(s(434, 234, 590, 390), fill=IMAN)
    d.ellipse(s(468, 268, 512, 312), fill=PAPEL + (90,))
    return capa


def primer_plano():
    """Papelito e imán con sombras, sin fondo (capa de adelante del ícono adaptable)."""
    capa = Image.new('RGBA', (LADO, LADO), (0, 0, 0, 0))
    p, i = papelito(), iman()
    for parte in (sombra(p, 10, 18, 0.12), p, sombra(i, 6, 12, 0.15), i):
        capa = Image.alpha_composite(capa, parte)
    return capa


def completo():
    return Image.alpha_composite(Image.new('RGBA', (LADO, LADO), FONDO + (255,)), primer_plano())


def cerrado(imagen):
    """Recorte de 640 al centro: el papelito ocupa más lugar donde nadie aplica máscara
    (favicon, ícono «any» de la PWA)."""
    return imagen.crop(s(192, 192, 832, 832))


def guardar(imagen, ruta, lado):
    destino = raiz / ruta
    imagen.resize((lado, lado), Image.LANCZOS).save(destino, optimize=True)
    print(f'{ruta} ({lado}x{lado})')


def principal():
    lleno = completo()
    guardar(cerrado(lleno), 'public/favicon.png', 48)
    guardar(cerrado(lleno), 'public/icono-192.png', 192)
    guardar(cerrado(lleno), 'public/icono-512.png', 512)
    guardar(lleno, 'public/icono-maskable-512.png', 512)


if __name__ == '__main__':
    principal()
