// Intro: a field of inspection patches is scanned, then the patches assemble the wordmark.
let INTRO_CELLS = null;
function introCells(word, size, left, by, step) {
  if (INTRO_CELLS) return INTRO_CELLS;
  const off = document.createElement("canvas"); off.width = W; off.height = H; const o = off.getContext("2d");
  o.font = `700 ${size}px ${SANS}`; o.letterSpacing = "-6px"; o.fillStyle = "#000"; o.fillText(word, left, by);
  const d = o.getImageData(0, 0, W, H).data; const cells = [];
  for (let y = by - size; y < by + 20; y += step) for (let xx = left - 10; xx < W - left + 10; xx += step) {
    if (d[((y + step / 2 | 0) * W + (xx + step / 2 | 0)) * 4 + 3] > 128) cells.push([xx, y]);
  }
  INTRO_CELLS = cells; return cells;
}
function sIntro(t) {
  const outA = 1 - eIO(P(t, 14.6, 16));
  const word = "WORKSIGHT", size = 230, step = 14; const total = measure(word, size, 700, SANS, -6);
  const by = H / 2 + 80, left = W / 2 - total / 2;
  const cells = introCells(word, size, left, by, step);
  // 1. a pulse, then a line that opens into a field of patches
  if (t < 1.4) { const k = eBack(P(t, 0.1, 0.6)); x.beginPath(); x.arc(W / 2, H / 2, 9 * k + 18 * Math.max(0, Math.sin(t * 6)) * (1 - P(t, 0.8, 1.4)), 0, 7); x.fillStyle = C.orange; x.fill(); }
  const lw = eExpo(P(t, 0.9, 2.0)) * 1500 * (1 - P(t, 2.4, 3.0));
  if (lw > 1) { x.fillStyle = C.orange; x.fillRect(W / 2 - lw / 2, H / 2 - 2, lw, 4); }
  const field = eOut(P(t, 2.0, 3.4)), gather = P(t, 5.4, 7.8), solid = eIO(P(t, 7.6, 8.6));
  const beam = lerp(-200, W + 200, eIO(P(t, 3.2, 5.6)));
  if (field > 0 && solid < 1) {
    x.save(); x.globalAlpha = outA * (1 - solid);
    cells.forEach(([tx, ty], i) => {
      // start: a loose grid band around the centre line
      const sx = W / 2 + (rand(i) - 0.5) * 1700 * field, sy = H / 2 + (rand(i + 11) - 0.5) * 520 * field;
      const k = eIO(clamp(gather * 1.35 - rand(i + 5) * 0.35));
      const px = lerp(sx, tx, k), py = lerp(sy, ty, k);
      const lit = px < beam;
      x.fillStyle = lit || k > 0.6 ? (i % 4 ? C.orange : C.blue) : "rgba(31,91,255,0.18)";
      const s = lerp(10, step - 2, k);
      x.fillRect(px, py, s, s);
    });
    x.restore();
  }
  if (t > 3.2 && t < 5.6) {
    const g = x.createLinearGradient(beam - 220, 0, beam, 0); g.addColorStop(0, "rgba(31,91,255,0)"); g.addColorStop(1, "rgba(31,91,255,0.22)");
    x.fillStyle = g; x.fillRect(beam - 220, H / 2 - 300, 220, 600); x.fillStyle = C.orange; x.fillRect(beam - 2, H / 2 - 320, 4, 640);
    text("scanning", beam + 16, H / 2 - 296, 20, { w: 500, fam: MONO, c: C.orange });
  }
  // 2. the patches become the solid wordmark
  if (solid > 0) text(word, left, by, size, { ls: -6, a: solid * outA });
  const sk = P(t, 8.8, 10.2);
  if (sk > 0 && sk < 1) {
    const sx = lerp(left - 40, left + total + 40, eIO(sk));
    const gr = x.createLinearGradient(sx - 160, 0, sx, 0); gr.addColorStop(0, "rgba(31,91,255,0)"); gr.addColorStop(1, `rgba(31,91,255,${0.22 * outA})`);
    x.fillStyle = gr; x.fillRect(sx - 160, by - size - 10, 160, size + 40); x.fillStyle = C.orange; x.globalAlpha = outA; x.fillRect(sx, by - size - 30, 3, size + 80); x.globalAlpha = 1;
  }
  const uk = eExpo(P(t, 8.4, 9.8)); x.globalAlpha = outA; x.fillStyle = C.orange; x.fillRect(W / 2 - 520 * uk, by + 36, 1040 * uk, 5); x.globalAlpha = 1;
  const sub = "Find defects on a new part from good photos only.";
  typeText(sub, W / 2 - measure(sub, 40, 400) / 2, by + 120, 40, P(t, 9.6, 11.8), { w: 400, c: C.muted, a: outA });
  const ck = eBack(P(t, 12.0, 12.8));
  if (ck > 0) {
    x.save(); x.globalAlpha = clamp(ck) * outA;
    const w1 = measure("AMD Developer Hackathon · ACT III", 24, 500) + 34, w2 = measure("Intelligent Industry", 24, 500) + 34, w3 = measure("Team Desert Eagles", 24, 500) + 34;
    let sx = W / 2 - (w1 + w2 + w3 + 32) / 2; const yy = by + 170 + (1 - clamp(ck)) * 30;
    sx += chip("AMD Developer Hackathon · ACT III", sx, yy, { stroke: C.amd }) + 16;
    sx += chip("Intelligent Industry", sx, yy) + 16; chip("Team Desert Eagles", sx, yy, { stroke: C.orange });
    x.restore();
  }
}
