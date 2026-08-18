// Extract mono 16k audio per clip and transcribe with ElevenLabs Scribe v2 (verbatim,
// word-level timestamps — fillers like "um"/"uh" are included by default; never set no_verbatim).
// Usage: bun transcribe.ts <project-dir>
// Requires ELEVENLABS_API_KEY in the environment (Bun auto-loads .env from cwd).
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { projectDirFromArgs, loadProject, clipBase, run, fmtTime, apiKey as loadKey, ffprobeDuration, logCost, type TranscriptWord } from "./lib";

const dir = projectDirFromArgs();
const project = await loadProject(dir);

const apiKey = await loadKey("ELEVENLABS_API_KEY");
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY is not set. Add it to .env in the repo root, then re-run.");
  process.exit(1);
}

mkdirSync(join(dir, "audio"), { recursive: true });
mkdirSync(join(dir, "transcripts"), { recursive: true });

function readableTranscript(words: TranscriptWord[]): string {
  const lines: string[] = [];
  let line: TranscriptWord[] = [];
  const flush = () => {
    if (line.length === 0) return;
    const text = line.map((w) => (w.type === "audio_event" ? `(${w.text})` : w.text)).join(" ").replace(/\s+/g, " ").trim();
    lines.push(`[${fmtTime(line[0].start)} - ${fmtTime(line[line.length - 1].end)}] ${text}`);
    line = [];
  };
  let prevEnd = 0;
  for (const w of words) {
    if (w.type === "spacing") continue;
    if (line.length > 0 && (w.start - prevEnd > 1.0 || line.length >= 28)) flush();
    line.push(w);
    prevEnd = w.end;
  }
  flush();
  return lines.join("\n") + "\n";
}

for (const clip of project.clips) {
  const base = clipBase(clip);
  const flac = join(dir, "audio", `${base}.flac`);
  const jsonPath = join(dir, "transcripts", `${base}.json`);
  const txtPath = join(dir, "transcripts", `${base}.txt`);

  if (!existsSync(flac)) {
    console.log(`[audio] extracting ${base}.flac`);
    await run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
      "-i", join(dir, "raw", clip), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", flac]);
  }

  if (existsSync(jsonPath)) {
    console.log(`[skip] ${base} already transcribed`);
    continue;
  }

  console.log(`[scribe] transcribing ${base} ...`);
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("timestamps_granularity", "word");
  form.append("diarize", "false");
  form.append("file", Bun.file(flac), `${base}.flac`);

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    console.error(`Scribe API error ${res.status} for ${base}:\n${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();
  await Bun.write(jsonPath, JSON.stringify(data, null, 2));
  await Bun.write(txtPath, readableTranscript(data.words ?? []));
  await logCost(dir, `${base}.flac`, await ffprobeDuration(flac));
  const nWords = (data.words ?? []).filter((w: TranscriptWord) => w.type === "word").length;
  console.log(`[done] ${base}: ${nWords} words, language=${data.language_code} (p=${data.language_probability?.toFixed?.(2)})`);
}
console.log("All clips transcribed.");
