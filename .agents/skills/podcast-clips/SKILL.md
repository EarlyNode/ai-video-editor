---
name: podcast-clips
description: Turn a finished multi-speaker podcast (raw per-speaker synced tracks + per-mic word transcripts) into a set of short-form vertical 9:16 clips — agent-judged clip discovery with strong hooks that the USER APPROVES before any cutting, then one render pass per clip: fluent recut (fillers, stutters and pauses removed), active-speaker multicam with a 2-up on laughs / rapid back-and-forth, baked-in Descript-style karaoke captions, persistent brand name tags, a 2-second hook card, and a brand outro CTA. Use when the user wants shorts, clips, reels, or TikToks from a podcast episode.
---

# ClipProducer

Roleplay as a top-tier video editor for viral podcast clips.

```SudoLang
ClipProducer {
  Inputs {
    A finished 2-speaker podcast where each speaker's own camera carries only THAT speaker's mic,
    and the tracks are synced (Riverside-style) — so one timeline drives every clip and both mics
    can be mixed. Reuse the same per-mic transcripts the `podcast` skill made (diarize=false per mic
    = perfect speaker attribution + word timestamps). Needs the darkglass nameplates the `podcast`
    skill baked (overlays/nameplates/darkglass-<id>.png) for the name tags.
  }

  Constraints {
    NEVER modify the originals; everything is recomputable from raw/ + transcripts/.
    TWO-STEP, approval-gated: DISCOVER clip-worthy moments and get the user's sign-off BEFORE cutting.
    Every clip MUST be portrait 1080x1920 and less than 3 minutes. Lengths vary per episode (some 20s, some ~1min).
    NUMBER the output files (01-, 02-, …) in the intended post order.
    The HOOK card must be fully visible on the FIRST frame (no fade-in) — platforms generate the
      preview thumbnail from frame 0, so the clickbait text has to be there immediately.
    START each clip on a clean SENTENCE START — never mid-word or inside a false start. Guests
      false-start ("I think that it's, um… the, the— I think the community's going…"); open on the
      clean attempt ("I think the community's going…") or a confident opener ("That's a tough one.").
    END each clip's last shot at the NATURAL END of its final sentence (a period, or a soft trailing
      filler like "so yeah"/"right"). NEVER end mid-word or partway into the NEXT sentence: the outro
      overlays the last ~1s of AUDIO (it keeps playing), so a cut-off word/new-sentence sounds broken.
      The outro should land over the sentence's own tail (or a trailing filler), so the audio completes.
    Cuts land on WORD boundaries from the per-mic transcripts (author them with dump-words).
    Verbatim transcription only (fillers included); ElevenLabs Scribe v2 per mic.
    On-screen copy uses NO em dashes — colon/period/comma instead (arrows → ok). See [[no-em-dashes-in-video-copy]].
    Name tags are baked PERSISTENTLY per active speaker, never popped in/out per cut —
      see [[podcast-bake-name-tags-into-full-tracks-first]]; here the render bakes the tag onto every
      span so the active speaker is always tagged.
    Render each clip in ONE ffmpeg pass with SEPARATE video + audio concats (a combined v=1:a=1
      concat feeding the deep video pipeline deadlocks; per-segment file-concat drifts A/V) —
      see [[clip-render-single-pass-av-sync]]. render-shorts handles this.
    require ffmpeg, ffprobe, bun on PATH; run every command from the repo root.
  }

  // ---- 1. DISCOVER (judgment) --------------------------------------------------
  fn discover() {
    ensure per-mic word transcripts exist (reuse the podcast project's; else transcribe per mic).
    `bun .claude/skills/podcast-clips/scripts/merge-transcript.ts $projectDir`  // → transcripts/conversation-turns.txt
    READ the whole interleaved transcript. Find clip-worthy moments:
      StrongHook    — open on the hookiest line; cut the boring lead-in ("so, um, let me ask...").
                      A direct "what would you do if…" question IS the hook — start there.
      SelfContained — a moment that makes sense with no other context; a story with a payoff.
      TrimTheWaffle — guests ramble (waffle); truncate to the point. So can the host.
    For each: a title, an attention-grabbing HOOK line pair (see HookCopy), and the source span.
    Present the ranked shortlist (hook + rough timestamps + why) and STOP for the user to pick /
      retrim. Only cut once the user approved the clips.
  }

  // ALWAYS include the QUESTION-CHAIN clip when the show has one (this show always does).
  QuestionChain {
    Concept {
      The previous guest left a question for THIS guest — stitch it ACROSS episodes so both guests
      can be tagged / react on social. Open on a SPLIT-SCREEN: previous guest (top) ASKING, current
      guest (bottom) LISTENING (use the current guest's footage from where the host relays the
      question). Then the previous guest "leaves" and it cuts to the current guest full-frame
      ANSWERING. Guests phrase it inconsistently ("how do YOU…" vs "how do THEY…") — make it read
      sensibly from the actual words said.
    }
    Constraints {
      Do NOT add the previous guest as a normal speaker in clips.json — the per-span mic amix folds
        their (wrong-timeline) audio into the answer. The intro is built separately instead.
      Fluent-recut the ASK like any clip (it is usually full of long pauses + a false start).
      Build the split intro as TWO A/V-LOCKED stages: (1) render ONE fluent prev-guest take via a
        COMBINED concat=n:v=1:a=1 forced to CFR — separate video/audio concats let the frame-quantized
        video drift off the sample-exact audio and his lips desync ([[clip-render-single-pass-av-sync]]);
        (2) composite the split-screen from that single continuous file, bottom = current guest
        LISTENING as ONE continuous take (never cut in sync with the speech).
      Re-running render-shorts for that clip id regenerates ONLY the answer — re-run build-chain-intro
        + concat after, or it clobbers the stitched clip.
    }
    build() {
      stage the prev episode's guest mp4 → raw/, transcript → transcripts/, nameplate → overlays/.
      spec the ANSWER as a normal single-current-guest clip: hook:[] (empty) + outro:true.
      `bun <projectDir>/scripts/build-chain-intro.ts`  // prev-guest top + current listening bottom, hook on frame 0
      concat -c copy [intro][answer] → output/clips/NN-<id>.mp4
    }
  }

  HookCopy {
    A 2s centered card, big Londrina Solid Black with a black outline, split-colored: the punchy
    part RED, the rest WHITE. e.g.
      ["THE SHOCKING TRUTH"(red), "ABOUT HIRING JUNIORS"(white)]
      ["A LIVE DEMO CRASH"(white), "COST HIM £700K"(red)]
  }

  // ---- 2. SPEC the approved clips ---------------------------------------------
  fn spec() {
    author projectDir/clips/clips.json. For each approved clip: { id, title, hook:[{text,color}], shots:[], outro? }.
    outro defaults ON (most clips want one); set `"outro": false` to omit it for a clip.
    Use `bun .claude/skills/podcast-clips/scripts/dump-words.ts $projectDir <start> <end>` to read word timestamps and place
      every cut on a boundary.
    Shot = { cam, a, b, speaker?, verbatim? }
      cam = a speaker id (show that speaker, center-cropped) | "both" (2-up: guest top, host bottom)
      Multicam rules (this is the craft):
        - one person mainly talking => stay on them (their backchannels don't trigger a switch)
        - a real interjection by the other (e.g. host gives short comments to what the guest says) => CUT to that speaker
        - a shared laugh / rapid back-and-forth => a momentary "both" 2-up (set verbatim:true so the
          laugh/beat, which has no transcribed words, isn't dropped by the fluent cut)
      a,b are the raw-timeline span; content-trim the waffle by splitting one shot into several.
      Watch the END of each clip: pull the last shot's `b` in so the tail doesn't catch the next
        sentence's onset.
    Fluency (applied by render-shorts, matching rough-cut): drop fillers (um/uh…), stutter fragments
      ("wh-which"), immediate repeats, and pauses > ~0.4s — all snapped to word boundaries.
  }

  // ---- 3. NAME TAGS ----------------------------------------------------------
  fn nametags() { `bun .claude/skills/podcast-clips/scripts/make-nametags.ts $projectDir` }
    // crops the brand darkglass pill → overlays/clip-assets/tag-<id>.png (top-left, transparent-padded)

  // ---- 4. RENDER + ANIMATE (mechanical) --------------------------------------
  fn render(clipId?) {
    `bun .claude/skills/podcast-clips/scripts/render-shorts.ts $projectDir [clipId]`  // omit clipId for all; KEEP=1 keeps .work
    // one pass per clip: fluent recut → multicam (active speaker / 2-up, tag baked per span) →
    // karaoke captions (bottom quarter, yellow pill) → 2s hook card (centered) → brand outro (last
    // 1s of the clip blurred+darkened + CTA; audio keeps playing under it, so no trailing pause). Output:
    // projectDir/output/clips/<id>.mp4
  }

  fn verify() {
    per clip: ffprobe video ≈ audio duration (locked, no drift) and total < 3min; grab frames at the
    hook, a speaker cut, a 2-up (if any), and the outro — confirm tags persistent, captions synced,
    no caption bleeding onto the outro card, hook clear of the face.
    RE-TRANSCRIBE the FINISHED clip (extract 16k mono, Scribe v2) and read its FIRST + LAST line —
      confirm it opens and ends on a WHOLE sentence. This is the only reliable way to catch a mid-word
      start or a trailing "so"/"what" hanger (frames won't show it); the boundary the transcript reveals
      is the fix (pull the shot's a/b to that word's exact edge). For a question-chain clip, also read
      that the prev-guest ASK is fluent (no long gaps left) and his lips track the audio.
  }

  /clips [projectDir] — discover |> (user approves) |> spec |> nametags |> render |> verify
  /discover — discover only (propose the shortlist)
  /render [clipId] — nametags (if needed) |> render |> verify
  /status — which of transcripts / clips.json / nametags / output exist, and the next step
}
```

## Styling & the outro (brand assets)

All look-and-feel lives in `brands/<brand>/podcast/clips-style.json`: caption font/size/colors, the
hook card, name-tag position + pill crop region, and the **outro** (on by default, `outro:false`
per clip to omit): red/white "Watch the full episode", the big yellow podcast name, and the yellow
ReactSquad mark, over the **blurred + darkened last second of the clip** — the shared brand outro
treatment (identical to the long-form/podcast outro), NOT a flat card. Editing that one
file re-skins every clip and every episode. The outro blur/dim match the brand standard in
`brands/<brand>/BRAND.md` → "Video treatments" (keep them in sync). See [[podcast-clips-recipe]].

## Recovery

Everything is recomputable. `clips/clips.json` is the source of truth for the cut — edit a shot and
re-run `/render <id>`. Delete `output/clips/` and re-render; delete a nametag and re-run `nametags`.
