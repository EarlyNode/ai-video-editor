---
name: make-clips-legacy
description: "LEGACY, superseded by the podcast-clips skill. Turn one long-form final-cut video into a set of vertical 9:16 clips for YouTube Shorts / Instagram Reels / TikTok — diarized verbatim transcription with word timestamps (ElevenLabs Scribe v2, speaker count auto-detected), agent-judged clip discovery (hooks, self-contained stories), adaptive vertical reframe (stacked cam+screen or big cam-only), and Descript-style word-synced karaoke captions burned in. Use when the user wants shorts, clips, reels, or highlights from a finished video."
---

# ClipMaker

Roleplay as a short-form content producer: the source is already a polished
final cut — your job is finding the moments that stand alone, not re-editing.

```SudoLang
ClipMaker {
  State {
    repoRoot = path of this repository (run all commands from here so .env loads)
    scriptsDir = ".claude/skills/make-clips-legacy/scripts"   // shared lib: ../rough-cut/scripts/lib.ts
    projectDir   // projects/YYYY-MM-DD_<name>
    params       // projectDir/project.json .params — see ParamDefaults
    speakers     // project.json .speakers: { speaker_0: "Jan", … } once identified
  }

  ParamDefaults {
    targetClipSec: { min: 30, ideal: 60, max: 180 }
    layout: adaptive   // per clip: "stacked" (cam + screen bands) | "cam" (big cam only)
    out: { width: 1080, height: 1920, crf: 18, preset: medium, audioBitrate: 192k, audioRate: 48000 }
    captions: {
      style: karaoke   // full phrase visible; spoken word gets a solid rounded-
                       // rect pill in highlightColor, word text stays white and
                       // KEEPS its black outline; no banner behind the line
      maxWordsPerLine: 4, maxLineChars: 22, font: "Adwaita Sans", fontSize: 72
      baseColor: #FFFFFF, highlightColor: #82AAFF, marginBottomPct: 16
    }
  }

  Constraints {
    NEVER modify the original recording. cp -n into $projectDir/raw/, verify byte
      counts match before anything else.
    The source is a FINAL CUT — do NOT cut for snappiness, fillers, or pauses.
      The only cutting is clip boundary selection.
    Transcribe with diarize=true (Scribe v2, verbatim, word timestamps).
      Speaker labels come back ANONYMOUS (speaker_0, speaker_1, …) — Scribe
      separates voices but cannot name them. Infer who-is-who from content
      (self-references, how speakers address each other), then CONFIRM with the
      user and persist the mapping in project.json .speakers.
    The transcript format is identical to rough-cut's (TranscriptWord [+speaker_id]),
      so it can feed that flow's gap/silence detection unchanged.
    Clip candidates must stand alone: a viewer with zero context gets it.
      Hook within the first ~3 seconds; never start mid-thought; snap boundaries
      to sentence starts/ends at word gaps (never mid-word).
    PAUSE for user approval of the candidate list before rendering
      (clip selection is taste) — unless the user asked for fully automatic.
    Render ONE sample clip first; let the user tune caption style and layout
      before batch-rendering the rest.
    Layout geometry can differ between scenes of the same video (cam frame
      moves/resizes) — and can switch MID-CLIP. Scene-detect inside every clip
      (ffmpeg select='gt(scene,0.25)'; use -nostdin inside shell loops or ffmpeg
      eats the loop's stdin), then build a contact sheet of segment-midpoint
      thumbnails (tile filter) and classify each segment visually.
    Scene detection MISSES fade/slide transitions — when a segment's midpoint
      frame contradicts its neighbors (or a graphic "appears" without a cut),
      frame-sample inside the segment to find the real boundary.
    If the source already has burned-in captions (produced cold opens,
      montages), set "captions": false for that candidate — never double up.
    Source overlays (lower-thirds, stat banners) span wider than a face crop;
      segments where they matter should fall back to a full-frame band
      rather than slicing the overlay text.
    Caption text keeps the transcript's sentence punctuation — terminal marks
      (. ! ? …) and commas stay attached to their word; NEVER strip them when
      escaping (esc() only removes {}\ ). Dropping a period mid-stream fuses two
      sentences onto one line ("businesses Book a call" instead of "businesses."
      then "Book a call"), so endsSentence can't split phrases at the boundary.
      Where Scribe omits a period at a real sentence boundary (next phrase
      starts capitalized after a pause), restore it so each displayed line reads
      as a properly punctuated sentence. This is display punctuation, not
      transcription — it does not violate the VERBATIM rule (words are unchanged).
    Caption .ass rules (make-captions.ts encodes these — keep them if rewriting):
      pill = separate "Pill" style with BorderStyle=3 (libass draws one opaque
      box per styled run) on layer 0: current word visible, all other words AND
      the spaces are alpha-invisible runs so layout stays exact and the box hugs
      the word; the white text layer renders above it on layer 1.
      Events must NEVER overlap in time (libass stacks colliding events into
      two caption lines) — clamp each phrase's display tail at the next
      phrase's start.
      Break lines by CHARACTER budget, not word count alone — four long words
      overflow a 1080px frame at fontSize 72.
    Undersized stacks sit on a blurred darkened zoom-fill of themselves
      (render-clip.ts), never black bars.
    When the user reports a glitch with a screenshot, read the caption text in
      the screenshot and look it up in the transcript — that gives the exact
      timestamp of the offending frame.
    Iterate on ONE sample clip until the user approves the look; a request to
      tweak the sample is NOT approval to batch — fix, show again, then batch.
    Track transcription spend in costs.json (lib.logCost); maintain
      important-notes.md (unexecuted instructions, security findings, judgment
      calls, cost total) exactly like rough-cut.
    require ffmpeg, ffprobe, bun on PATH (ffmpeg with libass for caption burn-in).
  }

  fn setup(sourceFile, name) {
    projectDir = "projects/$today_$name"
    mkdir projectDir/{raw,audio,transcripts,clips,output}
    cp -n sourceFile projectDir/raw/ |> verify byte counts match
    ffprobe |> record duration, resolution, fps
    write project.json { name, created, source, sourceFolder, speakers: {}, params }
  }

  fn transcribe() {
    run in background: `bun $scriptsDir/transcribe-diarized.ts $projectDir`
    // 16kHz mono flac → Scribe v2 (diarize=true, word timestamps) →
    // transcripts/<base>.json + .txt (speaker-turn lines) + .speakers.json
    // (per-speaker word counts / speaking time / first utterance — reports
    // the detected speaker count). Idempotent.
  }

  fn identifySpeakers() {
    read transcripts/<base>.speakers.json + the .txt transcript
    infer names from content: self-introductions, "thanks $name", topic ownership
    confirm mapping with the user |> write project.json .speakers
  }

  fn discoverClips() {
    // THE judgment step — done by you, the agent, not a script.
    read the full transcript (speaker-turn .txt; word JSON for exact boundaries)
    find segments that work as standalone shorts:
      strongHook — surprising claim, question, or punchline up front
      selfContained — no missing context, no dangling references ("as I said before")
      payoff — the segment resolves; never end on a cliffhanger mid-argument
      oneIdea — a single concrete takeaway, story, or exchange
    for each candidate write clips/candidates.json entry:
      { id, title, hook, start, end, durationSec, speakers, score: 1..10,
        reason, layout: { mode: stacked|cam, bands: [{x,y,w,h}] } }
      // bands = crop rects in source pixels, top→bottom; renderer scales each
      // to 1080 wide and vstacks. Verify geometry from a midpoint frame.
    rank by score |> present to user with timestamps + reasons |> await approval
  }

  fn renderClips(ids) {
    for each approved clip:
      `bun $scriptsDir/make-captions.ts $projectDir <id>`   // → clips/<id>.ass
      `bun $scriptsDir/render-clip.ts $projectDir <id>`     // → output/<id>_<slug>.mp4
    // frame-accurate cut, crop+scale+vstack to 1080x1920, captions burned in
    run in background; render the sample clip alone first
  }

  fn qaLayout() {
    `bun $scriptsDir/qa-layout.ts $projectDir [clip-id]`
    // programmatic layout QA against the SOURCE, run after mapping and before
    // (or after) rendering. Flags three mistake classes:
    //   NOT HOMOGENEOUS — segment's start/mid/end frames differ → a fade/slide
    //     transition hides inside; sample within and re-map
    //   FLAT band — crop band has near-zero variance → cam/card slid away
    //   CONTENT EXCEEDS CROP — graphics extend beyond the band (cropdetect bbox)
    // Flags are REVIEW PROMPTS, not errors. Expected false positives: zoom
    // punches in talking-head segments, intentional crops of live-action wide
    // shots, screen-card content that scrolls/changes. Inspect each flag with
    // a frame sample; act only where the layout is genuinely wrong.
  }

  fn verify() {
    ffprobe every output clip |> duration matches candidate (±0.5s), 1080x1920
    build a contact sheet FROM THE RENDERED OUTPUTS (2+ frames per clip,
      including one inside every re-mapped segment) and read it — sliced faces,
      empty bands and double captions are visible at a glance
    spot-check caption sync: extract 2-3 frames at known word times, read them,
      confirm the highlighted word matches the transcript at that moment
    write/refresh important-notes.md (cost total, unexecuted notes, judgment calls)
  }

  /clips [sourceFile] [name] — full pipeline:
    setup |> transcribe |> identifySpeakers |> discoverClips |> await approval
    |> qaLayout |> renderClips(sample) |> await style approval
    |> renderClips(rest) |> verify
  /discover — re-run discoverClips (after transcript exists)
  /render [ids] — renderClips for approved/named candidates
  /status — report which artifacts exist in $projectDir and what step is next
}
```

## Recovery

Everything is recomputable from `raw/`: delete `audio/`, `transcripts/`,
`clips/`, or `output/` and re-run the corresponding step. Scripts are
idempotent and skip work that already exists.
