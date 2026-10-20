import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Stage 6.10.14.11 — reorder existing OR branches, do not weaken conditions.
// Diagnostic-only generated files: NEVER deploy. firestore.rules stays untouched.
const original = await readFile("firestore.rules", "utf8");
const start = original.indexOf("      // Reject self-promotion before any self-update or admin-management branch.");
const end = original.indexOf("      allow delete:", start);
if (start < 0 || end <= start) throw new Error("usuarios update block not found");
const block = original.slice(start, end);
const begin = "        && (\n          (\n          isSignedIn()";
const left = block.indexOf(begin);
const right = block.lastIndexOf("\n        );");
if (left < 0 || right <= left || block.indexOf(begin, left + 1) >= 0)
  throw new Error("Unexpected OR layout in usuarios update");
const inner = block.slice(left + "        && (\n".length, right);
const chunks = inner.split("\n        || ");
if (chunks.length !== 3 || !chunks[0].includes("request.auth.uid == id")
    || !chunks[1].includes("isAdminGeral()") || !chunks[2].includes("canAdminEmpresaManageUser("))
  throw new Error("Expected three unique self/platform/company branches");
const names = ["self", "platform", "company"];
const permutations = [
  ["company", "self", "platform"],
  ["company", "platform", "self"],
  ["platform", "company", "self"],
  ["platform", "self", "company"],
];
const dir = await mkdtemp(join(tmpdir(), "patio-rules-6101411-"));
const variants = [["baseline", null]];
for (const permutation of permutations) {
  const name = permutation.join("-");
  const replacement = permutation.map(k => chunks[names.indexOf(k)]).join("\n        || ");
  const path = join(dir, name + ".rules");
  const edited = block.slice(0, left + "        && (\n".length) + replacement + block.slice(right);
  await writeFile(path, original.slice(0, start) + edited + original.slice(end));
  variants.push([name, path]);
}
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101411");
const results = {};
for (const [name, path] of variants) {
  results[name] = {};
  for (const [kind, focus] of [["security", "usuarios"], ["legitimate", "usuarios-validacao"]]) {
    const outputPrefix = prefix + "-" + name + "-" + kind;
    const env = { ...process.env, PATIO_RULES_FOCUS: focus, PATIO_RULES_REPORT_PREFIX: outputPrefix };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (path) env.PATIO_RULES_TEST_RULES_PATH = path;
    process.stdout.write("\n=== " + name + " / " + kind + " (Emulator only) ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    const summary = JSON.parse(await readFile(outputPrefix + "-summary.json", "utf8"));
    const log = await readFile(outputPrefix + ".log", "utf8");
    const individual = [];
    let preceding = [];
    for (const line of log.split("\n")) {
      if (line.includes("maximum of 1000 expressions to evaluate has been reached")) preceding.push("budget");
      else if (line.includes("evaluation error at L")) preceding.push("evaluation-error");
      const match = line.match(/^# Subtest: (.*)$/);
      if (match) { individual.push({ test: match[1], precedingDiagnostics: preceding }); preceding = []; }
    }
    results[name][kind] = {
      exitCode: run.status, testExitCode: summary.testExitCode,
      evaluationErrorMentions: summary.evaluationErrorMentions,
      expressionBudgetMentions: summary.expressionBudgetMentions,
      report: outputPrefix + "-summary.json", log: outputPrefix + ".log", individual,
    };
  }
}
const acceptance = Object.entries(results).filter(([name]) => name !== "baseline").map(([name, suites]) => ({
  name,
  testSuitesPass: Object.values(suites).every(s => s.exitCode === 0 && s.testExitCode === 0),
  zeroBudgetMentions: Object.values(suites).every(s => s.expressionBudgetMentions === 0),
  noNewEvaluationErrors: Object.keys(suites).every(k => suites[k].evaluationErrorMentions <= results.baseline[k].evaluationErrorMentions),
}));
const comparison = {
  stage: "6.10.14.11", emulatorOnly: true, officialRulesUnchanged: true,
  strategy: "Reorder unchanged self/platform/company OR branches without changing the global self-promotion guard",
  variants: Object.fromEntries(variants.slice(1)), results, acceptance,
  warning: "TAP assertFails may pass on rules evaluation errors. Compare logs and legitimate tests. Permutations are not proven equivalent; NEVER deploy generated rules.",
};
await writeFile(prefix + "-comparison.json", JSON.stringify(comparison, null, 2) + "\n");
process.stdout.write("\nEXPERIMENT COMPARISON " + JSON.stringify(comparison, null, 2) + "\n");
if (!acceptance.some(v => v.testSuitesPass && v.zeroBudgetMentions && v.noNewEvaluationErrors))
  process.exitCode = 1;
