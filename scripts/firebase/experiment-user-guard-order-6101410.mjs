import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// 6.10.14.10: diagnostic reordering of logically required company checks.
// NEVER deploy the generated rules. Official firestore.rules stays unchanged.
const original = await readFile("firestore.rules", "utf8");
const start = original.indexOf("      // Reject self-promotion before any self-update or admin-management branch.");
const end = original.indexOf("      allow delete:", start);
if (start < 0 || end <= start) throw new Error("Unexpected usuarios update block");
const block = original.slice(start, end);
const company = [
  '          resource.data.perfil != "Administrador Geral"',
  '          && request.resource.data.perfil != "Administrador Geral"',
  '          && hasOnlyUserManagementChanges(resource.data, request.resource.data)',
  '          && canAdminEmpresaManageUser(resource.data, request.resource.data)',
].join("\n");
if (block.split(company).length !== 2) throw new Error("Company branch anchor not unique");

const prefixes = {
  "tenant-first": ['resource.data.empresa_id == currentUserEmpresaId()'],
  "role-first": ['isAdminEmpresa()'],
  "role-and-tenant-first": ['isAdminEmpresa()', 'resource.data.empresa_id == currentUserEmpresaId()'],
};
const dir = await mkdtemp(join(tmpdir(), "patio-rules-6101410-"));
const variants = [["baseline", null]];
for (const [name, checks] of Object.entries(prefixes)) {
  const replacement = '          ' + checks.join("\n          && ") + "\n          && " + company.trimStart();
  const path = join(dir, name + ".rules");
  await writeFile(path, original.slice(0, start) + block.replace(company, replacement) + original.slice(end));
  variants.push([name, path]);
}
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101410");
const results = {};
for (const [name, path] of variants) {
  results[name] = {};
  for (const [label, focus] of [["security", "usuarios"], ["legitimate", "usuarios-validacao"]]) {
    const reportPrefix = prefix + "-" + name + "-" + label;
    const env = { ...process.env, PATIO_RULES_FOCUS: focus, PATIO_RULES_REPORT_PREFIX: reportPrefix };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (path) env.PATIO_RULES_TEST_RULES_PATH = path;
    process.stdout.write("\n=== " + name + " / " + label + " (Emulator only) ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    const summary = JSON.parse(await readFile(reportPrefix + "-summary.json", "utf8"));
    const log = await readFile(reportPrefix + ".log", "utf8");
    // Firebase denial diagnostics generally appear immediately before the TAP Subtest.
    // Attribution is a heuristic: consult full logs for exact failure details.
    const individual = [];
    let preceding = [];
    for (const line of log.split("\n")) {
      if (line.includes("maximum of 1000 expressions to evaluate has been reached")) preceding.push("expression-budget");
      else if (line.includes("evaluation error at L")) preceding.push("evaluation-error");
      const match = line.match(/^# Subtest: (.+)$/);
      if (match) {
        individual.push({ name: match[1], precedingDiagnostics: preceding });
        preceding = [];
      }
    }
    results[name][label] = {
      exitCode: run.status, testExitCode: summary.testExitCode,
      evaluationErrorMentions: summary.evaluationErrorMentions,
      expressionBudgetMentions: summary.expressionBudgetMentions,
      budgetByCategory: summary.budgetByCategory,
      report: reportPrefix + "-summary.json", log: reportPrefix + ".log",
      individual,
    };
  }
}
const noRegressions = Object.entries(results).filter(([name]) => name !== "baseline").map(([name, group]) => ({
  name,
  testsPassed: Object.values(group).every(item => item.exitCode === 0 && item.testExitCode === 0),
  zeroBudgets: Object.values(group).every(item => item.expressionBudgetMentions === 0),
}));
const comparison = {
  stage: "6.10.14.10", emulatorOnly: true, officialRulesUnchanged: true,
  variants: Object.fromEntries(variants.filter(([name]) => name !== "baseline")),
  results, acceptance: noRegressions,
  note: "Earlier predicates are already required by canAdminEmpresaManageUser; test coverage is not a formal equivalence proof. A passing assertFails may still hide evaluation errors. NEVER deploy generated rules.",
};
await writeFile(prefix + "-comparison.json", JSON.stringify(comparison, null, 2) + "\n");
process.stdout.write("\nEXPERIMENT COMPARISON " + JSON.stringify(comparison, null, 2) + "\n");
if (!noRegressions.some(item => item.testsPassed && item.zeroBudgets)) process.exitCode = 1;
