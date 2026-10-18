import { chromium } from "/home/user/worksight/web/node_modules/playwright-core/index.mjs";
import { spawn } from "node:child_process";
const [dir, startS, endS, out] = process.argv.slice(2); const FPS = 30;
const f0 = Math.round(+startS * FPS), f1 = Math.round(+endS * FPS);
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), out], { stdio: ["pipe", "inherit", "inherit"] });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--disable-gpu-vsync"] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on("pageerror", e => console.log("ERR", e.message));
await p.goto("file://" + dir + "/reel.html"); await p.evaluate(() => window.ready);
const t0 = Date.now();
for (let f = f0; f < f1; f++) {
  await p.evaluate(t => window.render(t), f / FPS);
  const buf = await p.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
  if ((f - f0) % 300 === 0) console.log(out, f - f0, "/", f1 - f0, ((f - f0) / ((Date.now() - t0) / 1000)).toFixed(1), "fps");
}
ff.stdin.end(); await new Promise(r => ff.on("close", r)); await b.close();
console.log("done", out, ((Date.now() - t0) / 1000).toFixed(0), "s");
