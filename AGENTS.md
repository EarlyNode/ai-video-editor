# AI Video Editor

Pipeline workspace for turning raw recordings into published-ready videos and social clips.

## Brands

Brand kits live in `brands/<Brand>/`; generic/non-branded assets in `brands/general/`.

**ReactSquad** (`brands/ReactSquad/`) — `BRAND.md` (palette/lockup), `reactsquad-mark*.png`,
`fonts/` (Lexend Deca, Instrument Sans, Londrina Solid). On-screen assets are grouped by where
they're used:
- `podcast/` — the **Ask Better Questions podcast** show kit (multicam, ffmpeg-composited PNG
  layers/overlays): `intro/` (animated title card), `nameplates/` (ignored episode-specific
  lower-thirds and previews), and `side-by-side/` (2-up panel + tile mask). Generate each
  nameplate locally with the guest's name and role.
- `youtube-videos/` — kit for **general YouTube videos**: HyperFrames graphic-overlay **templates**
  (each folder = `index.html` + `fonts/` + `reactsquad-mark.png` + `vendor/gsap`; supply your own
  `input-video.mp4` and render): `intro-letterbox/`, `outro/` ("Visit ReactSquad.io" CTA),
  `info-cards/{quote,stat,term}/`, `chapters/` (+ `youtube-chapters-example.txt`).

**general** (`brands/general/`) — `subscribe/`: YouTube subscribe animation; generic mechanism,
swap the channel avatar/name (currently ReactSquad's).

Brand yellow `#F7CF4C` + near-black `#0A0A0A`; wordmark "ReactSquad" in Lexend Deca. Use these
instead of re-deriving.

## Skills

Skill bodies are written in [SudoLang](https://github.com/paralleldrive/sudolang/blob/main/sudolang.sudo.md). In-house skills keep local names (no `aidd-` prefix) even though they follow the aidd structure.

Whenever you create a new skill or tweak an existing one, use the **skill-creating** skill
(`.agents/skills/skill-creating/`).

Each skill's own `description` (in the skills list) covers what it does and when — not duplicated
here. What matters is how they chain:

- **In-house editing** (local names, `.agents/skills/`): long-form flow is **rough-cut → package-video**;
  **podcast** builds the long-form V1 from per-speaker tracks; **podcast-clips** cuts short-form vertical
  clips from a finished episode; **make-clips-legacy** is parked (superseded by podcast-clips).
- **HyperFrames bundle** (`heygen-com/hyperframes`, the HTML video engine the above build on):
  engine — `hyperframes` · `hyperframes-core` · `hyperframes-animation` · `hyperframes-creative` ·
  `hyperframes-media` · `hyperframes-cli` · `hyperframes-registry`; creation workflows —
  `general-video` · `product-launch-video` · `website-to-video` · `faceless-explainer` · `pr-to-video` ·
  `music-to-video` · `motion-graphics` · `slideshow` · `embedded-captions` · `graphic-overlays` ·
  `remotion-to-hyperframes`.

## Conventions

```SudoLang
Conventions {
  ProjectLayout: projects/YYYY-MM-DD_<name>/ {
    raw/          // untouched copies of the sources
    audio/ transcripts/ cuts|clips/ output/   // output/: final.mp4 (rough-cut), packaged-v1.mp4 (package-video)
    overlays/     // package-video work dir: the composition driver + public/ + renders
    project.json  // source list + parameters
    costs.json    // every transcription API call (audio seconds, est. USD)
    important-notes.md  // unexecuted editor instructions, judgment calls, and any
                        // pre-publish notes (e.g. secrets/names) SPECIFIC TO THIS RECORDING.
                        // package-video reads this for DIRECTOR CUES ONLY ("show animation
                        // here", "highlight this") that rough-cut cut from final.mp4 — it must
                        // NOT carry this file's per-recording publish warnings onto its output.
  }
  Constraints {
    NEVER modify the original recordings (e.g. in ~/Videos/, ~/Downloads/).
      Always cp into projects/<p>/raw/ and verify byte counts; everything
      downstream is recomputable from raw/.
    Scripts are TypeScript run with Bun, zero npm dependencies, living in
      .agents/skills/<skill>/scripts/ (shared helpers: rough-cut/scripts/lib.ts).
      Run from the repo root so Bun auto-loads .env.
    .env at repo root holds ELEVENLABS_API_KEY (Scribe batch STT,
      $0.22/audio-hour). Never commit it.
    Transcription must stay VERBATIM (fillers included) — that's why Scribe v2
      and not Whisper/gpt-4o-transcribe (Whisper drops fillers; gpt-4o has no
      word timestamps). Scribe also diarizes (diarize=true) for multi-speaker
      sources — speaker labels come back anonymous (speaker_0…), naming them
      is agent inference from content, confirmed by the user.
  }
}
```
