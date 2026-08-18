# Render gotchas — load-bearing

Long graphic-overlay renders fail in quiet, expensive ways. render-verify.ts handles these,
but know why. Verify OUTPUT, never the "Render complete" message.

```SudoLang
RenderGotchas {
  DenseGOP {
    The renderer seeks per-frame; a sparse GOP (even -g <fps> = 1s keyframes) can't land exact
    seeks => the video FREEZES between keyframes => frozen frames get deduped & re-packed CFR
    => sped-up, far-too-short output. FIX: re-encode the input with `-g 12 -keyint_min 12`
    (0.2s keyframes @ 60fps; verified sufficient, ~1.3GB for 22min). `-g 1` works but ~8GB.
    Symptom: output duration ≪ expected; nb_read_frames a clean fraction (e.g. 1/6).
  }
  NoPngOnLongRenders {
    `--video-frame-format png` overflows temp space at scale: a 22-min/79k-frame render came
    out BLACK with exactly 1/6 the frames. png is fine for SHORT clips (≤ ~1k frames). For a
    full-length render OMIT it (default auto/jpg). Symptom: tiny file, black mid-frames.
  }
  VersionPin {
    `npx hyperframes` auto-upgrades; v0.7.10 silently TRUNCATED a 22-min render at ~1099s
    while printing "Render complete 100%". v0.7.5 rendered it fully. Pin: `hyperframes@0.7.5`.
    NOT forever — before a big render, check `hyperframes@latest --version`, test it on a
    full-length render, and move up once the truncation bug is fixed (newer = other fixes).
  }
  TheRealGate {
    Whatever version: GATE the mux on `nb_read_frames == round(duration*fps)` (±1) AND a
    last-frame check (extract -sseof -0.5; confirm it shows the expected final card — mid-content
    or black means a truncated or failed render). render-verify.ts does this and exits non-zero on failure.
  }
  AudioMux {
    The composition <video> is muted, so the render has no audio. Mux it back from the source
    at the SAME timeline: -map 0:v -map 1:a -c:v copy -shortest. If you re-cut the source,
    mux from the CUT video (its audio) and re-transcribe to re-derive card timestamps.
  }
  SnapshotFirst {
    Snapshots are cheap; the full render is ~20 min. Snapshot-verify every NEW card cropped to
    its region BEFORE rendering. Don't mistake adjacent UI (a dark terminal) for your card.
  }
}
```
