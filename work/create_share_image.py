from PIL import Image, ImageDraw, ImageFont, ImageFilter

source = Image.open('public/diwali-share-background.png').convert('RGB')
target = (1200, 630)
sw, sh = source.size
scale = max(target[0] / sw, target[1] / sh)
resized = source.resize((round(sw * scale), round(sh * scale)), Image.Resampling.LANCZOS)
left = (resized.width - target[0]) // 2
top = max(0, min(resized.height - target[1], round((resized.height - target[1]) * .25)))
image = resized.crop((left, top, left + target[0], top + target[1])).convert('RGBA')

# Keep the text readable at chat-preview size while retaining the original artwork.
shade = Image.new('RGBA', target, (0, 0, 0, 0))
shade_draw = ImageDraw.Draw(shade)
for x in range(0, 790):
    alpha = round(120 * (1 - x / 790) ** 1.7)
    shade_draw.line((x, 0, x, 630), fill=(16, 7, 23, alpha))
image = Image.alpha_composite(image, shade)

serif = r'C:\Windows\Fonts\georgiab.ttf'
serif_regular = r'C:\Windows\Fonts\georgia.ttf'
sans = r'C:\Windows\Fonts\segoeui.ttf'
title_font = ImageFont.truetype(serif, 58)
quote_font = ImageFont.truetype(serif_regular, 25)
from_font = ImageFont.truetype(sans, 17)
draw = ImageDraw.Draw(image)

title = 'Happy Diwali 2026'
tx, ty = 86, 208
glow = Image.new('RGBA', target, (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.text((tx, ty), title, font=title_font, fill=(255, 204, 113, 175), stroke_width=1)
glow = glow.filter(ImageFilter.GaussianBlur(13))
image = Image.alpha_composite(image, glow)
draw = ImageDraw.Draw(image)
draw.text((tx, ty), title, font=title_font, fill=(255, 243, 211, 255), stroke_width=1, stroke_fill=(255, 222, 158, 200))
draw.rounded_rectangle((88, 295, 162, 300), radius=2, fill=(255, 193, 91, 255))
draw.text((88, 322), '“May your life shine as brightly as', font=quote_font, fill=(255, 237, 213, 255))
draw.text((88, 357), 'the lights of Diwali.”', font=quote_font, fill=(255, 237, 213, 255))
draw.text((89, 421), '— JAYANTH G', font=from_font, fill=(255, 207, 134, 255), stroke_width=0)

image.convert('RGB').save('public/diwali-card-2026-v2.png', 'PNG', optimize=True)
