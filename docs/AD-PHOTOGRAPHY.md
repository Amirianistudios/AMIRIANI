# Advertising imagery — brief and prompts

How to get campaign images where the hoodie is *the* hoodie, not an
approximation of one.

## 1. The garment, exactly

Read off the product mockups. Every prompt below repeats this, because it is
what generators get wrong.

| | |
| --- | --- |
| **Cut** | Oversized, boxy, dropped shoulders, sleeves slightly long. Heavyweight brushed fleece. Falls straight, no taper. |
| **Hood** | Lined pullover hood, **no drawstrings, no eyelets, no zip**. |
| **Pocket** | One large kangaroo pouch across the front. |
| **Ribbing** | Wide ribbed cuffs and wide ribbed hem. |
| **Colours** | Onyx (true black) · Fog (athletic heather — light marled grey) · Deep Blue (cobalt) · Evergreen (pine green) |
| **Front mark** | "AMIRIANI" in a thin serif, wearer's **left** chest, about 6–7 cm wide. Dark on Fog, light grey on Onyx. Nothing else on the front. |
| **Back print** | "in silence we build." in serif, centred between the shoulder blades, with "I / MMXXV" beneath it in small caps. |

## 2. The rule that makes it identical

**Generate the hoodie blank. Add the marks in post.**

AI text is always wrong — the current hero reads "AMIRIAN" with a broken last
letter, at twice the real size, in the wrong place. So every prompt asks for a
plain chest and a plain back, and the wordmark goes on afterwards:

1. Export the mark as a vector (the site has it as text in Libre Baskerville).
2. In Photoshop: place it on the chest, Filter → Distort → Displace using a
   desaturated copy of the fabric as the map, blend mode Multiply on Fog /
   Screen on Onyx, opacity ~85%, 0.5px gaussian blur.
3. Same for the back print.

If the generator supports reference images, also feed it the flat mockup
(Midjourney `--cref` or omni-reference; Flux Kontext; Firefly structure
reference). That holds colour, fit and pocket. Still composite the text.

To skip the compositing and have the print come out of the generator in one
pass — every product, front and back, with its mockup attached as the
reference — use `AD-PROMPTS-MOCKUPS.md` instead. It trades some reliability
for zero post-work, and says what to check on each image.

## 3. The hero crop

The hero source is portrait, 4:5 (1600×2000). The site crops it with
`object-fit: cover`:

- **Desktop 1440px** — shown as a band about 1440×756, so the top and bottom
  ~30% of the portrait are cut off.
- **Mobile 390px** — shown about 390×410, close to square; the sides are cut.

So compose for the **middle half of the frame**: subject and any clean space
for the headline must sit there, or one crop loses the face and the other
loses the text. Leave the headline zone empty of detail — the current image
puts the text across the model's eyes.

## 4. Master prompt

Midjourney form. Drop the flags for Flux, Firefly or DALL·E and paste the
negatives into the negative field where one exists.

```
Editorial fashion photograph. A young man, early twenties, lying back in tall
dry summer grass, hood up, calm, looking just past the camera. He wears an
oversized heavyweight athletic-heather grey hoodie: boxy drop-shoulder cut,
lined hood with no drawstrings, one large kangaroo pocket, wide ribbed cuffs
and hem, plain chest with no print or logo, matte brushed fleece. Overcast
northern light, soft and directionless. Muted palette: straw gold, soft grey,
skin. Shallow depth of field, 85mm, Kodak Portra 400, natural skin, no
retouching. Quiet, still, understated luxury. Subject placed in the lower
right; open grass in the upper left for a headline. --ar 4:5 --style raw
--v 6.1 --cref <mockup-url> --cw 100
```

**Negative prompt**

```
text, logo, lettering, drawstrings, eyelets, zipper, graphic print,
glossy fabric, studio lighting, harsh shadows, smiling, extra hands,
jewellery, sunglasses, HDR, oversaturated
```

Swap the colour line for the other three:

- `oversized heavyweight true-black hoodie` — Onyx
- `oversized heavyweight cobalt-blue hoodie` — Deep Blue
- `oversized heavyweight pine-green hoodie` — Evergreen

## 5. Scenes

Same garment spec and negatives every time. Only the world changes.

**A. The field, done properly** — replaces the current hero.
```
…standing waist-deep in dry late-summer grass, three-quarter view, hands in
the kangaroo pocket so it reads, hood up, overcast, straw gold and grey,
subject right of centre, empty sky and grass upper left…
```

**B. Brutalist stairwell** — the "built in silence" side of the brand.
```
…seated on the landing of a bare concrete stairwell, morning light from a
single high window, raw grey concrete, no people, no signage, hood down,
back three-quarters to camera so the shoulders and plain back read…
```
(Composite the back print on this one.)

**C. Empty apartment**
```
…sitting on the floor of an unfurnished apartment against a white wall,
window light from the left, oak floorboards, hood up, knees drawn in,
the hoodie's volume and ribbed hem prominent…
```

**D. North Sea dunes**
```
…walking away from camera along a path through pale dune grass under a
flat grey sky, wind in the fabric, small in the frame, plain back to camera…
```

**E. Product-only, for ads**
```
Still-life product photograph. An oversized heavyweight athletic-heather
hoodie on a thin black wooden hanger against a raw lime-plaster wall, soft
window light from the left, plain chest, wide ribbed hem visible, no props.
--ar 4:5 --style raw
```

## 6. What to reject

Throw the image away if any of these appear, however good the light is:
drawstrings, a zip, a second pocket, a printed logo of any kind, a hood that
is not lined, ribbing narrower than the cuff of a normal sweatshirt, a fitted
or tapered body, shine on the fabric.
