// Dump word-level timestamps for a time window, interleaved across all mics, to author exact clip
// shot boundaries (hook in/out, content trims, where to cut to the reactor / 2-up). Cuts must land
// on these word boundaries.
// Run from REPO ROOT:  bun dump-words.ts <projectDir> <startSec> <endSec>
import { join } from "path";

const [projectDir, a, b] = process.argv.slice(2);
if (!projectDir || a == null || b == null) { console.error("usage: bun dump-words.ts <projectDir> <start> <end>"); process.exit(1); }
const spec = await Bun.file(join(projectDir, "clips", "clips.json")).json();
const rows: { s: number; e: number; spk: string; text: string }[] = [];
for (const [id, sp] of Object.entries<any>(spec.speakers)) {
  const t = await Bun.file(join(projectDir, "transcripts", sp.transcript)).json();
  for (const w of t.words) if (w.type === "word" && w.start >= +a && w.start <= +b) rows.push({ s: w.start, e: w.end, spk: id, text: w.text });
}
rows.sort((x, y) => x.s - y.s);
for (const r of rows) console.log(`${r.s.toFixed(2)}-${r.e.toFixed(2)} ${r.spk.toUpperCase().padEnd(6)} ${JSON.stringify(r.text)}`);
