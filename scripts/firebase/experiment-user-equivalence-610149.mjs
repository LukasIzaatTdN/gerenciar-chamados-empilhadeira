import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// 6.10.14.9: compare legitimate + denied operations before proposing a rule change.
// The candidate is generated in /tmp and MUST NEVER be deployed.
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
const variant = original.slice(0, start)
  + block.replace(company, '          request.auth.uid != id\n          && ' + company.trimStart())
  + original.slice(end);
const dir = await mkdtemp(join(tmpdir(), "patio-rules-610149-"));
const candidatePath = join(dir, "company-early-self-reject.rules");
await writeFile(candidatePath, variant);
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-610149");
const results = {};
for (const [name, path] of [["baseline", null], ["candidate", candidatePath]]) {
  results[name] = {};
  for (const [label, focus] of [["security", "usuarios"], ["legitimate", "usuarios-validacao"]]) {
    const reportPrefix = prefix + "-" + name + "-" + label;
    const env = { ...process.env, PATIO_RULES_FOCUS: focus, PATIO_RULES_REPORT_PREFIX: reportPrefix };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (path) env.PATIO_RULES_TEST_RULES_PATH = path;
    process.stdout.write("\n=== " + name + " / " + label + " (Emulator) ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    const summary = JSON.parse(await readFile(reportPrefix + "-summary.json", "utf8"));
    results[name][label] = {
      exitCode: run.status, testExitCode: summary.testExitCode,
      evaluationErrorMentions: summary.evaluationErrorMentions,
      expressionBudgetMentions: summary.expressionBudgetMentions,
      budgetByCategory: summary.budgetByCategory,
      report: reportPrefix + "-summary.json",
      log: reportPrefix + ".log",
    };
  }
}
const accepted = Object.values(results).every(group => Object.values(group).every(item => item.exitCode === 0 && item.testExitCode === 0))
  && results.candidate.security.expressionBudgetMentions === 0
  && results.candidate.legitimate.expressionBudgetMentions === 0;
const comparison = {
  stage: "6.10.14.9", emulatorOnly: true, officialRulesUnchanged: true,
  candidatePath, results, acceptance: { testsAndBudgetsPass: accepted },
  note: "A baseline-vs-candidate difference, even when all negative tests pass, is a security/authorization regression until reviewed. NEVER deploy generated rules.",
};
await writeFile(prefix + "-comparison.json", JSON.stringify(comparison, null, 2) + "\n");
process.stdout.write("\n" + JSON.stringify(comparison, null, 2) + "\n");
if (!accepted) process.exitCode = 1;
