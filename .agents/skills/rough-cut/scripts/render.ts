// Render keep-segments per clip (frame-accurate re-encode with micro audio fades),
// then losslessly concat the uniformly-encoded parts into output/final.mp4.
// Usage: bun render.ts <project-dir> [--force]
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { projectDirFromArgs, loadProject, clipBase, fmtTime, ffprobeDuration, rangesLength, type ClipPlan } from "./lib";

const dir = projectDirFromArgs();
const force = process.argv.includes("--force");
const project = await loadProject(dir);
const P = project.params;

const plan: { clips: ClipPlan[]; totalKeptSec: number } =
  await Bun.file(join(dir, "cuts", "cuts.json")).json();

const partsDir = join(dir, "output", "parts");
mkdirSync(partsDir, { recursive: true });

const partFiles: string[] = [];

for (const clip of plan.clips) {
  if (clip.keep.length === 0) {
    console.log(`[skip] ${clip.name}: nothing kept`);
    continue;
  }
  const base = clipBase(clip.name);
  const part = join(partsDir, `${base}.mp4`);
  partFiles.push(part);
  if (existsSync(part) && !force) {
    console.log(`[skip] ${base}.mp4 already rendered (use --force to redo)`);
    continue;
  }

  // Build filtergraph: trim each keep-segment, micro-fade audio edges, concat.
  const F = P.audioFadeSec;
  const graph: string[] = [];
  clip.keep.forEach((r, i) => {
    const len = r.end - r.start;
    const fade = Math.min(F, len / 4);
    graph.push(`[0:v]trim=start=${r.start.toFixed(4)}:end=${r.end.toFixed(4)},setpts=PTS-STARTPTS[v${i}]`);
    graph.push(`[0:a]atrim=start=${r.start.toFixed(4)}:end=${r.end.toFixed(4)},asetpts=PTS-STARTPTS,` +
      `afade=t=in:st=0:d=${fade.toFixed(4)},afade=t=out:st=${(len - fade).toFixed(4)}:d=${fade.toFixed(4)}[a${i}]`);
  });
  graph.push(clip.keep.map((_, i) => `[v${i}][a${i}]`).join("") +
    `concat=n=${clip.keep.length}:v=1:a=1[v][a]`);
  const graphFile = join(partsDir, `${base}.filter`);
  await Bun.write(graphFile, graph.join(";\n"));

  console.log(`[render] ${base}: ${clip.keep.length} segments → ${fmtTime(rangesLength(clip.keep))}`);
  const proc = Bun.spawn(["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning", "-stats",
    "-i", join(dir, "raw", clip.name),
    "-filter_complex_script", graphFile,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", P.preset, "-crf", String(P.crf),
    "-c:a", "aac", "-b:a", P.audioBitrate, "-ar", String(P.audioRate),
    "-movflags", "+faststart", part,
  ], { stdout: "inherit", stderr: "inherit" });
  if ((await proc.exited) !== 0) {
    console.error(`ffmpeg failed on ${base}`);
    process.exit(1);
  }
}

// Concat identically-encoded parts without re-encoding.
// NOTE: paths in a concat list resolve relative to the LIST FILE's directory — use absolute paths.
const listFile = join(dir, "output", "concat.txt");
await Bun.write(listFile, partFiles.map((f) => `file '${resolve(f).replace(/'/g, "'\\''")}'`).join("\n") + "\n");
const finalPath = join(dir, "output", "final.mp4");
console.log(`[concat] ${partFiles.length} parts → final.mp4`);
const proc = Bun.spawn(["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
  "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", finalPath,
], { stdout: "inherit", stderr: "inherit" });
if ((await proc.exited) !== 0) {
  console.error("ffmpeg concat failed");
  process.exit(1);
}

const actual = await ffprobeDuration(finalPath);
console.log(`final.mp4: ${fmtTime(actual)} (planned ${fmtTime(plan.totalKeptSec)})`);
if (Math.abs(actual - plan.totalKeptSec) > 2) {
  console.warn("WARNING: final duration deviates >2s from plan — inspect parts.");
}
