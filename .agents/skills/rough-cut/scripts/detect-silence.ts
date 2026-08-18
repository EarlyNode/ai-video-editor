// Detect silences in each clip with ffmpeg silencedetect → cuts/silences.json
// Usage: bun detect-silence.ts <project-dir>
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { projectDirFromArgs, loadProject, run, ffprobeDuration, type Range } from "./lib";

const dir = projectDirFromArgs();
const project = await loadProject(dir);
const { silenceNoiseDb, silenceMinSec } = project.params;

mkdirSync(join(dir, "cuts"), { recursive: true });

const result: Record<string, { duration: number; silences: Range[] }> = {};

for (const clip of project.clips) {
  const file = join(dir, "raw", clip);
  const duration = await ffprobeDuration(file);
  const stderr = await run(["ffmpeg", "-hide_banner", "-nostats", "-i", file,
    "-af", `silencedetect=noise=${silenceNoiseDb}dB:d=${silenceMinSec}`, "-f", "null", "-"], { stderr: true });

  const silences: Range[] = [];
  let start: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start: ([\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = parseFloat(s[1]);
    if (e && start !== null) {
      silences.push({ start, end: parseFloat(e[1]) });
      start = null;
    }
  }
  if (start !== null) silences.push({ start, end: duration }); // trailing silence runs to EOF

  result[clip] = { duration, silences };
  const total = silences.reduce((s, r) => s + (r.end - r.start), 0);
  console.log(`${clip}: ${duration.toFixed(1)}s, ${silences.length} silences (${total.toFixed(1)}s total)`);
}

await Bun.write(join(dir, "cuts", "silences.json"), JSON.stringify(result, null, 2));
console.log(`Wrote ${join(dir, "cuts", "silences.json")}`);
