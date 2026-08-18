# ReactSquad — Brand Kit

Vendored into this repo on 2026-06-28 so the video skills can use one approved set of
brand assets. The source of truth is ReactSquad's website styles and approved brand material.
The brand name is **ReactSquad** (one word, capital R + S), not "RectSquad" or "React Squad."

## Logo

| File | What |
|---|---|
| `reactsquad-mark.png` | The atom/hex mark only (115×104, black on transparent). The canonical icon used in every approved ad. |
| `reactsquad-mark@4x.png` | Lanczos-upscaled to 460px wide, for 1080p+ panels. |
| `reactsquad-mark@4x-yellow.png` | Same, recolored to brand yellow `#F7CF4C`, for placing on dark/near-black backgrounds. |

No official vector wordmark is bundled. Build the wordmark from the word **ReactSquad** set
in Lexend Deca.

### Lockup (the `.brand-row` recipe from approved ads)
- Horizontal row: `[mark] [gap 14px] ReactSquad`, vertically centered.
- Mark sized ~44px tall next to 38px text (≈1.15× text height).
- Text: **Lexend Deca**, weight 500, `letter-spacing: -0.02em`, `line-height: 1`.
- On dark/near-black bg: yellow mark (`reactsquad-mark@4x-yellow.png`) + white text.
- On yellow bg: near-black mark (`reactsquad-mark.png`) + near-black text (`#0A0A0A`).

## Colors

| Token | Hex | Use |
|---|---|---|
| Brand yellow | `#F7CF4C` | Primary brand color — backgrounds, highlights. The signature. |
| Near-black (punch) | `#0A0A0A` | Preferred on yellow (deeper than `#111` for contrast). |
| Main black | `#111111` | Text / logo default. |
| Off-white | `#F6F6F6` | Light surface. |
| Accent blue | `#445DD8` | Accent. |
| Deep navy | `#111D43` | Secondary text / panels. |
| Accent green | `#7FE1AA` | Success / accent. |

**Signature pairing:** brand yellow `#F7CF4C` + near-black `#0A0A0A`.

## Fonts

- **Londrina Solid** (300/400/700/900) — bold display/headline face (big intro/outro/CTA).
- **Lexend Deca** (300–700) — the wordmark + UI sans (what the ads actually load).
- **Instrument Sans** (400–700) — primary body sans.
- **Caveat** (400–700) — handwritten accent (underline-script feel).

## Video treatments (one outro look — used only when a video HAS an outro)

Outros are **requested, not automatic**: podcast clips and podcast episodes usually have one; a
regular long-form video often has none. This is only the spec for **when** an outro is used — it
does not mean every video gets one.

**When a video does have an outro, it always uses the SAME look** (long-form, podcast, and clips
alike): the final frames of the video **blurred + darkened + slightly desaturated** behind a centered
ReactSquad lockup + CTA (the footage stays faintly visible; never a flat card, never a scrim over
sharp video). Canonical params: Gaussian **sigma/blur 28**, **brightness ×0.66** (ffmpeg `-0.34`),
**saturation 0.55**.
- **ffmpeg engines** (podcast-clips): `gblur=sigma=28,eq=brightness=-0.34:saturation=0.55` on the
  outro tail. Params live in `podcast/clips-style.json → outro`.
- **HyperFrames/CSS engines** (package-video long-form + podcast): `backdrop-filter: blur(28px)
  brightness(0.66) saturate(0.55)` on the outro scrim. Canonical file: `youtube-videos/outro/index.html`.

**Intro ("blurred-you" open, podcast/long-form).** Speaker opens blurred + darkened behind the title
card, then **crossfades blur → sharp** (~0.6s) as the title fades: `gblur=sigma=26,eq=brightness=-0.12`
(fast path: `scale=470:264,scale=1920:1080:flags=bilinear,eq=brightness=-0.12`).
