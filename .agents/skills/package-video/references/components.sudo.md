# Card Vocabulary — components.ts

The reliable FLOOR. `createComposition(opts)` returns builder methods; call them to lay out
the card table, then `emit()`. All times are ABSOLUTE seconds in the (possibly re-cut) video.

## Builders

```SudoLang
createComposition({ duration, brand?, words?, fps=60, width=1920, height=1080 }) => composition

composition {
  t(m,s) => m*60+s            // timestamp helper
  sentence(firstWord,lastWord,after?) => words[]   // pull a spoken sentence for karaoke

  intro(start, name, role)                  // brand lower-third, bottom-left, ~4s
  karaoke(id, words)                        // ONE centered line at a time, active word pilled
  chapter(num, T, title)                    // numbered chip, bottom-left, ~3.5s
  term(id, T, term, def, hold=7)            // jargon definition callout, bottom-left
  tip(id, T, hold, tag, body)               // actionable tip callout (tag e.g. "Tip"/"Review")
  stat(T, [{n,label}, ...])                 // count-up tiles, bottom-left
  quote(id, T, html, hold=6.6, attr?)       // pull-quote, centered-left; wrap a word in
                                            //   <span class="qhl">...</span> for yellow
  reviewRecap(n, T, items[])                // cumulative checklist; call per n=1..items.length
  highlight(id, T, dur, {x,y,w,h}, label, labelStyle)  // box on exact pixels (own track)
  skipButton(T, hold, label)                // "Skip to mm:ss →" pill, bottom-right
  subscribe(T)                              // YouTube subscribe: 2 clicks + bell ring, ~12s
  outro(T, headlineHtml, ctaText)           // full-screen brand CTA; enter on the closing line
  raw(hostHtml, timelineJs)                 // ESCAPE HATCH for freestyle/creative cards
  emit(outPath, videoSrc="input-video.mp4")
}
```

## Layout rules baked into the components
- Info cards (intro, chapter, term, tip, stat, reviewRecap, skip) sit BOTTOM-LEFT/RIGHT,
  clear of a bottom-right webcam. Quotes, karaoke, and outro are CENTERED.
- Each card-host starts at `opacity:0`; builders set it to 1 when shown (don't regress this —
  it silently hid the karaoke once).
- Cards visible at the same time MUST be on different `data-track-index` (highlight=3,
  karaoke=4, skip=5 already; floor info cards=2). Pass distinct tracks for overlapping raw cards.

## Worked driver example ($workDir/build.ts)

```ts
import { createComposition, REACTSQUAD } from "../../../.claude/skills/package-video/scripts/components.ts";
import { readFileSync } from "node:fs";

const tr = JSON.parse(readFileSync("../../transcripts/_final-cut.json", "utf8"));
const C = createComposition({ duration: 1318.986, brand: REACTSQUAD, words: tr.words });
const t = C.t;

C.karaoke("kara1", C.sentence("im", "human"));        // opening sentence 1
C.intro(5.98, "Speaker Name", "Role &nbsp;·&nbsp; Company");       // in the gap between sentences
C.karaoke("kara2", C.sentence("but", "yourself", 6)); // opening sentence 2

C.chapter(2, t(0,16), "The Review Workflow");
C.term("term-sudo", t(1,2), "SudoLang", 'A pseudolanguage for prompting LLMs. <b>Token-efficient.</b>');
C.tip("tip-local", t(4,9), 6.2, "Tip", 'Always test PRs locally when they touch the UI.');
C.stat(t(5,35), [{n:4,label:"Generations"},{n:8,label:"Prototypes"},{n:73,label:"Files"}]);
C.quote("q1", t(1,54), 'Write review comments <span class="qhl">as questions</span>.');

const ITEMS = ["vitest → bun test", "Rightway → React Testing Library", "Raw SQL → Drizzle"];
ITEMS.forEach((_, i) => C.reviewRecap(i+1, /* its timestamp */ t(11,8) + i*60, ITEMS));

C.highlight("hl1", t(11,8), 3.6, {x:560,y:326,w:420,h:66}, "use bun test",
  "position:absolute;left:438px;top:9px;background:#f7cf4c;color:#0a0a0a;font-weight:700;font-size:24px;padding:8px 16px;border-radius:8px;");

C.subscribe(t(12,40));
C.outro(1314.9, "Hire senior React<br/>developers, fast.", "Visit ReactSquad.io now");
C.emit("public/index.html");
```

Then stage assets + render:
```bash
mkdir -p public/{vendor,fonts}
cp "$skillDir/assets/fonts/"*.ttf public/fonts/
cp "$skillDir/assets/gsap.min.js" public/vendor/
cp "$skillDir/assets/reactsquad-mark.png" public/
bun build.ts && npx hyperframes lint public
```
```
