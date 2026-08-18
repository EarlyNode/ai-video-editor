// Merge filler-word cuts, agent-authored content cuts, edge trims and long-pause
// collapses into keep-segments per clip → cuts/cuts.json + cuts/report.md
// Pauses are derived from TRANSCRIPT WORD GAPS, not audio silence — screen recordings
// carry room/keyboard noise above any sane silencedetect threshold, so word timestamps
// are the reliable pause signal. cuts/silences.json is used for duration + diagnostics only.
// Usage: bun plan-cuts.ts <project-dir>
// Inputs: transcripts/<clip>.json, cuts/silences.json, cuts/content-cuts.json (optional)
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  projectDirFromArgs, loadProject, clipBase, fmtTime,
  mergeRanges, subtractRanges, intersectRanges, rangesLength,
  type Range, type Cut, type ClipPlan, type TranscriptWord,
} from "./lib";

const dir = projectDirFromArgs();
const project = await loadProject(dir);
const P = project.params;
const fillerSet = new Set(P.fillerWords.map((w) => w.toLowerCase()));

const silencesAll: Record<string, { duration: number; silences: Range[] }> =
  await Bun.file(join(dir, "cuts", "silences.json")).json();

interface ContentCut { clip: string; start: number; end: number; reason: string; }
const contentCutsPath = join(dir, "cuts", "content-cuts.json");
const contentCutsAll: ContentCut[] = existsSync(contentCutsPath)
  ? await Bun.file(contentCutsPath).json()
  : [];
const extraCutsPath = join(dir, "cuts", "extra-cuts.json");
const extraCutsAll: ContentCut[] = existsSync(extraCutsPath)
  ? await Bun.file(extraCutsPath).json()
  : [];

const normalize = (s: string) => s.toLowerCase().replace(/[^a-zäöü]/g, "");

const plans: ClipPlan[] = [];

for (const clip of project.clips) {
  const { duration } = silencesAll[clip];
  const transcript = await Bun.file(join(dir, "transcripts", `${clipBase(clip)}.json`)).json();
  const words: TranscriptWord[] = (transcript.words ?? []).filter((w: TranscriptWord) => w.type === "word");
  // Pauses are gaps between WORDS only. Audio events (typing, clattering, coughs)
  // during waits are exactly the dead time to collapse; a laugh right after speech
  // survives inside the kept maxPauseSec/2 padding.
  const sounds: TranscriptWord[] = [...words].sort((a, b) => a.start - b.start);

  const cuts: Cut[] = [];

  // 1. Filler words + stutter fragments — aggressive, clamped to neighboring words
  //    so speech is never clipped. Scribe marks interrupted words with trailing
  //    hyphens ("sh--", "m-", "also--"); cut those too.
  const isStutter = (t: string) => /[a-zäöü]-+[.,!?]*$/i.test(t.trim());
  for (let i = 0; i < words.length; i++) {
    if (!fillerSet.has(normalize(words[i].text)) && !isStutter(words[i].text)) continue;
    const prevEnd = i > 0 ? words[i - 1].end : 0;
    const nextStart = i < words.length - 1 ? words[i + 1].start : duration;
    const start = Math.max(prevEnd, words[i].start - P.fillerPadSec);
    const end = Math.min(nextStart, words[i].end + P.fillerPadSec);
    if (end > start) cuts.push({ start, end, type: "filler", reason: words[i].text });
  }

  // 2. Agent-authored content cuts (off-topic, editor instructions, failed retakes)
  for (const c of contentCutsAll.filter((c) => c.clip === clip)) {
    cuts.push({ start: c.start, end: c.end, type: "content", reason: c.reason });
  }

  // 2b. Refinement cuts from the verify->refine loop (original-clip coordinates).
  //    They also REDUCE the pause budget of the gap they sit in (see step 5):
  //    a refined gap measured 3s in the final video despite a 2s kept pause —
  //    word-boundary slop — so re-keeping the full maxPauseSec would swallow
  //    the refinement and never converge.
  const extraMerged = mergeRanges(
    extraCutsAll.filter((c) => c.clip === clip).map((c) => ({ start: c.start, end: c.end })));
  for (const c of extraCutsAll.filter((c) => c.clip === clip)) {
    cuts.push({ start: c.start, end: c.end, type: "silence", reason: c.reason });
  }
  const extraIn = (g: { start: number; end: number }) =>
    rangesLength(intersectRanges(extraMerged, [g]));

  // 3. Stretched words: Scribe sometimes absorbs a long silence INTO a word's span,
  //    even merging the words on both sides of a multi-minute wait into one token
  //    (e.g. "online.Okay," spanning 137s). Word-gap detection is blind to these.
  //    Speech can only sit at the edges of such a span — keep an utterance guard
  //    plus half the allowed pause per side, cut the middle.
  const stretchedGuard = 0.8 + P.maxPauseSec / 2;
  for (const w of words) {
    const span = w.end - w.start;
    if (span <= (P.stretchedWordSec ?? 3.5)) continue;
    const start = w.start + stretchedGuard;
    const end = w.end - stretchedGuard;
    if (end > start) {
      cuts.push({
        start, end, type: "silence",
        reason: `stretched word "${w.text}" (${span.toFixed(1)}s) — silence absorbed by transcription`,
      });
    }
  }

  // 4. Pauses = gaps between transcribed sounds (words + audio events).
  //    Interior gaps > maxPauseSec get collapsed; leading/trailing gaps become edge trims.
  const gaps: Range[] = [];
  if (sounds.length > 0) {
    if (sounds[0].start > 0) gaps.push({ start: 0, end: sounds[0].start });
    for (let i = 1; i < sounds.length; i++) {
      const gap = { start: sounds[i - 1].end, end: sounds[i].start };
      if (gap.end > gap.start) gaps.push(gap);
    }
    const lastEnd = sounds[sounds.length - 1].end;
    if (lastEnd < duration) gaps.push({ start: lastEnd, end: duration });
  }

  const interiorGaps: Range[] = [];
  for (const g of gaps) {
    if (g.start === 0) {
      const keep = Math.max(0, P.edgePauseSec - extraIn(g));
      if (g.end - keep > 0) cuts.push({ start: 0, end: g.end - keep, type: "edge", reason: "leading pause" });
    } else if (g.end === duration) {
      const keep = Math.max(0, P.edgePauseSec - extraIn(g));
      if (g.start + keep < duration) cuts.push({ start: g.start + keep, end: duration, type: "edge", reason: "trailing pause" });
    } else {
      interiorGaps.push(g);
    }
  }

  // 5. Collapse long pauses to maxPauseSec — measured on what's KEPT after the cuts above,
  //    so a pause enlarged by filler/content cuts is still collapsed correctly.
  const keep1 = subtractRanges({ start: 0, end: duration }, cuts);
  for (const g of interiorGaps) {
    const pieces = intersectRanges([g], keep1);
    const total = rangesLength(pieces);
    const budget = Math.max(0, P.maxPauseSec - extraIn(g)); // verified slop shrinks the budget
    if (total <= budget + 0.05) continue;
    const excess = total - budget;
    // Asymmetric split: keep more silence as LEAD before the next word than as TRAIL
    // after the previous one. The old symmetric budget/2 left only ~0.2s lead at tight
    // pacing (maxPauseSec 0.4) and clipped soft onsets ("so", "the", "comply"). Lead
    // protects the onset; trailing silence after a finished word can be short.
    const leadKeep = Math.min(budget * 0.7, 0.35);
    const head = Math.max(0, budget - leadKeep); // trail kept after prev word; lead = budget - head
    let c = 0;
    for (const piece of pieces) {
      const len = piece.end - piece.start;
      const lo = Math.max(head, c);
      const hi = Math.min(head + excess, c + len);
      if (hi > lo) {
        cuts.push({
          start: piece.start + (lo - c), end: piece.start + (hi - c),
          type: "silence", reason: `pause ${total.toFixed(1)}s → ${P.maxPauseSec.toFixed(1)}s`,
        });
      }
      c += len;
    }
  }

  // 6. Final keep-segments; drop slivers
  //    A short kept segment with NO word in it is just silence/breath stranded between
  //    stacked cuts (filler + content + pause). Rendered, those slivers read as a visual
  //    flicker ("three clips concatenated"). Drop them so the neighbouring cuts merge.
  const hasWord = (r: Range) => words.some((w) => w.end > r.start && w.start < r.end);
  let keep = subtractRanges({ start: 0, end: duration }, cuts);
  keep = keep.filter((r) => {
    const dur = r.end - r.start;
    if (dur < P.minSegmentSec) return false;
    if (dur < 0.4 && !hasWord(r)) return false;
    return true;
  });

  plans.push({ name: clip, duration, keep, cuts: cuts.sort((a, b) => a.start - b.start) });
}

