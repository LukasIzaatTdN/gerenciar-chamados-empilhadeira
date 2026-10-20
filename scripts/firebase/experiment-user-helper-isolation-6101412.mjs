import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// 6.10.14.12: deliberately incomplete helper probes for diagnosis ONLY.
// All generated variants are UNSAFE and MUST NEVER be deployed.
const original = await readFile("firestore.rules", "utf8");
const start = original.indexOf("      // Reject self-promotion before any self-update or admin-management branch.");
const end = original.indexOf("      allow delete:", start);
if (start < 0 || end <= start) throw new Error("usuarios update block not found");
const block = original.slice(start, end);
const anchor = "&& canAdminEmpresaManageUser(resource.data, request.resource.data)";
if (block.split(anchor).length !== 2) throw new Error("Company helper anchor not unique");
const probes = {
  "company-disabled": "&& false",
  "actor-only": "&& isAdminEmpresa()",
  "actor-and-existing-tenant": "&& isAdminEmpresa() && resource.data.empresa_id == currentUserEmpresaId()",
  "actor-and-both-tenants": "&& isAdminEmpresa() && resource.data.empresa_id == currentUserEmpresaId() && request.resource.data.empresa_id == currentUserEmpresaId()",
  "actor-and-vinculo": "&& isAdminEmpresa() && isUsuarioVinculoValido(request.resource.data)",
};
const dir = await mkdtemp(join(tmpdir(), "patio-rules-6101412-"));
const variants = [["baseline", null]];
for (const [name, expression] of Object.entries(probes)) {
  const path = join(dir, name + ".rules");
  await writeFile(path, original.slice(0, start) + block.replace(anchor, expression) + original.slice(end));
  variants.push([name, path]);
}
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101412");
const results = {};
for (const [name, path] of variants) {
  results[name] = {};
  for (const [kind, focus] of [["security", "usuarios"], ["legitimate", "usuarios-validacao"]]) {
    const reportPrefix = prefix + "-" + name + "-" + kind;
    const env = { ...process.env, PATIO_RULES_FOCUS: focus, PATIO_RULES_REPORT_PREFIX: reportPrefix };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (path) env.PATIO_RULES_TEST_RULES_PATH = path;
    process.stdout.write("\n=== " + name + " / " + kind + " (UNSAFE diagnostic only) ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    const summary = JSON.parse(await readFile(reportPrefix + "-summary.json", "utf8"));
    const log = await readFile(reportPrefix + ".log", "utf8");
    const individual = [];
    let diagnostics = [];
    let pendingTest = null;
    for (const line of log.split("\n")) {
      if (line.includes("maximum of 1000 expressions to evaluate has been reached")) diagnostics.push("expression-budget");
      else if (line.includes("evaluation error at L")) diagnostics.push("evaluation-error");
      const subtest = line.match(/^# Subtest: (.+)$/);
      if (subtest) {
        if (pendingTest) individual.push(pendingTest);
        pendingTest = { test: subtest[1], diagnosticsBeforeTest: diagnostics, status: "unknown" };
        diagnostics = [];
      }
      const result = line.match(/^(ok|not ok) \d+ - /);
      if (result && pendingTest) pendingTest.status = result[1];
    }
    if (pendingTest) individual.push(pendingTest);
    results[name][kind] = {
      exitCode: run.status, testExitCode: summary.testExitCode,
      evaluationErrorMentions: summary.evaluationErrorMentions,
      expressionBudgetMentions: summary.expressionBudgetMentions,
      report: reportPrefix + "-summary.json", log: reportPrefix + ".log", individual,
    };
  }
}
const comparison = {
  stage: "6.10.14.12", emulatorOnly: true, officialRulesUnchanged: true,
  diagnosticOnly: true, deployableCandidates: [],
  warning: "ALL non-baseline variants deliberately omit authorization requirements and are UNSAFE. NEVER deploy, merge, or use them as production rules. Passing assertFails can hide evaluation errors.",
  variants: Object.fromEntries(variants.slice(1)), results,
};
await writeFile(prefix + "-comparison.json", JSON.stringify(comparison, null, 2) + "\n");
process.stdout.write("\nEXPERIMENT COMPARISON " + JSON.stringify(comparison, null, 2) + "\n");
// Diagnostic-only: no candidate is eligible for approval regardless of exit status.
if (Object.values(results).some(group => Object.values(group).some(s => s.exitCode !== 0)))
  process.exitCode = 1;
