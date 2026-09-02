# Campaign prompts — models wearing the real mockups

Ready-to-paste prompts for every product on the site, where the model wears
the exact garment from the product page — cut, colour, and the printed
wordmark and back text — so the output is a finished ad, not a blank to
composite.

This complements `AD-PHOTOGRAPHY.md`. That document generates a blank and
adds the print in post, which is the safest route. This one asks the
generator to reproduce the print in the same pass, which only works when the
flat mockup is attached as a **reference image**. Text alone will not spell
"AMIRIANI" reliably; a reference image usually will.

## 1. What you attach

Every prompt takes the product's own mockup as its reference. These are the
files already on the store CDN; paste the URL where the tool asks for a
reference image, or download and upload it.

| Product | Front | Back |
| --- | --- | --- |
| Hoodie – Onyx | [front](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-oversized-hoodie-black-front-687016df3a1b6.jpg) | [back](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-oversized-hoodie-black-back-687016df3ad04.jpg) |
| Hoodie – Fog | [front](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-oversized-hoodie-athletic-heather-front-687596f9e2b8b.jpg) | [back](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-oversized-hoodie-athletic-heather-back-687596f9e3bdc.jpg) |
| Hoodie – Deep Blue | [front](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-oversized-hoodie-cobalt-front-6875934d1a302.jpg) | [back](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-oversized-hoodie-cobalt-back-6875934d1b76f.jpg) |
| Hoodie – Evergreen | [front](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-oversized-hoodie-pine-green-front-6875918488840.jpg) | [back](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-oversized-hoodie-pine-green-back-6875918489528.jpg) |
| Tee – Onyx | [front](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-organic-oversized-high-neck-t-shirt-black-front-687051d922b74.jpg) | [back](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-organic-oversized-high-neck-t-shirt-black-back-687051d923b83.jpg) |
| Tee – Midnight | [front](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-organic-oversized-high-neck-t-shirt-french-navy-front-68758ecf55805.jpg) | [back](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-organic-oversized-high-neck-t-shirt-french-navy-back-68758ecf58b79.jpg) |
| Tee – Stone | [front](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-organic-oversized-high-neck-t-shirt-heather-grey-front-68758fc388510.jpg) | [back](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-organic-oversized-high-neck-t-shirt-heather-grey-back-68758fc38a507.jpg) |
| Tee – Sandstone | [front](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-organic-oversized-high-neck-t-shirt-stone-front-68758df09fe6b.jpg) | [back](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-organic-oversized-high-neck-t-shirt-stone-back-68758df09e710.jpg) |
| Tee – Cloud | [front](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-organic-oversized-high-neck-t-shirt-white-front-68758c7f6cf41.jpg) | [back](https://cdn.shopify.com/s/files/1/0950/0645/8187/files/unisex-organic-oversized-high-neck-t-shirt-white-back-68758c7f6defd.jpg) |

Attach the **front** mockup for a front-facing shot and the **back** mockup
for a back shot. Attaching both at once confuses most tools about which side
is showing.

The chest mark is small in the mockup (about 6% of the image width). Tools
weight a reference by what is large in it, so for front shots also attach a
**tight crop of the chest mark** as a second reference — open the front
mockup, crop to roughly the wordmark plus a hand's width around it, save it.
That crop is what makes the lettering come out right.

## 2. What the garments actually are

Read off the mockups. This is what generators get wrong, so it is repeated
inside every prompt.

### The Oversized Hoodie

| | |
| --- | --- |
| **Cut** | Oversized, boxy, dropped shoulders, sleeves long enough to bunch at the wrist. Heavyweight brushed fleece, matte. Falls straight, no taper. |
| **Hood** | Lined pullover hood. **No drawstrings, no eyelets, no zip.** |
| **Pocket** | One large kangaroo pouch. |
| **Ribbing** | Wide ribbed cuffs and wide ribbed hem. |
| **Front print** | "AMIRIANI", a thin regular-weight serif in capitals, slightly letter-spaced, wearer's **left** chest, about 6–7 cm wide. Nothing else on the front. |
| **Back print** | "in silence we build." in a medium-weight serif, lowercase with the full stop, centred on the upper-middle back below the shoulder blades. Beneath it, small and centred, "I / MMXXV" in serif capitals with spaces around the slash. |
| **Colours** | Onyx: true black · Fog: athletic-heather light marled grey · Deep Blue: cobalt, a saturated royal blue · Evergreen: deep pine green, slightly blue |
| **Ink** | Light grey (near white) on Onyx, Deep Blue and Evergreen. Dark charcoal on Fog. |

### The Oversized Tee

| | |
| --- | --- |
| **Cut** | Oversized, boxy, dropped shoulders, short wide sleeves ending above the elbow, straight hem. 200 gsm organic combed cotton, a smooth heavy jersey with no shine. |
| **Neck** | **High neck**: a tall 1×1 ribbed collar that stands up like a low mock neck, noticeably taller than a normal crew. This is the detail that identifies the tee. |
| **Front print** | "AMIRIANI", same thin serif capitals, wearer's **left** chest, about 6 cm wide. Nothing else on the front. |
| **Back print** | "absence has shape." in a medium-weight serif, lowercase with the full stop, centred **high on the back just below the collar**, between the shoulder blades. Beneath it, small and centred, "I/MMXXV" in serif capitals with no spaces. |
| **Colours** | Onyx: true black · Midnight: french navy · Stone: heather grey, light marled · Sandstone: warm pale sand beige · Cloud: optic white |
| **Ink** | Light grey on Onyx and Midnight. Dark charcoal on Stone, Sandstone and Cloud. |

Note the two back prints sit at different heights: the hoodie's is mid-back,
the tee's is right under the collar.

## 3. Per-tool setup

The prompts below are written in Midjourney form. Everything before the
`--` flags is plain English and pastes into any tool.

| Tool | How to attach the mockup | Notes |
| --- | --- | --- |
| **Midjourney V7** | `--oref <mockup-url> --ow 400` | Omni-reference. `--ow` 300–500 keeps the garment; above 600 it starts copying the flat-lay pose. Add `--style raw --v 7`. |
| **Midjourney V6.1** | `--cref <mockup-url> --cw 100` | Character reference tolerates garments reasonably. Weaker on lettering than V7. |
| **Flux Kontext (Pro/Max)** | Upload the mockup as the input image | Kontext is an editor: phrase it as *"Put this exact garment on a man …"* followed by the scene. Strongest tool for keeping the print legible. |
| **GPT Image (ChatGPT)** | Attach the mockup to the message | Say *"Use the attached product photo as the exact garment, including the printed text."* Very good at text, sometimes softens the fabric weight. |
| **Gemini 2.5 Flash Image** | Attach the mockup | Same phrasing as GPT Image. Fast for iterating scenes. |
| **Adobe Firefly Image 4** | Composition reference + style reference = the mockup | Weakest on lettering of the five. Expect to retouch the mark. |
| **Ideogram 3** | Style reference = the mockup | Best raw text rendering, weakest on garment fit. Useful for back shots where the text is the subject. |

Drop the `--ar`, `--style`, `--v` and reference flags for anything that is not
Midjourney. Where a tool has a negative-prompt field, use the block in §6.

## 4. The prompts

Every prompt has four parts, in this order: the reference instruction, the
garment lock, the print, the scene. Keep that order; tools weight the start
of the prompt most.

Aspect ratios: `--ar 4:5` for feed posts and the site hero, `--ar 9:16` for
stories, `--ar 1:1` for product-grid crops. All prompts are 4:5; change the
flag.

### The Oversized Hoodie

#### Onyx — front

```
Editorial fashion photograph of a young man wearing exactly the hoodie in
the reference image. Oversized heavyweight true-black hoodie, boxy drop-
shoulder cut, lined hood with no drawstrings, one large kangaroo pocket,
wide ribbed cuffs and hem, matte brushed fleece. A small thin serif
wordmark reading "AMIRIANI" in light grey capitals sits on the wearer's
left chest; nothing else printed on the front. He stands three-quarters to
camera on the landing of a bare concrete stairwell, hood down, hands in
the pocket, morning light from one high window, raw grey concrete, no
signage. Calm, looking past the lens. Shallow depth of field, 85mm, Kodak
Portra 400, natural skin. Subject right of centre, empty wall upper left.
--ar 4:5 --style raw --v 7 --oref <hoodie-onyx-front-url> --ow 400
```

#### Onyx — back

```
Editorial fashion photograph of a young man seen from behind, wearing
exactly the hoodie in the reference image. Oversized heavyweight true-
black hoodie, boxy drop-shoulder cut, lined hood down and resting flat
between the shoulders, no drawstrings, wide ribbed cuffs and hem, matte
brushed fleece. Printed on the upper-middle back in light grey serif
lowercase: "in silence we build." with a full stop, and beneath it in
small serif capitals "I / MMXXV". The text is centred, level and fully
legible. He stands still in an unfurnished apartment facing a white wall,
window light from the left, oak floorboards. 85mm, Kodak Portra 400,
muted, quiet. Subject centred, back print in the middle of the frame.
--ar 4:5 --style raw --v 7 --oref <hoodie-onyx-back-url> --ow 450
```

#### Fog — front

```
Editorial fashion photograph of a young man wearing exactly the hoodie in
the reference image. Oversized heavyweight athletic-heather light marled
grey hoodie, boxy drop-shoulder cut, lined hood with no drawstrings, one
large kangaroo pocket, wide ribbed cuffs and hem, matte brushed fleece. A
small thin serif wordmark reading "AMIRIANI" in dark charcoal capitals
sits on the wearer's left chest; nothing else printed on the front. He
stands waist-deep in dry late-summer grass, three-quarter view, hood up,
hands in the pocket, overcast northern light, straw gold and soft grey.
Calm, looking just past the camera. Shallow depth of field, 85mm, Kodak
Portra 400, natural skin. Subject lower right, open sky and grass upper
left for a headline.
--ar 4:5 --style raw --v 7 --oref <hoodie-fog-front-url> --ow 400
```

#### Fog — back

```
Editorial fashion photograph of a young man walking away from camera,
wearing exactly the hoodie in the reference image. Oversized heavyweight
athletic-heather light marled grey hoodie, boxy drop-shoulder cut, lined
hood down, no drawstrings, wide ribbed cuffs and hem, matte brushed
fleece. Printed on the upper-middle back in dark charcoal serif
lowercase: "in silence we build." with a full stop, and beneath it in
small serif capitals "I / MMXXV". Text centred, level, fully legible. A
path through pale dune grass under a flat grey North Sea sky, wind in the
fabric, figure medium-close so the print reads. 85mm, Kodak Portra 400.
--ar 4:5 --style raw --v 7 --oref <hoodie-fog-back-url> --ow 450
```

#### Deep Blue — front

```
Editorial fashion photograph of a young man wearing exactly the hoodie in
the reference image. Oversized heavyweight cobalt royal-blue hoodie, boxy
drop-shoulder cut, lined hood with no drawstrings, one large kangaroo
pocket, wide ribbed cuffs and hem, matte brushed fleece. A small thin
serif wordmark reading "AMIRIANI" in light grey capitals sits on the
wearer's left chest; nothing else printed on the front. He sits on the
floor of an unfurnished apartment against a white wall, knees drawn in,
hood up, window light from the left, oak floorboards, the hoodie's volume
and ribbed hem prominent. Calm. 85mm, Kodak Portra 400, muted palette so
the blue is the only saturated colour. Subject lower centre.
--ar 4:5 --style raw --v 7 --oref <hoodie-deep-blue-front-url> --ow 400
```

#### Deep Blue — back

```
Editorial fashion photograph of a young man seen from behind, wearing
exactly the hoodie in the reference image. Oversized heavyweight cobalt
royal-blue hoodie, boxy drop-shoulder cut, lined hood down and flat
between the shoulders, no drawstrings, wide ribbed cuffs and hem, matte
brushed fleece. Printed on the upper-middle back in light grey serif
lowercase: "in silence we build." with a full stop, and beneath it in
small serif capitals "I / MMXXV". Text centred, level, fully legible. He
stands on the landing of a bare concrete stairwell facing a high window,
morning light, raw grey concrete. 85mm, Kodak Portra 400. Subject centred.
--ar 4:5 --style raw --v 7 --oref <hoodie-deep-blue-back-url> --ow 450
```

#### Evergreen — front

```
Editorial fashion photograph of a young man wearing exactly the hoodie in
the reference image. Oversized heavyweight deep pine-green hoodie, boxy
drop-shoulder cut, lined hood with no drawstrings, one large kangaroo
pocket, wide ribbed cuffs and hem, matte brushed fleece. A small thin
serif wordmark reading "AMIRIANI" in light grey capitals sits on the
wearer's left chest; nothing else printed on the front. He stands at the
edge of dry late-summer grass with a line of dark trees behind, three-
quarter view, hood down, hands in the pocket, overcast light. Calm,
looking past the lens. 85mm, Kodak Portra 400, straw gold, grey and the
green. Subject right of centre, quiet space upper left.
--ar 4:5 --style raw --v 7 --oref <hoodie-evergreen-front-url> --ow 400
```

#### Evergreen — back

```
Editorial fashion photograph of a young man seen from behind, wearing
exactly the hoodie in the reference image. Oversized heavyweight deep
pine-green hoodie, boxy drop-shoulder cut, lined hood down and flat
between the shoulders, no drawstrings, wide ribbed cuffs and hem, matte
brushed fleece. Printed on the upper-middle back in light grey serif
lowercase: "in silence we build." with a full stop, and beneath it in
small serif capitals "I / MMXXV". Text centred, level, fully legible. He
stands in an unfurnished apartment facing a white wall, window light from
the left, oak floorboards. 85mm, Kodak Portra 400, muted. Subject centred.
--ar 4:5 --style raw --v 7 --oref <hoodie-evergreen-back-url> --ow 450
```

### The Oversized Tee

#### Onyx — front

```
Editorial fashion photograph of a young man wearing exactly the T-shirt
in the reference image. Oversized heavyweight true-black organic cotton
tee, boxy drop-shoulder cut, short wide sleeves ending above the elbow,
straight hem, and a tall ribbed high neck that stands up like a low mock
neck. A small thin serif wordmark reading "AMIRIANI" in light grey
capitals sits on the wearer's left chest; nothing else printed on the
front. He stands three-quarters to camera in an unfurnished apartment
against a white wall, window light from the left, oak floorboards. Calm,
looking past the lens. Shallow depth of field, 85mm, Kodak Portra 400,
natural skin. Subject right of centre, empty wall upper left.
--ar 4:5 --style raw --v 7 --oref <tee-onyx-front-url> --ow 400
```

#### Onyx — back

```
Editorial fashion photograph of a young man seen from behind, wearing
exactly the T-shirt in the reference image. Oversized heavyweight true-
black organic cotton tee, boxy drop-shoulder cut, short wide sleeves,
tall ribbed high neck. Printed high on the back just below the collar,
between the shoulder blades, in light grey serif lowercase: "absence has
shape." with a full stop, and directly beneath it in small serif capitals
"I/MMXXV". Text centred, level, fully legible. He stands on the landing
of a bare concrete stairwell facing a high window, morning light, raw
grey concrete. 85mm, Kodak Portra 400. Subject centred, framed from the
hips up so the print is large.
--ar 4:5 --style raw --v 7 --oref <tee-onyx-back-url> --ow 450
```

#### Midnight — front

```
Editorial fashion photograph of a young man wearing exactly the T-shirt
in the reference image. Oversized heavyweight french-navy organic cotton
tee, boxy drop-shoulder cut, short wide sleeves ending above the elbow,
straight hem, and a tall ribbed high neck that stands up like a low mock
neck. A small thin serif wordmark reading "AMIRIANI" in light grey
capitals sits on the wearer's left chest; nothing else printed on the
front. He sits on the top step of a bare concrete stairwell, elbows on
knees, morning light from one high window. Calm, looking past the lens.
85mm, Kodak Portra 400, muted grey and navy. Subject lower right.
--ar 4:5 --style raw --v 7 --oref <tee-midnight-front-url> --ow 400
```

#### Midnight — back

```
Editorial fashion photograph of a young man seen from behind, wearing
exactly the T-shirt in the reference image. Oversized heavyweight french-
navy organic cotton tee, boxy drop-shoulder cut, short wide sleeves, tall
ribbed high neck. Printed high on the back just below the collar, between
the shoulder blades, in light grey serif lowercase: "absence has shape."
with a full stop, and directly beneath it in small serif capitals
"I/MMXXV". Text centred, level, fully legible. He faces a white wall in an
unfurnished apartment, window light from the left. 85mm, Kodak Portra
400. Subject centred, framed from the hips up.
--ar 4:5 --style raw --v 7 --oref <tee-midnight-back-url> --ow 450
```

#### Stone — front

```
Editorial fashion photograph of a young man wearing exactly the T-shirt
in the reference image. Oversized heavyweight heather-grey light marled
organic cotton tee, boxy drop-shoulder cut, short wide sleeves ending
above the elbow, straight hem, and a tall ribbed high neck that stands up
like a low mock neck. A small thin serif wordmark reading "AMIRIANI" in
dark charcoal capitals sits on the wearer's left chest; nothing else
printed on the front. He stands waist-deep in dry late-summer grass,
three-quarter view, overcast northern light, straw gold and soft grey.
Calm, looking just past the camera. 85mm, Kodak Portra 400, natural skin.
Subject lower right, open sky upper left.
--ar 4:5 --style raw --v 7 --oref <tee-stone-front-url> --ow 400
```

#### Stone — back

```
Editorial fashion photograph of a young man seen from behind, wearing
exactly the T-shirt in the reference image. Oversized heavyweight heather-
grey light marled organic cotton tee, boxy drop-shoulder cut, short wide
sleeves, tall ribbed high neck. Printed high on the back just below the
collar, between the shoulder blades, in dark charcoal serif lowercase:
"absence has shape." with a full stop, and directly beneath it in small
serif capitals "I/MMXXV". Text centred, level, fully legible. He walks
away along a path through pale dune grass under a flat grey sky, framed
medium-close from the hips up. 85mm, Kodak Portra 400.
--ar 4:5 --style raw --v 7 --oref <tee-stone-back-url> --ow 450
```

#### Sandstone — front

```
Editorial fashion photograph of a young man wearing exactly the T-shirt
in the reference image. Oversized heavyweight warm pale-sand beige
organic cotton tee, boxy drop-shoulder cut, short wide sleeves ending
above the elbow, straight hem, and a tall ribbed high neck that stands up
like a low mock neck. A small thin serif wordmark reading "AMIRIANI" in
dark charcoal capitals sits on the wearer's left chest; nothing else
printed on the front. He stands against a raw lime-plaster wall, three-
quarter view, soft window light from the left, tone-on-tone sand and
plaster. Calm, looking past the lens. 85mm, Kodak Portra 400. Subject
right of centre.
--ar 4:5 --style raw --v 7 --oref <tee-sandstone-front-url> --ow 400
```

#### Sandstone — back

```
Editorial fashion photograph of a young man seen from behind, wearing
exactly the T-shirt in the reference image. Oversized heavyweight warm
pale-sand beige organic cotton tee, boxy drop-shoulder cut, short wide
sleeves, tall ribbed high neck. Printed high on the back just below the
collar, between the shoulder blades, in dark charcoal serif lowercase:
"absence has shape." with a full stop, and directly beneath it in small
serif capitals "I/MMXXV". Text centred, level, fully legible. He stands
in dry late-summer grass facing away, overcast light, straw gold. 85mm,
Kodak Portra 400. Subject centred, framed from the hips up.
--ar 4:5 --style raw --v 7 --oref <tee-sandstone-back-url> --ow 450
```

#### Cloud — front

```
Editorial fashion photograph of a young man wearing exactly the T-shirt
in the reference image. Oversized heavyweight optic-white organic cotton
tee, boxy drop-shoulder cut, short wide sleeves ending above the elbow,
straight hem, and a tall ribbed high neck that stands up like a low mock
neck. A small thin serif wordmark reading "AMIRIANI" in dark charcoal
capitals sits on the wearer's left chest; nothing else printed on the
front. He stands on the landing of a bare concrete stairwell, three-
quarter view, morning light from one high window, the white tee bright
against raw grey concrete. Calm, looking past the lens. 85mm, Kodak
Portra 400, natural skin. Subject right of centre, empty wall upper left.
--ar 4:5 --style raw --v 7 --oref <tee-cloud-front-url> --ow 400
```

#### Cloud — back

```
Editorial fashion photograph of a young man seen from behind, wearing
exactly the T-shirt in the reference image. Oversized heavyweight optic-
white organic cotton tee, boxy drop-shoulder cut, short wide sleeves,
tall ribbed high neck. Printed high on the back just below the collar,
between the shoulder blades, in dark charcoal serif lowercase: "absence
has shape." with a full stop, and directly beneath it in small serif
capitals "I/MMXXV". Text centred, level, fully legible. He faces a white
wall in an unfurnished apartment, window light from the left, oak
floorboards. 85mm, Kodak Portra 400. Subject centred, framed from the
hips up.
--ar 4:5 --style raw --v 7 --oref <tee-cloud-back-url> --ow 450
```

## 5. Swapping scenes

Each prompt above was given one scene so the set has variety. Any scene
goes with any garment: replace the sentence that starts with "He …" and
keep everything else.

- **Field** — `He stands waist-deep in dry late-summer grass, three-quarter view, overcast northern light, straw gold and soft grey.`
- **Stairwell** — `He stands on the landing of a bare concrete stairwell, morning light from one high window, raw grey concrete, no signage.`
- **Apartment** — `He sits on the floor of an unfurnished apartment against a white wall, knees drawn in, window light from the left, oak floorboards.`
- **Dunes** — `He walks away along a path through pale dune grass under a flat grey North Sea sky, wind in the fabric.`
- **Plaster wall** — `He stands against a raw lime-plaster wall, soft window light from the left, no props.`

For a woman or a second model, change "young man" to "young woman" and
nothing else; the garments are unisex and the cut reads the same.

For the **site hero**, use the Fog front prompt and add at the end:
`Subject in the lower right third; the upper left half of the frame is
empty grass and sky with no detail, for a headline.` Then crop per §3 of
`AD-PHOTOGRAPHY.md`.

## 6. Negative prompt

```
drawstrings, eyelets, zipper, second pocket, crew neck, v-neck, fitted,
tapered, slim fit, tucked in, glossy fabric, satin, extra logo, chest
logo on the right, large centred logo, misspelled text, garbled letters,
extra words, studio backdrop, harsh flash, smiling, sunglasses,
jewellery, hat, HDR, oversaturated, watermark
```

For Midjourney use `--no drawstrings, zipper, crew neck, extra logo,
garbled text, sunglasses, jewellery`.

## 7. Check every output

The reference image gets the garment right most of the time. The lettering
is the part to check, every single image, before it goes anywhere:

1. **Spelling.** A-M-I-R-I-A-N-I, eight letters, ends in I not N. Zoom in.
2. **Side.** Wearer's left chest, so it appears on the **right** side of
   the frame when the model faces you.
3. **Size.** Small. If it is wider than the model's hand, it is wrong.
4. **Back text.** Exact words, lowercase, full stop present, the date line
   beneath it. Hoodie: mid-back, "I / MMXXV" with spaces. Tee: just below
   the collar, "I/MMXXV" without.
5. **Neck.** Tee collar stands up. A flat crew neck is a different product.
6. **Hood.** No cords hanging down.

If only the lettering is off, do not regenerate the whole image. Select the
mark and inpaint it with the same tool (Midjourney "Vary Region", Kontext
"replace the chest text with …", Firefly "Generative Fill") using the
chest-crop reference. That is a one-minute fix and keeps the shot.

If the cut or the neck is off, regenerate. Raise `--ow` by 100 (Midjourney)
or lead the prompt with "Keep the garment identical to the reference
image" (Kontext, GPT Image).
