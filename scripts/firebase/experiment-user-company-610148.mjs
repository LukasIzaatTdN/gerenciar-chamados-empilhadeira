import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Stage 6.10.14.8: isolated diagnostic substitutions; NEVER deploy generated rules.
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
if (block.split(company).length !== 2) throw new Error("Company branch does not match exactly");
const cases = {
  "baseline": original,
  "company-denied": original.slice(0, start) + block.replace(company, "          false") + original.slice(end),
  "skip-management-diff": original.slice(0, start) + block.replace(company, company.replace(
    '          && hasOnlyUserManagementChanges(resource.data, request.resource.data)\n', ''
  )) + original.slice(end),
  "skip-admin-scope": original.slice(0, start) + block.replace(company, company.replace(
    '          && canAdminEmpresaManageUser(resource.data, request.resource.data)', ''
  )) + original.slice(end),
  "company-early-self-reject": original.slice(0, start) + block.replace(company,
    '          request.auth.uid != id\n          && ' + company.trimStart()
  ) + original.slice(end),
};
const dir = await mkdtemp(join(tmpdir(), "patio-rules-610148-"));
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-610148");
const summaries = {};
const paths = {};
for (const [name, rules] of Object.entries(cases)) {
  const env = { ...process.env, PATIO_RULES_FOCUS: "usuarios", PATIO_RULES_REPORT_PREFIX: prefix + "-" + name };
  delete env.PATIO_RULES_TEST_RULES_PATH;
  delete env.PATIO_RULES_STRICT;
  if (name !== "baseline") {
    const path = join(dir, name + ".rules");
    await writeFile(path, rules);
    env.PATIO_RULES_TEST_RULES_PATH = path;
    paths[name] = path;
  }
  process.stdout.write("\n=== " + name + " (emulator only) ===\n");
  const result = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
  if (result.error) throw result.error;
  const summary = JSON.parse(await readFile(prefix + "-" + name + "-summary.json", "utf8"));
  summaries[name] = { testExitCode: summary.testExitCode, evaluationErrorMentions: summary.evaluationErrorMentions,
    expressionBudgetMentions: summary.expressionBudgetMentions, budgetByCategory: summary.budgetByCategory };
  if (result.status !== 0 || summary.testExitCode !== 0) throw new Error("Diagnostic test failed: " + name);
}
const comparison = { stage: "6.10.14.8", emulatorOnly: true, officialRulesUnchanged: true,
  isolatedNegativeTestsOnly: true, paths, results: summaries,
  warning: "Variants bypass security conditions or deny legitimate updates. NEVER deploy. Zero budgets do not establish authorization equivalence." };
await writeFile(prefix + "-comparison.json", JSON.stringify(comparison, null, 2) + "\n");
process.stdout.write("\n" + JSON.stringify(comparison, null, 2) + "\n");
