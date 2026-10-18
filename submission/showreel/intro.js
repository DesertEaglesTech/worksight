function sIntro(t) {
  const cx = W / 2, cy = H / 2 - 20;
  const outA = 1 - eIO(P(t, 14.6, 16));
  // 1. a point, then a lens aperture that opens on a good board
  const open = eExpo(P(t, 0.9, 3.0)), shut = eIO(P(t, 5.8, 6.8));
  const R = 300 * eBack(P(t, 0.3, 1.2)) * (1 - shut), hole = 280 * open * (1 - shut);
  if (t < 7) {
    x.save(); x.globalAlpha = outA;
    if (t < 0.9) { x.beginPath(); x.arc(cx, cy, 10 * eBack(P(t, 0, 0.5)), 0, 7); x.fillStyle = C.orange; x.fill(); }
    const rot = t * 0.6;
    const hex = k => { x.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; const px = cx + k * Math.cos(a), py = cy + k * Math.sin(a); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); };
    if (R > 1) {
      x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fillStyle = "#0B1B3F"; x.fill();
      if (hole > 1) {
        x.save(); hex(hole); x.clip();
        imgFit("good03", cx - 300, cy - 230, 600, 460);
        const gk = P(t, 3.0, 5.6), n = 14;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const d = (i + j) / (2 * n); if (d > gk) continue; const age = gk - d;
          x.strokeStyle = `rgba(59,130,246,${clamp(1 - age * 4, 0.2, 1)})`; x.lineWidth = 1.5;
          x.strokeRect(cx - 300 + i * 600 / n, cy - 300 + j * 600 / n, 600 / n, 600 / n);
        }
        x.restore();
        x.strokeStyle = "rgba(255,255,255,0.35)"; x.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; x.beginPath(); x.moveTo(cx + hole * Math.cos(a), cy + hole * Math.sin(a)); x.lineTo(cx + R * Math.cos(a + 0.9), cy + R * Math.sin(a + 0.9)); x.stroke(); }
      }
      x.beginPath(); x.arc(cx, cy, R, 0, 7); x.strokeStyle = C.orange; x.lineWidth = 10; x.stroke();
      x.beginPath(); x.arc(cx, cy, R + 26, -Math.PI / 2, -Math.PI / 2 + 6.283 * open); x.strokeStyle = "rgba(31,91,255,0.35)"; x.lineWidth = 3; x.stroke();
    }
    x.restore();
  }
  // 2. the scanned patches fly into the wordmark
  const word = "WORKSIGHT", size = 230; const total = measure(word, size, 700, SANS, -6);
  const by = H / 2 + 80, left = W / 2 - total / 2;
  const fk = P(t, 5.9, 7.6);
  if (fk > 0 && fk < 1) {
    for (let i = 0; i < 120; i++) {
      const sx = cx + (rand(i) - 0.5) * 520, sy = cy + (rand(i + 7) - 0.5) * 520;
      const tx = left + rand(i + 13) * total, ty = by - size * 0.75 + rand(i + 21) * size * 0.7;
      const k = eIO(clamp(fk * 1.3 - rand(i + 3) * 0.3));
      x.globalAlpha = outA * (1 - eIO(P(fk, 0.75, 1)));
      x.fillStyle = i % 3 ? C.orange : C.blue; const s = lerp(30, 10, k);
      x.fillRect(lerp(sx, tx, k) - s / 2, lerp(sy, ty, k) - s / 2, s, s);
    }
    x.globalAlpha = 1;
  }
  let lx = left;
  for (let i = 0; i < word.length; i++) {
    const k = eExpo(P(t, 6.9 + i * 0.07, 8.0 + i * 0.07)); const cw = measure(word[i], size, 700, SANS, -6);
    x.save(); x.beginPath(); x.rect(lx - 5, by - size, cw + 10, size * 1.08); x.clip();
    text(word[i], lx, by + (1 - k) * size, size, { ls: -6, a: outA }); x.restore(); lx += cw;
  }
  // one calm blue scan line over the finished wordmark
  const sk = P(t, 8.4, 10.0);
  if (sk > 0 && sk < 1) {
    const sx = lerp(left - 40, left + total + 40, eIO(sk));
    const gr = x.createLinearGradient(sx - 160, 0, sx, 0); gr.addColorStop(0, "rgba(31,91,255,0)"); gr.addColorStop(1, `rgba(31,91,255,${0.25 * outA})`);
    x.fillStyle = gr; x.fillRect(sx - 160, by - size - 10, 160, size + 40); x.fillStyle = C.orange; x.globalAlpha = outA; x.fillRect(sx, by - size - 30, 3, size + 80); x.globalAlpha = 1;
  }
  const uk = eExpo(P(t, 8.2, 9.6)); x.globalAlpha = outA; x.fillStyle = C.orange; x.fillRect(W / 2 - 520 * uk, by + 36, 1040 * uk, 5); x.globalAlpha = 1;
  const sub = "Find defects on a new part from good photos only.";
  typeText(sub, W / 2 - measure(sub, 40, 400) / 2, by + 120, 40, P(t, 9.4, 11.6), { w: 400, c: C.muted, a: outA });
  const ck = eBack(P(t, 11.8, 12.6));
  if (ck > 0) {
    x.save(); x.globalAlpha = clamp(ck) * outA;
    const w1 = measure("AMD Developer Hackathon · ACT III", 24, 500) + 34, w2 = measure("Intelligent Industry", 24, 500) + 34, w3 = measure("Team Desert Eagles", 24, 500) + 34;
    let sx = W / 2 - (w1 + w2 + w3 + 32) / 2; const yy = by + 170 + (1 - clamp(ck)) * 30;
    sx += chip("AMD Developer Hackathon · ACT III", sx, yy, { stroke: C.amd }) + 16;
    sx += chip("Intelligent Industry", sx, yy) + 16; chip("Team Desert Eagles", sx, yy, { stroke: C.orange });
    x.restore();
  }
}
