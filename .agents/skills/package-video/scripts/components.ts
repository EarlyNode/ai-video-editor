// package-video — composition engine. Reusable, brand-parameterized card library.
// A per-project driver imports createComposition(), calls the builders to lay out the
// card data table, then emit() writes public/index.html. Zero npm deps (run with bun).
//
// Builders are the reliable FLOOR. Freestyle/creative graphics (marker emphasis, scene
// transitions, audio-reactive, SFX, diagrams, 3D/Lottie stings) are authored directly in
// the driver as extra card-host blocks or by loading the hyperframes-* skills — this engine
// does not constrain them. See references/creative-palette.sudo.md.
import { writeFileSync } from "node:fs";

export interface Brand {
  yellow: string; ink: string; glass: string; line: string;
  font: string;            // primary family name (font files staged into public/fonts)
  markSrc: string;         // relative path to the brand mark png, staged into public/
  name: string;            // wordmark text
}
export const REACTSQUAD: Brand = {
  yellow: "#f7cf4c", ink: "#0a0a0a", glass: "rgba(12,12,12,0.90)", line: "rgba(255,255,255,0.12)",
  font: "Instrument Sans", markSrc: "reactsquad-mark.png", name: "ReactSquad",
};

export interface Opts { fps?: number; width?: number; height?: number; duration: number; brand?: Brand; words?: any[]; }

