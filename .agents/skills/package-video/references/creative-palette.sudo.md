# Creative Palette — freestyle beyond the floor

The card vocabulary is the floor. A good V1 also has 2-4 ideas invented FOR this video.
Read the transcript, decide what would make it engaging, PROPOSE to the user, then build.
Author freestyle cards via `composition.raw(hostHtml, timelineJs)` (own `data-track-index`)
or as a small separate composition. Match density to pace — never overcrowd.

```SudoLang
Palette {
  // load the relevant HyperFrames skill for the technique, then adapt into a raw() card.

  Emphasis (load hyperframes-animation) {
    sketchout | hand-drawn circle | marker sweep | underline | scribble | burst lines
      — animated emphasis on a word or code region. Livelier than the static highlight box;
        use for the punchiest moments. (The static highlight() is the safe default.)
    zoom-punch — briefly scale #video-wrap toward the highlighted region, then back.
  }
  Transitions (load hyperframes-animation) {
    wipe | reveal | crossfade | shader transition between major sections (e.g. teaching ->
      demo). Keep subtle on a screen-recording; a quick brand-yellow wipe reads well.
  }
  Typography & data (load hyperframes-creative) {
    kinetic typography for a hero principle (words fly/stagger in).
    data-in-motion: a tiny animated chart for a real number in the content
      (e.g. "issues found — you vs the AI agent": two bars count up).
    a thin progress / chapter-timeline bar along the bottom edge.
  }
  Audio (load hyperframes-media) {
    SFX: pop on card-in · ding on subscribe confirm · stamp on each recap check ·
      soft whoosh on a chapter swipe. Keep them quiet and sparse.
    BGM: a low bed under intro + outro only (never under dense talking).
    audio-reactive: a subtle pulse/glow on a card synced to the speaker's emphasis.
  }
  Stings (load hyperframes-animation adapters) {
    Lottie / Three.js / TypeGPU for a short branded intro sting or animated logo —
      reserve for the very top/outro; do not sprinkle 3D through a tutorial.
  }

  Constraints {
    Every freestyle idea is PROPOSED to the user before building (it's the engaging part,
      and taste varies). Build the floor reliably and layer freestyle on top.
    Respect the global Constraints (no em dashes, track layering, snapshot-verify, etc.).
    A raw() card still obeys the HyperFrames contract: single paused timeline, seek-safe,
      no Math.random()/Date.now(), no repeat:-1, build synchronously. See hyperframes-core.
  }
}
```

## Content-aware ideation cues
- Enumerations ("first… then… finally") → reviewRecap, or an animated numbered list / mermaid flow.
- A process described in steps → an animated diagram of the process (mermaid via hyperframes).
- Two things compared → a side-by-side or before/after reveal.
- A spoken number → stat tile or a count-up data-in-motion hit.
- A named tool/product → a small logo chip or term card.
- A strong one-liner → a kinetic-typography quote instead of the static quote card.
- A "watch this" / pointing moment on screen → highlight (static) or sketchout (animated).