// --- outputs ---
const totalOrig = plans.reduce((s, p) => s + p.duration, 0);
const totalKept = plans.reduce((s, p) => s + rangesLength(p.keep), 0);

await Bun.write(join(dir, "cuts", "cuts.json"), JSON.stringify({
  generated: new Date().toISOString(),
  params: P,
  totalOriginalSec: totalOrig,
  totalKeptSec: totalKept,
  clips: plans,
}, null, 2));

const lines: string[] = [];
lines.push(`# Cut report — ${project.name}`, "");
lines.push(`Original: **${fmtTime(totalOrig)}** → Final (planned): **${fmtTime(totalKept)}** (removed ${fmtTime(totalOrig - totalKept)})`, "");
for (const p of plans) {
  const by = (t: Cut["type"]) => p.cuts.filter((c) => c.type === t);
  const cutLen = (cs: Cut[]) => rangesLength(mergeRanges(cs));
  lines.push(`## ${p.name}`);
  lines.push(`${fmtTime(p.duration)} → ${fmtTime(rangesLength(p.keep))} | ` +
    `fillers: ${by("filler").length} (${cutLen(by("filler")).toFixed(1)}s), ` +
    `content: ${by("content").length} (${cutLen(by("content")).toFixed(1)}s), ` +
    `silences: ${by("silence").length} (${cutLen(by("silence")).toFixed(1)}s), ` +
    `edges: ${cutLen(by("edge")).toFixed(1)}s`, "");
  for (const c of by("content")) {
    lines.push(`- **content** ${fmtTime(c.start)}–${fmtTime(c.end)}: ${c.reason}`);
  }
  const fillers = by("filler");
  if (fillers.length > 0) {
    lines.push(`- fillers cut: ${fillers.map((c) => `${c.reason}@${fmtTime(c.start)}`).join(", ")}`);
  }
  for (const c of by("silence")) {
    lines.push(`- silence ${fmtTime(c.start)}–${fmtTime(c.end)} (${c.reason})`);
  }
  lines.push("");
}
await Bun.write(join(dir, "cuts", "report.md"), lines.join("\n"));

console.log(`Planned: ${fmtTime(totalOrig)} → ${fmtTime(totalKept)}`);
console.log(`Wrote cuts/cuts.json and cuts/report.md`);
