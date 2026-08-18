# AI Video Editor

A pipeline workspace for turning raw recordings into published-ready videos.
The actual work is done by agent **skills** under `.claude/skills/` —
transcription, agent-judged cutting, branded graphic overlays, and
frame-accurate ffmpeg renders. This repo tracks only the code and config; the
multi-GB media lives under `projects/` and is gitignored.

> For the full conventions, constraints, and SudoLang skill definitions, see
> [`CLAUDE.md`](CLAUDE.md) and the `SKILL.md` in each skill folder. This README
> is just the orientation.

## The main flow

A normal long-form video runs **rough-cut → package-video**. Podcasts use the
**podcast** skill, then **podcast-clips** to turn the finished episode into
short-form verticals. Both feed **publish-metadata** to generate the publish
copy (titles, description, chapters, per-clip captions).

- **rough-cut** (`.claude/skills/rough-cut/`) — a folder of raw screen
  recordings → one polished, concatenated mp4. Verbatim transcription with
  word-level timestamps (ElevenLabs Scribe v2), filler-word cuts (um/uh),
  content cuts (off-topic, editor instructions, failed retakes), long pauses
  collapsed to a tight fluent gap.

- **package-video** (`.claude/skills/package-video/`) — a rough-cut `final.mp4`
  + transcript → publish-ready **"V1"**: a branded graphic-overlay pass
  (transcript-anchored chapters, term/tip/quote cards, karaoke captions,
  stat strips, intro lower-third, mid-roll subscribe, outro CTA), built on the
  HyperFrames HTML engine.

- **podcast** (`.claude/skills/podcast/`) — raw per-speaker podcast tracks →
  long-form V1. Picks the best retake takes, bakes name tags, then runs a
  single-pass multicam speaker-switching cut packaged with the ReactSquad
  podcast intro/outro.

- **podcast-clips** (`.claude/skills/podcast-clips/`) — a finished podcast (raw
  per-speaker tracks + per-mic transcripts) → a set of short-form vertical 9:16
  clips. Agent-judged clip discovery with hooks you approve first, then one
  render pass per clip: fluent recut, active-speaker multicam (2-up on
  laughs/rapid back-and-forth), baked-in karaoke captions, persistent name tags,
  a hook card, and a brand outro.

- **publish-metadata** (`.claude/skills/publish-metadata/`) — a finished episode
  (and its clips) → the publish pack. For the long-form: YouTube title options
  plus the description "meat" (an "In this episode…" overview + MM:SS chapters
  keyed to the final cut). For each clip: clickbait titles, a cross-platform
  description, and LinkedIn hooks.

### Supporting skills

- **make-clips-legacy** (`.claude/skills/make-clips-legacy/`) — parked;
  superseded by **podcast-clips**. One long-form final cut → vertical 9:16
  shorts, kept for reference.

## Setup

- **[Bun](https://bun.sh)** — all scripts are TypeScript run with Bun, zero npm
  dependencies. Run from the repo root so Bun auto-loads `.env`.
- **ffmpeg** — used for all silence detection, cutting, and rendering.
- **`.env`** — copy `.env.example` to `.env` and set `ELEVENLABS_API_KEY`
  (Scribe batch STT, ~$0.22/audio-hour). Never commit it.

## Project layout

Each editing job is a self-contained, timestamped folder. The originals are
copied into `raw/` and never modified — everything downstream is recomputable
from there.

```
projects/YYYY-MM-DD_<name>/
  raw/                 untouched copies of the sources
  audio/ transcripts/  extracted audio + Scribe transcripts
  cuts/ | clips/        intermediate segments
  overlays/            package-video work dir (composition driver + renders)
  output/              final renders (final.mp4 → packaged-v1.mp4)
  project.json         source list + parameters
  costs.json           every transcription API call (audio seconds, est. USD)
  important-notes.md   per-recording editor cues, judgment calls, pre-publish notes
```

`projects/` and `meta-ads/` are gitignored (raw recordings, audio, renders —
all recomputable). So is `.env`.
