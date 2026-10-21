import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Stage 6.10.14.14: temporary early-rejection experiments only.
// Generated rules MUST NEVER be deployed; firestore.rules is read-only.
const original = await readFile("firestore.rules", "utf8");
const start = original.indexOf("      // Reject self-promotion before any self-update or admin-management branch.");
const end = original.indexOf("      allow delete:", start);
if (start < 0 || end <= start) throw new Error("usuarios update anchor missing");
const block = original.slice(start, end);
const guard = `        && !(
          request.auth.uid == id
          && resource.data.get("perfil", null) != "Administrador Geral"
          && request.resource.data.get("perfil", null) == "Administrador Geral"
        )`;
if (block.split(guard).length !== 2) throw new Error("Global promotion guard changed; abort");
const deMorgan = `        && (
          request.auth.uid != id
          || resource.data.get("perfil", null) == "Administrador Geral"
          || request.resource.data.get("perfil", null) != "Administrador Geral"
        )`;
const externalTarget = `        && (
          request.auth.uid == id
          || request.resource.data.get("perfil", null) != "Administrador Geral"
        )`;
const variants = [["baseline", null]];
const dir = await mkdtemp(join(tmpdir(), "patio-rules-6101414-"));
for (const [name, variant] of [
  ["demorgan-guard", block.replace(guard, deMorgan)],
  ["external-target-guard", block.replace(guard, guard + "\n" + externalTarget)],
  ["demorgan-and-external-target", block.replace(guard, deMorgan + "\n" + externalTarget)],
]) {
  const path = join(dir, name + ".rules");
  await writeFile(path, original.slice(0, start) + variant + original.slice(end));
  variants.push([name, path]);
}
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101414");
const results = {};
for (const [name, rulesPath] of variants) {
  results[name] = {};
  for (const [kind, focus] of [["security", "usuarios"], ["legitimate", "usuarios-validacao"]]) {
    const reportPrefix = prefix + "-" + name + "-" + kind;
    const env = { ...process.env, PATIO_RULES_FOCUS: focus, PATIO_RULES_REPORT_PREFIX: reportPrefix };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (rulesPath) env.PATIO_RULES_TEST_RULES_PATH = rulesPath;
    process.stdout.write("\n=== " + name + " / " + kind + " (Emulator only) ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    const summary = JSON.parse(await readFile(reportPrefix + "-summary.json", "utf8"));
    const log = await readFile(reportPrefix + ".log", "utf8");
    let diagnostics = [];
    const individual = [];
    for (const line of log.split("\n")) {
      if (line.includes("maximum of 1000 expressions to evaluate has been reached")) diagnostics.push("budget");
      else if (line.includes("evaluation error at L")) diagnostics.push("evaluation-error");
      const subtest = line.match(/^# Subtest: (.+)$/);
      if (subtest) { individual.push({ test: subtest[1], precedingDiagnostics: diagnostics }); diagnostics = []; }
    }
    results[name][kind] = {
      exitCode: run.status,
      testExitCode: summary.testExitCode,
      evaluationErrorMentions: summary.evaluationErrorMentions,
      expressionBudgetMentions: summary.expressionBudgetMentions,
      log: reportPrefix + ".log", report: reportPrefix + "-summary.json", individual,
    };
  }
}
const acceptance = Object.entries(results).filter(([name]) => name !== "baseline").map(([name, suites]) => ({
  name,
  existingTestsPass: Object.values(suites).every(s => s.exitCode === 0 && s.testExitCode === 0),
  noBudgetMentions: Object.values(suites).every(s => s.expressionBudgetMentions === 0),
  noIncreasedEvaluationErrors: Object.keys(suites).every(kind =>
    suites[kind].evaluationErrorMentions <= results.baseline[kind].evaluationErrorMentions),
}));
const comparison = {
  stage: "6.10.14.14", emulatorOnly: true, officialRulesUnchanged: true,
  deployableCandidates: [], variants: Object.fromEntries(variants.slice(1)), results, acceptance,
  warning: "Experimental guards are not proven equivalent; passing negative assertFails can hide evaluation errors. Never deploy generated rules.",
};
await writeFile(prefix + "-comparison.json", JSON.stringify(comparison, null, 2) + "\n");
process.stdout.write("\nEXPERIMENT COMPARISON " + JSON.stringify(comparison, null, 2) + "\n");
if (!acceptance.some(s => s.existingTestsPass && s.noBudgetMentions && s.noIncreasedEvaluationErrors)) process.exitCode = 1;
