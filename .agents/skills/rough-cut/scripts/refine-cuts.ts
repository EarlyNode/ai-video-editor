// Closed-loop tightening: take residual dead air found by verify.ts in the FINAL
// video (transcripts/_final.json), map each spot back through cuts.json to original
// clip coordinates, and append precision cuts to cuts/extra-cuts.json.
// plan-cuts.ts merges extra-cuts on the next run; parts re-render from the raws,
// so there is no generation loss. Iterate: verify -> refine-cuts -> plan-cuts ->
// render -> verify, until verify passes (usually one iteration).
// Usage: bun refine-cuts.ts <project-dir> [--gaps-only]
//   --gaps-only: skip stretched-word findings. A "stretched word" in the final
//   transcript can be legit slow speech (dictating a URL character by character),
//   and cutting its middle would remove words. Use full mode for round 1, then
//   --gaps-only unless you eyeballed a stretched finding and confirmed it's silence.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { projectDirFromArgs, loadProject, clipBase, fmtTime, type ClipPlan, type TranscriptWord } from "./lib";

const dir = projectDirFromArgs();
const project = await loadProject(dir);
const P = project.params;
const TOLERANCE = 0.6;
const LEAD = 0.25; // a mapped cut END must stop >= LEAD before the next word's onset

// Original spoken words per clip, sorted — for boundary-clamping mapped cuts so a
// silence-trim can never cross into the next spoken word.
const clipWords: Record<string, TranscriptWord[]> = {};
for (const clip of project.clips) {
  const t = await Bun.file(join(dir, "transcripts", `${clipBase(clip)}.json`)).json();
  clipWords[clip] = (t.words ?? [])
    .filter((w: TranscriptWord) => w.type === "word")
    .sort((a: TranscriptWord, b: TranscriptWord) => a.start - b.start);
}

const plan: { clips: ClipPlan[] } = await Bun.file(join(dir, "cuts", "cuts.json")).json();
const finalT = await Bun.file(join(dir, "transcripts", "_final.json")).json();
const words: TranscriptWord[] = (finalT.words ?? []).filter((w: TranscriptWord) => w.type === "word");

// Final-video timeline -> (clip, original time): flatten keep segments with cumulative offsets.
interface Piece { clip: string; start: number; end: number; cum: number; }
const pieces: Piece[] = [];
let cum = 0;
for (const c of plan.clips) {
  for (const k of c.keep) {
    pieces.push({ clip: c.name, start: k.start, end: k.end, cum });
    cum += k.end - k.start;
  }
}

// Dead-air regions in final-video time; trim each to maxPauseSec.
interface Region { a: number; b: number; why: string; }
const regions: Region[] = [];
for (let i = 1; i < words.length; i++) {
  const gap = words[i].start - words[i - 1].end;
  if (gap > P.maxPauseSec + TOLERANCE) {
    regions.push({
      a: words[i - 1].end + P.maxPauseSec / 2,
      b: words[i].start - P.maxPauseSec / 2,
      why: `residual ${gap.toFixed(1)}s pause after "${words[i - 1].text}"`,
    });
  }
}
const gapsOnly = process.argv.includes("--gaps-only");
for (const w of gapsOnly ? [] : words) {
  const span = w.end - w.start;
  if (span > (P.stretchedWordSec ?? 3.5)) {
    // utterance guard 0.5s + half pause per side
    const a = w.start + 0.5 + P.maxPauseSec / 2;
    const b = w.end - 0.5 - P.maxPauseSec / 2;
    if (b > a) regions.push({ a, b, why: `stretched word "${w.text}" (${span.toFixed(1)}s) in final` });
  }
}

// Map regions through kept pieces to original clip coordinates.
interface ExtraCut { clip: string; start: number; end: number; reason: string; }
const extraPath = join(dir, "cuts", "extra-cuts.json");
const extra: ExtraCut[] = existsSync(extraPath) ? await Bun.file(extraPath).json() : [];
let added = 0, clampedN = 0, droppedN = 0;
for (const r of regions) {
  for (const p of pieces) {
    const len = p.end - p.start;
    const lo = Math.max(r.a, p.cum);
    const hi = Math.min(r.b, p.cum + len);
    if (hi <= lo) continue;
    const start = p.start + (lo - p.cum);
    let end = p.start + (hi - p.cum);
    // CLAMP: the mapped region can land across the NEXT spoken word (Scribe shrinks a
    // stretched word in the clean render, so its absorbed silence reads as one big gap
    // whose mapped end overshoots the following word). Never cross a word onset.
    const ws = clipWords[p.clip] ?? [];
    const next = ws.find((w) => w.start >= start - 0.001);
    if (next && next.start - LEAD < end) {
      if (next.start - LEAD !== end) clampedN++;
      end = next.start - LEAD;
    }
    if (end - start < 0.05) { droppedN++; continue; } // can't fit without clipping speech
    extra.push({ clip: p.clip, start, end, reason: `refine: ${r.why} @final ${fmtTime(r.a)}` });
    added++;
  }
}
await Bun.write(extraPath, JSON.stringify(extra, null, 2));
console.log(`${regions.length} dead-air region(s) -> ${added} extra cut(s) appended to cuts/extra-cuts.json (${clampedN} clamped to word boundary, ${droppedN} dropped to avoid clipping speech)`);
console.log("Next: re-run plan-cuts.ts, delete affected output/parts, render, verify.");
