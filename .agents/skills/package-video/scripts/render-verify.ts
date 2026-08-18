// package-video — render a composition with all the render gotchas handled, then verify
// and mux. Run with bun. Encapsulates: pinned hyperframes version, NO --video-frame-format
// png on long renders, and a HARD gate on frame count (never trust "completed").
//
// Usage:
//   bun render-verify.ts <publicDir> <audioSource.mp4> <out.mp4> [--version 0.7.5] [--fps 60]
//
// Precondition: <publicDir>/index.html exists and <publicDir>/input-video.mp4 is the
// DENSE-GOP (-g 12) re-encode of the source (use encode-input or the one-liner in SKILL.md).
// The mux pulls audio from <audioSource> (the cut/original video at the same timeline).
const args = process.argv.slice(2);
const publicDir = args[0], audioSrc = args[1], outMp4 = args[2];
const version = (args.includes("--version") ? args[args.indexOf("--version") + 1] : "0.7.5");
const fps = Number(args.includes("--fps") ? args[args.indexOf("--fps") + 1] : "60");
if (!publicDir || !audioSrc || !outMp4) { console.error("Usage: bun render-verify.ts <publicDir> <audioSrc.mp4> <out.mp4> [--version X] [--fps N]"); process.exit(1); }

const sh = (cmd: string[]) => Bun.spawnSync(cmd, { stderr: "pipe", stdout: "pipe" });
const probe = (file: string, entries: string) => sh(["ffprobe", "-v", "error", "-show_entries", entries, "-of", "csv=p=0", file]).stdout.toString().trim();

const inDur = Number(probe(`${publicDir}/input-video.mp4`, "format=duration").split("\n")[0]);
const expectFrames = Math.round(inDur * fps);
console.log(`input duration ${inDur}s -> expect ~${expectFrames} frames (±~1s tolerance)`);

console.log(`rendering with hyperframes@${version} (no png frame format on long renders)...`);
const r = Bun.spawnSync(["npx", `hyperframes@${version}`, "render", publicDir, "-o", "output.mp4", "--fps", String(fps)],
  { env: { ...process.env, PRODUCER_BROWSER_GPU_MODE: "hardware" }, stdout: "inherit", stderr: "inherit", cwd: publicDir.replace(/\/public$/, "") });
const outputMp4 = `${publicDir.replace(/\/public$/, "")}/output.mp4`;

const frames = Number(sh(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", outputMp4]).stdout.toString().trim());
const dur = Number(probe(outputMp4, "format=duration"));
console.log(`rendered: ${frames} frames, ${dur}s`);

// HARD GATE: never trust "completed". Allow ~1s of frames for rounding between the -g12
// re-encode and the composition duration; a real truncation/dedup is many seconds short
// (often a clean fraction of expected), so this tolerance separates them cleanly.
const tol = fps; // frames in ~1 second
if (Math.abs(frames - expectFrames) > tol) {
  console.error(`\n*** TRUNCATION/DEDUP DETECTED: ${frames} frames vs expected ${expectFrames}. NOT muxing.`);
  console.error(`Likely the hyperframes version regressed (truncates long renders) or --video-frame-format png was used.`);
  console.error(`Try a different pinned --version after testing it on a full-length render, and re-check.`);
  process.exit(2);
}
// last-frame sanity: extract the final frame, ensure it is not near-black (real content).
sh(["ffmpeg", "-y", "-sseof", "-0.5", "-i", outputMp4, "-frames:v", "1", "-vf", "scale=320:-1", "/tmp/pv-last.png"]);
const lastBytes = sh(["stat", "-c", "%s", "/tmp/pv-last.png"]).stdout.toString().trim();
console.log(`last-frame bytes: ${lastBytes} (a few-hundred bytes => black/blank => investigate)`);

console.log(`muxing audio from ${audioSrc} -> ${outMp4}`);
const m = sh(["ffmpeg", "-y", "-i", outputMp4, "-i", audioSrc, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", outMp4]);
if (m.exitCode !== 0) { console.error("mux failed:", m.stderr.toString().slice(-400)); process.exit(1); }
console.log(`DONE: ${outMp4}  (${probe(outMp4, "format=duration")}s)`);
