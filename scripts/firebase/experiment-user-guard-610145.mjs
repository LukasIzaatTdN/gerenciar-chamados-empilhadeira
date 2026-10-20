import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Stage 6.10.14.5: an isolated function guard experiment, never deploy its generated rules.
const source = await readFile("firestore.rules", "utf8");
const matchStart = source.indexOf("    match /usuarios/{id} {");
const guardStart = source.indexOf("      // Reject self-promotion before any self-update or admin-management branch.", matchStart);
const guardEnd = source.indexOf("        && (\n          (\n          isSignedIn()", guardStart);
if (matchStart < 0 || guardStart < 0 || guardEnd < 0 || guardStart < matchStart ||
    !source.slice(guardStart, guardEnd).includes('resource.data.get("perfil", null)')) {
  throw new Error("Unexpected usuarios update guard; refusing to generate experimental rules.");
}
// Equivalent to !(sameUid && oldProfile != platformAdmin && newProfile == platformAdmin).
// The fast first branch avoids touching old/new data for other users.
const helper = `    // EXPERIMENT ONLY: isolate self-promotion guard, not yet validated for production.
    function isNotSelfPromotion(userId, oldData, newData) {
      return request.auth.uid != userId
        || newData.get("perfil", null) != "Administrador Geral"
        || oldData.get("perfil", null) == "Administrador Geral";
    }

`;
const replacement = `      // EXPERIMENT ONLY: preserve the three existing authorization branches.
      allow update: if isSignedIn()
        && isNotSelfPromotion(id, resource.data, request.resource.data)`;
const variant = source.slice(0, matchStart)
  + helper
  + source.slice(matchStart, guardStart)
  + replacement
  + source.slice(guardEnd);
if (variant === source || variant.includes("      // Reject self-promotion before any self-update or admin-management branch.")) {
  throw new Error("Experimental guard replacement did not match the expected source.");
}
const folder = await mkdtemp(join(tmpdir(), "patio-rules-610145-"));
const variantPath = join(folder, "usuarios-helper-guard.rules");
await writeFile(variantPath, variant);
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-610145");
const cases = [
  { name: "baseline-usuarios", focus: "usuarios", path: null },
  { name: "helper-usuarios", focus: "usuarios", path: variantPath },
  { name: "helper-all", focus: "all", path: variantPath },
  { name: "helper-chamados", focus: "chamados", path: variantPath },
];
const results = {};
for (const item of cases) {
  const env = {
    ...process.env,
    PATIO_RULES_FOCUS: item.focus,
    PATIO_RULES_REPORT_PREFIX: prefix + "-" + item.name,
  };
  delete env.PATIO_RULES_TEST_RULES_PATH;
  delete env.PATIO_RULES_STRICT;
  if (item.path) env.PATIO_RULES_TEST_RULES_PATH = item.path;
  process.stdout.write("\n=== " + item.name + " (emulator only) ===\n");
  const run = spawnSync("npm", ["run", "test:rules:diagnose"], {
    env, stdio: "inherit", shell: false,
  });
  if (run.error) throw run.error;
  const summaryPath = prefix + "-" + item.name + "-summary.json";
  try {
    results[item.name] = JSON.parse(await readFile(summaryPath, "utf8"));
  } catch (error) {
    throw new Error("Missing summary for " + item.name + ": " + String(error));
  }
  if (run.status !== 0 || results[item.name].testExitCode !== 0) {
    throw new Error("Test regression in " + item.name + ". Review " + summaryPath);
  }
}
const compact = item => ({
  testExitCode: item.testExitCode,
  evaluationErrorMentions: item.evaluationErrorMentions,
  expressionBudgetMentions: item.expressionBudgetMentions,
  budgetByCategory: item.budgetByCategory,
});
const comparison = {
  stage: "6.10.14.5",
  emulatorOnly: true,
  officialRulesUnchanged: true,
  generatedRules: variantPath,
  baselineUsuarios: compact(results["baseline-usuarios"]),
  helperUsuarios: compact(results["helper-usuarios"]),
  helperAll: compact(results["helper-all"]),
  helperChamados: compact(results["helper-chamados"]),
  acceptance: {
    isolatedBudgetZero: results["helper-usuarios"].expressionBudgetMentions === 0,
    generalBudgetZero: results["helper-all"].expressionBudgetMentions === 0,
    chamadosBudgetZero: results["helper-chamados"].expressionBudgetMentions === 0,
    noTestFailures: true,
  },
  note: "A zero-budget result does not prove authorization equivalence. Validate legitimate user updates before proposing any production rule change.",
};
await writeFile(prefix + "-comparison.json", JSON.stringify(comparison, null, 2) + "\n");
process.stdout.write("\nEXPERIMENT COMPARISON " + JSON.stringify(comparison, null, 2) + "\n");
