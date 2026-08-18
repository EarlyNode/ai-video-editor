// package-video — highlight coordinate finder. Extracts the exact frame at a timestamp and
// draws a candidate yellow box on it so you can eyeball placement, then adjust X/Y/W/H and
// re-run until the box lands exactly on the code/region. Bake the final numbers into a
// highlight() card in the driver. Run with bun.
//
// Usage: bun find-box.ts <video.mp4> <seconds> <x> <y> <w> <h> [out.png]
// Then: Read the out.png, nudge x/y/w/h, repeat. Caveat: static box — pick a moment where
// the screen is NOT scrolling, and keep the highlight short (~3.5s).
const [video, sec, x, y, w, h, out = "/tmp/find-box.png"] = process.argv.slice(2);
if (!video || !sec || x === undefined) { console.error("Usage: bun find-box.ts <video.mp4> <seconds> <x> <y> <w> <h> [out.png]"); process.exit(1); }
const r = Bun.spawnSync(["ffmpeg", "-y", "-ss", sec, "-i", video, "-frames:v", "1",
  "-vf", `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=yellow@1.0:t=4`, out], { stderr: "pipe" });
if (r.exitCode !== 0) { console.error(r.stderr.toString().slice(-400)); process.exit(1); }
console.log(`drew box (x=${x} y=${y} w=${w} h=${h}) at ${sec}s -> ${out}  — Read it, adjust, repeat.`);
