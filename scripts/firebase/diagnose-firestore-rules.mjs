import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const project = "demo-patio-pro-log";
const port = Number(process.env.PATIO_FIRESTORE_EMULATOR_PORT || "28080");
const prefix = process.env.PATIO_RULES_REPORT_PREFIX || "/tmp/patio-rules-6108";
const suiteGroups = {
  all: [
    "functions/tests/firestore/subscriptions.rules.test.mjs",
    "functions/tests/firestore/subscriptions.client.test.mjs",
    "functions/tests/firestore/chamados-update.rules.test.mjs",
  ],
  chamados: ["functions/tests/firestore/chamados-update.rules.test.mjs"],
  assinaturas: [
    "functions/tests/firestore/subscriptions.rules.test.mjs",
    "functions/tests/firestore/subscriptions.client.test.mjs",
  ],
};
const focus = process.env.PATIO_RULES_FOCUS || "all";
if (!Object.hasOwn(suiteGroups, focus)) {
  throw new Error("PATIO_RULES_FOCUS must be all, chamados or assinaturas");
}
const suites = suiteGroups[focus];

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
  focus,
  testExitCode: exitCode,
  evaluationErrorMentions: errors.length,
  expressionBudgetMentions: budgets.length,
  byRule,
  byCategory: {
    chamados: (byRule["L714 update"] || 0),
    auditoria: (byRule["L793 create"] || 0),
    usuarios: (byRule["L1081 update"] || 0),
    demais: errors.length - (byRule["L714 update"] || 0) - (byRule["L793 create"] || 0) - (byRule["L1081 update"] || 0),
  },
  log: prefix + ".log",
};
for (const extension of ["json", "html"]) {
  // The JSON endpoint has no extension; only the HTML endpoint ends in .html.
  const url = "http://127.0.0.1:" + port + "/emulator/v1/projects/" + project + ":ruleCoverage" + (extension === "html" ? ".html" : "");
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const path = prefix + "-coverage." + extension;
    const body = await response.text();
    if (extension === "json") JSON.parse(body);
    await writeFile(path, body);
    summary["coverage_" + extension] = path;
  } catch (error) {
    summary["coverage_" + extension + "_error"] = String(error);
  }
}
await writeFile(prefix + "-summary.json", JSON.stringify(summary, null, 2) + "\n");
process.stdout.write("\nRULES DIAGNOSTIC " + JSON.stringify(summary, null, 2) + "\n");
if (exitCode !== 0) process.exitCode = exitCode;
else if (process.env.PATIO_RULES_STRICT === "1" && (errors.length || budgets.length)) process.exitCode = 1;
