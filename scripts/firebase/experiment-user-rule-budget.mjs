import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// 6.10.14.4: Emulator-only negative-test control. Never deploy these rules.
const source = await readFile("firestore.rules", "utf8");
const start = source.indexOf("      // Reject self-promotion before any self-update or admin-management branch.");
const end = source.indexOf("      allow delete:", start);
if (start < 0 || end < 0 || !source.slice(start, end).includes("allow update:")) {
  throw new Error("Expected usuarios/{id} update block was not found; refusing experiment.");
}
const folder = await mkdtemp(join(tmpdir(), "patio-rules-610144-"));
const controlPath = join(folder, "usuarios-deny-update.rules");
const denyAllUpdate = source.slice(0, start)
  + "      // EXPERIMENT ONLY: reject every usuarios update, never publish.\\n".replace("\\n", "\n")
  + "      allow update: if false;\n\n"
  + source.slice(end);
await writeFile(controlPath, denyAllUpdate);
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-610144");
const cases = [
  { name: "baseline", rulesPath: null },
  { name: "deny-update-control", rulesPath: controlPath },
];
for (const item of cases) {
  const env = {
    ...process.env,
    PATIO_RULES_FOCUS: "usuarios",
    PATIO_RULES_REPORT_PREFIX: prefix + "-" + item.name,
  };
  delete env.PATIO_RULES_TEST_RULES_PATH;
  if (item.rulesPath) env.PATIO_RULES_TEST_RULES_PATH = item.rulesPath;
  process.stdout.write("\n=== " + item.name + " (Emulator-only) ===\n");
  const run = spawnSync("npm", ["run", "test:rules:diagnose"], {
    env, stdio: "inherit", shell: false,
  });
  if (run.error || run.status !== 0) {
    throw new Error(item.name + " failed: " + (run.error?.message || run.status));
  }
}
const baseline = JSON.parse(await readFile(prefix + "-baseline-summary.json", "utf8"));
const control = JSON.parse(await readFile(prefix + "-deny-update-control-summary.json", "utf8"));
const result = {
  stage: "6.10.14.4",
  emulatorOnly: true,
  unchangedProductionRules: true,
  baseline: { testsExitCode: baseline.testExitCode, expressionBudgetMentions: baseline.expressionBudgetMentions, evaluationErrorMentions: baseline.evaluationErrorMentions },
  denyUpdateControl: { testsExitCode: control.testExitCode, expressionBudgetMentions: control.expressionBudgetMentions, evaluationErrorMentions: control.evaluationErrorMentions },
  experimentalRulesPath: controlPath,
  note: "Deny-all is a diagnostic control, not an acceptable production authorization rule.",
};
await writeFile(prefix + "-comparison.json", JSON.stringify(result, null, 2) + "\n");
process.stdout.write("\nEXPERIMENT COMPARISON " + JSON.stringify(result, null, 2) + "\n");
