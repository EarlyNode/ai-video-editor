// Render approved podcast clips to vertical 1080x1920 shorts, in ONE ffmpeg pass each:
// fluent recut (drop fillers/stutters/pauses on word boundaries) + multicam (active speaker /
// 2-up) + baked-in karaoke captions + persistent brand nametags + a centered 2s hook card +
// a brand outro card overlaid on the last second (no trailing pause).
//
// Reads:  <projectDir>/clips/clips.json   { speakers, host, clips:[{id,title,hook,shots}] }
//         <projectDir>/transcripts/<speaker.transcript>   (per-mic, word-level, ElevenLabs Scribe)
//         brands/<brand>/podcast/clips-style.json          (caption/hook/tag/outro styling + outro copy)
//         <projectDir>/overlays/clip-assets/tag-<id>.png   (run make-nametags.ts first)
// Run from REPO ROOT:  bun .../render-shorts.ts <projectDir> [clipId]
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

const projectDir = process.argv[2];
const onlyId = process.argv[3];
if (!projectDir) { console.error("usage: bun render-shorts.ts <projectDir> [clipId]"); process.exit(1); }

const project = existsSync(join(projectDir, "project.json")) ? await Bun.file(join(projectDir, "project.json")).json() : {};
const brand = project.brand ?? "ReactSquad";
const S = await Bun.file(`brands/${brand}/podcast/clips-style.json`).json();
const spec = await Bun.file(join(projectDir, "clips", "clips.json")).json();
const speakers: Record<string, { name: string; role: string; track: string; transcript: string; cropX?: number }> = spec.speakers;
const host: string = spec.host;
const guest = Object.keys(speakers).find(s => s !== host) ?? host; // 2-up: guest on top, host on bottom

const W = S.out.w, H = S.out.h, FPS = S.out.fps;
const FILLERS = new Set(["um","uh","uhm","uhh","umm","ehm","erm","hm","hmm","mhm","mhmm","ah","äh","ähm"]);
const MAXGAP = 0.40, LEAD = 0.05, TRAIL = 0.09;
const OUT = join(projectDir, "output", "clips");
const TMP = join(OUT, ".work");
const raw = (id: string) => join(projectDir, "raw", speakers[id].track);
const tag = (id: string) => join(projectDir, "overlays", "clip-assets", `tag-${id}.png`);

type Cam = string; // speaker id | "both"
type Shot = { cam: Cam; a: number; b: number; speaker?: string; verbatim?: boolean };
type HookLine = { text: string; color: "red" | "white" };
type Clip = { id: string; title: string; hook: HookLine[]; shots: Shot[]; outro?: boolean }; // outro defaults ON; set false to omit

type Word = { text: string; start: number; end: number; type: string };
const TR: Record<string, Word[]> = {};
for (const id of Object.keys(speakers)) TR[id] = (await Bun.file(join(projectDir, "transcripts", speakers[id].transcript)).json()).words;

