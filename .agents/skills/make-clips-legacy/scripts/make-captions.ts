// Generate Descript-style karaoke captions for one clip candidate as an .ass file:
// the current phrase (≤ maxWordsPerLine words) stays visible, the word being
// spoken is highlighted — one Dialogue event per word, timed from the Scribe
// word timestamps (shifted to clip-local time). Burned in later by render-clip.ts.
// Usage: bun make-captions.ts <project-dir> <clip-id>
import { join } from "node:path";
import { clipBase, type TranscriptWord } from "../../rough-cut/scripts/lib";

const dir = process.argv[2];
const clipId = process.argv[3];
if (!dir || !clipId) {
  console.error("Usage: bun make-captions.ts <project-dir> <clip-id>");
  process.exit(1);
}
const project = await Bun.file(join(dir, "project.json")).json();
const C = project.params.captions;
const candidates = await Bun.file(join(dir, "clips", "candidates.json")).json();
const clip = candidates.find((c: { id: string }) => c.id === clipId);
if (!clip) { console.error(`No candidate with id "${clipId}" in clips/candidates.json`); process.exit(1); }

const transcript = await Bun.file(join(dir, "transcripts", `${clipBase(project.source)}.json`)).json();
// clips with `"captions": false` (e.g. source already has burned-in captions) get an empty .ass
const words: TranscriptWord[] = (clip.captions === false ? [] : transcript.words ?? [])
  .filter((w: TranscriptWord) => w.type === "word" && w.start >= clip.start - 0.05 && w.end <= clip.end + 0.05)
  .map((w: TranscriptWord) => ({ ...w, start: Math.max(0, w.start - clip.start), end: w.end - clip.start }));

// --- group words into phrases ---
const PHRASE_GAP = 0.8; // a pause this long starts a new phrase (caption hides in between)
const MAX_CHARS = C.maxLineChars ?? 22; // char budget per line — word count alone lets long words overflow the frame
interface Phrase { words: TranscriptWord[] }
const phrases: Phrase[] = [];
let cur: TranscriptWord[] = [];
const endsSentence = (t: string) => /[.!?…]["')\]]?$/.test(t.trim());
const lineLen = (ws: TranscriptWord[]) => ws.reduce((s, w) => s + w.text.trim().length, 0) + ws.length - 1;
for (let i = 0; i < words.length; i++) {
  const w = words[i];
  cur.push(w);
  const next = words[i + 1];
  const breakHere = cur.length >= C.maxWordsPerLine || endsSentence(w.text)
    || (next && next.start - w.end > PHRASE_GAP)
    || (next && lineLen(cur) + 1 + next.text.trim().length > MAX_CHARS);
  if (breakHere) { phrases.push({ words: cur }); cur = []; }
}
if (cur.length) phrases.push({ words: cur });

// --- restore dropped sentence punctuation ---
// Scribe occasionally omits the terminal period at a sentence boundary, fusing
// two sentences onto one line ("businesses Book a call"). When a phrase break
// coincides with a real pause AND the next phrase starts capitalized, the break
// is a sentence end — append a period so each line reads as a proper sentence.
// This is DISPLAY punctuation only (spoken words unchanged → VERBATIM holds).
// A pause is required, so mid-sentence proper nouns ("SaaS", "ReactSquad") that
// happen to be capitalized are never given a spurious period.
const ENDS_PUNCT = /[.!?…,:;—-]["')\]]?$/;
for (let pi = 0; pi < phrases.length - 1; pi++) {
  const last = phrases[pi].words[phrases[pi].words.length - 1];
  const nextFirst = phrases[pi + 1].words[0];
  const paused = nextFirst.start - last.end > PHRASE_GAP;
  const nextCapitalized = /^[A-Z]/.test(nextFirst.text.trim());
  if (paused && nextCapitalized && !ENDS_PUNCT.test(last.text.trim())) {
    last.text = last.text.trimEnd() + ".";
  }
}

// --- ASS output ---
const assTime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60), cs = Math.round((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(Math.min(cs, 99)).padStart(2, "0")}`;
};
// #RRGGBB → ASS &HAABBGGRR (alpha 00 = opaque)
const assColor = (hex: string) => {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  return `&H00${b}${g}${r}`.toUpperCase();
};
const esc = (t: string) => t.replace(/[{}\\]/g, "").trim();
const base = assColor(C.baseColor);
const hi = assColor(C.highlightColor);
const W = project.params.out.width, H = project.params.out.height;
const marginV = Math.round((H * C.marginBottomPct) / 100);

// Two layers per word event (Descript-style pill highlight):
//   layer 0, style "Pill" (BorderStyle 3 = opaque box) — libass draws a clean
//             rectangle behind each styled run; the current word's run is visible
//             (white text on a highlight-colored box), every other word and the
//             spaces are alpha-invisible runs that still occupy layout space,
//             so the box lands exactly under the word.
//   layer 1, style "Caption" — the full phrase in white with black outline,
//             including the highlighted word (outline stays on over the pill).
// Events never overlap in time (phrase tails are clamped at the next phrase's
// start) — overlapping events would make libass stack two caption lines.
const events: string[] = [];
const SHOW = `{\\alpha&H00&}`;
const HIDE = `{\\alpha&HFF&}`;
for (let pi = 0; pi < phrases.length; pi++) {
  const p = phrases[pi];
  const nextPhraseStart = phrases[pi + 1]?.words[0].start ?? Infinity;
  const phraseEnd = Math.min(p.words[p.words.length - 1].end + 0.15, nextPhraseStart - 0.001);
  for (let i = 0; i < p.words.length; i++) {
    const from = p.words[i].start;
    const to = i + 1 < p.words.length ? p.words[i + 1].start : phraseEnd; // highlight persists through intra-phrase gaps
    if (to - from < 0.01) continue;
    const pill = p.words
      .map((w, j) => `${j === i ? SHOW : HIDE}${esc(w.text)}`)
      .join(`${HIDE} `); // spaces are their own invisible runs so the box hugs the word
    const text = p.words.map((w) => esc(w.text)).join(" ");
    events.push(`Dialogue: 0,${assTime(from)},${assTime(to)},Pill,,0,0,0,,${pill}`);
    events.push(`Dialogue: 1,${assTime(from)},${assTime(to)},Caption,,0,0,0,,${text}`);
  }
}

const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${C.font},${C.fontSize},${base},${base},&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,${Math.round(C.fontSize * 0.1)},0,2,60,60,${marginV},1
Style: Pill,${C.font},${C.fontSize},${base},${base},${hi},&H00000000,1,0,0,0,100,100,0,0,3,${Math.round(C.fontSize * 0.14)},0,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;

const out = join(dir, "clips", `${clipId}.ass`);
await Bun.write(out, ass);
console.log(`[captions] ${out}: ${phrases.length} phrases, ${events.length} word events, ${words.length} words`);
