# Makes the demo's neutral poster and 16-second sample video (public/demo). Needs Pillow and ffmpeg:
#   mkdir -p /tmp/frames && python3 scripts/make-demo-assets.py public/demo /tmp/frames
#   ffmpeg -framerate 30 -i /tmp/frames/f%05d.png -c:v libx264 -pix_fmt yuv420p -crf 26 -movflags +faststart public/demo/welcome.mp4
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os, sys
OUT = sys.argv[1]; FR = sys.argv[2]
W, H = 1280, 720
GREEN = (47, 107, 94); DEEP = (24, 61, 54); PAPER = (248, 245, 241)
serif = lambda s: ImageFont.truetype('/System/Library/Fonts/Supplemental/Georgia.ttf', s)
sans = lambda s: ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', s)

def base(w=W, h=H):
    img = Image.new('RGB', (w, h), DEEP)
    px = img.load()
    for y in range(h):
        for x in range(0, w, 1):
            t = (x / w * 0.6 + y / h * 0.4)
            px[x, y] = tuple(int(GREEN[i] * (1 - t) + DEEP[i] * t) for i in range(3))
    glow = Image.new('L', (w, h), 0); d = ImageDraw.Draw(glow)
    d.ellipse((w * 0.62, -h * 0.35, w * 1.25, h * 0.55), fill=70)
    d.ellipse((-w * 0.2, h * 0.6, w * 0.35, h * 1.4), fill=45)
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    light = Image.new('RGB', (w, h), (120, 180, 160))
    return Image.composite(light, img, glow)

# Poster (no text: the player draws its own "Video coming soon" over it)
base(1600, 900).save(os.path.join(OUT, 'poster.jpg'), quality=86)

slides = [
    ('SAMPLE PRACTICE', 'Welcome to\nCedar Grove Counseling', 'A short sample of a video step.'),
    ('HOW IT WORKS', 'Every step starts\nwith a short video', 'Recorded by the practice owner in Loom,\nor uploaded straight into the app.'),
    ('THEN', 'Read, check,\nand move on', 'The reading, a quick check, and links\nsit right under the video.'),
    ('CLINICALLY READY', 'Pass the section quiz\nto unlock the next one', 'New questions every try.'),
]
bg = base()
FPS, HOLD, FADE = 30, 4.2, 0.6
frames = 0
def card(label, title, sub, alpha):
    img = bg.copy(); d = ImageDraw.Draw(img, 'RGBA')
    a = int(255 * alpha)
    d.text((110, 200), label, font=sans(26), fill=(214, 236, 228, a), spacing=8)
    d.multiline_text((106, 248), title, font=serif(72), fill=(255, 255, 255, a), spacing=14)
    d.multiline_text((110, 470), sub, font=sans(32), fill=(234, 244, 240, a), spacing=12)
    d.rounded_rectangle((110, 600, 110 + 140, 606), radius=3, fill=(214, 236, 228, a))
    return img
for (label, title, sub) in slides:
    n = int(HOLD * FPS)
    for i in range(n):
        t = i / FPS
        alpha = min(1, t / FADE, (HOLD - t) / FADE)
        alpha = max(0, alpha)
        card(label, title, sub, alpha).save(os.path.join(FR, f'f{frames:05d}.png'))
        frames += 1
print('frames', frames)
