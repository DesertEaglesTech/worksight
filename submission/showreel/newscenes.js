function board(n, X, Y, w, h, state, k) {
  img(n, X, Y, w, h);
  if (state === "ok") { x.strokeStyle = C.green; x.lineWidth = 3; x.strokeRect(X, Y, w, h); x.fillStyle = C.green; x.beginPath(); x.arc(X + w - 16, Y + 16, 11, 0, 7); x.fill(); x.strokeStyle = "#fff"; x.lineWidth = 3; x.beginPath(); x.moveTo(X + w - 21, Y + 16); x.lineTo(X + w - 17, Y + 20); x.lineTo(X + w - 10, Y + 11); x.stroke(); }
  if (state === "bad") {
    img("overlay", X, Y, w, h, clamp(k * 2));
    x.strokeStyle = C.red; x.lineWidth = 5; x.strokeRect(X - 2, Y - 2, w + 4, h + 4);
    const ph = ((k * 1.5) % 1 + 1) % 1; const r = 30 + 60 * ph; x.strokeStyle = `rgba(229,56,79,${1 - ph})`; x.lineWidth = 3; x.beginPath(); x.arc(X + w * 0.46, Y + h * 0.82, r, 0, 7); x.stroke();
    rr(X + 6, Y + h - 34, 104, 28, 6, C.red); text("FAIL 0.21", X + 58, Y + h - 14, 16, { align: "center", c: "#fff", fam: MONO });
  }
}
function sSearch(t) {
  const a = inOut(t, 112, 128); x.save(); x.globalAlpha = a;
  riseWords("Searching every board", 150, 200, 70, 112.3, t);
  text("Each photo is compared with the 20 good ones, about 0.3 s per board on a CPU.", 150, 255, 28, { w: 400, c: C.muted, a: P(t, 113, 114) });
  const cols = 10, rows = 4, bw = 150, bh = 114, gap = 14, gx = (W - (cols * (bw + gap) - gap)) / 2, gy = 320;
  const bad = new Set([7, 22, 33]); const span = cols * (bw + gap) + 100;
  const beam = lerp(gx - 60, gx + span - 60, eIO(P(t, 113.6, 124.5)));
  let seen = 0, flagged = 0;
  for (let i = 0; i < cols * rows; i++) {
    const cx = gx + (i % cols) * (bw + gap), cy = gy + Math.floor(i / cols) * (bh + gap);
    const ap = eOut(P(t, 112.4 + i * 0.02, 113 + i * 0.02)); x.globalAlpha = a * ap;
    const scanned = beam > cx + bw / 2; if (scanned) { seen++; if (bad.has(i)) flagged++; }
    board(bad.has(i) ? "part" : "good" + String(i % 20).padStart(2, "0"), cx, cy + (1 - ap) * 40, bw, bh, scanned ? (bad.has(i) ? "bad" : "ok") : null, t - 113);
  }
  x.globalAlpha = a;
  if (t > 113.6 && t < 124.6) {
    const g = x.createLinearGradient(beam - 160, 0, beam, 0); g.addColorStop(0, "rgba(31,91,255,0)"); g.addColorStop(1, "rgba(31,91,255,0.28)");
    x.fillStyle = g; x.fillRect(beam - 160, gy - 30, 160, rows * (bh + gap) + 40); x.fillStyle = C.orange; x.fillRect(beam - 2, gy - 40, 4, rows * (bh + gap) + 60);
  }
  text(`${seen}`, 150, 960, 90, { c: C.ink }); text("boards inspected", 160 + measure(`${seen}`, 90), 945, 30, { w: 500, c: C.muted });
  text(`${flagged}`, 900, 960, 90, { c: C.red }); text("anomalies found", 910 + measure(`${flagged}`, 90), 945, 30, { w: 500, c: C.muted });
  const fk = eBack(P(t, 125, 125.8));
  if (fk > 0) { x.save(); x.globalAlpha = a * clamp(fk); chip("Only the anomalies reach the engineer", 1270, 905, { size: 26, fill: "#fff", stroke: C.red }); x.restore(); }
  x.restore();
}
function machine(X, Y, s, a) {
  x.save(); x.globalAlpha *= a; x.translate(X, Y); x.scale(s, s);
  rr(0, 0, 420, 260, 16, "#E9EEF7", C.ink, 3); rr(30, 30, 150, 110, 8, "#0B1B3F"); for (let i = 0; i < 5; i++) { x.fillStyle = [C.red, C.yellow, C.green, C.orange, C.red][i]; x.beginPath(); x.arc(230 + i * 34, 60, 10, 0, 7); x.fill(); }
  for (let i = 0; i < 4; i++) { x.fillStyle = C.line; x.fillRect(220, 100 + i * 22, 170, 10); }
  x.fillStyle = C.ink; x.fillRect(-40, 260, 500, 18); x.fillRect(20, 278, 20, 50); x.fillRect(380, 278, 20, 50);
  x.restore();
}
function camera(X, Y, s, a) {
  x.save(); x.globalAlpha *= a; x.translate(X, Y); x.scale(s, s);
  rr(0, 20, 140, 90, 14, C.orange); x.beginPath(); x.arc(70, 65, 30, 0, 7); x.fillStyle = "#fff"; x.fill(); x.beginPath(); x.arc(70, 65, 18, 0, 7); x.fillStyle = C.ink; x.fill(); rr(40, 0, 60, 24, 6, C.orange);
  rr(190, 0, 120, 150, 10, "#fff", C.ink, 3); for (let i = 0; i < 4; i++) { rr(205, 18 + i * 32, 90, 20, 4, i === 0 ? C.green : C.line); }
  x.restore();
}
function box(X, Y, col) { rr(X, Y, 70, 56, 6, col === "bad" ? "#FCE3E7" : "#EAF1FF", col === "bad" ? C.red : C.orange, 3); x.strokeStyle = col === "bad" ? C.red : C.orange; x.lineWidth = 2; x.beginPath(); x.moveTo(X, Y + 18); x.lineTo(X + 70, Y + 18); x.stroke(); }
function sValue(t) {
  const a = inOut(t, 272, 288); x.save(); x.globalAlpha = a;
  if (t < 280) {
    const pa = 1 - P(t, 279.5, 280); x.globalAlpha = a * pa;
    riseWords("No expensive inspection rig.", 150, 210, 70, 272.3, t);
    text("A camera and a CPU server instead of a dedicated machine.", 150, 265, 28, { w: 400, c: C.muted, a: P(t, 273, 274) });
    const mk = eExpo(P(t, 272.8, 274)); machine(220, 380 + (1 - mk) * 60, 1, mk);
    text("Dedicated inspection machine", 220, 760, 30, { a: mk }); text("hardware · integration · set-up per part", 220, 800, 24, { w: 400, c: C.muted, a: mk });
    const cost = eOut(P(t, 274, 276.5)); rr(220, 840, 560, 26, 13, C.line); if (cost > 0.02) rr(220, 840, 560 * cost, 26, 13, C.red);
    const sk = eIO(P(t, 277, 277.8)); if (sk > 0) { x.strokeStyle = C.red; x.lineWidth = 8; x.beginPath(); x.moveTo(190, 360); x.lineTo(190 + 640 * sk, 360 + 520 * sk); x.stroke(); }
    const ck = eBack(P(t, 275.5, 276.4)); if (ck > 0) camera(1120, 430, clamp(ck, 0, 1.15) * 1.3, clamp(ck));
    text("Worksight", 1120, 760, 30, { a: clamp(ck) }); text("one camera per view · runs on a CPU", 1120, 800, 24, { w: 400, c: C.muted, a: clamp(ck) });
    const c2 = eOut(P(t, 276.5, 278)); rr(1120, 840, 560, 26, 13, C.line); if (c2 > 0.05) rr(1120, 840, 560 * 0.18 * c2, 26, 13, C.green);
    text("illustration, not a measured cost", 1680, 905, 18, { w: 400, align: "right", c: C.muted, a: P(t, 277, 278) });
  } else {
    x.globalAlpha = a * P(t, 280, 280.4);
    riseWords("Catch defects before they ship.", 150, 210, 70, 280.3, t);
    text("Fewer returns, warranty claims and compensation for defective parts.", 150, 265, 28, { w: 400, c: C.muted, a: P(t, 281, 282) });
    const lanes = [[430, "Without Worksight", false], [740, "With Worksight", true]];
    for (const [ly, label, ws] of lanes) {
      text(label, 150, ly - 70, 28, { c: ws ? C.orange : C.muted });
      x.fillStyle = C.line; x.fillRect(150, ly + 60, 1450, 6);
      rr(1640, ly - 30, 130, 120, 14, "#fff", C.ink, 3); x.fillStyle = C.ink; x.beginPath(); x.arc(1705, ly + 10, 18, 0, 7); x.fill(); x.fillRect(1680, ly + 34, 50, 34); text("customer", 1705, ly + 120, 20, { w: 500, align: "center", c: C.muted });
      if (ws) { x.fillStyle = C.orange; x.fillRect(980, ly - 40, 6, 110); text("Worksight", 983, ly - 52, 20, { align: "center", c: C.orange }); }
      for (let i = 0; i < 6; i++) {
        const bt = t - 280.6 - i * 0.9; if (bt < 0) continue; const isBad = i === 3;
        let bx = 150 + bt * 230, by = ly; const tGate = (940 - 150) / 230, tCust = (1560 - 150) / 230;
        if (ws && isBad && bt > tGate) { const d = bt - tGate; bx = 940 + d * 40; by = ly + d * 160; if (by > ly + 220) continue; }
        if (!ws && isBad && bt > tCust) { const d = bt - tCust; bx = Math.max(1100, 1560 - d * 420); by = ly - 10 - Math.sin(clamp(d / 1.1) * Math.PI) * 60; }
        if (bx > 1580 && !(isBad && !ws)) continue;
        box(bx, by, isBad ? "bad" : "ok");
        if (!ws && isBad && bt > tCust) { const d = bt - tCust; x.save(); x.globalAlpha = a * clamp(d * 2); chip("return · compensation claim", bx - 60, by - 70, { size: 20, fill: "#fff", stroke: C.red, c: C.red }); x.restore(); }
        if (ws && isBad && bt > tGate) { x.save(); x.globalAlpha = a * clamp((bt - tGate) * 3); chip("caught on the line", 1010, ly + 120, { size: 20, fill: "#fff", stroke: C.green, c: C.green }); x.restore(); }
      }
    }
    text("AI visual inspection market: about +$27B by 2029 (Technavio)", 150, 1000, 22, { w: 400, fam: MONO, c: C.muted, a: P(t, 284, 285) });
  }
  x.restore();
}