export function createComposition(opts: Opts) {
  const FPS = opts.fps ?? 60, W = opts.width ?? 1920, H = opts.height ?? 1080, DUR = opts.duration;
  const B = opts.brand ?? REACTSQUAD;
  const WORDS = (opts.words ?? []).filter((x: any) => x.type === "word");
  const t = (m: number, s: number) => m * 60 + s;
  const q = (n: number) => Math.round(n * FPS) / FPS;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const cl = (x: any) => (x?.text || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  const hosts: string[] = []; const tljs: string[] = [];
  const Hsel = (id: string) => `'.card-host[data-card-id="${id}"]'`;
  function host(id: string, start: number, dur: number, style: string, inner: string, track = 2) {
    hosts.push(`      <div class="card-host clip" data-card-id="${id}" data-start="${q(start).toFixed(4)}" data-duration="${dur.toFixed(4)}" data-track-index="${track}" style="${style}visibility:hidden;opacity:0;">\n        <div class="card" data-card-id="${id}">\n${inner}\n        </div>\n      </div>`);
  }

  // find a spoken sentence by first/last word (for karaoke). after = min start seconds.
  function sentence(startW: string, endW: string, after = 0) {
    let s = -1;
    for (let i = 0; i < WORDS.length; i++) { if (WORDS[i].start >= after && cl(WORDS[i]) === startW) { s = i; break; } }
    const arr: any[] = [];
    for (let i = s; i < WORDS.length; i++) { arr.push(WORDS[i]); if (i > s && cl(WORDS[i]) === endW) break; }
    return arr;
  }

  const api: any = { t, q, sentence, FPS, W, H, DUR, brand: B };

  api.intro = (start: number, name: string, role: string) => {
    const id = "intro";
    host(id, start, 4.6, "left:120px;top:800px;width:1100px;height:240px;",
`          <div class="nl-l3"><div class="nl-bar" id="intro-bar"><img class="nl-mark" id="intro-mark" src="${B.markSrc}" alt="${B.name}" /><div class="nl-div"></div><div class="nl-text"><div class="nl-name" id="intro-name">${esc(name)}</div><div class="nl-role" id="intro-role">${role}</div></div></div></div>`);
    tljs.push(`
  tl.set(${Hsel(id)}, { visibility: "visible", opacity: 1 }, ${q(start)});
  tl.fromTo('#intro-bar', { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.55, ease: "power3.out" }, ${q(start)});
  tl.from('#intro-mark', { opacity: 0, x: -10, duration: 0.4, ease: "power2.out" }, ${q(start + 0.2)});
  tl.from('#intro-name', { opacity: 0, y: 14, duration: 0.45, ease: "power3.out" }, ${q(start + 0.32)});
  tl.from('#intro-role', { opacity: 0, y: 12, duration: 0.42, ease: "power3.out" }, ${q(start + 0.48)});
  tl.to(${Hsel(id)}, { opacity: 0, y: 24, duration: 0.5, ease: "power2.in" }, ${q(start + 3.45)});
  tl.set(${Hsel(id)}, { visibility: "hidden" }, ${q(start + 4.0)});`);
  };

  // karaoke: ONE centered line at a time, active word pilled. words = sentence(...) output.
  api.karaoke = (id: string, words: any[]) => {
    const MAXC = 30;
    const lines: any[][] = []; let cur: any[] = [];
    for (const w of words) { const cand = [...cur, w].map((x) => x.text.trim()).join(" "); if (cur.length && cand.length > MAXC) { lines.push(cur); cur = []; } cur.push(w); }
    if (cur.length) lines.push(cur);
    const t0 = words[0].start, tN = words[words.length - 1].end;
    const start = t0 - 0.3, dur = (tN + 0.7) - start;
    const lineHtml = lines.map((ws, li) => `<div class="kara-line" id="${id}-l${li}">` + ws.map((w, wi) => `<span class="kara-w" id="${id}-l${li}-w${wi}">${esc(w.text.trim())}</span>`).join(" ") + `</div>`).join("\n          ");
    host(id, start, dur, "left:360px;top:860px;width:1200px;height:170px;", `          ${lineHtml}`, 4);
    let js = `\n  tl.set(${Hsel(id)}, { visibility: "visible", opacity: 1 }, ${q(start)});\n`;
    for (let li = 0; li < lines.length; li++) {
      const ws = lines[li];
      const showAt = li === 0 ? q(start + 0.05) : q(ws[0].start - 0.05);
      const hideAt = li < lines.length - 1 ? q(lines[li + 1][0].start - 0.05) : q(tN + 0.45);
      js += `  tl.fromTo('#${id}-l${li}', { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, ${showAt});\n`;
      js += `  tl.to('#${id}-l${li}', { opacity: 0, duration: 0.2, ease: "power2.in" }, ${hideAt});\n`;
      js += `  tl.set('#${id}-l${li}', { opacity: 0 }, ${q(hideAt + 0.21)});\n`;
      for (let wi = 0; wi < ws.length; wi++) {
        js += `  tl.set('#${id}-l${li}-w${wi}', { backgroundColor: "${B.yellow}", color: "${B.ink}" }, ${q(ws[wi].start)});\n`;
        const off = wi + 1 < ws.length ? q(ws[wi + 1].start) : hideAt;
        js += `  tl.set('#${id}-l${li}-w${wi}', { backgroundColor: "rgba(0,0,0,0)", color: "#ffffff" }, ${off});\n`;
      }
    }
    js += `  tl.set(${Hsel(id)}, { visibility: "hidden" }, ${q(tN + 0.7)});`;
    tljs.push(js);
  };

  api.chapter = (num: number, T: number, title: string) => {
    const id = `ch${num}`;
    host(id, T, 3.5, "left:96px;top:884px;width:1560px;height:140px;",
`          <div class="chap-chip" id="${id}-chip"><div class="chap-num">${String(num).padStart(2, "0")}</div><div class="chap-body"><div class="chap-kick">Chapter</div><div class="chap-title">${esc(title)}</div></div></div>`);
    tljs.push(`
  tl.set(${Hsel(id)}, { visibility: "visible", opacity: 1 }, ${q(T)});
  tl.fromTo('#${id}-chip', { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.55, ease: "power3.out" }, ${q(T)});
  tl.to(${Hsel(id)}, { opacity: 0, x: -30, duration: 0.45, ease: "power2.in" }, ${q(T + 3.0)});
  tl.set(${Hsel(id)}, { visibility: "hidden" }, ${q(T + 3.5)});`);
  };

  const callout = (id: string, T: number, hold: number, tag: string, big: string, body: string) => {
    host(id, T, hold + 1.6, "left:96px;top:600px;width:1140px;height:440px;",
`          <div class="callout" id="${id}-c"><div class="callout-tag">${esc(tag)}</div>${big ? `<div class="callout-big">${esc(big)}</div>` : ""}<div class="callout-body">${body}</div></div>`);
    tljs.push(`
  tl.set(${Hsel(id)}, { visibility: "visible" }, ${q(T)});
  tl.fromTo(${Hsel(id)}, { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }, ${q(T)});
  tl.from('#${id}-c .callout-tag', { opacity: 0, y: 10, duration: 0.4, ease: "power2.out" }, ${q(T + 0.22)});
  ${big ? `tl.from('#${id}-c .callout-big', { opacity: 0, y: 16, duration: 0.45, ease: "power3.out" }, ${q(T + 0.38)});` : ""}
  tl.from('#${id}-c .callout-body', { opacity: 0, y: 14, duration: 0.5, ease: "power2.out" }, ${q(T + 0.55)});
  tl.to(${Hsel(id)}, { opacity: 0, x: -36, duration: 0.5, ease: "power2.in" }, ${q(T + hold)});
  tl.set(${Hsel(id)}, { visibility: "hidden" }, ${q(T + hold + 0.55)});`);
  };
  api.term = (id: string, T: number, term: string, def: string, hold = 7.0) => callout(id, T, hold, "Term", term, def);
  api.tip = (id: string, T: number, hold: number, tag: string, body: string) => callout(id, T, hold, tag, "", body);

  api.skipButton = (T: number, hold: number, label: string) => {
    const id = "skip";
    host(id, T, hold + 1.0, "left:980px;top:884px;width:780px;height:96px;",
`          <div class="skip-pill" id="skip-pill"><span class="skip-q">Just here for the review?</span><span class="skip-cta">${esc(label)}</span></div>`, 5);
    tljs.push(`
  tl.set(${Hsel(id)}, { visibility: "visible", opacity: 1 }, ${q(T)});
  tl.fromTo('#skip-pill', { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, ${q(T)});
  tl.to('#skip-pill .skip-cta', { x: 6, duration: 0.6, ease: "sine.inOut", yoyo: true, repeat: ${Math.max(2, Math.floor((hold - 1) / 0.6))} }, ${q(T + 0.6)});
  tl.to(${Hsel(id)}, { opacity: 0, x: 24, duration: 0.45, ease: "power2.in" }, ${q(T + hold)});
  tl.set(${Hsel(id)}, { visibility: "hidden" }, ${q(T + hold + 0.5)});`);
  };

  // stat strip: tiles = [{ n, label }]. Count-up animated.
  api.stat = (T: number, tiles: { n: number; label: string }[]) => {
    const id = "stat";
    const tileHtml = tiles.map((tl2, i) => `<div class="stat-tile" id="st-t${i}"><div class="stat-num" id="st-n${i}">0</div><div class="stat-lbl">${esc(tl2.label)}</div></div>`).join("\n            ");
    host(id, T, 8.5, "left:96px;top:874px;width:1700px;height:150px;",
`          <div class="stat-row"><div class="stat-brand" id="st-brand"><img src="${B.markSrc}" alt="${B.name}" /></div>\n            ${tileHtml}</div>`);
    let js = `\n  tl.set(${Hsel(id)}, { visibility: "visible", opacity: 1 }, ${q(T)});\n  tl.from('#st-brand', { opacity: 0, scale: 0.6, duration: 0.4, ease: "back.out(1.8)", transformOrigin: "center" }, ${q(T)});\n`;
    tiles.forEach((tl2, i) => {
      js += `  tl.from('#st-t${i}', { opacity: 0, y: 24, scale: 0.9, duration: 0.42, ease: "back.out(1.5)", transformOrigin: "center bottom" }, ${q(T + 0.15 + i * 0.13)});\n`;
      js += `  (function(){var o={v:0};tl.to(o,{v:${tl2.n},duration:1.1,ease:"power2.out",onUpdate:function(){var el=document.querySelector('#st-n${i}');if(el)el.textContent=Math.round(o.v);}},${q(T + 0.25 + i * 0.13)});})();\n`;
    });
    js += `  tl.to(${Hsel(id)}, { opacity: 0, y: 24, duration: 0.5, ease: "power2.in" }, ${q(T + 8.0)});\n  tl.set(${Hsel(id)}, { visibility: "hidden" }, ${q(T + 8.5)});`;
    tljs.push(js);
  };

  api.quote = (id: string, T: number, html: string, hold = 6.6, attr = `Speaker Name &nbsp;·&nbsp; <b>Role, ${B.name}</b>`) => {
    host(id, T, hold + 1.6, "left:96px;top:500px;width:1240px;height:540px;",
`          <div class="quote-card" id="${id}-q"><div class="quote-mark">&ldquo;</div><div class="quote-text">${html}</div><div class="quote-attr">${attr}</div></div>`);
    tljs.push(`
  tl.set(${Hsel(id)}, { visibility: "visible" }, ${q(T)});
  tl.fromTo(${Hsel(id)}, { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, ${q(T)});
  tl.from('#${id}-q .quote-mark', { opacity: 0, scale: 0.4, duration: 0.5, ease: "back.out(2)", transformOrigin: "left top" }, ${q(T + 0.2)});
  tl.from('#${id}-q .quote-text', { opacity: 0, y: 18, duration: 0.55, ease: "power2.out" }, ${q(T + 0.42)});
  tl.from('#${id}-q .quote-attr', { opacity: 0, y: 12, duration: 0.45, ease: "power2.out" }, ${q(T + 0.8)});
  tl.to(${Hsel(id)}, { opacity: 0, y: 26, duration: 0.55, ease: "power2.in" }, ${q(T + hold)});
  tl.set(${Hsel(id)}, { visibility: "hidden" }, ${q(T + hold + 0.6)});`);
  };

  // cumulative review recap. items = full list; reviewRecap(n, T) shows 1..n (n highlighted).
  api.reviewRecap = (n: number, T: number, items: string[]) => {
    const id = `rc${n}`;
    const rows = items.slice(0, n).map((it, i) => { const active = i === n - 1; return `              <div class="recap-row ${active ? "active" : "done"}"><div class="recap-num">${active ? n : "&#10003;"}</div><div class="recap-topic">${esc(it)}</div></div>`; }).join("\n");
    host(id, T, 3.8, "left:96px;top:496px;width:1100px;height:540px;",
`          <div class="recap" id="${id}-r"><div class="recap-head">Review comments so far</div>\n            <div class="recap-rows">\n${rows}\n            </div></div>`);
    tljs.push(`
  tl.set(${Hsel(id)}, { visibility: "visible", opacity: 1 }, ${q(T)});
  tl.fromTo(${Hsel(id)}, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, ${q(T)});
  tl.from('#${id}-r .recap-row.active', { opacity: 0, x: -22, scale: 0.96, duration: 0.45, ease: "back.out(1.5)", transformOrigin: "left center" }, ${q(T + 0.18)});
  tl.to(${Hsel(id)}, { opacity: 0, x: -26, duration: 0.45, ease: "power2.in" }, ${q(T + 3.3)});
  tl.set(${Hsel(id)}, { visibility: "hidden" }, ${q(T + 3.8)});`);
  };

  // highlight: box at EXACT pixel coords (find via find-box.ts). label offset to a clear area.
  api.highlight = (id: string, T: number, dur: number, box: { x: number; y: number; w: number; h: number }, label: string, labelStyle: string) => {
    host(id, T, dur, `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;`,
`          <div class="hl-box" id="${id}-box"></div>\n          <div class="hl-label" id="${id}-label" style="${labelStyle}">${esc(label)}</div>`, 3);
    tljs.push(`
  tl.set(${Hsel(id)}, { visibility: "visible", opacity: 1 }, ${q(T)});
  tl.fromTo('#${id}-box', { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)", transformOrigin: "center" }, ${q(T)});
  tl.from('#${id}-label', { opacity: 0, y: 8, duration: 0.35, ease: "power2.out" }, ${q(T + 0.2)});
  tl.to('#${id}-box', { boxShadow: "0 0 0 4px rgba(247,207,76,0.0), 0 0 28px 6px rgba(247,207,76,0.55)", duration: 0.6, yoyo: true, repeat: 3, ease: "sine.inOut" }, ${q(T + 0.4)});
  tl.to(${Hsel(id)}, { opacity: 0, duration: 0.4, ease: "power2.in" }, ${q(T + dur - 0.5)});
  tl.set(${Hsel(id)}, { visibility: "hidden" }, ${q(T + dur)});`);
  };

  api.subscribe = (T: number) => {
    const id = "sub", o = T;
    host(id, T, 12, "left:540px;top:720px;width:920px;height:340px;",
`          <div class="sub-bar" id="sub-bar"><div class="sub-avatar"><img src="${B.markSrc}" alt="${B.name}" /></div><div class="sub-meta"><div class="sub-chname">${B.name}</div><div class="sub-subs">Senior React developers</div></div><div class="sub-btngroup"><div class="sub-btnwrap"><div class="sub-btn sub-btn-red" id="sub-btn-red">Subscribe</div><div class="sub-btn sub-btn-done" id="sub-btn-done"><svg class="sub-check" viewBox="0 0 24 24"><path d="M4 12.5l5 5 11-11"/></svg>Subscribed</div></div><div class="sub-bell-btn" id="sub-bell-btn"><svg class="sub-bell" id="sub-bell" viewBox="0 0 24 24"><path d="M12 2.2a2 2 0 0 0-2 2v.5C7.6 5.5 6 7.7 6 10.3V14l-1.7 1.7a1 1 0 0 0 .7 1.7h14a1 1 0 0 0 .7-1.7L18 14v-3.7c0-2.6-1.6-4.8-4-5.6v-.5a2 2 0 0 0-2-2z"/><path d="M10 19a2 2 0 0 0 4 0z"/></svg></div></div></div><svg class="sub-cursor" id="sub-cursor" viewBox="0 0 24 24"><path d="M4 2l0 17.5 4.2-4.1 2.6 6.1 2.8-1.2-2.6-6.0 5.8 0z" fill="#fff" stroke="#0a0a0a" stroke-width="1.2" stroke-linejoin="round"/></svg>`);
    const SX = 612, SY = 214, BX = 786, BY = 214;
    tljs.push(`
  tl.set(${Hsel(id)}, { visibility: "visible" }, ${q(o + 1.0)});
  tl.fromTo(${Hsel(id)}, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }, ${q(o + 1.0)});
  tl.from('#sub-bar .sub-avatar', { opacity: 0, scale: 0.5, duration: 0.45, ease: "back.out(2)", transformOrigin: "center" }, ${q(o + 1.25)});
  tl.from('#sub-bar .sub-meta', { opacity: 0, x: -14, duration: 0.4, ease: "power2.out" }, ${q(o + 1.35)});
  tl.set('#sub-cursor', { x: ${SX + 150}, y: ${SY + 150}, opacity: 0 });
  tl.to('#sub-cursor', { opacity: 1, duration: 0.2 }, ${q(o + 1.95)});
  tl.to('#sub-cursor', { x: ${SX}, y: ${SY}, duration: 0.85, ease: "power2.inOut" }, ${q(o + 2.0)});
  tl.to('#sub-cursor', { scale: 0.82, duration: 0.1, transformOrigin: "0 0" }, ${q(o + 2.88)});
  tl.to('#sub-cursor', { scale: 1.0, duration: 0.12, transformOrigin: "0 0" }, ${q(o + 2.98)});
  tl.to('#sub-btn-red', { scale: 0.94, duration: 0.1, transformOrigin: "center" }, ${q(o + 2.88)});
  tl.to('#sub-btn-red', { scale: 1.0, duration: 0.12, transformOrigin: "center" }, ${q(o + 2.98)});
  tl.to('#sub-btn-red', { opacity: 0, duration: 0.25 }, ${q(o + 3.12)});
  tl.fromTo('#sub-btn-done', { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${q(o + 3.12)});
  tl.fromTo('#sub-bell-btn', { opacity: 0, scale: 0.6, x: -10 }, { opacity: 1, scale: 1, x: 0, duration: 0.35, ease: "back.out(1.8)", transformOrigin: "center" }, ${q(o + 3.22)});
  tl.to('#sub-cursor', { x: ${BX}, y: ${BY}, duration: 0.7, ease: "power2.inOut" }, ${q(o + 3.75)});
  tl.to('#sub-cursor', { scale: 0.82, duration: 0.1, transformOrigin: "0 0" }, ${q(o + 4.55)});
  tl.to('#sub-cursor', { scale: 1.0, duration: 0.12, transformOrigin: "0 0" }, ${q(o + 4.65)});
  tl.to('#sub-bell-btn', { scale: 0.9, duration: 0.1, transformOrigin: "center" }, ${q(o + 4.55)});
  tl.to('#sub-bell-btn', { scale: 1.0, duration: 0.12, transformOrigin: "center" }, ${q(o + 4.65)});
  tl.to('#sub-bell path', { fill: "${B.yellow}", duration: 0.2 }, ${q(o + 4.7)});
  tl.to('#sub-bell', { keyframes: { rotation: [0, -24, 17, -12, 8, -4, 0] }, duration: 0.9, ease: "sine.inOut", transformOrigin: "top center" }, ${q(o + 4.72)});
  tl.to('#sub-cursor', { x: ${BX + 160}, y: ${BY + 150}, opacity: 0, duration: 0.6, ease: "power2.in" }, ${q(o + 5.3)});
  tl.to(${Hsel(id)}, { opacity: 0, y: 30, duration: 0.5, ease: "power2.in" }, ${q(o + 9.9)});
  tl.set(${Hsel(id)}, { visibility: "hidden" }, ${q(o + 10.5)});`);
  };

  api.outro = (T: number, headlineHtml: string, ctaText: string) => {
    const id = "outro";
    host(id, T, DUR - T, "left:0;top:0;width:1920px;height:1080px;",
`          <div class="outro-scrim" id="outro-scrim"></div>\n          <div class="outro-wrap"><div class="outro-lockup" id="outro-lockup"><img src="${B.markSrc}" alt="${B.name}" /><div class="outro-wordmark">${B.name}</div></div><div class="outro-headline" id="outro-headline">${headlineHtml}</div><div class="outro-cta" id="outro-cta"><span>${esc(ctaText)}</span><span class="outro-arrow">→</span></div></div>`);
    tljs.push(`
  tl.set(${Hsel(id)}, { visibility: "visible", opacity: 1 }, ${q(T)});
  tl.fromTo('#outro-scrim', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out" }, ${q(T)});
  tl.from('#outro-lockup', { opacity: 0, y: 22, duration: 0.5, ease: "power3.out" }, ${q(T + 0.25)});
  tl.from('#outro-headline', { opacity: 0, y: 26, duration: 0.55, ease: "power3.out" }, ${q(T + 0.5)});
  tl.fromTo('#outro-cta', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", transformOrigin: "center" }, ${q(T + 0.85)});
  tl.to('#outro-cta .outro-arrow', { x: 10, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 4 }, ${q(T + 1.6)});`);
  };

  // escape hatch for freestyle/creative cards: push raw host html + raw timeline js.
  api.raw = (hostHtml: string, timelineJs: string) => { hosts.push(hostHtml); tljs.push(timelineJs); };

  api.emit = (outPath: string, videoSrc = "input-video.mp4") => {
    const css = CSS(B);
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>${css}    </style>
  </head>
  <body>
    <div id="stage" data-composition-id="graphic-overlays" data-start="0" data-duration="${DUR}" data-fps="${FPS}" data-width="${W}" data-height="${H}">
      <div class="video-wrapper" id="video-wrap">
        <video id="bg-video" src="${videoSrc}" muted playsinline data-start="0" data-duration="${DUR}" data-track-index="1"></video>
      </div>
${hosts.join("\n")}
      <script src="vendor/gsap.min.js"></script>
      <script>
        (function () {
          var gsap = window.gsap;
          var tl = gsap.timeline({ paused: true });
${tljs.join("\n")}
          window.__timelines = window.__timelines || {};
          window.__timelines["graphic-overlays"] = tl;
        })();
      </script>
    </div>
  </body>
</html>
`;
    writeFileSync(outPath, html);
    console.log(`wrote ${outPath} — ${hosts.length} cards, dur ${DUR}`);
  };

  return api;
}

function CSS(B: Brand) {
  return `
      @font-face { font-family: "${B.font}"; src: url("fonts/${B.font.replace(/ /g, "")}-Bold.ttf") format("truetype"); font-weight: 700; font-display: block; }
      @font-face { font-family: "${B.font}"; src: url("fonts/${B.font.replace(/ /g, "")}-SemiBold.ttf") format("truetype"); font-weight: 600; font-display: block; }
      @font-face { font-family: "${B.font}"; src: url("fonts/${B.font.replace(/ /g, "")}-Regular.ttf") format("truetype"); font-weight: 400; font-display: block; }
      :root { --yellow:${B.yellow}; --ink:${B.ink}; --glass:${B.glass}; --line:${B.line}; --yt-red:#cc0000; }
      * { box-sizing: border-box; }
      html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000; font-family:"${B.font}", ui-sans-serif, system-ui, sans-serif; }
      #stage { position:relative; width:100%; height:100%; overflow:hidden; }
      .video-wrapper { position:absolute; left:0; top:0; width:1920px; height:1080px; overflow:hidden; }
      .video-wrapper video { width:100%; height:100%; object-fit:cover; }
      .card-host { position:absolute; pointer-events:none; overflow:visible; }
      .card-host .card { position:relative; width:100%; height:100%; }
      .nl-l3 { position:absolute; left:0; bottom:0; }
      .nl-bar { display:inline-flex; align-items:center; gap:26px; padding:20px 44px 20px 30px; background:var(--yellow); border-radius:18px; box-shadow:0 16px 44px rgba(0,0,0,0.42); will-change:clip-path; }
      .nl-mark { height:84px; width:auto; display:block; }
      .nl-div { width:3px; height:78px; background:rgba(10,10,10,0.16); border-radius:2px; }
      .nl-text { display:flex; flex-direction:column; gap:8px; }
      .nl-name { font-weight:700; font-size:56px; line-height:1; color:var(--ink); letter-spacing:-0.5px; white-space:nowrap; }
      .nl-role { font-weight:600; font-size:26px; line-height:1; color:rgba(10,10,10,0.74); letter-spacing:2px; text-transform:uppercase; white-space:nowrap; }
      .kara-line { position:absolute; left:50%; bottom:0; transform:translateX(-50%); white-space:nowrap; background:rgba(12,12,12,0.86); border:1px solid var(--line); border-radius:14px; padding:14px 24px; box-shadow:0 14px 38px rgba(0,0,0,0.45); opacity:0; }
      .kara-w { display:inline-block; font-weight:700; font-size:36px; line-height:1.1; color:#fff; padding:2px 10px; border-radius:8px; }
      .chap-chip { position:absolute; left:0; bottom:0; display:inline-flex; align-items:stretch; height:96px; background:var(--glass); border:1px solid var(--line); border-radius:16px; overflow:hidden; box-shadow:0 16px 44px rgba(0,0,0,0.42); will-change:clip-path; }
      .chap-num { width:96px; background:var(--yellow); color:var(--ink); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:44px; letter-spacing:-1px; }
      .chap-body { display:flex; flex-direction:column; justify-content:center; gap:5px; padding:0 34px; }
      .chap-kick { font-weight:600; font-size:18px; letter-spacing:4px; text-transform:uppercase; color:var(--yellow); }
      .chap-title { font-weight:700; font-size:40px; line-height:1; color:#fff; white-space:nowrap; }
      .callout { position:absolute; left:0; bottom:0; width:1140px; background:var(--glass); border:1px solid var(--line); border-left:6px solid var(--yellow); border-radius:18px; padding:28px 40px 30px; box-shadow:0 16px 44px rgba(0,0,0,0.45); }
      .callout-tag { display:inline-flex; align-items:center; gap:8px; background:var(--yellow); color:var(--ink); font-weight:700; font-size:17px; letter-spacing:3px; text-transform:uppercase; padding:6px 14px; border-radius:8px; }
      .callout-big { font-weight:700; font-size:50px; line-height:1; color:#fff; margin-top:16px; }
      .callout-body { font-weight:400; font-size:28px; line-height:1.42; color:#e0e0e0; margin-top:15px; }
      .callout-body b { color:var(--yellow); font-weight:600; }
      .skip-pill { position:absolute; right:0; bottom:0; display:inline-flex; align-items:center; gap:18px; height:88px; padding:0 30px; background:var(--glass); border:1px solid var(--line); border-radius:16px; box-shadow:0 14px 38px rgba(0,0,0,0.45); }
      .skip-q { font-weight:600; font-size:26px; color:#cfcfcf; }
      .skip-cta { display:inline-flex; align-items:center; font-weight:700; font-size:30px; color:var(--ink); background:var(--yellow); padding:10px 20px; border-radius:11px; white-space:nowrap; }
      .stat-row { position:absolute; left:0; bottom:0; display:flex; align-items:stretch; gap:14px; }
      .stat-brand { width:104px; background:var(--yellow); border-radius:16px; display:flex; align-items:center; justify-content:center; box-shadow:0 16px 44px rgba(0,0,0,0.4); }
      .stat-brand img { width:62px; height:62px; object-fit:contain; }
      .stat-tile { background:var(--glass); border:1px solid var(--line); border-radius:16px; padding:16px 30px 18px; display:flex; flex-direction:column; align-items:flex-start; gap:4px; box-shadow:0 16px 44px rgba(0,0,0,0.4); min-width:150px; }
      .stat-num { font-weight:700; font-size:60px; line-height:1; color:var(--yellow); letter-spacing:-1px; }
      .stat-lbl { font-weight:600; font-size:20px; letter-spacing:2px; text-transform:uppercase; color:#e9e9e9; }
      .quote-card { position:absolute; left:0; bottom:0; width:1180px; background:var(--glass); border:1px solid var(--line); border-left:8px solid var(--yellow); border-radius:22px; padding:40px 56px 44px; box-shadow:0 20px 56px rgba(0,0,0,0.5); }
      .quote-mark { position:absolute; left:38px; top:-14px; font-family:Georgia, serif; font-size:130px; line-height:1; color:var(--yellow); opacity:0.9; }
      .quote-text { font-weight:700; font-size:54px; line-height:1.22; color:#fff; letter-spacing:-0.5px; }
      .quote-text .qhl { color:var(--yellow); }
      .quote-attr { font-weight:600; font-size:25px; letter-spacing:1px; color:#bdbdbd; margin-top:22px; }
      .quote-attr b { color:var(--yellow); font-weight:600; }
      .recap { position:absolute; left:0; bottom:0; }
      .recap-head { font-weight:600; font-size:18px; letter-spacing:3px; text-transform:uppercase; color:var(--yellow); margin-bottom:12px; padding-left:4px; }
      .recap-rows { display:flex; flex-direction:column; gap:10px; }
      .recap-row { display:flex; align-items:center; gap:14px; }
      .recap-num { width:46px; height:46px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:24px; flex:0 0 auto; }
      .recap-topic { font-weight:700; font-size:30px; padding:7px 18px; border-radius:11px; white-space:nowrap; background:rgba(12,12,12,0.82); border:1px solid var(--line); }
      .recap-row.active .recap-num { background:var(--yellow); color:var(--ink); }
      .recap-row.active .recap-topic { color:#fff; }
      .recap-row.done .recap-num { background:rgba(255,255,255,0.10); color:#7fd99a; }
      .recap-row.done .recap-topic { color:#8c8c8c; font-weight:600; background:rgba(12,12,12,0.66); }
      .hl-box { position:absolute; inset:0; border:4px solid var(--yellow); border-radius:8px; box-shadow:0 0 0 4px rgba(247,207,76,0.0), 0 0 22px 4px rgba(247,207,76,0.45); }
      .sub-bar { position:absolute; left:0; bottom:60px; width:880px; height:128px; display:flex; align-items:center; gap:22px; background:rgba(12,12,12,0.88); border:1px solid rgba(255,255,255,0.10); border-radius:28px; padding:0 26px; box-shadow:0 18px 50px rgba(0,0,0,0.5); }
      .sub-avatar { width:84px; height:84px; border-radius:50%; background:var(--yellow); display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
      .sub-avatar img { width:52px; height:52px; object-fit:contain; display:block; }
      .sub-meta { display:flex; flex-direction:column; gap:3px; flex:1 1 auto; min-width:0; }
      .sub-chname { font-weight:700; font-size:32px; color:#fff; line-height:1.1; }
      .sub-subs { font-weight:400; font-size:21px; color:#aaa; }
      .sub-btngroup { display:flex; align-items:center; gap:14px; flex:0 0 auto; }
      .sub-btnwrap { position:relative; width:236px; height:68px; }
      .sub-btn { position:absolute; inset:0; border-radius:999px; display:flex; align-items:center; justify-content:center; gap:10px; font-weight:700; font-size:26px; letter-spacing:1px; text-transform:uppercase; }
      .sub-btn-red { background:var(--yt-red); color:#fff; }
      .sub-btn-done { background:#2b2b2b; color:#e9e9e9; opacity:0; }
      .sub-check { width:24px; height:24px; }
      .sub-check path { stroke:#e9e9e9; stroke-width:2.4; fill:none; stroke-linecap:round; stroke-linejoin:round; }
      .sub-bell-btn { width:68px; height:68px; border-radius:50%; background:#2b2b2b; display:flex; align-items:center; justify-content:center; opacity:0; flex:0 0 auto; }
      .sub-bell { width:34px; height:34px; }
      .sub-bell path { fill:#e9e9e9; }
      .sub-cursor { position:absolute; left:0; top:0; width:52px; height:52px; opacity:0; filter:drop-shadow(0 2px 3px rgba(0,0,0,0.55)); }
      .outro-scrim { position:absolute; inset:0; background:radial-gradient(120% 120% at 50% 45%, rgba(14,14,14,0.78) 0%, rgba(8,8,8,0.92) 100%); }
      .outro-wrap { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:30px; }
      .outro-lockup { display:flex; align-items:center; gap:18px; }
      .outro-lockup img { height:64px; width:auto; filter:brightness(0) invert(1); }
      .outro-wordmark { font-weight:700; font-size:50px; color:#fff; letter-spacing:-0.5px; }
      .outro-headline { font-weight:700; font-size:78px; line-height:1.05; color:#fff; text-align:center; letter-spacing:-1px; max-width:1300px; }
      .outro-cta { display:inline-flex; align-items:center; gap:16px; margin-top:6px; padding:22px 40px; background:var(--yellow); color:var(--ink); border-radius:16px; font-weight:700; font-size:38px; box-shadow:0 18px 50px rgba(247,207,76,0.28); }
      .outro-arrow { font-size:38px; line-height:1; }
`;
}
