---
name: package-video
description: Add a branded graphic-overlay pass to a rough-cut talking-head or screen-recording video to produce a publish-ready "V1" — transcript-anchored chapters, term/tip/quote cards, one-line karaoke captions, count-up stat strips, a cumulative review recap, on-screen code-highlight annotations, plus an intro lower-third, a mid-roll subscribe animation, and an outro CTA. Reads the transcript to IDEATE engaging graphics tailored to the content and pulls from the HyperFrames creative palette. Use after rough-cut, when the user wants to dress up, annotate, package, or "make a V1 of" a finished video with synced graphics and YouTube chapters.
---

# Package Video (V1)

Roleplay as a top-tier motion-graphics editor: turn a rough cut into a publish-ready,
engaging V1. The bundled card library is the reliable floor; read the content and build
something worth watching on top of it. When in doubt, propose to the user.

```SudoLang
PackageVideo {
  State {
    repoRoot      // run commands from here
    skillDir = ".claude/skills/package-video"
    projectDir    // the rough-cut project: has output/final.mp4 + transcripts/_final*.json
    workDir = "$projectDir/overlays/full"   // driver + public/ + renders live here
    brand = REACTSQUAD   // default; swap via BrandKit for other brands
    plan          // the agreed card data table (chapters + cards + creative ideas)
  }

  Pipeline: rough-cut final.mp4  ->  [package-video]  ->  output/packaged-v1.mp4 (+ youtube-chapters.txt)

  // ── reliable FLOOR: components.ts builders (details: references/components.sudo.md) ──
  CardVocabulary {
    intro          // brand lower-third: mark + name + role
    chapter(n,T,title)  // numbered chip; titles+timestamps ARE the YouTube description
    term | tip     // define jargon / give actionable advice, anchored to the moment
    quote          // the memorable principles, as pull-quotes
    stat(T,tiles)  // count-up tiles for numbers the speaker rattles off
    reviewRecap(n,T,items)  // cumulative checklist: prior greyed/checked, current highlighted
    highlight      // box on EXACT code/region — see references/highlight.sudo.md
    karaoke        // ONE centered line at a time for the 2-3 key opening sentences
    skipButton | subscribe | outro
  }

  // ── FREESTYLE: ideate per-transcript; build on the floor with ideas for this video ──
  CreativePalette {
    The video should be ENGAGING. After reading the transcript, invent graphics that fit
    THIS content, then propose them. Pull from HyperFrames:
    load(hyperframes-animation) for { marker sweeps · hand-drawn circles · scribble ·
      sketchout (animated emphasis on code/words, livelier than a static box) · burst
      lines · scene transitions (wipe/reveal/shader) · Lottie/Three.js/TypeGPU stings }
    load(hyperframes-creative) for { kinetic typography · data-in-motion (mini charts,
      e.g. "issues found: human vs AI") · beat-direction · audio-reactive pulses/glow ·
      house-style · typography }
    load(hyperframes-media) for { SFX (pop on card-in, ding on subscribe, stamp on a
      recap check, whoosh on chapter swipe) · subtle BGM under intro/outro · beat sync }
    Author freestyle cards in the driver via composition.raw(hostHtml, timelineJs), or
    as their own small composition — components.ts does not constrain you.
    Ideas worth proposing for tutorials/dev content: animated mermaid diagram of a
    process; before/after code-diff reveal; zoom-punch on the highlighted code; a running
    progress/timeline bar; a "score" tally. Match density to pace — don't overcrowd.
  }

  Constraints {
    NEVER modify final.mp4 or the original — emit a NEW output/packaged-v1.mp4.
    Anchor EVERY card to an exact transcript phrase. "around 4:09" / "when I mention X"
      => search the transcript for the phrase and use its real seconds. Never approximate.
    No em dashes (—) in any on-screen copy or chapter title — reword with colon/period/
      comma (arrows → are fine). grep "—" public/index.html must be 0 before rendering.
    Keep copy in the speaker's authentic voice; offer it, let the user rewrite stiff lines.
    Layout: info cards bottom-LEFT (clear of a bottom-right webcam); quotes/outro/karaoke
      CENTERED. Karaoke = one centered line at a time, SEQUENCED with the name card in the
      spoken gap between sentences — never overlapping.
    Place subscribe AFTER any skippable section (so skippers still see it).
    Simultaneously-visible cards => different data-track-index (else lint:
      overlapping_clips_same_track).
    Generate the composition from a DATA TABLE driver that imports components.ts — NEVER
      hand-author dozens of cards inline.
    Snapshot-verify each NEW card cropped to ITS region before the ~20-min full render
      (don't mistake adjacent UI like a dark terminal for your card).
    Render gotchas are load-bearing => references/render-gotchas.sudo.md. Use render-verify.ts;
      it GATES on frame count, never on the "completed" message.
    If you cut the video (e.g. a duplicate retake rough-cut missed) => re-transcribe the cut
      video and re-derive ALL downstream timestamps (they shift by the removed duration).
    Honor in-video DIRECTOR CUES ("show animation here", "highlight this", "add a card") —
      rough-cut cut these out, so recover them from important-notes.md + the raw transcripts
      and act on them (see /understand). Never silently miss an explicit request.
    Aim for an engaging result. Propose creative options and ask for feedback when unsure,
      and iterate on rendered clips.
    require ffmpeg, ffprobe, bun, npx hyperframes on PATH.
  }

  BrandKit {
    Default REACTSQUAD (assets/: Instrument Sans, reactsquad-mark.png; yellow #F7CF4C,
      ink #0A0A0A). For another brand: capture with the website-to-video skill (Step 0),
      verify colors/fonts/logo, then pass a new Brand object to createComposition().
    Caveat: a site's "logo-*.svg" may be a customer logo — verify the real mark.
  }

  /understand {
    Read transcripts/_final*.json (word-level) + watch the intent. Note: the topic, the
    natural chapter boundaries, the jargon to define, the memorable lines, any spoken
    numbers, any enumerations (=> reviewRecap), any code moments to highlight, the opening
    sentences (=> karaoke), and the closing line (=> outro entry).

    THEN recover IN-VIDEO DIRECTOR CUES — the speaker talking to the editor: "show an
    animation here", "highlight this", "zoom in", "put a title/card here", "add a diagram",
    "make this big". rough-cut treats these as editorInstructions and CUTS them, so they are
    NOT in final.mp4 or _final.json. Recover them from:
      - $projectDir/important-notes.md (rough-cut logs cut editor instructions there), and
      - the RAW per-clip transcripts transcripts/<clip>.json (scan for the cue phrases).
    For each cue, locate its spot on the FINAL timeline: take the words spoken just
    before/after the cue (they survived the cut) and find them in _final.json to get the
    real seconds. These are EXPLICIT requests — honor them (or propose how you'll fulfill
    each). Surface anything ambiguous to the user.

    important-notes.md is PER-RECORDING. Mine it for DIRECTOR CUES ONLY. Its "review before
    publishing" / secrets / names / Signal warnings describe THAT specific recording — do NOT
    apply them to your output or report them as a rough edge, and never claim a video needs
    blurring/scrubbing unless THIS video's own content shows it. If there are no cut cues
    (e.g. an isolated rebuild from just final.mp4 + _final.json), the file adds nothing here.
  }

  /ideate {
    Produce a graphics PLAN: chapter splits (transcript-anchored, themed; titles double as
    the YouTube description) + a card table (floor cards) + 2-4 FREESTYLE ideas from the
    CreativePalette tailored to this video. PRESENT it to the user with timestamps and copy;
    iterate until approved. This is the creative gate — do not skip it.
  }

  /build {
    Write $workDir/build.ts that imports skillDir/scripts/components.ts, lays out the agreed
    cards (and any raw() freestyle blocks), and emits public/index.html. Stage assets
    (fonts, mark, gsap) into public/. `bun build.ts` ; `npx hyperframes lint public` (0 errors;
    overlapping-tween warnings are ok). Snapshot-verify new cards (crop to region).
  }

  /render {
    Encode the (possibly re-cut) source to a dense GOP into public/input-video.mp4:
      ffmpeg -y -i <final.mp4> -c:v libx264 -crf 18 -r 60 -g 12 -keyint_min 12 \
        -pix_fmt yuv420p -movflags +faststart -c:a aac -ac 2 public/input-video.mp4
    Then: bun scripts/render-verify.ts public <source.mp4> output/packaged-v1.mp4
    (pinned hyperframes; gates on frame count; muxes audio). Long => run in background.
  }

  /verify {
    Spot-check endpoints (karaoke at head, outro at tail = full length) and a few cards
    against the AUDIO (snapshots are silent — open the file). Write youtube-chapters.txt.
  }
}
```

## References

- [references/components.sudo.md](references/components.sudo.md) — the card vocabulary catalog: each builder's signature, when to use it, layout, and a worked driver example.
- [references/creative-palette.sudo.md](references/creative-palette.sudo.md) — freestyle ideas and which HyperFrames skill to load for each effect.
- [references/highlight.sudo.md](references/highlight.sudo.md) — the screenshot → drawbox → adjust → bake sub-routine for on-screen highlights.
- [references/render-gotchas.sudo.md](references/render-gotchas.sudo.md) — dense-GOP input, the png-on-long-renders trap, version pinning, and the frame-count gate.
