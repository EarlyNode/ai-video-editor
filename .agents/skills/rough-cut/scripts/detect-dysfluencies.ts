// Enumerate IMMEDIATE word/phrase repeats (stumbles) across the WHOLE transcript, so
// analyzeContent reviews a complete candidate list instead of whatever it happened to
// spot while reading. Emits candidates only — the agent promotes the real ones into
// cuts/content-cuts.json. Catches "and a bunch of"x2, "then it, then it", "Next, next",
// "so, so", "A lot of the UI tests..."x2 — the class that kept slipping through.
// Usage: bun detect-dysfluencies.ts <project-dir>
import { join } from "node:path";
import { projectDirFromArgs, loadProject, clipBase, fmtTime, type TranscriptWord } from "./lib";

const dir = projectDirFromArgs();
const project = await loadProject(dir);
const P = project.params;
const fillerSet = new Set(P.fillerWords.map((w) => w.toLowerCase()));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöü]/g, "");
const isStutter = (t: string) => /[a-zäöü]-+[.,!?]*$/i.test(t.trim());
const MAX_GAP = 2.0;   // seconds between the two takes — a stumble, not a deliberate later echo
const MAX_LEN = 6;     // longest repeated phrase to look for

interface Cand { clip: string; start: number; end: number; len: number; kind: string; text: string; }
const cands: Cand[] = [];

for (const clip of project.clips) {
  const t = await Bun.file(join(dir, "transcripts", `${clipBase(clip)}.json`)).json();
  const words: TranscriptWord[] = (t.words ?? [])
    .filter((w: TranscriptWord) => w.type === "word")
    .sort((a: TranscriptWord, b: TranscriptWord) => a.start - b.start);
  // Speech tokens only — fillers/stutters are removed by plan-cuts, so a repeat split
  // by "uh"/"sh--" ("and a bunch of, s-- and a bunch of") still counts as back-to-back.
  const spk = words.filter((w) => norm(w.text) && !fillerSet.has(norm(w.text)) && !isStutter(w.text));

  for (let i = 1; i < spk.length;) {
    let best = 0;
    for (let L = Math.min(MAX_LEN, i, spk.length - i); L >= 1; L--) {
      let match = true;
      for (let k = 0; k < L; k++) if (norm(spk[i - L + k].text) !== norm(spk[i + k].text)) { match = false; break; }
      if (match && spk[i].start - spk[i - 1].end <= MAX_GAP) { best = L; break; }
    }
    if (best) {
      // cut the FIRST take: from its first word up to the second take's first word.
      cands.push({
        clip, start: spk[i - best].start, end: spk[i].start, len: best,
        kind: best === 1 ? "word-repeat" : "phrase-repeat",
        text: spk.slice(i - best, i).map((w) => w.text).join(" "),
      });
      i += best; // don't re-detect the same repeat
    } else i++;
  }
}

cands.sort((a, b) => a.start - b.start);
await Bun.write(join(dir, "cuts", "dysfluencies.json"), JSON.stringify(cands, null, 2));
console.log(`${cands.length} immediate-repeat candidate(s) -> cuts/dysfluencies.json (review, then promote real ones into content-cuts.json):`);
for (const c of cands) console.log(`  ${fmtTime(c.start)}–${fmtTime(c.end)}  [${c.kind}]  "${c.text}"`);
