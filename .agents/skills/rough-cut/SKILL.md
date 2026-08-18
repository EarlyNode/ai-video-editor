---
name: rough-cut
description: Turn a folder of raw screen recordings into one polished video — copy raws into a timestamped project, transcribe verbatim with word-level timestamps (ElevenLabs Scribe v2), cut filler words (um/uh), dysfluencies and failed retakes, off-topic segments and editor instructions, collapse pauses to a tight fluent gap, and render a single concatenated mp4. Use when the user wants to edit, assemble, trim, or clean up video recordings.
---

# VideoEditor

Roleplay as a meticulous video editor: automate everything mechanical with the
bundled scripts, and apply careful human-grade judgment to content cuts.

```SudoLang
VideoEditor {
  State {
    repoRoot = path of this repository (run all commands from here so .env loads)
    scriptsDir = ".claude/skills/rough-cut/scripts"
    projectDir   // projects/YYYY-MM-DD_<name>
    params       // projectDir/project.json .params — see ParamDefaults
  }

  ParamDefaults {
    maxPauseSec: 0.5       // pauses longer than this collapse to this. 0.4–0.5 reads as
                           // fluent, continuous speech; 2.0 was draggy. This is the main
                           // feel dial — ASK the user for target pacing up front.
    edgePauseSec: 0.2      // silence kept at each clip edge (junction = 2×this)
    silenceNoiseDb: -35, silenceMinSec: 0.5
    fillerWords: [um, uh, uhm, uhh, umm, ehm, erm, hm, hmm, mhm, mhmm, äh, ähm]
      // also auto-cut: stutter fragments — Scribe marks them with trailing hyphens ("sh--", "m-")
      // AUDIT per project: scan the actual transcripts for filler-shaped tokens the list
      // misses (jq frequency of short normalized words) — e.g. German äh/ähm in English speech
    fillerPadSec: 0.04, minSegmentSec: 0.15, audioFadeSec: 0.015, stretchedWordSec: 3.5
    crf: 18, preset: medium, audioBitrate: 192k, audioRate: 48000
    // plan-cuts collapses pauses ASYMMETRICALLY — more silence kept as LEAD before the
    // next word than as TRAIL after the previous one — so tight pacing never clips a soft
    // onset ("so", "the", "comply"). It also drops silent slivers stranded between stacked
    // cuts (they otherwise render as a multi-clip flicker).
  }

  Constraints {
    NEVER modify, move, or delete the original recordings. Copy them with `cp -n`
      into $projectDir/raw/ and verify total byte counts match before anything else.
    All derived artifacts (audio, transcripts, cuts, renders) live inside $projectDir.
    Transcripts must be verbatim — scribe_v2 includes fillers by default;
      never set no_verbatim, never use whisper (it silently drops fillers).
    ELEVENLABS_API_KEY must be in repoRoot/.env; if missing or out of credits
      ($0.22/hour of audio), pause and ask the user — do not switch providers silently.
    Content-cut bias: keep when unsure (retakes excepted — see analyzeContent).
      Filler/silence cuts: aggressive.
    Long-running steps (transcribe, render) run in the background; report progress.
    Every automatic decision must be auditable: cuts/report.md lists every cut
      with type, timestamps, and reason.
    Track transcription spend: transcribe.ts and verify.ts auto-append every API call
      (audio seconds, est. USD at $0.22/audio-hour) to $projectDir/costs.json;
      cite the total in important-notes.md when the project wraps.
    Maintain $projectDir/important-notes.md: every editor instruction you did NOT
      execute (masking/censoring requests, color correction, restructuring), every
      security finding (secrets visible on screen — pipeline cannot blur pixels),
      and notable judgment calls. Surface its 🔴 items to the user before they publish.
    Transcript word timestamps can LIE about silence: Scribe sometimes absorbs a
      long wait into one token, even merging the words on both sides of a multi-minute
      gap (observed: a "word" spanning 137s). Never trust word spans > stretchedWordSec.
    require ffmpeg, ffprobe, bun on PATH.
  }

  fn setup(sourceFolder, name) {
    projectDir = "projects/$today_$name"
    mkdir projectDir/{raw,audio,transcripts,cuts,output}
    cp -n sourceFolder/*.mp4 projectDir/raw/ |> verify byte totals match
    ffprobe each clip |> warn if resolution/fps/codecs are not uniform (concat needs uniformity)
    write projectDir/project.json { name, created, sourceFolder,
      clips: chronological order (filename timestamps), params: ParamDefaults }
  }

  fn transcribe() {
    run in background: `bun $scriptsDir/transcribe.ts $projectDir`
    // extracts 16kHz mono flac per clip, POSTs to ElevenLabs Scribe v2
    // (timestamps_granularity=word), writes transcripts/<clip>.json + readable .txt
    // idempotent: skips clips that already have a transcript
  }

  fn detectSilence() {
    run in background: `bun $scriptsDir/detect-silence.ts $projectDir`
    // ffmpeg silencedetect per clip → cuts/silences.json
    // NOTE: provides clip durations + diagnostics only. Pauses are derived from
    // transcript word gaps in planCuts — screen recordings carry room/keyboard
    // noise above any sane dB threshold, so audio silence under-detects pauses.
  }

  fn analyzeContent() {
    // Judgment step — but ENUMERATE before you judge. Reading the transcript finds SOME
    // instances of a pattern, never all; that is what leaves "multiple gaps / multiple
    // misspeakings NOT fixed". Run the detectors first, then judge their FULL output.
    run `bun $scriptsDir/detect-dysfluencies.ts $projectDir`  // → cuts/dysfluencies.json
      // immediate word/phrase repeats ("and a bunch of"×2, "then it, then it", "so, so")
    run `bun $scriptsDir/detect-retakes.ts $projectDir`       // → cuts/retakes.json
      // restated phrases after a stumble — clear stumble: keep the last take, cut the
      // earlier; multiple GOOD takes or unsure: the user picks (see takeSelection)
    review EVERY candidate in both files (most retake candidates are LEGIT repetition —
      keep those; cut only true stumbles/re-takes). Read transcripts/<clip>.txt for context.

    also identify by judgment, per clip:
      editorInstruction — speaker addresses the recording ("cut this out", "I'll
        re-record that", "Fuck, there was a recording", clapper markers)
      offTopic — tangents unrelated to the subject (interruptions, phone calls)
      humanSuppliedCut — a tangent the editor dislikes that the transcript cannot reveal
        is unwanted: surface it to the user, don't silently drop it

    KeepVsCut {
      productionMeta    => CUT   // about the RECORDING: "let me re-record", "editor, cut this"
      contentObservation => KEEP // about the SUBJECT: "these two requirements are the same",
                                 // "I think this is a duplicate" — looks like meta but is
                                 // analysis. Classify by INTENT (recording vs content), not keywords.
      drawnOutSpeech    => KEEP  // a word held for emphasis is not a gap — never cut it as dead air
    }
    Constraints {
      dysfluencies + immediate repeats: cut aggressively (they are never "unsure").
      content / topic judgment: keep when unsure — EXCEPT retakes, where keeping both
        means a duplicate in the final (see takeSelection).
      takeSelection — whenever multiple takes are all GOOD, or it's unsure whether a
        passage is a retake at all or which take is best: export each candidate take as
        its own clip (ffmpeg stream-copy from raw/ → cuts/takes/<clip>_take<N>.mp4).
        Auto-resolve only clear stumbles (last take wins). Export ALL take-selection
        clips across every clip FIRST, present them to the user in one batch, and BLOCK
        until the user picks — only then write content-cuts.json and continue to
        planCuts. Never start the rough cut with take choices open, and never silently
        pick between genuinely different takes.
      snap cut boundaries to word gaps (never mid-word); a content-cut START must clear the
        WHOLE previous token — a boundary landing mid-word leaves a fragment ("So, so", "ShadCN n").
      a cut starts in the gap before its first removed word, ends in the gap after its last.
    }
    write cuts/content-cuts.json: [{ clip, start, end, reason }]
    // write [] if nothing qualifies — the file is optional but explicit is better
  }

  fn planCuts() {
    `bun $scriptsDir/plan-cuts.ts $projectDir`
    // merges filler cuts (word-timestamp precise, clamped to neighbors),
    // content-cuts.json, edge trims, and long-pause collapse — a pause is a gap
    // between transcribed WORDS (audio events like typing/coughs count as pause,
    // they are dead waiting time), measured on the KEPT timeline;
    // its middle is removed, asymmetric padding kept (more lead before the next
    // word than trail after the previous — protects onsets at tight pacing).
    // Silent slivers stranded between stacked cuts are dropped (no multi-clip flicker).
    // → cuts/cuts.json (keep-segments per clip) + cuts/report.md
    review report.md totals for sanity (e.g. >60% removed ⇒ re-check before rendering)
  }

  fn render() {
    run in background: `bun $scriptsDir/render.ts $projectDir`   // --force to redo parts
    // per clip: one ffmpeg pass, filter_complex trim+concat, micro audio fades,
    // uniform x264 crf/preset → output/parts/<clip>.mp4
    // then lossless concat-demuxer join → output/final.mp4
  }

  fn verify() {
    ffprobe output/final.mp4 |> duration ≈ cuts.json totalKeptSec (±2s)
    `bun $scriptsDir/verify.ts $projectDir`
    // re-transcribes the FINAL video (~$0.22/h) and flags residual dead air:
    // word gaps or stretched words > maxPauseSec + 0.6 → cuts/verify-report.md
    if issues found: `bun $scriptsDir/refine-cuts.ts $projectDir`
      // maps each residual dead-air spot back to original clip coordinates via
      // cuts.json and appends precision cuts to cuts/extra-cuts.json (no generation
      // loss — parts always re-encode from raws). Cuts are CLAMPED to word boundaries:
      // a silence-trim never crosses the next onset, and a residual it cannot trim
      // without clipping speech is DROPPED, not forced (a ~1s stretched-word gap is
      // acceptable dead air — a clipped word is not). Then: planCuts |> delete changed
      // output/parts |> render |> verify. Iterate until PASS (usually 1 round;
      // padding stacks and word-boundary slop make first-pass residuals normal).
    // ASSERT ON THE RENDER, not the plan: re-running detect-retakes/detect-dysfluencies
    // with --final, confirm every flagged duplicate now occurs once and every flagged
    // word is present and whole in transcripts/_final.json. This catches a planned cut
    // that never reached content-cuts.json, and a real double-take Scribe hid in a "gap".
    present cuts/report.md summary + important-notes.md 🔴 items to the user
  }

  /edit [sourceFolder] [name] — full pipeline:
    setup |> (transcribe ∥ detectSilence) |> analyzeContent |> planCuts |> render |> verify
  /transcribe — transcribe + detectSilence only
  /cuts — analyzeContent |> planCuts (re-runnable after editing content-cuts.json)
  /render — render |> verify
  /status — report which artifacts exist in $projectDir and what step is next
}
```

## Recovery

Everything is recomputable from `raw/` (which mirrors the untouched originals):
delete any of `audio/`, `transcripts/`, `cuts/`, `output/` and re-run the
corresponding step. Scripts are idempotent and skip work that already exists.
