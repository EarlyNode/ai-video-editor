// Transcribe the long-form source with ElevenLabs Scribe v2, diarization ON:
// verbatim, word-level timestamps, anonymous speaker labels (speaker_0, …).
// Writes transcripts/<base>.json (raw API), <base>.txt (readable, speaker-turn
// lines) and <base>.speakers.json (per-speaker stats for who-is-who inference).
// Idempotent: skips if the JSON transcript already exists.
// Usage: bun transcribe-diarized.ts <project-dir>
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { projectDirFromArgs, clipBase, run, fmtTime, apiKey as loadKey, ffprobeDuration, logCost, type TranscriptWord } from "../../rough-cut/scripts/lib";

const dir = projectDirFromArgs();
const project = await Bun.file(join(dir, "project.json")).json();

const apiKey = await loadKey("ELEVENLABS_API_KEY");
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY is not set. Add it to .env in the repo root, then re-run.");
  process.exit(1);
}

mkdirSync(join(dir, "audio"), { recursive: true });
mkdirSync(join(dir, "transcripts"), { recursive: true });

// Speaker-turn readable transcript: new line on speaker change, >1s gap, or length.
function readableTranscript(words: TranscriptWord[]): string {
  const lines: string[] = [];
  let line: TranscriptWord[] = [];
  const flush = () => {
    if (line.length === 0) return;
    const text = line.map((w) => (w.type === "audio_event" ? `(${w.text})` : w.text)).join(" ").replace(/\s+/g, " ").trim();
    const who = line.find((w) => w.speaker_id)?.speaker_id ?? "?";
    lines.push(`[${fmtTime(line[0].start)} - ${fmtTime(line[line.length - 1].end)}] ${who}: ${text}`);
    line = [];
  };
  let prevEnd = 0;
  let prevSpeaker: string | undefined;
  for (const w of words) {
    if (w.type === "spacing") continue;
    const speakerChanged = w.type === "word" && w.speaker_id && prevSpeaker && w.speaker_id !== prevSpeaker;
    if (line.length > 0 && (speakerChanged || w.start - prevEnd > 1.0 || line.length >= 28)) flush();
    line.push(w);
    prevEnd = w.end;
    if (w.type === "word" && w.speaker_id) prevSpeaker = w.speaker_id;
  }
  flush();
  return lines.join("\n") + "\n";
}

const source: string = project.source;
const base = clipBase(source);
const flac = join(dir, "audio", `${base}.flac`);
const jsonPath = join(dir, "transcripts", `${base}.json`);

if (!existsSync(flac)) {
  console.log(`[audio] extracting ${base}.flac`);
  await run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
    "-i", join(dir, "raw", source), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", flac]);
}

if (existsSync(jsonPath)) {
  console.log(`[skip] ${base} already transcribed`);
} else {
  console.log(`[scribe] transcribing ${base} (diarized) ...`);
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("timestamps_granularity", "word");
  form.append("diarize", "true"); // anonymous speaker_0/1/… labels per word
  form.append("file", Bun.file(flac), `${base}.flac`);

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
  await Bun.write(jsonPath, JSON.stringify(data, null, 2));
  await Bun.write(join(dir, "transcripts", `${base}.txt`), readableTranscript(data.words ?? []));
  await logCost(dir, `${base}.flac (diarized)`, await ffprobeDuration(flac));
}

// Per-speaker stats — input for the agent's who-is-who inference.
const data = await Bun.file(jsonPath).json();
const words: TranscriptWord[] = (data.words ?? []).filter((w: TranscriptWord) => w.type === "word");
const stats: Record<string, { words: number; speakingSec: number; firstAt: number; sample: string }> = {};
for (const w of words) {
  const id = w.speaker_id ?? "unlabeled";
  if (!stats[id]) stats[id] = { words: 0, speakingSec: 0, firstAt: w.start, sample: "" };
  stats[id].words++;
  stats[id].speakingSec += w.end - w.start;
  if (stats[id].sample.length < 200) stats[id].sample += w.text + " ";
}
for (const s of Object.values(stats)) s.speakingSec = Math.round(s.speakingSec);
await Bun.write(join(dir, "transcripts", `${base}.speakers.json`), JSON.stringify(stats, null, 2));

console.log(`[done] ${base}: ${words.length} words, language=${data.language_code}`);
console.log(`[speakers] detected ${Object.keys(stats).length}:`);
for (const [id, s] of Object.entries(stats)) {
  console.log(`  ${id}: ${s.words} words, ~${s.speakingSec}s speaking, first at ${fmtTime(s.firstAt)} — "${s.sample.slice(0, 80)}…"`);
}
