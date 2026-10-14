import { spawnSync } from "node:child_process";

// Use the npm CLI that launched this script, without adding a shell dependency.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this script with npm run demo.");

function run(script: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [npmCli!, "run", script, "--", ...args], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result;
}

console.log("Processing invoices before starting the review interface…");
const pipeline = run("pipeline", process.argv.slice(2));
if (pipeline.signal) {
  process.exitCode = 1;
} else {
  if (pipeline.status !== 0) {
    console.warn("Pipeline failed or completed with failures. Starting the interface to review available results.");
  }
  const web = run("dev");
  process.exitCode = web.signal ? 1 : (web.status ?? 1);
}
