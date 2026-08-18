// Shared helpers for the video-editing skills (rough-cut, make-clips). Zero dependencies, Bun only.
import { existsSync } from "node:fs";
import { join, basename } from "node:path";

export interface Params {
  maxPauseSec: number;      // silences longer than this get collapsed to this
  edgePauseSec: number;     // silence kept at clip start/end (per side)
  silenceNoiseDb: number;   // silencedetect noise threshold (dB)
  silenceMinSec: number;    // minimum silence duration to detect
  fillerWords: string[];    // normalized filler tokens to cut
  fillerPadSec: number;     // padding around filler cuts
  stretchedWordSec: number; // words spanning longer than this absorbed a silence (Scribe quirk)
  minSegmentSec: number;    // drop keep-segments shorter than this
  audioFadeSec: number;     // micro fade per segment to avoid clicks
  crf: number;
  preset: string;
  audioBitrate: string;
  audioRate: number;
}

export interface Project {
  name: string;
  created: string;
  sourceFolder: string;
  clips: string[];
  params: Params;
}

export interface Range { start: number; end: number; }
export interface Cut extends Range {
  type: "filler" | "content" | "silence" | "edge";
  reason?: string;
}
export interface ClipPlan {
  name: string;
  duration: number;
  keep: Range[];
  cuts: Cut[];
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  type: "word" | "spacing" | "audio_event";
  speaker_id?: string; // present when transcribed with diarize=true (anonymous: "speaker_0", …)
}

// Bun only auto-loads .env from the CURRENT working directory; scripts are often
// invoked from elsewhere. Fall back to the repo root's .env (scripts live at
// <repo>/.claude/skills/<skill>/scripts).
export async function apiKey(name: string): Promise<string | undefined> {
  if (process.env[name]) return process.env[name];
  const envFile = join(import.meta.dir, "..", "..", "..", "..", ".env");
  if (!existsSync(envFile)) return undefined;
  const text = await Bun.file(envFile).text();
  const m = text.match(new RegExp(`^${name}=["']?([^"'\\n]+)`, "m"));
  return m?.[1];
}

// Append a transcription-cost entry to <projectDir>/costs.json (Scribe bills per
// hour of input audio). Keeps a running total so important-notes.md can cite it.
export const SCRIBE_USD_PER_AUDIO_HOUR = 0.22;
export async function logCost(dir: string, file: string, audioSec: number): Promise<void> {
  const path = join(dir, "costs.json");
  const ledger = existsSync(path)
    ? await Bun.file(path).json()
    : { currency: "USD", pricePerAudioHour: SCRIBE_USD_PER_AUDIO_HOUR, entries: [] };
  ledger.entries.push({
    date: new Date().toISOString().slice(0, 10),
    file,
    audioSec: Math.round(audioSec * 10) / 10,
    estUsd: Math.round((audioSec / 3600) * SCRIBE_USD_PER_AUDIO_HOUR * 1000) / 1000,
  });
  ledger.totalAudioSec = Math.round(ledger.entries.reduce((s: number, e: { audioSec: number }) => s + e.audioSec, 0));
  ledger.totalEstUsd = Math.round(ledger.entries.reduce((s: number, e: { estUsd: number }) => s + e.estUsd, 0) * 100) / 100;
  await Bun.write(path, JSON.stringify(ledger, null, 2));
}

export function projectDirFromArgs(): string {
  const dir = process.argv[2];
  if (!dir || !existsSync(join(dir, "project.json"))) {
    console.error(`Usage: bun ${basename(process.argv[1])} <project-dir>   (project-dir must contain project.json)`);
    process.exit(1);
  }
  return dir;
}

export async function loadProject(dir: string): Promise<Project> {
  return await Bun.file(join(dir, "project.json")).json();
}

export const clipBase = (name: string) => name.replace(/\.[^.]+$/, "");

export function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export async function run(cmd: string[], opts: { stderr?: boolean } = {}): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd[0]} failed (exit ${code}):\n${err.slice(-2000)}`);
  return opts.stderr ? err : out;
}

export async function ffprobeDuration(file: string): Promise<number> {
  const out = await run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(out.trim());
}

// --- range math (all on a clip's original timeline) ---

export function mergeRanges<T extends Range>(ranges: T[]): T[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: T[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 1e-6) {
      if (r.end > last.end) last.end = r.end;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

export function subtractRanges(total: Range, cuts: Range[]): Range[] {
  const merged = mergeRanges(cuts.map((c) => ({
    start: Math.max(total.start, c.start),
    end: Math.min(total.end, c.end),
  })).filter((c) => c.end > c.start));
  const keep: Range[] = [];
  let cursor = total.start;
  for (const c of merged) {
    if (c.start > cursor) keep.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < total.end) keep.push({ start: cursor, end: total.end });
  return keep;
}

export function intersectRanges(a: Range[], b: Range[]): Range[] {
  const out: Range[] = [];
  for (const x of a) for (const y of b) {
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
  }
  return out.sort((x, y) => x.start - y.start);
}

export const rangesLength = (rs: Range[]) => rs.reduce((s, r) => s + (r.end - r.start), 0);
