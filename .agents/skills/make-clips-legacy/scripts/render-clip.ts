// Render one clip candidate to a vertical 1080x1920 short — in ONE ffmpeg pass:
// frame-accurate cut, per-SEGMENT layouts (a clip can switch scenes mid-way:
// full-cam → screen+cam composite), each segment cropped into bands, scaled to
// 1080 wide, vstacked, normalized to 1080x1920, segments concatenated, captions
// burned in from the .ass file.
//
// candidates.json layout contract (times are CLIP-LOCAL seconds):
//   layout: { segments: [ { from, to, bands: [{x,y,w,h}, …] }, … ] }
//   bands are crop rects in source pixels, stacked top→bottom.
// Usage: bun render-clip.ts <project-dir> <clip-id> [--force]
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { run, fmtTime, ffprobeDuration } from "../../rough-cut/scripts/lib";

const dir = process.argv[2];
const clipId = process.argv[3];
const force = process.argv.includes("--force");
if (!dir || !clipId) {
  console.error("Usage: bun render-clip.ts <project-dir> <clip-id> [--force]");
  process.exit(1);
}
const project = await Bun.file(join(dir, "project.json")).json();
const O = project.params.out;
const candidates = await Bun.file(join(dir, "clips", "candidates.json")).json();
const clip = candidates.find((c: { id: string }) => c.id === clipId);
if (!clip) { console.error(`No candidate with id "${clipId}" in clips/candidates.json`); process.exit(1); }

const slug = (clip.title as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const outPath = join(dir, "output", `${clipId}_${slug}.mp4`);
if (existsSync(outPath) && !force) { console.log(`[skip] ${outPath} exists (--force to redo)`); process.exit(0); }

const assPath = resolve(join(dir, "clips", `${clipId}.ass`));
if (!existsSync(assPath)) { console.error(`Missing ${assPath} — run make-captions.ts first.`); process.exit(1); }

interface Band { x: number; y: number; w: number; h: number }
interface Segment { from: number; to: number; bands: Band[] }
const segments: Segment[] = clip.layout.segments;
if (!segments?.length) { console.error(`Candidate ${clipId} has no layout.segments`); process.exit(1); }

const even = (n: number) => 2 * Math.round(n / 2);
const parts: string[] = [];
const segLabels: string[] = [];

segments.forEach((seg, si) => {
  const segIn = `seg${si}`;
  parts.push(`[0:v]trim=start=${seg.from.toFixed(3)}:end=${seg.to.toFixed(3)},setpts=PTS-STARTPTS[${segIn}]`);
  // crop each band (split the segment stream if there is more than one band)
  const bandLabels = seg.bands.map((_, bi) => `${segIn}b${bi}`);
  if (seg.bands.length > 1) {
    parts.push(`[${segIn}]split=${seg.bands.length}${bandLabels.map((l) => `[${l}i]`).join("")}`);
  } else {
    parts.push(`[${segIn}]null[${bandLabels[0]}i]`);
  }
  let totalH = 0;
  seg.bands.forEach((b, bi) => {
    const scaledH = even((O.width * b.h) / b.w);
    totalH += scaledH;
    parts.push(`[${bandLabels[bi]}i]crop=${even(b.w)}:${even(b.h)}:${Math.round(b.x)}:${Math.round(b.y)},scale=${O.width}:${scaledH}[${bandLabels[bi]}]`);
  });
  let stk = `${segIn}stk`;
  if (seg.bands.length > 1) {
    parts.push(`${bandLabels.map((l) => `[${l}]`).join("")}vstack=inputs=${seg.bands.length}[${stk}]`);
  } else {
    stk = bandLabels[0];
  }
  // normalize every segment to exactly 1080x1920; undersized stacks sit on a
  // blurred, slightly darkened zoom-fill of themselves instead of black bars
  const out = `s${si}`;
  if (totalH < O.height) {
    parts.push(`[${stk}]split[${out}bs][${out}fg]`);
    parts.push(`[${out}bs]scale=${O.width}:${O.height}:force_original_aspect_ratio=increase,crop=${O.width}:${O.height},gblur=sigma=30,eq=brightness=-0.06[${out}bg]`);
    parts.push(`[${out}bg][${out}fg]overlay=0:${even((O.height - totalH) / 2)}[${out}]`);
  } else if (totalH > O.height) {
    parts.push(`[${stk}]crop=${O.width}:${O.height}:0:${even((totalH - O.height) / 2)}[${out}]`);
  } else {
    parts.push(`[${stk}]null[${out}]`);
  }
  segLabels.push(`[${out}]`);
});

const joined = segments.length > 1 ? "cat" : "s0";
if (segments.length > 1) parts.push(`${segLabels.join("")}concat=n=${segments.length}:v=1:a=0[cat]`);
parts.push(`[${joined}]subtitles=filename='${assPath}'[v]`);

const durationSec = clip.end - clip.start;
const args = [
  "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-stats",
  "-ss", String(clip.start), "-t", String(durationSec),
  "-i", resolve(join(dir, "raw", project.source)),
  "-filter_complex", parts.join(";"),
  "-map", "[v]", "-map", "0:a",
  "-c:v", "libx264", "-crf", String(O.crf), "-preset", O.preset,
  "-c:a", "aac", "-b:a", O.audioBitrate, "-ar", String(O.audioRate), "-ac", "2",
  "-movflags", "+faststart",
  outPath,
];
console.log(`[render] ${clipId} "${clip.title}" ${fmtTime(clip.start)}→${fmtTime(clip.end)} (${durationSec.toFixed(1)}s, ${segments.length} segment(s))`);
await run(args, { stderr: true });

const got = await ffprobeDuration(outPath);
const drift = Math.abs(got - durationSec);
console.log(`[done] ${outPath}: ${fmtTime(got)}${drift > 0.5 ? `  ⚠ drift ${drift.toFixed(2)}s vs plan` : ""}`);
