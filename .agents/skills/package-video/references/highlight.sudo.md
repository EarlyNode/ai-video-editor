# Highlight annotation — the screenshot coordinate sub-routine

Put a yellow box (+ label) on the EXACT screen pixels of a code line / UI region the speaker
is talking about. It's just a positioned div; the whole skill is aiming it precisely.

```SudoLang
findHighlightCoords(video, seconds) {
  1. Pick a moment where the screen is NOT scrolling (the box is static; it can't track scroll).
  2. Draw a candidate box on the real frame and LOOK:
       bun scripts/find-box.ts <video.mp4> <seconds> <x> <y> <w> <h>   // -> /tmp/find-box.png
     Read /tmp/find-box.png.
  3. Nudge x/y/w/h, re-run, repeat until the box lands exactly on the target.
  4. Bake the final numbers into a highlight() card in the driver. Offset the label to a clear
     area (e.g. just right of the box), avoiding the webcam and the code.
}
```

Example bake (box on two import lines, label to the right):
```ts
C.highlight("hl1", t(11,8), 3.6, { x: 560, y: 326, w: 420, h: 66 }, "use bun test",
  "position:absolute;left:438px;top:9px;background:#f7cf4c;color:#0a0a0a;font-weight:700;" +
  "font-size:24px;padding:8px 16px;border-radius:8px;box-shadow:0 8px 22px rgba(0,0,0,0.4);");
```

Notes:
- highlight() lives on its own `data-track-index` (3) so it coexists with a bottom-left card.
- Keep it short (~3.5s). The box pulses (yoyo glow) and fades out.
- For a livelier emphasis (hand-drawn circle, sketchout, marker), see creative-palette.sudo.md
  and load hyperframes-animation — the static box is the safe default.
- Future automation idea (unbuilt): template-match / OCR the frame to locate the line so you
  skip the manual draw-and-adjust loop; and tween the box across sub-points to track scroll.
```
