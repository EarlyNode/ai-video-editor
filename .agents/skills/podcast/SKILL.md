---
name: podcast
description: Edit raw multi-speaker podcast recordings into a published long-form V1 — pick the best intro/retake/ad-read/outro takes, bake name tags, a multicam speaker-switching cut, then a packaged V1 with the podcast intro and the Visit-ReactSquad.io outro. Use when the user wants to edit, assemble, or "make the podcast" from raw per-speaker recordings.
---

# PodcastProducer

Roleplay as a top-tier podcast editor.

Usually supplied: one video track per speaker (each speaker's own camera + mic), plus an extras
track — almost always a re-recorded intro (recorded after the fact), and sometimes retakes
(re-asked / overlaid questions), ad-reads, or an outro.

```SudoLang
PodcastProducer {
  fn createPodcast(sourceFolder) {
    1. transcribe each speaker track + the extras track (verbatim, word-level)
    2. find every clean re-recorded intro / retake / ad-read / outro in the extras; render a clip
       per candidate |> user picks the best of each |> ask where bonus clips (ad-reads, outro) go
    3. scan all transcripts for editor cues (for the cut) and V1 cues (for packaging); list the
       assets the V1 cues need and ASK for any missing (book covers, logos…) before cutting
    4. NAME TAGS FIRST — re-render each speaker's WHOLE individual track with their name tag
       baked in as a PERSISTENT (always-on) lower-third, and bake the host tag into the chosen
       intro/extras clips. This MUST happen BEFORE any cutting, as its own full-length re-render
       per track. Do NOT overlay tags per-cut during assembly. Then cut from the already-tagged
       tracks so every frame carries the correct, persistent tag automatically.
       Then VERIFY each tagged track actually shows its tag (grab a frame, check the nameplate
       pixels) BEFORE cutting — the bake can silently fail (an `overlay=...:format=auto` dropped
       an 8-bit-alpha nameplate over yuv420p; use plain `overlay=0:0`). Never assume it worked
       from checking only one speaker. See [[podcast-bake-name-tags-into-full-tracks-first]].
    5. load BOTH `rough-cut` and `package-video`, then produce the V1 in a SINGLE render pass (never
       render the cut and then re-render it for graphics):
         - cut per rough-cut: splice the retakes onto the timeline (new intro, overlaid questions),
           hold on the active speaker and switch to the side-by-side panel on rapid back-and-forth,
           apply its filler/pause/dysfluency rules + the editor cues, and verify the um/uhs trimmed
         - package per package-video: prepend the ~3s podcast intro, append the Visit-ReactSquad.io
           outro, drop the bonus clips where chosen, and apply the V1 cues with the gathered assets
  }

  /podcast [sourceFolder] — createPodcast
}
```
