// Build a readable, interleaved speaker-turn transcript from the per-mic word transcripts, so the
// agent can peruse the whole conversation to find clip-worthy moments. Timestamps are on the raw
// synced timeline (both mics share a clock) — the exact numbers used to author clip shots.
// Reads speaker ids + transcript filenames from <projectDir>/clips/clips.json.
// Run from REPO ROOT:  bun merge-transcript.ts <projectDir>   ->  transcripts/conversation-turns.txt
import { join } from "path";

const projectDir = process.argv[2];
if (!projectDir) { console.error("usage: bun merge-transcript.ts <projectDir>"); process.exit(1); }
const spec = await Bun.file(join(projectDir, "clips", "clips.json")).json();

type W = { text: string; start: number; end: number; type: string; spk: string };
let words: W[] = [];
for (const [id, s] of Object.entries<any>(spec.speakers)) {
  const t = await Bun.file(join(projectDir, "transcripts", s.transcript)).json();
  words.push(...t.words.filter((w: any) => w.type === "word" && w.text).map((w: any) => ({ ...w, spk: id })));
}
words.sort((a, b) => a.start - b.start);

const ts = (s: number) => { const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(2).padStart(5, "0")}`; };
let out = "", cur: { spk: string; start: number; end: number; text: string } | null = null;
for (const w of words) {
  if (!cur || cur.spk !== w.spk) { if (cur) out += `[${ts(cur.start)}-${ts(cur.end)}] ${cur.spk.toUpperCase()}: ${cur.text}\n`; cur = { spk: w.spk, start: w.start, end: w.end, text: w.text }; }
  else { cur.end = w.end; cur.text += " " + w.text; }
}
if (cur) out += `[${ts(cur.start)}-${ts(cur.end)}] ${cur.spk.toUpperCase()}: ${cur.text}\n`;
const dest = join(projectDir, "transcripts", "conversation-turns.txt");
await Bun.write(dest, out);
console.log(`✓ ${dest}  (${out.split("\n").length - 1} turns, ends ${ts(words.at(-1)!.end)})`);
