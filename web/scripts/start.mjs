import { spawn } from "node:child_process";
import nextEnv from "@next/env";
// The standalone server runs from .next/standalone; load the web root's server configuration first.
nextEnv.loadEnvConfig(process.cwd(), false);
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: "0.0.0.0" },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
