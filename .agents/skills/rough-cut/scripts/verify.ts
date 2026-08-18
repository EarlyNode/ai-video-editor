// QA the rendered final video: re-transcribe it with Scribe and flag residual
// dead air — word gaps OR stretched words longer than maxPauseSec + tolerance.
// Costs one extra transcription (~$0.22/audio-hour). Writes cuts/verify-report.md.
// Usage: bun verify.ts <project-dir>
import { existsSync } from "node:fs";
import { join } from "node:path";
import { projectDirFromArgs, loadProject, fmtTime, ffprobeDuration, run, apiKey as loadKey, logCost, type TranscriptWord } from "./lib";

const dir = projectDirFromArgs();
const project = await loadProject(dir);
const P = project.params;
const TOLERANCE = 0.6; // allow encoder/timestamp slack beyond maxPauseSec

const finalPath = join(dir, "output", "final.mp4");
if (!existsSync(finalPath)) {
  console.error("output/final.mp4 not found — render first.");
  process.exit(1);
}
const apiKey = await loadKey("ELEVENLABS_API_KEY");
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY is not set. Add it to .env in the repo root, then re-run.");
  process.exit(1);
}

const flac = join(dir, "output", "final-audio.flac");
const transcriptPath = join(dir, "transcripts", "_final.json");
console.log("[audio] extracting final-audio.flac");
await run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
  "-i", finalPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", flac]);

console.log("[scribe] transcribing final video for verification...");
const form = new FormData();
form.append("model_id", "scribe_v2");
form.append("timestamps_granularity", "word");
form.append("diarize", "false");
form.append("file", Bun.file(flac), "final.flac");
const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
  method: "POST",
  headers: { "xi-api-key": apiKey },
  body: form,
});
if (!res.ok) {
  console.error(`Scribe API error ${res.status}:\n${await res.text()}`);
  process.exit(1);
}
const data = await res.json();
await Bun.write(transcriptPath, JSON.stringify(data, null, 2));
await logCost(dir, "final-audio.flac (verify)", await ffprobeDuration(flac));

const duration = await ffprobeDuration(finalPath);
const words: TranscriptWord[] = (data.words ?? []).filter((w: TranscriptWord) => w.type === "word");

interface Issue { at: number; len: number; kind: string; context: string; }
const issues: Issue[] = [];
const limit = P.maxPauseSec + TOLERANCE;

for (let i = 1; i < words.length; i++) {
  const gap = words[i].start - words[i - 1].end;
  if (gap > limit) {
    issues.push({
      at: words[i - 1].end, len: gap, kind: "gap",
      context: `…${words[i - 1].text} ⏸ ${words[i].text}…`,
    });
  }
}
for (const w of words) {
  const span = w.end - w.start;
  if (span > (P.stretchedWordSec ?? 3.5)) {
    issues.push({ at: w.start, len: span, kind: "stretched word", context: `"${w.text}"` });
  }
}
if (words.length > 0) {
  if (words[0].start > limit) issues.push({ at: 0, len: words[0].start, kind: "leading silence", context: `before "${words[0].text}"` });
  const lastEnd = words[words.length - 1].end;
  if (duration - lastEnd > limit) issues.push({ at: lastEnd, len: duration - lastEnd, kind: "trailing silence", context: `after "${words[words.length - 1].text}"` });
}
issues.sort((a, b) => a.at - b.at);

const lines = [`# Verify report — ${project.name}`, "", `final.mp4: ${fmtTime(duration)}, ${words.length} words. Pause limit: ${limit.toFixed(1)}s.`, ""];
if (issues.length === 0) {
  lines.push("**PASS** — no residual dead air detected.");
} else {
  lines.push(`**${issues.length} issue(s) found:**`, "");
  for (const i of issues) lines.push(`- ${fmtTime(i.at)} ${i.kind} of ${i.len.toFixed(1)}s — ${i.context}`);
  lines.push("", "Stretched words here may also just be the transcriber re-absorbing an intentional 2s pause into a token — eyeball the listed spots before re-cutting.");
}
await Bun.write(join(dir, "cuts", "verify-report.md"), lines.join("\n") + "\n");

console.log(issues.length === 0
  ? `PASS — ${fmtTime(duration)}, no residual dead air.`
  : `${issues.length} issue(s) — see cuts/verify-report.md`);
for (const i of issues.slice(0, 20)) {
  console.log(`  ${fmtTime(i.at)} ${i.kind} ${i.len.toFixed(1)}s ${i.context}`);
}
