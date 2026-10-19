import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const project = "demo-patio-pro-log";
const port = Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "28080");
const prefix = process.env.PATIO_RULES_REPORT_PREFIX || "/tmp/patio-rules-6107";
const suites = [
  "functions/tests/firestore/subscriptions.rules.test.mjs",
  "functions/tests/firestore/subscriptions.client.test.mjs",
  "functions/tests/firestore/chamados-update.rules.test.mjs",
];

const runner = spawn(process.execPath, ["--experimental-strip-types", "--test", ...suites], {
  stdio: ["inherit", "pipe", "pipe"],
  env: process.env,
});
let output = "";
for (const [stream, destination] of [[runner.stdout, process.stdout], [runner.stderr, process.stderr]]) {
  stream.on("data", chunk => {
    const value = chunk.toString();
    output += value;
    destination.write(chunk);
  });
}
const exitCode = await new Promise((resolve, reject) => {
  runner.on("error", reject);
  runner.on("close", code => resolve(code ?? 1));
});
await writeFile(prefix + ".log", output);

const errors = [...output.matchAll(/evaluation error at L(\d+):\d+ for '(\w+)'/g)];
const budgets = [...output.matchAll(/maximum of 1000 expressions to evaluate has been reached/g)];
const byRule = {};
for (const match of errors) {
  const key = "L" + match[1] + " " + match[2];
  byRule[key] = (byRule[key] || 0) + 1;
}
const summary = {
  testExitCode: exitCode,
  evaluationErrorMentions: errors.length,
  expressionBudgetMentions: budgets.length,
  byRule,
  log: prefix + ".log",
};
for (const extension of ["json", "html"]) {
  const url = "http://127.0.0.1:" + port + "/emulator/v1/projects/" + project + ":ruleCoverage." + extension;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const path = prefix + "-coverage." + extension;
    await writeFile(path, await response.text());
    summary["coverage_" + extension] = path;
  } catch (error) {
    summary["coverage_" + extension + "_error"] = String(error);
  }
}
await writeFile(prefix + "-summary.json", JSON.stringify(summary, null, 2) + "\n");
process.stdout.write("\nRULES DIAGNOSTIC " + JSON.stringify(summary, null, 2) + "\n");
if (exitCode !== 0) process.exitCode = exitCode;
else if (process.env.PATIO_RULES_STRICT === "1" && (errors.length || budgets.length)) process.exitCode = 1;
