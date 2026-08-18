// Enumerate RETAKES: the speaker restates a phrase after a stumble/pause, separated by
// other words (not back-to-back — that's detect-dysfluencies). Finds repeated >=4-word
// runs whose two takes start within WINDOW seconds, and proposes cutting the earlier
// take (keep the last/cleanest). Emits candidates only. Catches "given user wants
// alerts..."xN, the macro explained twice, "didn't even catch up... fire off".
//
// Run it on the ORIGINAL transcript first; ALSO run `--final` after the first render —
// Scribe sometimes collapses a real double-take into one token + a "gap" in the original,
// and only transcribes both takes once they are in the rendered audio (the "and that's
// it ... and that's it" case).
// Usage: bun detect-retakes.ts <project-dir> [--final]
import { join } from "node:path";
import { projectDirFromArgs, loadProject, clipBase, fmtTime, type TranscriptWord } from "./lib";

const dir = projectDirFromArgs();
const project = await loadProject(dir);
const useFinal = process.argv.includes("--final");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöü]/g, "");
const N = 4;          // minimum matching run length (words)
const WINDOW = 30;    // seconds — two takes farther apart are treated as legit repetition

interface Cand { clip: string; cutStart: number; cutEnd: number; words: number; phrase: string; takesAt: string; }
const cands: Cand[] = [];

const sources: { clip: string; words: TranscriptWord[] }[] = [];
if (useFinal) {
  const t = await Bun.file(join(dir, "transcripts", "_final.json")).json();
  sources.push({ clip: "_final", words: (t.words ?? []).filter((w: TranscriptWord) => w.type === "word") });
} else {
  for (const clip of project.clips) {
    const t = await Bun.file(join(dir, "transcripts", `${clipBase(clip)}.json`)).json();
    sources.push({ clip, words: (t.words ?? []).filter((w: TranscriptWord) => w.type === "word").sort((a: any, b: any) => a.start - b.start) });
  }
}

for (const { clip, words } of sources) {
  const key = (i: number) => words.slice(i, i + N).map((w) => norm(w.text)).join(" ");
  const index = new Map<string, number[]>();
  for (let i = 0; i + N <= words.length; i++) {
    const k = key(i);
    (index.get(k) ?? index.set(k, []).get(k)!).push(i);
  }
  const covered: [number, number][] = [];
  const isCovered = (a: number, b: number) => covered.some(([x, y]) => a < y && x < b);
  for (const positions of index.values()) {
    if (positions.length < 2) continue;
    for (let p = 0; p < positions.length - 1; p++) {
      const i = positions[p], j = positions[p + 1];
      if (j <= i || words[j].start - words[i].start > WINDOW) continue;
      if (isCovered(i, j)) continue;
      // extend the matching run as far as it goes (without overlapping the second take)
      let L = N;
      while (i + L < j && j + L < words.length && norm(words[i + L].text) === norm(words[j + L].text)) L++;
      covered.push([i, j + L]);
      cands.push({
        clip, cutStart: words[i].start, cutEnd: words[j].start, words: L,
        phrase: words.slice(i, i + L).map((w) => w.text).join(" "),
        takesAt: `${fmtTime(words[i].start)} -> ${fmtTime(words[j].start)} (keep later)`,
      });
    }
  }
}

cands.sort((a, b) => a.cutStart - b.cutStart);
const out = join(dir, "cuts", useFinal ? "retakes-final.json" : "retakes.json");
await Bun.write(out, JSON.stringify(cands, null, 2));
console.log(`${cands.length} retake candidate(s) -> ${out} (review; many will be legit repetition — keep only true re-takes):`);
for (const c of cands) console.log(`  cut ${fmtTime(c.cutStart)}–${fmtTime(c.cutEnd)}  (${c.words}w)  "${c.phrase.slice(0, 60)}"  [${c.takesAt}]`);
