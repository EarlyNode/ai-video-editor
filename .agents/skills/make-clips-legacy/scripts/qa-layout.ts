// Layout QA — catches the three classes of reframing mistakes BEFORE/AFTER render:
//  1. non-homogeneous segment: a fade/slide transition hides inside one segment
//     (scene detection misses those) → start/mid/end frames of the segment should
//     look alike; low pairwise similarity = the segment needs sub-mapping.
//  2. flat band: a crop band that lands on wall/background because the cam or
//     card slid away → near-zero pixel variance in the band crop.
//  3. cut-off graphics: on dark-background graphics scenes, content extends
//     beyond the band rect (detected via ffmpeg cropdetect bounding box).
// Prints flags per clip; an agent reviews flagged segments visually and remaps.
// Usage: bun qa-layout.ts <project-dir> [clip-id]
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { run } from "../../rough-cut/scripts/lib";

const dir = process.argv[2];
const only = process.argv[3];
if (!dir) { console.error("Usage: bun qa-layout.ts <project-dir> [clip-id]"); process.exit(1); }
const project = await Bun.file(join(dir, "project.json")).json();
const source = join(dir, "raw", project.source);
const candidates = await Bun.file(join(dir, "clips", "candidates.json")).json();
const tmp = mkdtempSync(join(tmpdir(), "qa-layout-"));

const W = 96, H = 54; // tiny grayscale probes are plenty for similarity/variance
async function probe(t: number, crop?: { x: number; y: number; w: number; h: number }): Promise<Uint8Array> {
  const vf = `${crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` : ""}scale=${W}:${H},format=gray`;
  const file = join(tmp, "probe.raw");
  await run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-ss", t.toFixed(3), "-i", source,
    "-frames:v", "1", "-vf", vf, "-f", "rawvideo", file]);
  return new Uint8Array(await Bun.file(file).arrayBuffer());
}
const similarity = (a: Uint8Array, b: Uint8Array) => { // 1 - normalized mean abs diff
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return 1 - s / a.length / 255;
};
const stddev = (a: Uint8Array) => {
  let m = 0; for (const v of a) m += v; m /= a.length;
  let s = 0; for (const v of a) s += (v - m) ** 2;
  return Math.sqrt(s / a.length);
};

let flags = 0;
for (const clip of candidates) {
  if (only && clip.id !== only) continue;
  for (const seg of clip.layout?.segments ?? []) {
    const len = seg.to - seg.from;
    const t = (rel: number) => clip.start + seg.from + rel;
    const probes = len >= 2
      ? [t(0.4), t(len / 2), t(len - 0.4)]
      : [t(len / 2)];
    // 1. homogeneity across the segment (full frame)
    if (probes.length === 3) {
      const [a, b, c] = await Promise.all(probes.map((p) => probe(p)));
      const sim = Math.min(similarity(a, b), similarity(b, c), similarity(a, c));
      if (sim < 0.82) {
        console.log(`FLAG ${clip.id} seg ${seg.from}-${seg.to}: NOT HOMOGENEOUS (sim=${sim.toFixed(2)}) — hidden transition? sample inside and re-map`);
        flags++;
      }
    }
    // 2. flat bands at segment midpoint (skip full-frame bands)
    for (const [bi, band] of (seg.bands ?? []).entries()) {
      if (band.w >= 1900 && band.h >= 1060) continue;
      const sd = stddev(await probe(t(len / 2), band));
      if (sd < 14) {
        console.log(`FLAG ${clip.id} seg ${seg.from}-${seg.to} band ${bi}: FLAT (σ=${sd.toFixed(1)}) — cam/card not there at midpoint?`);
        flags++;
      }
    }
    // 3. content extent vs crop on dark-bg graphics segments (single non-full band, dark frame)
    if (seg.bands?.length === 1 && !(seg.bands[0].w >= 1900)) {
      const full = await probe(t(len / 2));
      let m = 0; for (const v of full) m += v; m /= full.length;
      if (m < 60) { // dark scene → cropdetect can find the content box
        const out = await run(["ffmpeg", "-nostdin", "-v", "info", "-ss", t(len / 2).toFixed(3), "-i", source,
          "-frames:v", "8", "-vf", "cropdetect=limit=48:round=2", "-f", "null", "-"], { stderr: true });
        const last = [...out.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].pop();
        if (last) {
          const [cw, ch, cx, cy] = last.slice(1).map(Number);
          const b = seg.bands[0], M = 40; // tolerance px
          if (cx < b.x - M || cy < b.y - M || cx + cw > b.x + b.w + M || cy + ch > b.y + b.h + M) {
            console.log(`FLAG ${clip.id} seg ${seg.from}-${seg.to}: CONTENT EXCEEDS CROP (content ${cw}x${ch}@${cx},${cy} vs band ${b.w}x${b.h}@${b.x},${b.y}) — widen or go full-frame`);
            flags++;
          }
        }
      }
    }
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log(flags === 0 ? "QA PASS — no layout flags." : `${flags} flag(s) — review the listed segments visually.`);