const norm = (t: string) => t.toLowerCase().replace(/[^a-zäöüß']/g, "");
function destutter(text: string): string | null {
  const core = text.replace(/[.,!?…"'’)\]]+$/, "").replace(/^["'(\[]+/, "");
  if (/^[a-zA-ZäöüÄÖÜ]{1,4}-$/.test(core)) return null;
  if (core.includes("-")) {
    const parts = core.split("-"), last = parts[parts.length - 1];
    if (last && parts.slice(0, -1).every(p => last.toLowerCase().startsWith(p.toLowerCase()))) return text.replace(core, last);
  }
  return text;
}

interface Kept { text: string; start: number; end: number }
interface Span { sa: number; sb: number; cam: Cam; speaker: string; outStart: number; outEnd: number }

function fluentShot(shot: Shot, outBase: number): { spans: Span[]; caps: Kept[] } {
  const spk = shot.speaker ?? (shot.cam === "both" ? guest : shot.cam);
  const words = TR[spk].filter(w => w.type === "word" && w.start >= shot.a - 0.02 && w.end <= shot.b + 0.02);
  if (shot.verbatim) { // keep the whole [a,b] (preserves laughs/beats), just clean caption text
    const span: Span = { sa: shot.a, sb: shot.b, cam: shot.cam, speaker: spk, outStart: outBase, outEnd: outBase + (shot.b - shot.a) };
    const caps: Kept[] = [];
    for (const w of words) { if (FILLERS.has(norm(w.text))) continue; const ds = destutter(w.text); if (ds === null) continue; caps.push({ text: ds, start: outBase + (w.start - shot.a), end: outBase + (w.end - shot.a) }); }
    return { spans: [span], caps };
  }
  const kept: Kept[] = [];
  for (const w of words) {
    if (FILLERS.has(norm(w.text))) continue;
    const ds = destutter(w.text); if (ds === null) continue;
    if (kept.length && norm(kept[kept.length - 1].text) === norm(ds)) kept.pop();
    kept.push({ text: ds, start: w.start, end: w.end });
  }
  const spans: Span[] = [], caps: Kept[] = [];
  let i = 0, outCursor = outBase;
  while (i < kept.length) {
    let j = i;
    while (j + 1 < kept.length && kept[j + 1].start - kept[j].end <= MAXGAP) j++;
    const sa = Math.max(shot.a, kept[i].start - LEAD), sb = Math.min(shot.b, kept[j].end + TRAIL);
    spans.push({ sa, sb, cam: shot.cam, speaker: spk, outStart: outCursor, outEnd: outCursor + (sb - sa) });
    for (let k = i; k <= j; k++) caps.push({ text: kept[k].text, start: outCursor + (kept[k].start - sa), end: outCursor + (kept[k].end - sa) });
    outCursor += sb - sa; i = j + 1;
  }
  return { spans, caps };
}

// ---------- ASS ----------
const assTime = (s: number) => { const m = Math.floor(s / 60), sec = s % 60; return `0:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`; };
const assColor = (hex: string) => `&H00${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`.toUpperCase();
const esc = (t: string) => t.replace(/[{}\\"“”]/g, "").trim();
const C = S.caption, HK = S.hook, O = S.outro;

function buildAss(clip: Clip, capsIn: Kept[], total: number): string {
  const hasOutro = clip.outro !== false;
  const cardStart = hasOutro ? total - O.dur : total; // no card window when the clip has no outro
  const caps = capsIn.filter(c => c.start < cardStart - 0.05);
  const endsSentence = (t: string) => /[.!?…]["')\]]?$/.test(t.trim());
  const lineLen = (ws: Kept[]) => ws.reduce((s, w) => s + w.text.trim().length, 0) + ws.length - 1;
  const phrases: Kept[][] = []; let cur: Kept[] = [];
  for (let i = 0; i < caps.length; i++) {
    cur.push(caps[i]); const next = caps[i + 1];
    if (cur.length >= C.maxWords || endsSentence(caps[i].text) || (next && next.start - caps[i].end > 0.7) || (next && lineLen(cur) + 1 + next.text.trim().length > C.maxChars)) { phrases.push(cur); cur = []; }
  }
  if (cur.length) phrases.push(cur);

  const events: string[] = [], SHOW = `{\\alpha&H00&}`, HIDE = `{\\alpha&HFF&}`;
  for (let pi = 0; pi < phrases.length; pi++) {
    const p = phrases[pi];
    const pEnd = Math.min(p[p.length - 1].end + 0.15, (phrases[pi + 1]?.[0].start ?? Infinity) - 0.001);
    for (let i = 0; i < p.length; i++) {
      const from = p[i].start; let to = i + 1 < p.length ? p[i + 1].start : pEnd;
      to = Math.min(to, cardStart); // captions stop when the outro card appears
      if (to - from < 0.01) continue;
      const pill = p.map((w, j) => `${j === i ? SHOW : HIDE}${esc(w.text)}`).join(`${HIDE} `);
      events.push(`Dialogue: 0,${assTime(from)},${assTime(to)},Pill,,0,0,0,,${pill}`);
      events.push(`Dialogue: 1,${assTime(from)},${assTime(to)},Caption,,0,0,0,,${p.map(w => esc(w.text)).join(" ")}`);
    }
  }
  // hook card (first HK.dur). Empty hook[] => no card (e.g. a segment that will be concatenated
  // after another that already carries the hook).
  if (clip.hook.length) {
    const hookText = clip.hook.map(l => `{\\c${assColor(l.color === "red" ? HK.red : HK.white)}}${esc(l.text)}`).join("\\N");
    // NO fade-in on the hook: platforms thumbnail the FIRST frame, so the clickbait text must be
    // fully visible at t=0 (fade-in would leave frame 0 blank). Fade-out at the end is fine.
    events.push(`Dialogue: 5,${assTime(0)},${assTime(HK.dur)},Hook,,0,0,0,,{\\fad(0,250)\\pos(${W / 2},${HK.y})}${hookText}`);
  }
  // outro card text (only when the clip HAS an outro; blur + mark composited in the graph)
  if (hasOutro) {
    const o0 = assTime(cardStart), o1 = assTime(total);
    const cta = O.cta.map((l: string, i: number) => `{\\c${assColor(i === O.cta.length - 1 ? HK.red : HK.white)}}${esc(l)}`).join("\\N");
    events.push(`Dialogue: 6,${o0},${o1},Hook,,0,0,0,,{\\fad(100,80)\\fs${O.ctaSize}\\pos(${W / 2},${O.ctaY})}${cta}`);
    events.push(`Dialogue: 6,${o0},${o1},OShow,,0,0,0,,{\\fad(100,80)\\pos(${W / 2},${O.showY})}${(O.showLines as string[]).map(esc).join("\\N")}`);
    events.push(`Dialogue: 6,${o0},${o1},OBrand,,0,0,0,,{\\fad(100,80)\\pos(${W / 2},${O.brandY})}${esc(O.brand)}`);
  }

  const base = assColor(C.base), hi = assColor(C.hi);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${C.font},${C.size},${base},${base},&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,${Math.round(C.size * 0.09)},2,2,40,40,${C.marginV},1
Style: Pill,${C.font},${C.size},${base},${base},${hi},&H00000000,1,0,0,0,100,100,0,0,3,${Math.round(C.size * 0.13)},0,2,40,40,${C.marginV},1
Style: Hook,${HK.font},${HK.size},${assColor(HK.white)},${assColor(HK.white)},&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,9,3,5,40,40,40,1
Style: OShow,Lexend Deca,${O.showSize},${hi},${hi},&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,3,0,5,40,40,40,1
Style: OBrand,Lexend Deca,${O.brandSize},${assColor("#FFFFFF")},${assColor("#FFFFFF")},&H00000000,&H00000000,1,0,0,0,100,100,1,0,1,2,0,5,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
}

// ---------- ffmpeg ----------
function ff(args: string[], label: string) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${label})`);
}
function splitNode(parts: string[], src: string, n: number, prefix: string, audio = false): string[] {
  if (n <= 0) return [];
  const [one, many] = audio ? ["anull", "asplit"] : ["null", "split"];
  if (n === 1) { parts.push(`[${src}]${one}[${prefix}0]`); return [`${prefix}0`]; }
  const labs = Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  parts.push(`[${src}]${many}=${n}${labs.map(l => `[${l}]`).join("")}`);
  return labs;
}

function renderClip(clip: Clip, clipIdx: number) {
  // fluency -> spans + caption words
  const spans: Span[] = [], caps: Kept[] = [];
  let outCursor = 0;
  for (const shot of clip.shots) { const r = fluentShot(shot, outCursor); spans.push(...r.spans); caps.push(...r.caps); outCursor = r.spans.at(-1)?.outEnd ?? outCursor; }
  const total = outCursor;
  const hasOutro = clip.outro !== false; // outro is on by default; a clip can set outro:false to omit it
  writeFileSync(join(TMP, `${clip.id}.ass`), buildAss(clip, caps, total));
  const assPath = join(TMP, `${clip.id}.ass`);

  // inputs 0..K-1 = each speaker raw track (accurate-seek anchored to bound decode)
  const ids = Object.keys(speakers);
  const OFF = Math.min(...spans.map(s => s.sa)) - 0.2;
  const rel = (t: number) => (t - OFF).toFixed(3);
  const inputs: string[] = [];
  for (const id of ids) inputs.push("-ss", String(OFF), "-i", raw(id));
  const vIn = (id: string) => ids.indexOf(id); // raw video/audio input index for a speaker
  const tagInput: Record<string, number> = {};
  let idx = ids.length;
  for (const id of ids) { inputs.push("-i", tag(id)); tagInput[id] = idx++; }
  let markIdx = -1;
  if (hasOutro) { markIdx = idx; inputs.push("-i", O.mark); idx++; }

  const N = spans.length, parts: string[] = [];
  const cropX = (id: string) => speakers[id].cropX ?? S.crop.x;
  const usesVid = (id: string) => spans.filter(s => s.cam === id || s.cam === "both").length;
  const vSplit: Record<string, string[]> = {}, tSplit: Record<string, string[]> = {};
  for (const id of ids) { vSplit[id] = splitNode(parts, `${vIn(id)}:v`, usesVid(id), `v_${id}_`); tSplit[id] = splitNode(parts, `${tagInput[id]}:v`, usesVid(id), `t_${id}_`); }
  const aSplit: Record<string, string[]> = {};
  for (const id of ids) aSplit[id] = splitNode(parts, `${vIn(id)}:a`, N, `a_${id}_`, true);
  const vi: Record<string, number> = {}, ti: Record<string, number> = {}, ai: Record<string, number> = {};
  for (const id of ids) { vi[id] = 0; ti[id] = 0; ai[id] = 0; }

  spans.forEach((s, i) => {
    const t = `trim=${rel(s.sa)}:${rel(s.sb)},setpts=PTS-STARTPTS`, at = `atrim=${rel(s.sa)}:${rel(s.sb)},asetpts=PTS-STARTPTS`;
    // audio: mix all mics (so backchannels/laughs are heard)
    const aLabs = ids.map(id => { const l = `xa_${id}_${i}`; parts.push(`[${aSplit[id][ai[id]++]}]${at}[${l}]`); return `[${l}]`; });
    parts.push(`${aLabs.join("")}amix=inputs=${ids.length}:normalize=0[A${i}]`);
    // video + baked persistent nametag(s)
    if (s.cam === "both") { // 2-up: guest on top band, host on bottom band (crop full source height, scale to band)
      parts.push(`[${vSplit[guest][vi[guest]++]}]${t},crop=${S.twoUp.cropW}:1080:${S.twoUp.cropX}:0,scale=${W}:${S.twoUp.bandH},setsar=1[rb${i}]`);
      parts.push(`[${vSplit[host][vi[host]++]}]${t},crop=${S.twoUp.cropW}:1080:${S.twoUp.cropX}:0,scale=${W}:${S.twoUp.bandH},setsar=1[jb${i}]`);
      parts.push(`[rb${i}][jb${i}]vstack[vbb${i}]`);
      parts.push(`[vbb${i}][${tSplit[guest][ti[guest]++]}]overlay=${S.tag.x}:${S.tag.y}[vbt${i}]`);
      parts.push(`[vbt${i}][${tSplit[host][ti[host]++]}]overlay=${S.tag.x}:${S.tag.yBottom}[V${i}]`);
    } else {
      const id = s.cam;
      parts.push(`[${vSplit[id][vi[id]++]}]${t},crop=${S.crop.w}:1080:${cropX(id)}:0,scale=${W}:${H},setsar=1[vb${i}]`);
      parts.push(`[vb${i}][${tSplit[id][ti[id]++]}]overlay=${S.tag.x}:${S.tag.y}[V${i}]`);
    }
  });

  // separate video + audio concats (avoid combined-concat deadlock w/ asymmetric downstream)
  parts.push(`${spans.map((_, i) => `[V${i}]`).join("")}concat=n=${N}:v=1:a=0[vcat]`);
  parts.push(`${spans.map((_, i) => `[A${i}]`).join("")}concat=n=${N}:v=0:a=1[acat]`);
  // outro (only when requested — most clips have one): the tail of the clip gaussian-blurred +
  // darkened, with the CTA + podcast name + mark on top (the speaker stays faintly visible). Audio
  // keeps playing under it, so the clip never gets longer.
  if (hasOutro) {
    const cardStart = (total - O.dur).toFixed(3);
    parts.push(`[vcat]split[vc1][vc2]`);
    parts.push(`[vc1]trim=0:${cardStart},setpts=PTS-STARTPTS[vA]`);
    parts.push(`[vc2]trim=${cardStart}:${total.toFixed(3)},setpts=PTS-STARTPTS,gblur=sigma=${O.blurSigma},eq=brightness=${O.dim}:saturation=0.55[obg]`);
    parts.push(`[${markIdx}:v]scale=${O.markScale}:-1[omk]`);
    parts.push(`[obg][omk]overlay=x=(W-w)/2:y=${O.markY}[Vo]`);
    parts.push(`[vA][Vo]concat=n=2:v=1:a=0[vfull]`);
    parts.push(`[vfull]subtitles=filename='${assPath}':fontsdir='${S.fontsDir}'[vsub]`);
  } else {
    parts.push(`[vcat]subtitles=filename='${assPath}':fontsdir='${S.fontsDir}'[vsub]`);
  }

  // Numbered filename so they sort in the intended post order (not alphabetical).
  const outPath = join(OUT, `${String(clipIdx + 1).padStart(2, "0")}-${clip.id}.mp4`);
  ff([...inputs, "-filter_complex", parts.join(";"), "-map", "[vsub]", "-map", "[acat]",
    "-r", String(FPS), "-c:v", "libx264", "-crf", String(S.out.crf), "-preset", S.out.preset, "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "1", "-movflags", "+faststart", outPath], "render");
  const mm = Math.floor(total / 60), ss = (total % 60).toFixed(1);
  console.log(`✓ ${outPath}  ${mm}:${ss.padStart(4, "0")}  spans=${spans.length}`);
}

// preflight: nametags exist
for (const id of Object.keys(speakers)) if (!existsSync(tag(id))) { console.error(`missing nametag ${tag(id)} — run: bun .../make-nametags.ts ${projectDir}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
(spec.clips as Clip[]).forEach((clip, idx) => { if (onlyId && clip.id !== onlyId && !clip.id.startsWith(onlyId)) return; renderClip(clip, idx); });
if (!process.env.KEEP) rmSync(TMP, { recursive: true, force: true });
