// Crop each speaker's brand darkglass nameplate (a full-frame 1920x1080 lower-third overlay,
// produced by the `podcast` skill's nameplates step) down to just the pill, so it can be overlaid
// top-left on the vertical clips. Uses the fixed pill region from the brand style's tag.cropRegion
// ([w,h,x,y]) — the darkglass template pins the pill to the same bottom-left spot; the region is
// generous on width so any name fits, with transparent padding to the right (invisible on overlay).
// Reads speaker ids from <projectDir>/clips/clips.json.
// Run from REPO ROOT:  bun make-nametags.ts <projectDir>
import { spawnSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const projectDir = process.argv[2];
if (!projectDir) { console.error("usage: bun make-nametags.ts <projectDir>"); process.exit(1); }
const project = existsSync(join(projectDir, "project.json")) ? await Bun.file(join(projectDir, "project.json")).json() : {};
const brand = project.brand ?? "ReactSquad";
const S = await Bun.file(`brands/${brand}/podcast/clips-style.json`).json();
const spec = await Bun.file(join(projectDir, "clips", "clips.json")).json();
const [w, h, x, y] = S.tag.cropRegion as number[];
const outDir = join(projectDir, "overlays", "clip-assets");
mkdirSync(outDir, { recursive: true });

for (const id of Object.keys(spec.speakers)) {
  const src = join(projectDir, "overlays", "nameplates", `darkglass-${id}.png`);
  if (!existsSync(src)) { console.error(`missing ${src} — run the podcast skill's nameplate step first`); process.exit(1); }
  const out = join(outDir, `tag-${id}.png`);
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vf", `crop=${w}:${h}:${x}:${y}`, out], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`crop failed for ${id}`);
  console.log(`✓ ${out}  (${w}x${h})`);
}
